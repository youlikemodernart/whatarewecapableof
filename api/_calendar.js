const { google } = require('googleapis');

function env(name, fallback = '') {
  return (process.env[name] ?? fallback).trim();
}

function intEnv(name, fallback) {
  const value = parseInt(env(name, String(fallback)), 10);
  return Number.isFinite(value) ? value : fallback;
}

const SLOT_DURATION_MIN = intEnv('BOOKING_SLOT_MINUTES', 60);
const SLOT_INTERVAL_MIN = intEnv('BOOKING_SLOT_INTERVAL_MINUTES', SLOT_DURATION_MIN);
const BUSINESS_START = intEnv('BOOKING_START_HOUR', 9);
const BUSINESS_END = intEnv('BOOKING_END_HOUR', 17);
const TIMEZONE = env('BOOKING_TIMEZONE', 'America/Arizona');
const CALENDAR_EMAIL = env('BOOKING_CALENDAR_EMAIL');
const IMPERSONATE_EMAIL = env('BOOKING_IMPERSONATE_EMAIL', CALENDAR_EMAIL);
const CALENDAR_ID = env('BOOKING_CALENDAR_ID', IMPERSONATE_EMAIL ? 'primary' : CALENDAR_EMAIL || 'primary');
const NOTIFY_EMAIL = env('BOOKING_NOTIFY_EMAIL');
const LOOKAHEAD_DAYS = intEnv('BOOKING_LOOKAHEAD_DAYS', 14);

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

function isWeekend(dateStr) {
  const parts = parseDateString(dateStr);
  if (!parts) return true;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  const day = date.getUTCDay();
  return day === 0 || day === 6;
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

function getDayRange(dateStr) {
  const nextDate = addDays(dateStr, 1);
  return {
    start: zonedTimeToDate(dateStr, 0, 0, 0),
    end: zonedTimeToDate(nextDate, 0, 0, 0),
  };
}

function getBusinessSlots(dateStr) {
  const slots = [];
  const startMinutes = BUSINESS_START * 60;
  const endMinutes = BUSINESS_END * 60;

  for (let minuteOfDay = startMinutes; minuteOfDay + SLOT_DURATION_MIN <= endMinutes; minuteOfDay += SLOT_INTERVAL_MIN) {
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    const start = zonedTimeToDate(dateStr, hour, minute, 0);
    const end = new Date(start.getTime() + SLOT_DURATION_MIN * 60000);
    slots.push({ start, end });
  }

  return slots;
}

function getBookableDates() {
  const dates = [];
  let cursor = addDays(dateStringInTimeZone(new Date()), 1);

  while (dates.length < LOOKAHEAD_DAYS) {
    if (!isWeekend(cursor)) dates.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function isBookableStart(startTime) {
  if (!(startTime instanceof Date) || Number.isNaN(startTime.getTime())) return false;

  const dateStr = dateStringInTimeZone(startTime);
  if (!getBookableDates().includes(dateStr)) return false;

  return getBusinessSlots(dateStr).some((slot) => slot.start.getTime() === startTime.getTime());
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

function getBusyPeriods(freeBusyResponse) {
  return freeBusyResponse.data.calendars?.[CALENDAR_ID]?.busy || [];
}

function slotOverlapsBusy(slot, busyPeriods) {
  return busyPeriods.some((busy) => {
    const busyStart = new Date(busy.start);
    const busyEnd = new Date(busy.end);
    return slot.start < busyEnd && slot.end > busyStart;
  });
}

module.exports = {
  SLOT_DURATION_MIN,
  TIMEZONE,
  CALENDAR_ID,
  CALENDAR_EMAIL,
  IMPERSONATE_EMAIL,
  NOTIFY_EMAIL,
  LOOKAHEAD_DAYS,
  parseDateString,
  isWeekend,
  getDayRange,
  getBusinessSlots,
  getBookableDates,
  isBookableStart,
  formatTime,
  getCalendar,
  getBusyPeriods,
  slotOverlapsBusy,
};
