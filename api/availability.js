const {
  TIMEZONE,
  CALENDAR_ID,
  getBookingConfig,
  parseDateString,
  isBookableDate,
  getDayRange,
  getBusinessSlots,
  getBookableDates,
  formatTime,
  getCalendar,
  getBusyPeriods,
  slotOverlapsBusy,
} = require('./_calendar');

function getTypeFromRequest(req) {
  return String(req.query?.type || req.query?.bookingType || req.query?.flow || 'coach').trim();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  let bookingConfig;
  try {
    bookingConfig = getBookingConfig(getTypeFromRequest(req));
  } catch (err) {
    return res.status(400).json({ error: 'Unknown booking type' });
  }

  try {
    const calendar = getCalendar(['https://www.googleapis.com/auth/calendar']);
    const { date } = req.query;
    const bookableDates = getBookableDates(bookingConfig);

    if (date) {
      if (!parseDateString(date)) {
        return res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD.' });
      }

      if (!isBookableDate(date, bookingConfig) || !bookableDates.includes(date)) {
        return res.json({
          type: bookingConfig.key,
          timezone: TIMEZONE,
          slotMinutes: bookingConfig.slotDurationMin,
          bufferMinutes: bookingConfig.bufferMinutes,
          date,
          slots: [],
        });
      }

      const range = getDayRange(date);
      const freeBusy = await calendar.freebusy.query({
        requestBody: {
          timeMin: range.start.toISOString(),
          timeMax: range.end.toISOString(),
          timeZone: TIMEZONE,
          items: [{ id: CALENDAR_ID }],
        },
      });

      const busyPeriods = getBusyPeriods(freeBusy);
      const available = getBusinessSlots(date, bookingConfig)
        .filter((slot) => !slotOverlapsBusy(slot, busyPeriods, bookingConfig.bufferMinutes));

      return res.json({
        type: bookingConfig.key,
        timezone: TIMEZONE,
        slotMinutes: bookingConfig.slotDurationMin,
        bufferMinutes: bookingConfig.bufferMinutes,
        date,
        slots: available.map((slot) => ({
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
          display: formatTime(slot.start, TIMEZONE),
        })),
      });
    }

    if (bookableDates.length === 0) {
      return res.json({
        type: bookingConfig.key,
        timezone: TIMEZONE,
        slotMinutes: bookingConfig.slotDurationMin,
        bufferMinutes: bookingConfig.bufferMinutes,
        dates: [],
      });
    }

    const firstRange = getDayRange(bookableDates[0]);
    const lastRange = getDayRange(bookableDates[bookableDates.length - 1]);

    const freeBusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: firstRange.start.toISOString(),
        timeMax: lastRange.end.toISOString(),
        timeZone: TIMEZONE,
        items: [{ id: CALENDAR_ID }],
      },
    });

    const busyPeriods = getBusyPeriods(freeBusy);
    const result = bookableDates.map((dateStr) => {
      const available = getBusinessSlots(dateStr, bookingConfig)
        .filter((slot) => !slotOverlapsBusy(slot, busyPeriods, bookingConfig.bufferMinutes));
      return {
        date: dateStr,
        availableCount: available.length,
        dayName: new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      };
    });

    return res.json({
      type: bookingConfig.key,
      timezone: TIMEZONE,
      slotMinutes: bookingConfig.slotDurationMin,
      bufferMinutes: bookingConfig.bufferMinutes,
      dates: result.filter((date) => date.availableCount > 0),
    });
  } catch (err) {
    console.error('Availability error:', err.message, err.stack);
    return res.status(500).json({ error: 'Could not fetch availability' });
  }
};
