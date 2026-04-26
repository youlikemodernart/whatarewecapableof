const { requireSession, readTrackerData } = require('./_tracker');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSession(req, res)) return;

  try {
    return res.json(readTrackerData());
  } catch (err) {
    console.error('Tracker data error:', err.message, err.stack);
    return res.status(500).json({ error: 'Could not read proposal tracker data.' });
  }
};
