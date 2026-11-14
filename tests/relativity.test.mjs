import test from "node:test";
import assert from "node:assert/strict";
import { calculateTransit, lorentzGamma } from "../scripts/relativity.mjs";

// The solver is still used by campaign time (and by the dormant astral-travel code). The cluster
// coordinates it used to be tested with were removed, so routes are given as explicit distances.
const LONG_ROUTE_LY = 2.41; // the former cluster's shortest depth-separated system pair

test("0.995c gamma is about 10.0125", () => {
  assert.ok(Math.abs(lorentzGamma(0.995) - 10.012523) < 1e-5);
});

test("200g trip to 0.995c reaches cap across a multi-light-year route", () => {
  const transit = calculateTransit(LONG_ROUTE_LY, {
    accelerationG: 200,
    cruiseBeta: 0.995,
  });
  assert.equal(transit.reachesCruise, true);
  assert.ok(transit.shipYears > 0.25 && transit.shipYears < 0.28);
  assert.ok(transit.clusterYears > 2.4 && transit.clusterYears < 2.5);
});

test("very short route flips before reaching cruise cap", () => {
  const transit = calculateTransit(0.01, { accelerationG: 200, cruiseBeta: 0.995 });
  assert.equal(transit.reachesCruise, false);
  assert.ok(transit.peakBeta < 0.995);
});
