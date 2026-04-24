const {
  TIMEZONE,
  CALENDAR_ID,
  parseDateString,
  isWeekend,
  getDayRange,
  getBusinessSlots,
  getBookableDates,
  formatTime,
  getCalendar,
  getBusyPeriods,
  slotOverlapsBusy,
} = require('./_calendar');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const calendar = getCalendar(['https://www.googleapis.com/auth/calendar']);
    const { date } = req.query;
    const bookableDates = getBookableDates();

    if (date) {
      if (!parseDateString(date)) {
        return res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD.' });
      }

      if (isWeekend(date) || !bookableDates.includes(date)) {
        return res.json({ date, timezone: TIMEZONE, slots: [] });
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
      const available = getBusinessSlots(date).filter((slot) => !slotOverlapsBusy(slot, busyPeriods));

      return res.json({
        date,
        timezone: TIMEZONE,
        slots: available.map((slot) => ({
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
          display: formatTime(slot.start, TIMEZONE),
        })),
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
      const available = getBusinessSlots(dateStr).filter((slot) => !slotOverlapsBusy(slot, busyPeriods));
      return {
        date: dateStr,
        availableCount: available.length,
        dayName: new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      };
    });

    return res.json({
      timezone: TIMEZONE,
      dates: result.filter((date) => date.availableCount > 0),
    });
  } catch (err) {
    console.error('Availability error:', err.message, err.stack);
    return res.status(500).json({ error: 'Could not fetch availability' });
  }
};
