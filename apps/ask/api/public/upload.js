const { handleUpload } = require('@vercel/blob/client');
const { get, put, del } = require('@vercel/blob');
const { getDraft, json } = require('../_auth');
const { readJsonBody, handleApiError, makeHttpError } = require('../_http');
const { checkRateLimit } = require('../_rate_limit');
const { prepareUpload, completeUpload, completionAlreadyRecorded, markOriginalDeleted, uploadStatus } = require('../_uploads');

function parsePayload(value) {
  try {
    const payload = JSON.parse(String(value || ''));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('shape');
    return payload;
  } catch {
    throw makeHttpError(400, 'Invalid upload request.');
  }
}

async function readVerifiedBytes(stream, expectedSize, maximumSize = 10 * 1024 * 1024) {
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > maximumSize) throw makeHttpError(400, 'Invalid uploaded image size.');
  const reader = stream.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    length += chunk.length;
    if (length > maximumSize || length > expectedSize) {
      await reader.cancel().catch(() => {});
      throw makeHttpError(400, 'Invalid uploaded image size.');
    }
    chunks.push(chunk);
  }
  if (length !== expectedSize) throw makeHttpError(400, 'Uploaded image was incomplete.');
  return Buffer.concat(chunks);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Method not allowed' });
  }
  try {
    const draft = getDraft(req);

    if (req.method === 'GET') {
      checkRateLimit(req, 'ask:upload-status', { limit: 60, windowMs: 10 * 60 * 1000 });
      if (!draft?.responseId) throw makeHttpError(401, 'This response session expired. Please reopen the link.');
      const url = new URL(req.url, 'http://ask.local');
      return json(res, 200, { ok: true, ...(await uploadStatus(draft.responseId, url.searchParams.get('questionRef'))) });
    }

    const body = await readJsonBody(req, 14 * 1024 * 1024);
    if (body?.type !== 'blob.upload-completed') {
      checkRateLimit(req, 'ask:upload-authorize', { limit: 30, windowMs: 10 * 60 * 1000 });
      if (!draft?.responseId) throw makeHttpError(401, 'This response session expired. Please reopen the link.');
    }
    if (process.env.ASK_BLOB_MODE === 'memory') {
      if (body?.type === 'blob.generate-client-token') {
        const client = parsePayload(body.payload?.clientPayload);
        const prepared = await prepareUpload({ draft, pathname: body.payload?.pathname, ...client });
        return json(res, 200, { ok: true, type: body.type, memoryUpload: true, uploadId: prepared.uploadId, pathname: prepared.pathname });
      }
      if (body?.type === 'ask.memory-upload') {
        const raw = Buffer.from(String(body.payload?.base64 || ''), 'base64');
        const upload = await completeUpload({
          uploadId: body.payload?.uploadId,
          pathname: body.payload?.pathname,
          blobUrl: `memory://${body.payload?.pathname}`,
          contentType: body.payload?.contentType,
          size: raw.length,
          bytes: raw,
        });
        return json(res, 200, { ok: true, completed: true, uploadId: upload.id });
      }
      throw makeHttpError(400, 'Invalid local upload event.');
    }

    const result = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const client = parsePayload(clientPayload);
        const prepared = await prepareUpload({ draft, pathname, ...client });
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/heic', 'image/heif'],
          maximumSizeInBytes: prepared.maximumSizeInBytes,
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 60,
          tokenPayload: JSON.stringify({ uploadId: prepared.uploadId, pathname: prepared.pathname, contentType: prepared.contentType }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const token = parsePayload(tokenPayload);
        if (token.pathname !== blob.pathname || token.contentType !== blob.contentType) throw makeHttpError(400, 'Upload completion did not match its authorization.');
        const recorded = await completionAlreadyRecorded(token.uploadId, blob.pathname, blob.contentType);
        if (recorded) {
          if (recorded.metadataPolicy === 'strip' && recorded.originalStatus !== 'deleted') {
            try {
              await del(blob.pathname);
              await markOriginalDeleted(recorded.id, true);
            } catch {
              await markOriginalDeleted(recorded.id, false);
              throw makeHttpError(503, 'Original deletion is pending retry.');
            }
          }
          return;
        }
        const fetched = await get(blob.pathname, { access: 'private', useCache: false });
        if (!fetched || fetched.statusCode !== 200) throw makeHttpError(400, 'Uploaded image could not be verified.');
        const bytes = await readVerifiedBytes(fetched.stream, fetched.blob.size);
        const completed = await completeUpload({
          uploadId: token.uploadId,
          pathname: blob.pathname,
          blobUrl: blob.url,
          contentType: fetched.blob.contentType,
          size: fetched.blob.size,
          bytes,
          writePublication: async ({ pathname: publicationPathname, bytes: publicationBytes, contentType }) => {
            const stored = await put(publicationPathname, publicationBytes, {
              access: 'private',
              contentType,
              addRandomSuffix: false,
              allowOverwrite: true,
              cacheControlMaxAge: 60,
            });
            return { ...stored, size: publicationBytes.length };
          },
          deletePublication: (publicationPathname) => del(publicationPathname),
          deleteOriginalBlob: (originalPathname) => del(originalPathname),
        });
        if (completed.deleteOriginal) {
          try {
            await del(blob.pathname);
            await markOriginalDeleted(completed.id, true);
          } catch {
            await markOriginalDeleted(completed.id, false);
            throw makeHttpError(503, 'Original deletion is pending retry.');
          }
        }
      },
    });
    return json(res, 200, result);
  } catch (error) {
    return handleApiError(res, json, error);
  }
};
