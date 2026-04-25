const { google } = require('googleapis');

function env(name, fallback = '') {
  return (process.env[name] ?? fallback).trim();
}

function intEnv(name, fallback) {
  const value = parseInt(env(name, String(fallback)), 10);
  return Number.isFinite(value) ? value : fallback;
}

function listEnv(name, fallback = []) {
  const value = env(name);
  if (!value) return [...fallback];

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? [...new Set(items)] : [...fallback];
}

const TIMEZONE = env('BOOKING_TIMEZONE', 'America/Phoenix');
const CALENDAR_EMAIL = env('BOOKING_CALENDAR_EMAIL');
const IMPERSONATE_EMAIL = env('BOOKING_IMPERSONATE_EMAIL', CALENDAR_EMAIL);
const CALENDAR_ID = env('BOOKING_CALENDAR_ID', IMPERSONATE_EMAIL ? 'primary' : CALENDAR_EMAIL || 'primary');
const NOTIFY_EMAIL = env('BOOKING_NOTIFY_EMAIL');
const BUSY_CALENDAR_IDS = listEnv('BOOKING_BUSY_CALENDAR_IDS', [CALENDAR_ID]);

const DAY_ALIASES = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

function parseDayValue(value) {
  const token = String(value || '').trim().toLowerCase();
  if (!token) return null;

  if (/^\d+$/.test(token)) {
    const day = Number(token);
    if (day >= 0 && day <= 6) return day;
    if (day === 7) return 0;
  }

  return DAY_ALIASES[token] ?? null;
}

function parseDaysOfWeek(value, fallback) {
  if (!value) return [...fallback];

  const days = String(value)
    .split(/[\s,]+/)
    .map(parseDayValue)
    .filter((day) => day !== null);

  return days.length > 0 ? [...new Set(days)] : [...fallback];
}

function parseClockTime(value) {
  const match = /^(\d{1,2})(?::(\d{2}))?$/.exec(String(value || '').trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return hour * 60 + minute;
}

function parseWindows(value, fallback) {
  if (!value) return fallback.map((window) => ({ ...window }));

  const windows = String(value)
    .split(',')
    .map((range) => {
      const [startRaw, endRaw] = range.split('-');
      const start = parseClockTime(startRaw);
      const end = parseClockTime(endRaw);
      if (start === null || end === null || end <= start) return null;
      return { start, end };
    })
    .filter(Boolean);

  return windows.length > 0 ? windows : fallback.map((window) => ({ ...window }));
}

function createBookingConfig({
  key,
  label,
  envPrefix,
  defaultSlotMinutes,
  defaultBufferMinutes,
  defaultDaysOfWeek,
  defaultWindows,
  defaultLookaheadDays = 14,
  defaultSummaryPrefix,
  defaultSourceLabel,
}) {
  const slotDurationMin = Math.max(1, intEnv(`${envPrefix}_SLOT_MINUTES`, defaultSlotMinutes));
  const bufferMinutes = Math.max(0, intEnv(`${envPrefix}_BUFFER_MINUTES`, defaultBufferMinutes));
  const slotIntervalMin = Math.max(1, intEnv(`${envPrefix}_SLOT_INTERVAL_MINUTES`, slotDurationMin + bufferMinutes));
  const daysOfWeek = parseDaysOfWeek(env(`${envPrefix}_DAYS_OF_WEEK`, env(`${envPrefix}_DAYS`)), defaultDaysOfWeek);
  const windows = parseWindows(env(`${envPrefix}_WINDOWS`), defaultWindows);

  return {
    key,
    label,
    slotDurationMin,
    bufferMinutes,
    slotIntervalMin,
    daysOfWeek,
    windows,
    lookaheadDays: intEnv(`${envPrefix}_LOOKAHEAD_DAYS`, defaultLookaheadDays),
    summaryPrefix: env(`${envPrefix}_EVENT_SUMMARY`, defaultSummaryPrefix),
    sourceLabel: env(`${envPrefix}_EVENT_SOURCE`, defaultSourceLabel),
    busyCalendarIds: listEnv(`${envPrefix}_BUSY_CALENDAR_IDS`, BUSY_CALENDAR_IDS),
    availabilityCalendarId: env(`${envPrefix}_AVAILABILITY_CALENDAR_ID`),
    availabilityEventQuery: env(`${envPrefix}_AVAILABILITY_EVENT_QUERY`),
  };
}

const coachDefaultStart = intEnv('BOOKING_START_HOUR', 9) * 60;
const coachDefaultEnd = intEnv('BOOKING_END_HOUR', 17) * 60;

const BOOKING_CONFIGS = {
  coach: createBookingConfig({
    key: 'coach',
    label: 'Coaching call',
    envPrefix: 'BOOKING',
    defaultSlotMinutes: 60,
    defaultBufferMinutes: 0,
    defaultDaysOfWeek: [1, 2, 3, 4, 5],
    defaultWindows: [{ start: coachDefaultStart, end: coachDefaultEnd }],
    defaultLookaheadDays: 14,
    defaultSummaryPrefix: 'Coaching call',
    defaultSourceLabel: 'whatarewecapableof.com/coach/book',
  }),
  discovery: createBookingConfig({
    key: 'discovery',
    label: 'Discovery call',
    envPrefix: 'DISCOVERY_BOOKING',
    defaultSlotMinutes: 30,
    defaultBufferMinutes: 15,
    defaultDaysOfWeek: [4, 5],
    defaultWindows: [{ start: 10 * 60, end: 13 * 60 }],
    defaultLookaheadDays: 14,
    defaultSummaryPrefix: 'Discovery call',
    defaultSourceLabel: 'whatarewecapableof.com/book',
  }),
};

const BOOKING_ALIASES = {
  proposal: 'discovery',
  proposals: 'discovery',
  acquisition: 'discovery',
  sales: 'discovery',
};

function getBookingConfig(type = 'coach') {
  const requested = String(type || 'coach').trim().toLowerCase();
  const key = BOOKING_ALIASES[requested] || requested || 'coach';
  const config = BOOKING_CONFIGS[key];
  if (!config) throw new Error(`Unknown booking type: ${requested}`);
  return config;
}

const dateTimeFormatters = new Map();

function getFormatter(timeZone) {
  if (!dateTimeFormatters.has(timeZone)) {
    dateTimeFormatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }));
  }
  return dateTimeFormatters.get(timeZone);
}

function partsInTimeZone(date, timeZone = TIMEZONE) {
  const parts = getFormatter(timeZone).formatToParts(date);
  const values = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function dateStringFromParts(parts) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function dateStringInTimeZone(date, timeZone = TIMEZONE) {
  return dateStringFromParts(partsInTimeZone(date, timeZone));
}

function parseDateString(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function addDays(dateStr, days) {
  const parts = parseDateString(dateStr);
  if (!parts) throw new Error(`Invalid date: ${dateStr}`);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
  return date.toISOString().slice(0, 10);
}

function dayOfWeek(dateStr) {
  const parts = parseDateString(dateStr);
  if (!parts) return null;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  return date.getUTCDay();
}

function isWeekend(dateStr) {
  const day = dayOfWeek(dateStr);
  return day === 0 || day === 6 || day === null;
}

function isBookableDate(dateStr, config = getBookingConfig()) {
  const day = dayOfWeek(dateStr);
  return day !== null && config.daysOfWeek.includes(day);
}

function zonedTimeToDate(dateStr, hour = 0, minute = 0, second = 0, timeZone = TIMEZONE) {
  const parts = parseDateString(dateStr);
  if (!parts) throw new Error(`Invalid date: ${dateStr}`);

  const utcGuess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, second));
  const zonedParts = partsInTimeZone(utcGuess, timeZone);
  const zonedAsUtc = Date.UTC(
    zonedParts.year,
    zonedParts.month - 1,
    zonedParts.day,
    zonedParts.hour,
    zonedParts.minute,
    zonedParts.second
  );
  const offset = zonedAsUtc - utcGuess.getTime();

  return new Date(utcGuess.getTime() - offset);
}

function getDayRange(dateStr, timeZone = TIMEZONE) {
  const nextDate = addDays(dateStr, 1);
  return {
    start: zonedTimeToDate(dateStr, 0, 0, 0, timeZone),
    end: zonedTimeToDate(nextDate, 0, 0, 0, timeZone),
  };
}

function getEarliestBookableDate() {
  return addDays(dateStringInTimeZone(new Date()), 1);
}

function getAvailabilitySearchRange(config = getBookingConfig()) {
  const startDate = getEarliestBookableDate();
  const maxCalendarDays = Math.max(config.lookaheadDays * 14, 60);
  const endDate = addDays(startDate, maxCalendarDays);

  return {
    start: getDayRange(startDate).start,
    end: getDayRange(endDate).end,
  };
}

function getSlotsFromWindows(dateStr, windows, config = getBookingConfig()) {
  const slots = [];
  for (const window of windows) {
    for (
      let minuteOfDay = window.start;
      minuteOfDay + config.slotDurationMin <= window.end;
      minuteOfDay += config.slotIntervalMin
    ) {
      const hour = Math.floor(minuteOfDay / 60);
      const minute = minuteOfDay % 60;
      const start = zonedTimeToDate(dateStr, hour, minute, 0);
      const end = new Date(start.getTime() + config.slotDurationMin * 60000);
      slots.push({ start, end });
    }
  }

  return slots;
}

function getBusinessSlots(dateStr, config = getBookingConfig()) {
  if (!isBookableDate(dateStr, config)) return [];
  return getSlotsFromWindows(dateStr, config.windows, config);
}

function eventDateTime(event, field) {
  const value = event?.[field]?.dateTime;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function minutesInTimeZone(date, timeZone = TIMEZONE) {
  const parts = partsInTimeZone(date, timeZone);
  return parts.hour * 60 + parts.minute;
}

function getAvailabilityWindows(dateStr, availabilityEvents = []) {
  const range = getDayRange(dateStr);
  const windows = [];

  for (const event of availabilityEvents || []) {
    if (event.status === 'cancelled') continue;

    const eventStart = eventDateTime(event, 'start');
    const eventEnd = eventDateTime(event, 'end');
    if (!eventStart || !eventEnd || eventEnd <= eventStart) continue;

    const start = new Date(Math.max(eventStart.getTime(), range.start.getTime()));
    const end = new Date(Math.min(eventEnd.getTime(), range.end.getTime()));
    if (end <= start) continue;

    windows.push({
      start: minutesInTimeZone(start),
      end: minutesInTimeZone(end),
    });
  }

  return windows;
}

function getSlotsFromAvailabilityEvents(dateStr, availabilityEvents = [], config = getBookingConfig()) {
  const windows = getAvailabilityWindows(dateStr, availabilityEvents);
  return getSlotsFromWindows(dateStr, windows, config);
}

function getCandidateSlots(dateStr, config = getBookingConfig(), availabilityEvents = null) {
  if (config.availabilityCalendarId) {
    return getSlotsFromAvailabilityEvents(dateStr, availabilityEvents || [], config);
  }

  return getBusinessSlots(dateStr, config);
}

function getBookableDates(config = getBookingConfig()) {
  const dates = [];
  let cursor = getEarliestBookableDate();
  let inspectedDays = 0;
  const maxCalendarDays = Math.max(config.lookaheadDays * 14, 60);

  while (dates.length < config.lookaheadDays && inspectedDays < maxCalendarDays) {
    if (isBookableDate(cursor, config)) dates.push(cursor);
    cursor = addDays(cursor, 1);
    inspectedDays += 1;
  }

  return dates;
}

function getBookableDatesFromAvailabilityEvents(availabilityEvents = [], config = getBookingConfig()) {
  const dates = [];
  const seen = new Set();
  const earliest = getEarliestBookableDate();

  const events = [...(availabilityEvents || [])].sort((a, b) => {
    const aStart = eventDateTime(a, 'start')?.getTime() ?? 0;
    const bStart = eventDateTime(b, 'start')?.getTime() ?? 0;
    return aStart - bStart;
  });

  for (const event of events) {
    const eventStart = eventDateTime(event, 'start');
    const eventEnd = eventDateTime(event, 'end');
    if (!eventStart || !eventEnd || eventEnd <= eventStart) continue;

    let cursor = dateStringInTimeZone(eventStart);
    const lastDate = dateStringInTimeZone(new Date(eventEnd.getTime() - 1));

    while (cursor <= lastDate) {
      if (cursor >= earliest && !seen.has(cursor) && getSlotsFromAvailabilityEvents(cursor, events, config).length > 0) {
        seen.add(cursor);
        dates.push(cursor);
        if (dates.length >= config.lookaheadDays) return dates;
      }
      cursor = addDays(cursor, 1);
    }
  }

  return dates;
}

function isBookableStart(startTime, config = getBookingConfig()) {
  if (!(startTime instanceof Date) || Number.isNaN(startTime.getTime())) return false;
  if (config.availabilityCalendarId) return false;

  const dateStr = dateStringInTimeZone(startTime);
  if (!getBookableDates(config).includes(dateStr)) return false;

  return getBusinessSlots(dateStr, config).some((slot) => slot.start.getTime() === startTime.getTime());
}

function formatTime(date, timeZone = TIMEZONE) {
  return date.toLocaleTimeString('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getServiceAccountCredentials() {
  const encodedKey = env('GOOGLE_SERVICE_ACCOUNT_KEY');
  if (!encodedKey) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_KEY');

  const decoded = Buffer.from(encodedKey, 'base64').toString();
  return JSON.parse(decoded);
}

function getAuth(scopes) {
  const creds = getServiceAccountCredentials();
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    subject: IMPERSONATE_EMAIL || undefined,
    scopes,
  });
}

function getCalendar(scopes) {
  return google.calendar({ version: 'v3', auth: getAuth(scopes) });
}

async function getAvailabilityEvents(calendar, config, rangeStart, rangeEnd) {
  if (!config.availabilityCalendarId) return null;

  const response = await calendar.events.list({
    calendarId: config.availabilityCalendarId,
    timeMin: rangeStart.toISOString(),
    timeMax: rangeEnd.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    q: config.availabilityEventQuery || undefined,
  });

  return response.data.items || [];
}

function getBusyPeriods(freeBusyResponse, calendarIds = [CALENDAR_ID]) {
  const calendars = freeBusyResponse.data.calendars || {};
  const inaccessible = [];
  const busyPeriods = [];

  for (const calendarId of calendarIds) {
    const calendar = calendars[calendarId];
    if (!calendar) {
      inaccessible.push({ id: calendarId, reason: 'No free/busy response' });
      continue;
    }

    if (calendar.errors?.length) {
      inaccessible.push({
        id: calendarId,
        reason: calendar.errors.map((error) => error.reason || error.domain || 'unknown').join(', '),
      });
      continue;
    }

    busyPeriods.push(...(calendar.busy || []));
  }

  if (inaccessible.length) {
    const details = inaccessible.map((calendar) => `${calendar.id} (${calendar.reason})`).join(', ');
    throw new Error(`Could not read busy calendar(s): ${details}`);
  }

  return busyPeriods;
}

function slotOverlapsBusy(slot, busyPeriods, bufferMinutes = 0) {
  const bufferMs = bufferMinutes * 60000;
  const slotStart = new Date(slot.start.getTime() - bufferMs);
  const slotEnd = new Date(slot.end.getTime() + bufferMs);

  return busyPeriods.some((busy) => {
    const busyStart = new Date(busy.start);
    const busyEnd = new Date(busy.end);
    return slotStart < busyEnd && slotEnd > busyStart;
  });
}

module.exports = {
  TIMEZONE,
  CALENDAR_ID,
  CALENDAR_EMAIL,
  IMPERSONATE_EMAIL,
  NOTIFY_EMAIL,
  BUSY_CALENDAR_IDS,
  BOOKING_CONFIGS,
  getBookingConfig,
  parseDateString,
  addDays,
  dateStringInTimeZone,
  isWeekend,
  isBookableDate,
  getDayRange,
  getEarliestBookableDate,
  getAvailabilitySearchRange,
  getBusinessSlots,
  getCandidateSlots,
  getBookableDates,
  getBookableDatesFromAvailabilityEvents,
  isBookableStart,
  formatTime,
  getCalendar,
  getAvailabilityEvents,
  getBusyPeriods,
  slotOverlapsBusy,
};
