# Checkpoint: Caren climate, next steps (work in progress; not for merge)

Saved 21 November 2026 at the owner's request ("Pause for now"). Branch `claude/real-geography-circulation`
(built on `claude/rain-band-energy-balance`). Shipped state is unchanged: main is v0.43.0.

## State of this branch

- Source code: steps 1, 2, 3, 4 and 6 of the owner's block "Caren climate: decision + next steps" are written.
- Derived data is HALF BUILT: the build was stopped after the energy balance, Caren's survey (first pass) and the
  ocean climate; the rain and everything after it are still step 1's. Run `node tools/build-generated.mjs` (repeat
  while it says "not finished"), then `node tools/world.mjs --no-build`, before reading any data file or running tests.
- Tests: not yet brought up to date. After step 1 alone, 14 of 612 failed (pins and expectations that follow the
  changed world; listed in the session). Expect more after the full build. None has been weakened.
- Dials set for step 6: `energy.bandFollowsBalance: true`. Banks and shallow-sea warmth are off
  (`seaFloor.banks: []`, `ocean.shallowWarmC: 0`).

## What each step is, in the code

1. Aquaplanet assumptions removed. `tools/generate-eym-energy.mjs` writes `scripts/eym-rain-band.generated.mjs`:
   the belts' swing from the land by longitude (0.2 of the Sun's declination over open ocean, 1.145 over the most
   land, 0.423 in Eym's mean; it was 0.4 everywhere), the westerlies' strength by hemisphere from the land in their
   path (north 0.991, south 1.009; it was 1 and 1.15, Earth's). Dials `ocean.beltShift`, `weather.beltShift` and
   `rain.wind.seasonShift` are gone. Not changed, to report: the plate fit's 98.6% is the cores' share before the
   land is grown (comment corrected in the dials; the fit's own file is untouched, since any edit to it refits the
   plates); sea-level temperature by latitude and the reference rain by latitude are Earth-shaped and symmetric;
   the El Niño periods are Earth's; the trade-tilt's cold tongue is centred 1° S; the jets' waves are modest.
2. East–west circulation (`zonalHeat` in `scripts/eym-rain.mjs`, dials `rain.zonal`). Measured: rising over Gaffa
   (+0.37 °C of heating about 165° E), sinking centred about 35° W (−0.5), only −0.06 to −0.09 over Caren: it takes
   about 2% off Caren's rain.
3. Trade-wind inversion (`lidShare`, `lidM`, `columnOver`, dials `rain.lid`): no lid within about 9° of the band;
   elsewhere in the trades a lid about 2,000 m (lower over cold water and under sinking air); under it only shallow
   showers (1.5 mm a day), deep rain judged by the whole column, 70% of the low air that meets high ground turned
   aside, climbs wring only below the lid.
4. Heated land draws the band (`landSummerC` in the band's place, dials `rain.belt`). Small for Caren: near the
   equator there is little summer.
6. The band's mean from the hemispheres' energy balance (0.18° S), switched on.
5. Not started beyond what steps 2 and 3 give (lid lower over cold water). The winds are already each season's own.

## Measurements so far (coarse one-degree sample, `tools/wip/steps.mjs`; mm a year, dry months)

| Stage | Band over Caren | North | Plateau sample | South | Molkath west | Garyk |
|---|---|---|---|---|---|---|
| 0.43.0 (survey) | 6.3° S to 13.8° N | 2,575, 1.0 | 2,878, 0 | 1,671, 3.7 | 1,610 | 1,553, 3.8 |
| Step 1 | 0.9° S to 6.5° N | 3,072, 0.2 | 3,546, 0 | 1,549, 2.7 | 1,439, 3.4 | 1,380, 4.9 |
| + step 2 | same | 3,018, 0.3 | 3,495, 0 | 1,523, 2.7 | 1,377, 3.4 | 1,376, 4.9 |
| + step 4 | 2.1° S to 6.5° N | 2,944, 0.7 | 3,649, 0 | 1,799, 2.6 | 1,178, 5.2 | 1,900, 3.9 |
| + step 6, lid as last corrected | 7.5° S to 6.6° N | 2,462, 1.5 | 3,067, 0 | 1,886, 2.8 | 1,131, 5.2 | 1,306, 6.4 |

(The 0.43.0 row is the full survey's; the others are the coarse sample, whose regions differ a little. The step 3
figures before the lid was corrected are not kept: the first lid made high ground wetter, which was wrong.)
In the last row the north's driest months fall to 78 mm and the plateau sample's to 140 mm (they were 175 and 250).

## Not found yet

The plateau has no dry month; the north is wetter than the south; the Molkath is not arid; Garyk is drier than in
0.43.0 with a longer dry season. One very wet place (2.5° N 0.5° E, 2,084 m, windward of the Sondel's remnant)
dominates the small plateau sample: use the survey's 148 places after a full build.

## Next

1. Finish the build; read the survey (`node tools/wip/carenband.mjs data/eym/caren.json`) and the world report.
2. Report steps 1 to 4 and 6 to the owner with the survey's numbers, north and desert together, and Garyk.
3. Step 5, then causal tests for each mechanism (on against off), then bring the suite up to date.
4. Nothing is merged without the owner's go-ahead and pictures.

Also open: the v0.43.0 Region tiles are not refreshed (Vercel refused requests from the session's machine); the
purge switch is off.
