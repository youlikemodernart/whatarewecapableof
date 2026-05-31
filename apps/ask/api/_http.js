const MAX_BODY_BYTES = 96_000;

function makeHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readRawBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(makeHttpError(413, 'Request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readBody(req, maxBytes = MAX_BODY_BYTES) {
  return (await readRawBody(req, maxBytes)).toString('utf8');
}

async function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  const type = String(req.headers['content-type'] || '').toLowerCase();
  if (!type.includes('application/json')) throw makeHttpError(415, 'Expected application/json.');
  const text = await readBody(req, maxBytes);
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw makeHttpError(400, 'Invalid JSON body.');
  }
}

function handleApiError(res, json, error) {
  const status = error.status || 500;
  return json(res, status, { error: status === 500 ? 'Internal server error.' : error.message });
}

module.exports = {
  makeHttpError,
  readRawBody,
  readBody,
  readJsonBody,
  handleApiError,
};
