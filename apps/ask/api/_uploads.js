const crypto = require('crypto');
const path = require('path');
const sharp = require('sharp');
const heicDecode = require('heic-decode');
const { storageConfig, ensureSchema, _memory, _persistMemory, _sql } = require('./_db');
const { makeHttpError } = require('./_http');

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);
const EXTENSIONS = new Map([
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'],
  ['.heic', 'image/heic'], ['.heif', 'image/heif'],
]);

function clean(value, max = 240) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanQuestionRef(value) {
  const ref = clean(value, 80).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(ref)) throw makeHttpError(400, 'Invalid upload question.');
  return ref;
}

function safeName(value) {
  const name = path.basename(clean(value, 240)).replace(/[^A-Za-z0-9._ ()-]/g, '_');
  if (!name || name.startsWith('.')) throw makeHttpError(400, 'Choose a named image file.');
  return name;
}

function validateFileMeta({ fileName, contentType, size }) {
  const name = safeName(fileName);
  const type = clean(contentType, 100).toLowerCase();
  const extensionType = EXTENSIONS.get(path.extname(name).toLowerCase());
  if (!ALLOWED_TYPES.has(type) || !extensionType) throw makeHttpError(400, 'Use a JPEG, PNG, or HEIC image.');
  const compatible = type === extensionType || (type === 'image/heif' && extensionType === 'image/heic') || (type === 'image/heic' && extensionType === 'image/heif');
  if (!compatible) throw makeHttpError(400, 'The image filename and format do not match.');
  if (size !== undefined && (!Number.isSafeInteger(Number(size)) || Number(size) < 1 || Number(size) > MAX_BYTES)) {
    throw makeHttpError(400, 'The headshot must be 10 MB or smaller.');
  }
  return { name, type, extension: path.extname(name).toLowerCase() };
}

function jpegIsComplete(buffer) {
  if (buffer.length < 32 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer.at(-2) !== 0xff || buffer.at(-1) !== 0xd9) return false;
  let offset = 2;
  let sawFrame = false;
  let sawScan = false;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (marker === 0xd9) break;
    if (marker === 0xda) { sawScan = true; break; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) return false;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return false;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7 || buffer.readUInt16BE(offset + 3) < 1 || buffer.readUInt16BE(offset + 5) < 1) return false;
      sawFrame = true;
    }
    offset += length;
  }
  return sawFrame && sawScan;
}

function pngIsComplete(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 45 || !buffer.subarray(0, 8).equals(signature)) return false;
  let offset = 8;
  let sawHeader = false;
  let sawData = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > buffer.length) return false;
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    if (!sawHeader && type !== 'IHDR') return false;
    if (type === 'IHDR') {
      if (sawHeader || length !== 13 || buffer.readUInt32BE(offset + 8) < 1 || buffer.readUInt32BE(offset + 12) < 1) return false;
      sawHeader = true;
    }
    if (type === 'IDAT') sawData = true;
    if (type === 'IEND') return length === 0 && sawHeader && sawData && end === buffer.length;
    offset = end;
  }
  return false;
}

function heifIsComplete(buffer) {
  if (buffer.length < 32 || buffer.subarray(4, 8).toString('ascii') !== 'ftyp') return false;
  const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
  if (!['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return false;
  let offset = 0;
  let sawMeta = false;
  let sawMedia = false;
  while (offset + 8 <= buffer.length) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    let header = 8;
    if (size === 1) {
      if (offset + 16 > buffer.length) return false;
      const large = buffer.readBigUInt64BE(offset + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) return false;
      size = Number(large); header = 16;
    } else if (size === 0) size = buffer.length - offset;
    if (size < header || offset + size > buffer.length) return false;
    if (type === 'meta') sawMeta = true;
    if (type === 'mdat') sawMedia = true;
    offset += size;
  }
  return offset === buffer.length && sawMeta && sawMedia;
}

function sniffImage(buffer) {
  if (!Buffer.isBuffer(buffer)) return '';
  if (jpegIsComplete(buffer)) return 'image/jpeg';
  if (pngIsComplete(buffer)) return 'image/png';
  if (heifIsComplete(buffer)) {
    const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
    return brand.startsWith('hei') || brand.startsWith('hev') ? 'image/heic' : 'image/heif';
  }
  return '';
}

async function validateDecodedImage(buffer, expectedType) {
  const sniffed = sniffImage(buffer);
  if (!sniffed || (sniffed !== expectedType && !(sniffed.startsWith('image/hei') && expectedType.startsWith('image/hei')))) {
    throw makeHttpError(400, 'The uploaded file contents do not match the allowed image format.');
  }
  try {
    if (sniffed.startsWith('image/hei')) {
      const images = await heicDecode.all({ buffer });
      try {
        if (images.length < 1 || images.length > 8) throw new Error('images');
        let cumulativePixels = 0;
        for (const candidate of images) {
          const candidateWidth = Number(candidate.width || 0);
          const candidateHeight = Number(candidate.height || 0);
          const pixels = candidateWidth * candidateHeight;
          cumulativePixels += pixels;
          if (candidateWidth < 1 || candidateHeight < 1 || candidateWidth > 6000 || candidateHeight > 6000 || pixels > 12_000_000 || cumulativePixels > 16_000_000) throw new Error('dimensions');
          const decoded = await candidate.decode();
          if (decoded.width !== candidateWidth || decoded.height !== candidateHeight || decoded.data?.length !== pixels * 4) throw new Error('decode');
        }
        return { contentType: sniffed, width: Number(images[0].width), height: Number(images[0].height) };
      } finally {
        images.dispose();
      }
    }
    const image = sharp(buffer, { failOn: 'error', limitInputPixels: 12_000_000, sequentialRead: true });
    const metadata = await image.metadata();
    const formatType = metadata.format === 'jpeg' ? 'image/jpeg' : metadata.format === 'png' ? 'image/png' : '';
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);
    if (!formatType || formatType !== expectedType) throw new Error('format');
    if (width < 1 || height < 1 || width > 6000 || height > 6000 || width * height > 12_000_000) throw new Error('dimensions');
    if (Number(metadata.pages || 1) !== 1) throw new Error('pages');
    await image.stats();
    return { contentType: formatType, width, height };
  } catch {
    throw makeHttpError(400, 'The headshot could not be decoded as a safe JPEG, PNG, or HEIC image.');
  }
}

function questionFor(schema, questionRef) {
  const question = (schema?.questions || []).find((item) => item.ref === questionRef);
  if (!question || question.type !== 'photo_upload') throw makeHttpError(400, 'This question does not accept an upload.');
  return question;
}

async function responseContext(responseId) {
  if (storageConfig().mode === 'memory') {
    const state = _memory();
    const response = state.responses.get(responseId);
    if (!response) throw makeHttpError(404, 'Response not found.');
    const deck = state.decksById.get(response.deckId);
    return { state, response, schema: deck?.schemaJson };
  }
  await ensureSchema();
  const rows = await _sql()`SELECT r.id, r.deck_id, r.deck_version_id, r.status, v.schema_json
    FROM ask_responses r JOIN ask_deck_versions v ON v.id = r.deck_version_id
    WHERE r.id = ${responseId} LIMIT 1`;
  if (!rows.length) throw makeHttpError(404, 'Response not found.');
  return { response: { id: rows[0].id, deckId: rows[0].deck_id, deckVersionId: rows[0].deck_version_id, status: rows[0].status }, schema: rows[0].schema_json };
}

async function prepareUpload({ draft, questionRef, fileName, contentType, size, pathname: requestedPathname }) {
  if (!draft?.responseId || !draft.deckId || !draft.deckVersionId) throw makeHttpError(401, 'This response session expired. Please reopen the link.');
  const ref = cleanQuestionRef(questionRef);
  const meta = validateFileMeta({ fileName, contentType, size });
  const context = await responseContext(draft.responseId);
  const { response, schema } = context;
  if (response.status !== 'started') throw makeHttpError(409, 'This response has already been submitted.');
  if (response.deckId !== draft.deckId || response.deckVersionId !== draft.deckVersionId) throw makeHttpError(403, 'Upload session does not match this question set.');
  questionFor(schema, ref);
  const uploadId = `ask_upload_${crypto.randomBytes(16).toString('hex')}`;
  const pathname = clean(requestedPathname, 200);
  if (!new RegExp(`^ask-headshots/[A-Za-z0-9_-]{24,80}\\${meta.extension}$`).test(pathname)) {
    throw makeHttpError(400, 'Invalid upload destination.');
  }
  const now = new Date().toISOString();
  const record = {
    id: uploadId, responseId: response.id, deckVersionId: response.deckVersionId, questionRef: ref,
    originalName: meta.name, pathname, blobUrl: '', contentType: meta.type, sizeBytes: 0,
    status: 'pending', active: false, createdAt: now, completedAt: null,
  };
  if (storageConfig().mode === 'memory') {
    for (const other of context.state.uploads.values()) {
      if (other.responseId === response.id && other.questionRef === ref && (other.active || other.status === 'pending')) {
        other.active = false; other.status = 'replaced';
      }
    }
    context.state.uploads.set(uploadId, record);
    _persistMemory(context.state);
  } else {
    const db = _sql();
    const [lockedRows, , insertedRows] = await db.transaction((tx) => [
      tx`SELECT id FROM ask_responses
        WHERE id = ${response.id} AND deck_id = ${draft.deckId} AND deck_version_id = ${draft.deckVersionId} AND status = 'started'
        FOR UPDATE`,
      tx`UPDATE ask_uploads current SET active = FALSE, status = 'replaced'
        WHERE current.response_id = ${response.id} AND current.question_ref = ${ref} AND (current.active = TRUE OR current.status = 'pending')
          AND EXISTS (SELECT 1 FROM ask_responses r WHERE r.id = current.response_id AND r.status = 'started')`,
      tx`INSERT INTO ask_uploads (id, response_id, deck_version_id, question_ref, original_name, pathname, content_type)
        SELECT ${uploadId}, id, deck_version_id, ${ref}, ${meta.name}, ${pathname}, ${meta.type}
        FROM ask_responses
        WHERE id = ${response.id} AND deck_id = ${draft.deckId} AND deck_version_id = ${draft.deckVersionId} AND status = 'started'
        RETURNING id`,
    ]);
    if (!lockedRows.length || !insertedRows.length) throw makeHttpError(409, 'This response changed before the upload could begin.');
  }
  return { uploadId, pathname, contentType: meta.type, maximumSizeInBytes: MAX_BYTES };
}

async function completeUpload({ uploadId, pathname, blobUrl, contentType, size, bytes }) {
  const id = clean(uploadId, 80);
  const actualSize = Number(size || bytes?.length || 0);
  const actualType = clean(contentType, 100).toLowerCase();
  if (!id || !Number.isSafeInteger(actualSize) || actualSize < 1 || actualSize > MAX_BYTES) throw makeHttpError(400, 'Invalid completed upload.');
  if (bytes) await validateDecodedImage(bytes, actualType);
  if (storageConfig().mode === 'memory') {
    const state = _memory();
    const upload = state.uploads.get(id);
    if (!upload || upload.pathname !== pathname || upload.contentType !== actualType) throw makeHttpError(400, 'Upload completion did not match its authorization.');
    const response = state.responses.get(upload.responseId);
    if (upload.status === 'completed' && upload.active && upload.sizeBytes === actualSize && upload.blobUrl === clean(blobUrl, 1000)) return upload;
    if (!response || response.status !== 'started') throw makeHttpError(409, 'This response has already been submitted.');
    if (upload.status !== 'pending') throw makeHttpError(409, 'This upload was already replaced.');
    for (const other of state.uploads.values()) {
      if (other.id !== upload.id && other.responseId === upload.responseId && other.questionRef === upload.questionRef && other.active) {
        other.active = false; other.status = 'replaced';
      }
    }
    Object.assign(upload, { blobUrl: clean(blobUrl, 1000), sizeBytes: actualSize, status: 'completed', active: true, completedAt: new Date().toISOString(), memoryBytes: bytes?.toString('base64') || '' });
    _persistMemory(state);
    return upload;
  }
  await ensureSchema();
  const db = _sql();
  const [lockedRows, , activatedRows] = await db.transaction((tx) => [
    tx`SELECT u.id, u.response_id, u.question_ref, u.pathname, u.blob_url, u.content_type, u.size_bytes, u.status AS upload_status, u.active, r.status AS response_status
      FROM ask_uploads u JOIN ask_responses r ON r.id = u.response_id
      WHERE u.id = ${id}
      FOR UPDATE OF u, r`,
    tx`UPDATE ask_uploads current
      SET active = FALSE, status = 'replaced'
      WHERE current.id <> ${id} AND current.active = TRUE
        AND EXISTS (
          SELECT 1 FROM ask_uploads target JOIN ask_responses r ON r.id = target.response_id
          WHERE target.id = ${id} AND target.pathname = ${pathname} AND target.content_type = ${actualType}
            AND target.status = 'pending' AND r.status = 'started'
            AND current.response_id = target.response_id AND current.question_ref = target.question_ref
        )`,
    tx`UPDATE ask_uploads target
      SET blob_url = ${clean(blobUrl, 1000)}, size_bytes = ${actualSize}, status = 'completed', active = TRUE,
        completed_at = COALESCE(target.completed_at, now())
      FROM ask_responses r
      WHERE target.id = ${id} AND target.response_id = r.id
        AND target.pathname = ${pathname} AND target.content_type = ${actualType} AND r.status = 'started'
        AND (target.status = 'pending' OR (target.status = 'completed' AND target.active = TRUE))
      RETURNING target.id, target.response_id, target.question_ref`,
  ]);
  if (!lockedRows.length || lockedRows[0].pathname !== pathname || lockedRows[0].content_type !== actualType) throw makeHttpError(400, 'Upload completion did not match its authorization.');
  if (lockedRows[0].upload_status === 'completed' && lockedRows[0].active === true && Number(lockedRows[0].size_bytes) === actualSize && lockedRows[0].blob_url === clean(blobUrl, 1000)) {
    return { id, responseId: lockedRows[0].response_id, questionRef: lockedRows[0].question_ref };
  }
  if (lockedRows[0].response_status !== 'started') throw makeHttpError(409, 'This response has already been submitted.');
  if (!activatedRows.length) throw makeHttpError(409, 'This upload was already replaced.');
  return { id, responseId: activatedRows[0].response_id, questionRef: activatedRows[0].question_ref };
}

async function activeUpload(responseId, questionRef) {
  const ref = cleanQuestionRef(questionRef);
  if (storageConfig().mode === 'memory') {
    const state = _memory();
    return Array.from(state.uploads.values()).find((item) => item.responseId === responseId && item.questionRef === ref && item.active && item.status === 'completed') || null;
  }
  await ensureSchema();
  const rows = await _sql()`SELECT id, response_id, deck_version_id, question_ref, original_name, pathname, blob_url, content_type, size_bytes, completed_at
    FROM ask_uploads WHERE response_id = ${responseId} AND question_ref = ${ref} AND active = TRUE AND status = 'completed' LIMIT 1`;
  if (!rows.length) return null;
  const row = rows[0];
  return { id: row.id, responseId: row.response_id, deckVersionId: row.deck_version_id, questionRef: row.question_ref, originalName: row.original_name, pathname: row.pathname, blobUrl: row.blob_url, contentType: row.content_type, sizeBytes: Number(row.size_bytes), completedAt: row.completed_at };
}

async function uploadStatus(responseId, questionRef) {
  const upload = await activeUpload(responseId, questionRef);
  if (!upload) return { completed: false };
  return { completed: true, uploadId: upload.id, fileName: upload.originalName, contentType: upload.contentType, size: upload.sizeBytes };
}

async function answersWithVerifiedUploads(responseId, schema, answers) {
  const incoming = Array.isArray(answers) ? answers.filter((answer) => questionForRef(schema, answer?.questionRef)?.type !== 'photo_upload') : [];
  for (const question of schema?.questions || []) {
    if (question.type !== 'photo_upload') continue;
    const upload = await activeUpload(responseId, question.ref);
    if (!upload) {
      if (question.required) throw makeHttpError(400, 'Upload a headshot before submitting.');
      continue;
    }
    incoming.push({ questionRef: question.ref, value: { serverVerified: true, uploadId: upload.id, fileName: upload.originalName, contentType: upload.contentType, size: upload.sizeBytes } });
  }
  return incoming;
}

function questionForRef(schema, ref) {
  return (schema?.questions || []).find((question) => question.ref === ref);
}

async function adminUpload(uploadId) {
  const id = clean(uploadId, 80);
  if (!/^ask_upload_[a-f0-9]{32}$/.test(id)) throw makeHttpError(400, 'Invalid upload.');
  if (storageConfig().mode === 'memory') {
    const upload = _memory().uploads.get(id);
    if (!upload || !upload.active || upload.status !== 'completed') throw makeHttpError(404, 'Upload not found.');
    return upload;
  }
  await ensureSchema();
  const rows = await _sql()`SELECT id, response_id, original_name, pathname, blob_url, content_type, size_bytes
    FROM ask_uploads WHERE id = ${id} AND active = TRUE AND status = 'completed' LIMIT 1`;
  if (!rows.length) throw makeHttpError(404, 'Upload not found.');
  const row = rows[0];
  return { id: row.id, responseId: row.response_id, originalName: row.original_name, pathname: row.pathname, blobUrl: row.blob_url, contentType: row.content_type, sizeBytes: Number(row.size_bytes) };
}

module.exports = { MAX_BYTES, ALLOWED_TYPES, validateFileMeta, sniffImage, validateDecodedImage, prepareUpload, completeUpload, uploadStatus, answersWithVerifiedUploads, adminUpload, activeUpload };
