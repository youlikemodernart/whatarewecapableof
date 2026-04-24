const { google } = require('googleapis');

const SLOT_DURATION_MIN = parseInt(process.env.BOOKING_SLOT_MINUTES || '60', 10);
const TIMEZONE = process.env.BOOKING_TIMEZONE || 'America/Chicago';
const CALENDAR_EMAIL = process.env.BOOKING_CALENDAR_EMAIL;
const NOTIFY_EMAIL = process.env.BOOKING_NOTIFY_EMAIL || '';

function getAuth() {
  const creds = JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString());
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
    subject: CALENDAR_EMAIL,
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { start, name, email, note } = req.body;

  if (!start || !name || !email) {
    return res.status(400).json({ error: 'Missing required fields: start, name, email' });
  }

  try {
    const auth = getAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    const startTime = new Date(start);
    const endTime = new Date(startTime.getTime() + SLOT_DURATION_MIN * 60000);

    const freeBusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        timeZone: TIMEZONE,
        items: [{ id: CALENDAR_EMAIL }],
      },
    });

    const busyPeriods = freeBusy.data.calendars[CALENDAR_EMAIL]?.busy || [];
    if (busyPeriods.length > 0) {
      return res.status(409).json({ error: 'This time slot is no longer available' });
    }

    const attendees = [{ email }];
    if (NOTIFY_EMAIL) {
      attendees.push({ email: NOTIFY_EMAIL });
    }

    const event = await calendar.events.insert({
      calendarId: CALENDAR_EMAIL,
      sendUpdates: 'all',
      requestBody: {
        summary: `Call with ${name}`,
        description: note ? `Note from ${name}:\n\n${note}` : `Booked via whatarewecapableof.com`,
        start: { dateTime: startTime.toISOString(), timeZone: TIMEZONE },
        end: { dateTime: endTime.toISOString(), timeZone: TIMEZONE },
        attendees,
      },
    });

    return res.json({
      success: true,
      eventId: event.data.id,
      start: startTime.toISOString(),
      end: endTime.toISOString(),
    });
  } catch (err) {
    console.error('Booking error:', err.message);
    return res.status(500).json({ error: 'Could not create booking' });
  }
};
