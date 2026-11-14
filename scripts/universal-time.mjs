export const UNIVERSAL_TIME_SETTING = "universalTimeState";
export const UNION_EPOCH_MS = Date.UTC(5016, 8, 3, 10, 38, 0, 0);
export const DAY_MS = 86_400_000;

export const DEFAULT_UNIVERSAL_TIME_STATE = Object.freeze({
  baseMs: UNION_EPOCH_MS,
  anchorRealMs: 0,
  running: true,
});

// Eym's calendar: twelve Gregorian-named months of exactly 28 days (4 weeks), then a 14-day year-end
// holiday, for a 350-day year that matches Eym's tropical year exactly (no leap days). A day is 24 hours
// of 60 minutes of 60 seconds, all in Eym units (one Eym second is 365.2422 / 350 SI seconds).
// 28 days and 350 days are whole numbers of weeks, so every month and every year starts on the same weekday.
export const MONTH_NAMES = Object.freeze([
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]);
export const HOLIDAY_NAME = "Year's End";
export const DAYS_PER_MONTH = 28;
export const HOLIDAY_DAYS = 14;
export const HOLIDAY_MONTH = MONTH_NAMES.length + 1; // the holiday is addressed as month 13
export const DAYS_PER_YEAR = MONTH_NAMES.length * DAYS_PER_MONTH + HOLIDAY_DAYS; // 350
export const WEEKDAY_NAMES = Object.freeze(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
/** Weekday of the first day of every month and of the holiday (Monday). */
export const MONTH_START_WEEKDAY_INDEX = 1;

const positiveModulo = (value, modulus) => ((value % modulus) + modulus) % modulus;
const pad2 = (value) => String(value).padStart(2, "0");

export function normalizeUniversalTimeState(state) {
  const source = state && typeof state === "object" ? state : DEFAULT_UNIVERSAL_TIME_STATE;
  const baseMs = Number(source.baseMs);
  const anchorRealMs = Number(source.anchorRealMs);
  return {
    baseMs: Number.isFinite(baseMs) ? baseMs : UNION_EPOCH_MS,
    anchorRealMs: Number.isFinite(anchorRealMs) && anchorRealMs > 0 ? anchorRealMs : 0,
    running: source.running !== false,
  };
}

export function currentUniversalTimeMs(state, realNowMs = Date.now()) {
  const normalized = normalizeUniversalTimeState(state);
  if (!normalized.running || normalized.anchorRealMs <= 0) return normalized.baseMs;
  return normalized.baseMs + Math.max(0, Number(realNowMs) - normalized.anchorRealMs);
}

export function settleUniversalTimeState(state, realNowMs = Date.now()) {
  const normalized = normalizeUniversalTimeState(state);
  return {
    baseMs: currentUniversalTimeMs(normalized, realNowMs),
    anchorRealMs: Number(realNowMs),
    running: normalized.running,
  };
}

export function resumeUniversalTimeSession(state, realNowMs = Date.now()) {
  const normalized = normalizeUniversalTimeState(state);
  const now = Number(realNowMs);
  return {
    ...normalized,
    anchorRealMs: Number.isFinite(now) ? now : Date.now(),
  };
}

export function setUniversalTimeRunning(state, running, realNowMs = Date.now()) {
  const settled = settleUniversalTimeState(state, realNowMs);
  return { ...settled, running: Boolean(running) };
}

export function adjustUniversalTime(state, deltaMs, realNowMs = Date.now()) {
  const settled = settleUniversalTimeState(state, realNowMs);
  return { ...settled, baseMs: settled.baseMs + Number(deltaMs || 0) };
}

/** Days in a calendar month (1–12) or the year-end holiday (13). */
export function daysInMonth(month) {
  return month === HOLIDAY_MONTH ? HOLIDAY_DAYS : DAYS_PER_MONTH;
}

const dayIndexOf = (year, month, day) => (year - 1) * DAYS_PER_YEAR + (month - 1) * DAYS_PER_MONTH + (day - 1);
// The internal timeline anchor (UNION_EPOCH_MS) keeps its calendar label: 3 September 5016, 10:38.
const EPOCH_LABEL = Object.freeze({ year: 5016, month: 9, day: 3, hour: 10, minute: 38 });
const CALENDAR_ZERO_MS = UNION_EPOCH_MS - ((EPOCH_LABEL.hour * 60 + EPOCH_LABEL.minute) * 60_000) - dayIndexOf(EPOCH_LABEL.year, EPOCH_LABEL.month, EPOCH_LABEL.day) * DAY_MS;

export function makeUniversalTimeMs({ year, month, day, hour = 0, minute = 0, second = 0 }) {
  const values = [year, month, day, hour, minute, second].map(Number);
  if (!values.every(Number.isInteger)) throw new Error("Date and time values must be whole numbers.");
  const [y, m, d, h, min, sec] = values;
  if (y < 1 || m < 1 || m > HOLIDAY_MONTH || d < 1 || h < 0 || h > 23 || min < 0 || min > 59 || sec < 0 || sec > 59) {
    throw new Error("Date or time is outside the supported range.");
  }
  if (d > daysInMonth(m)) throw new Error("That date does not exist in the calendar of Eym.");
  return CALENDAR_ZERO_MS + dayIndexOf(y, m, d) * DAY_MS + ((h * 60 + min) * 60 + sec) * 1000;
}

export function setUniversalDateTime(state, parts, realNowMs = Date.now()) {
  const normalized = normalizeUniversalTimeState(state);
  return {
    baseMs: makeUniversalTimeMs(parts),
    anchorRealMs: Number(realNowMs),
    running: normalized.running,
  };
}

export function universalTimeParts(ms) {
  const elapsed = Number(ms) - CALENDAR_ZERO_MS;
  const dayIndex = Math.floor(elapsed / DAY_MS);
  const msOfDay = elapsed - dayIndex * DAY_MS;
  const year = Math.floor(dayIndex / DAYS_PER_YEAR) + 1;
  const dayOfYear = positiveModulo(dayIndex, DAYS_PER_YEAR); // 0-based
  const month = Math.min(HOLIDAY_MONTH, Math.floor(dayOfYear / DAYS_PER_MONTH) + 1);
  const day = dayOfYear - (month - 1) * DAYS_PER_MONTH + 1;
  const totalSeconds = Math.floor(msOfDay / 1000);
  return {
    year, month, day, dayOfYear: dayOfYear + 1,
    hour: Math.floor(totalSeconds / 3600),
    minute: Math.floor(totalSeconds / 60) % 60,
    second: totalSeconds % 60,
  };
}

export function weekdayIndex(ms) {
  const dayIndex = Math.floor((Number(ms) - CALENDAR_ZERO_MS) / DAY_MS);
  return positiveModulo(MONTH_START_WEEKDAY_INDEX + dayIndex, 7);
}

export function monthName(month) {
  return month === HOLIDAY_MONTH ? HOLIDAY_NAME : MONTH_NAMES[month - 1];
}

export function formatUniversalDate(ms) {
  const parts = universalTimeParts(ms);
  return `${WEEKDAY_NAMES[weekdayIndex(ms)]}, ${monthName(parts.month)} ${parts.day}, ${parts.year}`;
}

export function formatUniversalClock(ms) {
  const parts = universalTimeParts(ms);
  return `${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
}

export function formatUniversalTimeInput(ms) {
  const parts = universalTimeParts(ms);
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}
