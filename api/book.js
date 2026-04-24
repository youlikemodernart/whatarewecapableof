const crypto = require('crypto');
const {
  SLOT_DURATION_MIN,
  TIMEZONE,
  CALENDAR_ID,
  NOTIFY_EMAIL,
  isBookableStart,
  getCalendar,
  getBusyPeriods,
  slotOverlapsBusy,
} = require('./_calendar');

function clean(value) {
  return String(value || '').trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function uniqueAttendees(emails) {
  const seen = new Set();
  return emails
    .map(clean)
    .filter(Boolean)
    .filter((email) => {
      const key = email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((email) => ({ email }));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const start = clean(req.body?.start);
  const name = clean(req.body?.name);
  const email = clean(req.body?.email);
  const note = clean(req.body?.note);

  if (!start || !name || !email) {
    return res.status(400).json({ error: 'Missing required fields: start, name, email' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  const startTime = new Date(start);
  if (!isBookableStart(startTime)) {
    return res.status(400).json({ error: 'Choose an available time from the booking page.' });
  }

  try {
    const calendar = getCalendar(['https://www.googleapis.com/auth/calendar']);
    const endTime = new Date(startTime.getTime() + SLOT_DURATION_MIN * 60000);

    const freeBusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        timeZone: TIMEZONE,
        items: [{ id: CALENDAR_ID }],
      },
    });

    const busyPeriods = getBusyPeriods(freeBusy);
    if (slotOverlapsBusy({ start: startTime, end: endTime }, busyPeriods)) {
      return res.status(409).json({ error: 'This time slot is no longer available' });
    }

    const attendees = uniqueAttendees([email, NOTIFY_EMAIL]);
    const event = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      sendUpdates: 'all',
      conferenceDataVersion: 1,
      requestBody: {
        summary: `Call with ${name}`,
        description: [
          `Booked via whatarewecapableof.com`,
          `Name: ${name}`,
          `Email: ${email}`,
          note ? `Note:\n${note}` : '',
        ].filter(Boolean).join('\n\n'),
        start: { dateTime: startTime.toISOString(), timeZone: TIMEZONE },
        end: { dateTime: endTime.toISOString(), timeZone: TIMEZONE },
        attendees,
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      },
    });

    return res.json({
      success: true,
      eventId: event.data.id,
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      meetLink: event.data.hangoutLink || null,
    });
  } catch (err) {
    console.error('Booking error:', err.message, err.stack);
    return res.status(500).json({ error: 'Could not create booking' });
  }
};
