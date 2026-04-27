const crypto = require('crypto');
const {
  TIMEZONE,
  CALENDAR_ID,
  NOTIFY_EMAIL,
  getBookingConfig,
  addDays,
  dateStringInTimeZone,
  getDayRange,
  getCandidateSlots,
  getCalendar,
  getAvailabilityEvents,
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

function getTypeFromRequest(req) {
  return clean(req.body?.type || req.body?.bookingType || req.query?.type || req.query?.flow || 'coach');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let bookingConfig;
  try {
    bookingConfig = getBookingConfig(getTypeFromRequest(req));
  } catch (err) {
    return res.status(400).json({ error: 'Unknown booking type' });
  }

  const start = clean(req.body?.start);
  const name = clean(req.body?.name);
  const email = clean(req.body?.email);
  const purpose = clean(req.body?.purpose);
  const note = clean(req.body?.note);

  if (!start || !name || !email || !purpose) {
    return res.status(400).json({ error: 'Missing required fields: start, name, email, purpose' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  const startTime = new Date(start);
  if (Number.isNaN(startTime.getTime())) {
    return res.status(400).json({ error: 'Choose an available time from the booking page.' });
  }

  const dateStr = dateStringInTimeZone(startTime);
  const earliestDate = addDays(dateStringInTimeZone(new Date()), 1);
  if (dateStr < earliestDate) {
    return res.status(400).json({ error: 'Choose an available time from the booking page.' });
  }

  try {
    const calendar = getCalendar(['https://www.googleapis.com/auth/calendar']);
    const dayRange = getDayRange(dateStr);
    const availabilityEvents = await getAvailabilityEvents(calendar, bookingConfig, dayRange.start, dayRange.end);
    const candidateSlot = getCandidateSlots(dateStr, bookingConfig, availabilityEvents)
      .find((slot) => slot.start.getTime() === startTime.getTime());

    if (!candidateSlot) {
      return res.status(400).json({ error: 'Choose an available time from the booking page.' });
    }

    const endTime = candidateSlot.end;
    const bufferMs = bookingConfig.bufferMinutes * 60000;

    const freeBusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: new Date(startTime.getTime() - bufferMs).toISOString(),
        timeMax: new Date(endTime.getTime() + bufferMs).toISOString(),
        timeZone: TIMEZONE,
        items: bookingConfig.busyCalendarIds.map((id) => ({ id })),
      },
    });

    const busyPeriods = getBusyPeriods(freeBusy, bookingConfig.busyCalendarIds);
    if (slotOverlapsBusy({ start: startTime, end: endTime }, busyPeriods, bookingConfig.bufferMinutes)) {
      return res.status(409).json({ error: 'This time slot is no longer available' });
    }

    const attendees = uniqueAttendees([email, NOTIFY_EMAIL]);
    const event = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      sendUpdates: 'all',
      conferenceDataVersion: 1,
      requestBody: {
        summary: `${bookingConfig.summaryPrefix} with ${name}`,
        description: [
          `Booked via ${bookingConfig.sourceLabel}`,
          `Booking type: ${bookingConfig.label}`,
          `Name: ${name}`,
          `Email: ${email}`,
          `Purpose:\n${purpose}`,
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
      type: bookingConfig.key,
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
