const { google } = require('googleapis');

const SLOT_DURATION_MIN = parseInt(process.env.BOOKING_SLOT_MINUTES || '60', 10);
const BUSINESS_START = parseInt(process.env.BOOKING_START_HOUR || '9', 10);
const BUSINESS_END = parseInt(process.env.BOOKING_END_HOUR || '17', 10);
const TIMEZONE = process.env.BOOKING_TIMEZONE || 'America/Chicago';
const CALENDAR_EMAIL = process.env.BOOKING_CALENDAR_EMAIL;
const LOOKAHEAD_DAYS = 14;

function getAuth() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    subject: CALENDAR_EMAIL,
  });
}

function getBusinessSlots(dateStr) {
  const slots = [];
  for (let hour = BUSINESS_START; hour < BUSINESS_END; hour++) {
    const start = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00`);
    const end = new Date(start.getTime() + SLOT_DURATION_MIN * 60000);
    slots.push({ start, end });
  }
  return slots;
}

function formatTime(date, tz) {
  return date.toLocaleTimeString('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function isWeekend(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  return day === 0 || day === 6;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = getAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    const { date } = req.query;

    if (date) {
      if (isWeekend(date)) {
        return res.json({ date, timezone: TIMEZONE, slots: [] });
      }

      const dayStart = new Date(`${date}T00:00:00`);
      const dayEnd = new Date(`${date}T23:59:59`);

      const freeBusy = await calendar.freebusy.query({
        requestBody: {
          timeMin: dayStart.toISOString(),
          timeMax: dayEnd.toISOString(),
          timeZone: TIMEZONE,
          items: [{ id: CALENDAR_EMAIL }],
        },
      });

      const busyPeriods = freeBusy.data.calendars[CALENDAR_EMAIL]?.busy || [];
      const allSlots = getBusinessSlots(date);

      const available = allSlots.filter((slot) => {
        return !busyPeriods.some((busy) => {
          const busyStart = new Date(busy.start);
          const busyEnd = new Date(busy.end);
          return slot.start < busyEnd && slot.end > busyStart;
        });
      });

      return res.json({
        date,
        timezone: TIMEZONE,
        slots: available.map((s) => ({
          start: s.start.toISOString(),
          end: s.end.toISOString(),
          display: formatTime(s.start, TIMEZONE),
        })),
      });
    }

    const dates = [];
    const now = new Date();
    let cursor = new Date(now);
    cursor.setDate(cursor.getDate() + 1);

    while (dates.length < LOOKAHEAD_DAYS) {
      const dateStr = cursor.toISOString().split('T')[0];
      if (!isWeekend(dateStr)) {
        dates.push(dateStr);
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    const timeMin = new Date(dates[0] + 'T00:00:00').toISOString();
    const timeMax = new Date(dates[dates.length - 1] + 'T23:59:59').toISOString();

    const freeBusy = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        timeZone: TIMEZONE,
        items: [{ id: CALENDAR_EMAIL }],
      },
    });

    const busyPeriods = freeBusy.data.calendars[CALENDAR_EMAIL]?.busy || [];

    const result = dates.map((dateStr) => {
      const allSlots = getBusinessSlots(dateStr);
      const available = allSlots.filter((slot) => {
        return !busyPeriods.some((busy) => {
          const busyStart = new Date(busy.start);
          const busyEnd = new Date(busy.end);
          return slot.start < busyEnd && slot.end > busyStart;
        });
      });
      return {
        date: dateStr,
        availableCount: available.length,
        dayName: new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
      };
    });

    return res.json({
      timezone: TIMEZONE,
      dates: result.filter((d) => d.availableCount > 0),
    });
  } catch (err) {
    console.error('Availability error:', err.message);
    return res.status(500).json({ error: 'Could not fetch availability' });
  }
};
