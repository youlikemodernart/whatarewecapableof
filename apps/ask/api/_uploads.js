const crypto = require('crypto');
const path = require('path');
const sharp = require('sharp');
const heicDecode = require('heic-decode');
const { storageConfig, ensureSchema, _memory, _persistMemory, _sql } = require('./_db');
const { makeHttpError } = require('./_http');

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);
const METADATA_POLICIES = new Set(['strip', 'preserve', 'preserve_with_derivative']);
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
          if (candidateWidth < 1 || candidateHeight < 1 || candidateWidth > 6000 || candidateHeight > 6000 || pixels > 13_000_000 || cumulativePixels > 17_000_000) throw new Error('dimensions');
          const decoded = await candidate.decode();
          if (decoded.width !== candidateWidth || decoded.height !== candidateHeight || decoded.data?.length !== pixels * 4) throw new Error('decode');
        }
        return { contentType: sniffed, width: Number(images[0].width), height: Number(images[0].height) };
      } finally {
        images.dispose();
      }
    }
    const image = sharp(buffer, { failOn: 'error', limitInputPixels: 13_000_000, sequentialRead: true });
    const metadata = await image.metadata();
    const formatType = metadata.format === 'jpeg' ? 'image/jpeg' : metadata.format === 'png' ? 'image/png' : '';
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);
    if (!formatType || formatType !== expectedType) throw new Error('format');
    if (width < 1 || height < 1 || width > 6000 || height > 6000 || width * height > 13_000_000) throw new Error('dimensions');
    if (Number(metadata.pages || 1) !== 1) throw new Error('pages');
    await image.stats();
    return { contentType: formatType, width, height };
  } catch {
    throw makeHttpError(400, 'The headshot could not be decoded as a safe JPEG, PNG, or HEIC image.');
  }
}

async function sanitizePublicationImage(buffer, expectedType) {
  await validateDecodedImage(buffer, expectedType);
  let source;
  let dispose;
  if (expectedType.startsWith('image/hei')) {
    const images = await heicDecode.all({ buffer });
    dispose = () => images.dispose();
    try {
      const decoded = await images[0].decode();
      source = sharp(Buffer.from(decoded.data), {
        raw: { width: decoded.width, height: decoded.height, channels: 4 },
        limitInputPixels: 13_000_000,
      });
    } catch (error) {
      dispose();
      throw error;
    }
  } else {
    source = sharp(buffer, { failOn: 'error', limitInputPixels: 13_000_000, sequentialRead: true }).rotate();
  }
  try {
    const bytes = await source.toColourspace('srgb').jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer();
    const decoded = await validateDecodedImage(bytes, 'image/jpeg');
    if (bytes.length > MAX_BYTES) throw makeHttpError(400, 'The sanitized headshot is too large.');
    return { bytes, contentType: 'image/jpeg', width: decoded.width, height: decoded.height };
  } finally {
    dispose?.();
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
  const question = questionFor(schema, ref);
  const metadataPolicy = METADATA_POLICIES.has(question.metadataPolicy) ? question.metadataPolicy : 'strip';
  const uploadId = `ask_upload_${crypto.randomBytes(16).toString('hex')}`;
  const pathname = clean(requestedPathname, 200);
  if (!new RegExp(`^ask-headshots/[A-Za-z0-9_-]{24,80}\\${meta.extension}$`).test(pathname)) throw makeHttpError(400, 'Invalid upload destination.');
  const publicationPathname = metadataPolicy === 'preserve' ? '' : `ask-headshots-publication/${uploadId.slice('ask_upload_'.length)}.jpg`;
  const now = new Date().toISOString();
  const record = {
    id: uploadId, responseId: response.id, deckVersionId: response.deckVersionId, questionRef: ref,
    originalName: meta.name, pathname, blobUrl: '', contentType: meta.type, sizeBytes: 0, metadataPolicy,
    publicationPathname, publicationBlobUrl: '', publicationContentType: '', publicationSizeBytes: 0,
    originalStatus: 'retained', status: 'pending', active: false, createdAt: now, completedAt: null,
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
      tx`SELECT id FROM ask_responses WHERE id = ${response.id} AND deck_id = ${draft.deckId} AND deck_version_id = ${draft.deckVersionId} AND status = 'started' FOR UPDATE`,
      tx`UPDATE ask_uploads current SET active = FALSE, status = 'replaced'
        WHERE current.response_id = ${response.id} AND current.question_ref = ${ref} AND (current.active = TRUE OR current.status = 'pending')
          AND EXISTS (SELECT 1 FROM ask_responses r WHERE r.id = current.response_id AND r.status = 'started')`,
      tx`INSERT INTO ask_uploads (id, response_id, deck_version_id, question_ref, original_name, pathname, content_type, metadata_policy, publication_pathname)
        SELECT ${uploadId}, id, deck_version_id, ${ref}, ${meta.name}, ${pathname}, ${meta.type}, ${metadataPolicy}, ${publicationPathname}
        FROM ask_responses WHERE id = ${response.id} AND deck_id = ${draft.deckId} AND deck_version_id = ${draft.deckVersionId} AND status = 'started' RETURNING id`,
    ]);
    if (!lockedRows.length || !insertedRows.length) throw makeHttpError(409, 'This response changed before the upload could begin.');
  }
  return { uploadId, pathname, contentType: meta.type, maximumSizeInBytes: MAX_BYTES };
}

function publicationRecord(upload, sanitized, blobUrl = '') {
  return {
    publicationBlobUrl: clean(blobUrl, 1000), publicationContentType: sanitized.contentType,
    publicationSizeBytes: sanitized.bytes.length, publicationMemoryBytes: sanitized.bytes.toString('base64'),
  };
}

async function completeUpload({ uploadId, pathname, blobUrl, contentType, size, bytes, writePublication, deletePublication, deleteOriginalBlob }) {
  const id = clean(uploadId, 80);
  const actualSize = Number(size || bytes?.length || 0);
  const actualType = clean(contentType, 100).toLowerCase();
  if (!id || !Buffer.isBuffer(bytes) || !Number.isSafeInteger(actualSize) || actualSize !== bytes.length || actualSize < 1 || actualSize > MAX_BYTES) throw makeHttpError(400, 'Invalid completed upload.');
  await validateDecodedImage(bytes, actualType);

  if (storageConfig().mode === 'memory') {
    const state = _memory();
    const upload = state.uploads.get(id);
    if (!upload || upload.pathname !== pathname || upload.contentType !== actualType) throw makeHttpError(400, 'Upload completion did not match its authorization.');
    if (upload.status === 'completed' && upload.active) return upload;
    const response = state.responses.get(upload.responseId);
    if (!response || response.status !== 'started') throw makeHttpError(409, 'This response has already been submitted.');
    if (upload.status !== 'pending') throw makeHttpError(409, 'This upload was already replaced.');
    let publication = null;
    if (upload.metadataPolicy !== 'preserve') publication = publicationRecord(upload, await sanitizePublicationImage(bytes, actualType), `memory://${upload.publicationPathname}`);
    for (const other of state.uploads.values()) {
      if (other.id !== upload.id && other.responseId === upload.responseId && other.questionRef === upload.questionRef && other.active) {
        other.active = false; other.status = 'replaced';
      }
    }
    Object.assign(upload, {
      blobUrl: clean(blobUrl, 1000), sizeBytes: actualSize, status: 'completed', active: true,
      completedAt: new Date().toISOString(), memoryBytes: bytes.toString('base64'), ...publication,
    });
    if (upload.metadataPolicy === 'strip') {
      upload.memoryBytes = '';
      upload.blobUrl = '';
      upload.originalStatus = 'deleted';
    }
    _persistMemory(state);
    return upload;
  }

  await ensureSchema();
  const db = _sql();
  const rows = await db`SELECT u.*, r.status AS response_status FROM ask_uploads u JOIN ask_responses r ON r.id = u.response_id WHERE u.id = ${id} LIMIT 1`;
  if (!rows.length || rows[0].pathname !== pathname || rows[0].content_type !== actualType) throw makeHttpError(400, 'Upload completion did not match its authorization.');
  const row = rows[0];
  const cleanBlobUrl = clean(blobUrl, 1000);
  if (row.status === 'completed' && row.active === true) return { id, responseId: row.response_id, questionRef: row.question_ref };
  if (row.response_status !== 'started') throw makeHttpError(409, 'This response has already been submitted.');
  if (row.status !== 'pending') throw makeHttpError(409, 'This upload was already replaced.');

  let publication = { pathname: '', url: '', contentType: '', size: 0 };
  if (row.metadata_policy !== 'preserve') {
    const sanitized = await sanitizePublicationImage(bytes, actualType);
    if (typeof writePublication !== 'function') throw makeHttpError(500, 'Sanitized publication storage is unavailable.');
    const publicationBlob = await writePublication({ pathname: row.publication_pathname, bytes: sanitized.bytes, contentType: sanitized.contentType });
    if (!publicationBlob || publicationBlob.pathname !== row.publication_pathname || publicationBlob.contentType !== sanitized.contentType || Number(publicationBlob.size) !== sanitized.bytes.length) {
      throw makeHttpError(500, 'Sanitized publication image was not stored.');
    }
    publication = { pathname: publicationBlob.pathname, url: clean(publicationBlob.url, 1000), contentType: sanitized.contentType, size: sanitized.bytes.length };
  }
  const originalStatus = row.metadata_policy === 'strip' ? 'delete_pending' : 'retained';
  const [lockedRows, , activatedRows] = await db.transaction((tx) => [
    tx`SELECT u.id FROM ask_uploads u JOIN ask_responses r ON r.id = u.response_id
      WHERE u.id = ${id} AND u.pathname = ${pathname} AND u.content_type = ${actualType} AND u.status = 'pending' AND r.status = 'started' FOR UPDATE OF u, r`,
    tx`UPDATE ask_uploads current SET active = FALSE, status = 'replaced'
      WHERE current.id <> ${id} AND current.active = TRUE
        AND EXISTS (
          SELECT 1 FROM ask_uploads target JOIN ask_responses target_response ON target_response.id = target.response_id
          WHERE target.id = ${id} AND target.status = 'pending' AND target_response.status = 'started'
            AND current.response_id = target.response_id AND current.question_ref = target.question_ref
        )`,
    tx`UPDATE ask_uploads target SET blob_url = ${cleanBlobUrl}, size_bytes = ${actualSize},
        publication_blob_url = ${publication.url}, publication_content_type = ${publication.contentType}, publication_size_bytes = ${publication.size},
        original_status = ${originalStatus}, status = 'completed', active = TRUE, completed_at = COALESCE(target.completed_at, now())
      FROM ask_responses r WHERE target.id = ${id} AND target.response_id = r.id AND target.pathname = ${pathname}
        AND target.content_type = ${actualType} AND target.status = 'pending' AND r.status = 'started'
      RETURNING target.id, target.response_id, target.question_ref`,
  ]);
  if (!lockedRows.length || !activatedRows.length) {
    const currentRows = await db`SELECT u.status, u.active, u.metadata_policy, u.original_status, r.status AS response_status
      FROM ask_uploads u JOIN ask_responses r ON r.id = u.response_id WHERE u.id = ${id} LIMIT 1`;
    const current = currentRows[0];
    if (current?.status === 'completed' && current.active === true) {
      return { id, responseId: row.response_id, questionRef: row.question_ref,
        deleteOriginal: current.metadata_policy === 'strip' && current.original_status !== 'deleted' };
    }
    if (current?.status === 'replaced') {
      await Promise.allSettled([
        publication.pathname && typeof deletePublication === 'function' ? deletePublication(publication.pathname) : Promise.resolve(),
        typeof deleteOriginalBlob === 'function' ? deleteOriginalBlob(pathname) : Promise.resolve(),
      ]);
    }
    throw makeHttpError(409, 'This upload was already replaced.');
  }
  return { id, responseId: activatedRows[0].response_id, questionRef: activatedRows[0].question_ref, deleteOriginal: row.metadata_policy === 'strip' };
}

async function completionAlreadyRecorded(uploadId, pathname, contentType) {
  const id = clean(uploadId, 80);
  const expectedPathname = clean(pathname, 200);
  const expectedType = clean(contentType, 100).toLowerCase();
  if (storageConfig().mode === 'memory') {
    const upload = _memory().uploads.get(id);
    if (!upload || upload.pathname !== expectedPathname || upload.contentType !== expectedType || upload.status !== 'completed' || !upload.active) return null;
    return { id: upload.id, metadataPolicy: upload.metadataPolicy, originalStatus: upload.originalStatus };
  }
  await ensureSchema();
  const rows = await _sql()`SELECT id, metadata_policy, original_status FROM ask_uploads
    WHERE id = ${id} AND pathname = ${expectedPathname} AND content_type = ${expectedType}
      AND status = 'completed' AND active = TRUE LIMIT 1`;
  if (!rows.length) return null;
  return { id: rows[0].id, metadataPolicy: rows[0].metadata_policy, originalStatus: rows[0].original_status };
}

async function markOriginalDeleted(uploadId, deleted) {
  const id = clean(uploadId, 80);
  if (storageConfig().mode === 'memory') return;
  await ensureSchema();
  await _sql()`UPDATE ask_uploads SET original_status = ${deleted ? 'deleted' : 'delete_pending'},
    blob_url = CASE WHEN ${deleted} THEN '' ELSE blob_url END,
    size_bytes = CASE WHEN ${deleted} THEN 0 ELSE size_bytes END
    WHERE id = ${id} AND metadata_policy = 'strip' AND status = 'completed'`;
}

async function activeUpload(responseId, questionRef) {
  const ref = cleanQuestionRef(questionRef);
  if (storageConfig().mode === 'memory') return Array.from(_memory().uploads.values()).find((item) => item.responseId === responseId && item.questionRef === ref && item.active && item.status === 'completed') || null;
  await ensureSchema();
  const rows = await _sql()`SELECT * FROM ask_uploads WHERE response_id = ${responseId} AND question_ref = ${ref} AND active = TRUE AND status = 'completed' LIMIT 1`;
  if (!rows.length) return null;
  const row = rows[0];
  return {
    id: row.id, responseId: row.response_id, deckVersionId: row.deck_version_id, questionRef: row.question_ref,
    originalName: row.original_name, pathname: row.pathname, blobUrl: row.blob_url, contentType: row.content_type,
    sizeBytes: Number(row.size_bytes), metadataPolicy: row.metadata_policy, publicationPathname: row.publication_pathname,
    publicationBlobUrl: row.publication_blob_url, publicationContentType: row.publication_content_type,
    publicationSizeBytes: Number(row.publication_size_bytes), originalStatus: row.original_status, completedAt: row.completed_at,
  };
}

async function uploadStatus(responseId, questionRef) {
  const upload = await activeUpload(responseId, questionRef);
  if (!upload) return { completed: false };
  const displayType = upload.metadataPolicy === 'preserve' ? upload.contentType : upload.publicationContentType;
  const displaySize = upload.metadataPolicy === 'preserve' ? upload.sizeBytes : upload.publicationSizeBytes;
  return { completed: true, uploadId: upload.id, fileName: upload.originalName, contentType: displayType, size: displaySize };
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
    incoming.push({ questionRef: question.ref, value: { serverVerified: true, uploadId: upload.id, fileName: upload.originalName, metadataPolicy: upload.metadataPolicy || 'strip' } });
  }
  return incoming;
}

function questionForRef(schema, ref) {
  return (schema?.questions || []).find((question) => question.ref === ref);
}

async function adminUpload(uploadId, representation = 'publication') {
  const id = clean(uploadId, 80);
  const selected = clean(representation || 'publication', 40);
  if (!/^ask_upload_[a-f0-9]{32}$/.test(id)) throw makeHttpError(400, 'Invalid upload.');
  if (!['publication', 'original'].includes(selected)) throw makeHttpError(400, 'Invalid upload representation.');
  const upload = storageConfig().mode === 'memory' ? _memory().uploads.get(id) : await activeUploadById(id);
  if (!upload || !upload.active || upload.status !== 'completed') throw makeHttpError(404, 'Upload not found.');
  const policy = upload.metadataPolicy || 'strip';
  if (selected === 'original') {
    if (!['preserve', 'preserve_with_derivative'].includes(policy) || upload.originalStatus === 'deleted') throw makeHttpError(404, 'Original upload not retained.');
    return { ...upload, representation: selected, retrievalPathname: upload.pathname, retrievalContentType: upload.contentType, retrievalSizeBytes: upload.sizeBytes, retrievalName: upload.originalName, retrievalMemoryBytes: upload.memoryBytes || '' };
  }
  if (!['strip', 'preserve_with_derivative'].includes(policy) || !upload.publicationPathname || !upload.publicationContentType) throw makeHttpError(404, 'Publication image not available.');
  const base = path.basename(upload.originalName, path.extname(upload.originalName)) || 'headshot';
  return { ...upload, representation: selected, retrievalPathname: upload.publicationPathname, retrievalContentType: upload.publicationContentType, retrievalSizeBytes: upload.publicationSizeBytes, retrievalName: `${base}.jpg`, retrievalMemoryBytes: upload.publicationMemoryBytes || '' };
}

async function activeUploadById(id) {
  await ensureSchema();
  const rows = await _sql()`SELECT * FROM ask_uploads WHERE id = ${id} AND active = TRUE AND status = 'completed' LIMIT 1`;
  if (!rows.length) return null;
  const row = rows[0];
  return {
    id: row.id, responseId: row.response_id, originalName: row.original_name, pathname: row.pathname, blobUrl: row.blob_url,
    contentType: row.content_type, sizeBytes: Number(row.size_bytes), metadataPolicy: row.metadata_policy,
    publicationPathname: row.publication_pathname, publicationBlobUrl: row.publication_blob_url,
    publicationContentType: row.publication_content_type, publicationSizeBytes: Number(row.publication_size_bytes),
    originalStatus: row.original_status, status: row.status, active: row.active,
  };
}

module.exports = {
  MAX_BYTES, ALLOWED_TYPES, validateFileMeta, sniffImage, validateDecodedImage, sanitizePublicationImage,
  prepareUpload, completeUpload, completionAlreadyRecorded, markOriginalDeleted, uploadStatus, answersWithVerifiedUploads, adminUpload, activeUpload,
};
