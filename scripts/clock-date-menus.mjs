// The choices of the campaign clock's date menus (month, day, year). Pure; the clock's panel fills its menus from these.
import { HOLIDAY_MONTH, HOLIDAY_NAME, MONTH_NAMES, daysInMonth } from "./universal-time.mjs";

/** How many years before and after the year shown the clock's year menu offers. */
export const CLOCK_YEARS_BEFORE = 100, CLOCK_YEARS_AFTER = 150;
/** The choices of the clock's date menus: [value, label] for the months (Year's End is the thirteenth), a month's days, and the years round a year. */
export function clockDateChoices({ month, year }) {
  const months = [...MONTH_NAMES.map((name, index) => [index + 1, name]), [HOLIDAY_MONTH, HOLIDAY_NAME]];
  const days = Array.from({ length: daysInMonth(month) }, (_, index) => [index + 1, String(index + 1)]);
  const first = Math.max(1, year - CLOCK_YEARS_BEFORE), years = Array.from({ length: year + CLOCK_YEARS_AFTER - first + 1 }, (_, index) => [first + index, String(first + index)]);
  return { months, days, years };
}
