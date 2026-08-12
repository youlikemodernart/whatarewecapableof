const { Readable } = require('stream');
const { get } = require('@vercel/blob');
const { getSession, json } = require('../_auth');
const { handleApiError, makeHttpError } = require('../_http');
const { adminUpload } = require('../_uploads');
const { storageConfig } = require('../_db');

function dispositionName(value) {
  return String(value || 'headshot').replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 180) || 'headshot';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }
  try {
    if (!getSession(req)) throw makeHttpError(401, 'Sign in required.');
    const url = new URL(req.url, 'http://ask.local');
    const upload = await adminUpload(url.searchParams.get('id'), url.searchParams.get('representation') || 'publication');
    let bytes;
    let stream;
    if (storageConfig().mode === 'memory') {
      bytes = Buffer.from(upload.retrievalMemoryBytes || '', 'base64');
    } else {
      const fetched = await get(upload.retrievalPathname, { access: 'private', useCache: false });
      if (!fetched || fetched.statusCode !== 200) throw makeHttpError(404, 'Upload not found.');
      stream = Readable.fromWeb(fetched.stream);
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', upload.retrievalContentType);
    res.setHeader('Content-Length', String(upload.retrievalSizeBytes));
    res.setHeader('Content-Disposition', `inline; filename="${dispositionName(upload.retrievalName)}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (bytes) return res.end(bytes);
    stream.on('error', () => { if (!res.headersSent) res.statusCode = 502; res.end(); });
    return stream.pipe(res);
  } catch (error) {
    return handleApiError(res, json, error);
  }
};
