import test from "node:test";
import assert from "node:assert/strict";
import {
  DAY_MS,
  DEFAULT_UNIVERSAL_TIME_STATE,
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

test("the timeline epoch keeps its date, September 3, 5016 at 10:38", () => {
  assert.equal(formatUniversalDate(UNION_EPOCH_MS), "Wednesday, September 3, 5016");
  assert.equal(formatUniversalClock(UNION_EPOCH_MS), "10:38:00");
  assert.equal(formatUniversalDate(UNION_EPOCH_MS + DAY_MS), "Thursday, September 4, 5016");
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
  assert.equal(formatUniversalClock(adjusted.baseMs), "11:38:00");
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
