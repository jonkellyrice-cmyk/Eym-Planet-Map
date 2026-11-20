import test from "node:test";
// (The clock's date menus are tested at the end of this file.)
import assert from "node:assert/strict";
import {
  DAY_MS,
  CAMPAIGN_START_MS,
  DEFAULT_UNIVERSAL_TIME_STATE,
  NORTHWARD_EQUINOX_MS,
  UNION_EPOCH_MS,
  adjustUniversalTime,
  currentUniversalTimeMs,
  formatUniversalClock,
  formatUniversalDate,
  makeUniversalTimeMs,
  resumeUniversalTimeSession,
  setUniversalDateTime,
  setUniversalTimeRunning,
  universalTimeParts,
  weekdayIndex,
} from "../scripts/universal-time.mjs";

test("the campaign begins on 14 March, year 50, and the March equinox falls on 20 March every year", () => {
  assert.equal(DEFAULT_UNIVERSAL_TIME_STATE.baseMs, CAMPAIGN_START_MS);
  assert.equal(formatUniversalDate(CAMPAIGN_START_MS), "Sunday, March 14, 50");
  assert.equal(formatUniversalClock(CAMPAIGN_START_MS), "08:00:00");
  assert.equal(`${formatUniversalDate(NORTHWARD_EQUINOX_MS)} ${formatUniversalClock(NORTHWARD_EQUINOX_MS)}`, "Saturday, March 20, 50 12:00:00");
  assert.equal(formatUniversalDate(NORTHWARD_EQUINOX_MS + 10 * 350 * DAY_MS), "Saturday, March 20, 60");
  assert.ok(UNION_EPOCH_MS < CAMPAIGN_START_MS, "the internal astronomy anchor stays where it was");
});

test("running universal time advances from its real-time anchor", () => {
  const state = { baseMs: UNION_EPOCH_MS, anchorRealMs: 1_000, running: true };
  assert.equal(currentUniversalTimeMs(state, 61_000), UNION_EPOCH_MS + 60_000);
});

test("resuming a Foundry session discards downtime and then advances normally", () => {
  const checkpoint = { baseMs: UNION_EPOCH_MS + 300_000, anchorRealMs: 10_000, running: true };
  const resumed = resumeUniversalTimeSession(checkpoint, 3_610_000);
  assert.equal(resumed.baseMs, checkpoint.baseMs);
  assert.equal(currentUniversalTimeMs(resumed, 3_610_000), checkpoint.baseMs);
  assert.equal(currentUniversalTimeMs(resumed, 3_670_000), checkpoint.baseMs + 60_000);
});

test("pausing settles elapsed time and freezes the clock", () => {
  const running = { baseMs: UNION_EPOCH_MS, anchorRealMs: 1_000, running: true };
  const paused = setUniversalTimeRunning(running, false, 61_000);
  assert.equal(paused.baseMs, UNION_EPOCH_MS + 60_000);
  assert.equal(currentUniversalTimeMs(paused, 999_999), UNION_EPOCH_MS + 60_000);
});

test("GM adjustments preserve running state", () => {
  const adjusted = adjustUniversalTime({ ...DEFAULT_UNIVERSAL_TIME_STATE, anchorRealMs: 1_000 }, 3_600_000, 1_000);
  assert.equal(adjusted.running, true);
  assert.equal(formatUniversalClock(adjusted.baseMs), "09:00:00");
});

test("direct date and time setting validates calendar dates", () => {
  const state = setUniversalDateTime(DEFAULT_UNIVERSAL_TIME_STATE, {
    year: 5017,
    month: 2,
    day: 28,
    hour: 23,
    minute: 5,
    second: 0,
  }, 100);
  assert.equal(formatUniversalDate(state.baseMs), "Sunday, February 28, 5017");
  assert.equal(formatUniversalClock(state.baseMs), "23:05:00");
  assert.throws(() => makeUniversalTimeMs({ year: 5017, month: 2, day: 29 }), /does not exist/);
  assert.throws(() => makeUniversalTimeMs({ year: 5017, month: 13, day: 15 }), /does not exist/);
  assert.throws(() => makeUniversalTimeMs({ year: 5017, month: 14, day: 1 }), /outside the supported range/);
});

test("Eym's year: twelve 28-day months, a 14-day Year's End, exactly 350 days with no leap days", () => {
  const start = (year) => makeUniversalTimeMs({ year, month: 1, day: 1 });
  for (const year of [1, 4999, 5016, 5017, 5400]) assert.equal((start(year + 1) - start(year)) / DAY_MS, 350);
  assert.equal(formatUniversalDate(makeUniversalTimeMs({ year: 5016, month: 12, day: 28 })), "Sunday, December 28, 5016");
  assert.equal(formatUniversalDate(makeUniversalTimeMs({ year: 5016, month: 13, day: 1 })), "Monday, Year's End 1, 5016");
  const lastHoliday = makeUniversalTimeMs({ year: 5016, month: 13, day: 14, hour: 23, minute: 59, second: 59 });
  assert.equal(formatUniversalDate(lastHoliday), "Sunday, Year's End 14, 5016");
  assert.equal(formatUniversalDate(lastHoliday + 1000), "Monday, January 1, 5017");
  assert.deepEqual(universalTimeParts(lastHoliday + 1000), { year: 5017, month: 1, day: 1, dayOfYear: 1, hour: 0, minute: 0, second: 0 });
});

test("every month, the holiday and every year begin on a Monday", () => {
  for (const year of [5015, 5016, 5017]) for (let month = 1; month <= 13; month += 1) {
    assert.equal(weekdayIndex(makeUniversalTimeMs({ year, month, day: 1 })), 1, `${year}-${month}`);
  }
});

test("calendar round-trips every day of a year, including times before the epoch", () => {
  for (const year of [5015, 5016]) for (let month = 1; month <= 13; month += 1) {
    for (let day = 1; day <= (month === 13 ? 14 : 28); day += 1) {
      const ms = makeUniversalTimeMs({ year, month, day, hour: 6, minute: 7, second: 8 });
      const parts = universalTimeParts(ms);
      assert.deepEqual([parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second], [year, month, day, 6, 7, 8]);
    }
  }
});

test("the clock's date is chosen from menus: thirteen months by name, the month's own days, and the years round the year shown", async () => {
  const { CLOCK_YEARS_AFTER, CLOCK_YEARS_BEFORE, clockDateChoices } = await import("../scripts/universal-time.mjs");
  const june = clockDateChoices({ month: 6, year: 50 });
  assert.deepEqual(june.months.map(([value]) => value), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.deepEqual(june.months[5], [6, "June"]); assert.deepEqual(june.months[12], [13, "Year's End"]);
  assert.equal(june.days.length, 28); assert.deepEqual(june.days[0], [1, "1"]); assert.deepEqual(june.days.at(-1), [28, "28"]);
  // Year's End has fourteen days.
  assert.equal(clockDateChoices({ month: 13, year: 50 }).days.length, 14);
  // The years never go below year 1 and always hold the year shown.
  assert.equal(june.years[0][0], 1); assert.equal(june.years.at(-1)[0], 50 + CLOCK_YEARS_AFTER); assert.ok(june.years.some(([value]) => value === 50));
  const late = clockDateChoices({ month: 1, year: 5016 }); assert.equal(late.years[0][0], 5016 - CLOCK_YEARS_BEFORE); assert.equal(late.years.length, CLOCK_YEARS_BEFORE + CLOCK_YEARS_AFTER + 1);
  // The panel offers menus, not typed numbers, for the date.
  const { readFileSync } = await import("node:fs"), template = readFileSync(new URL("../templates/cluster-map.hbs", import.meta.url), "utf8");
  for (const name of ["universalMonth", "universalDay", "universalYear"]) assert.match(template, new RegExp(`<select name="${name}"></select>`));
  assert.ok(!/name="universal(Month|Day|Year)" type="number"/.test(template));
});
