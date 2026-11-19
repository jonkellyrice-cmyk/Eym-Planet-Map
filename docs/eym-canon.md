# Eym canon notes

Decisions about Eym that come from its world's author, Dave, or are recorded on his behalf by the owner. The code
follows these; where a value had to be chosen to meet them, the measured values are given so that a later change can
be checked against the intent. Settings that are still the author's to decide are listed at the end, with the
default the code uses until he answers.

## Eym's magnetic field (confirmed by the world's author; recorded 18 November 2026)

*The author's intent:* the north magnetic pole lies over open ocean; there are no compass oddities at Garyk; there
are never auroras over Caren or Garyk.

*The field:* an Earth-like dipole, as in Eym's data (`docs/system-orbital-distances.csv`: a geodynamo with a liquid
iron outer core around a solid inner core, about 25–65 µT at the surface). The magnetic axis is tilted about 10° from
the spin axis; this is separate from the 23.44° axial tilt.

*The pole (owner's choice, 18 November 2026, option A):* the north magnetic pole leans toward about **100° E**, at
about 80° N. With a 10° tilt no pole direction keeps every coast of Caren and Garyk within ±12° of the magnetic
equator *and* the compass declination under 7°: Garyk's north coast lies at 21.4° N, and the directions that pull
both continents toward the magnetic equator are those that turn the compass most. The ±12° and 7° figures were the
owner's proxies for the intent above, not the author's; the owner chose to keep the latitude and let the declination
be Earth-normal. Measured with the pole at 80° N, 100° E, over every coastline point of the two continents and their
islands:

| | Magnetic latitude, centre | Magnetic latitude, coasts | Compass declination, worst |
|---|---|---|---|
| Caren | −2.0° | −11.6° to +6.7° | 10.1° |
| Garyk | +4.6° | −2.4° to +11.4° | 2.5° |
| The crossing (great circle between their centres) | | | 9.9° |

Declination of about 10° is ordinary on Earth and a navigator corrects for it; at Garyk it is under 3°. The pole lies
over open ocean: there is no land between 77° and 82° N from 75° to 105° E, and the nearest coast (Khohalis) is about
2,670 km away.

*Drift:* the pole wanders slowly and deterministically, 10–50 km a year, always inside the box **79°–80° N,
80°–100° E** (about 405 km long and 110 km wide; it moves back and forth along the box rather than freely, because the
region where the constraints hold is a long, narrow band). Anywhere in the box, for every century:

| | Magnetic latitude, centre | Magnetic latitude, coasts | Compass declination, worst |
|---|---|---|---|
| Caren | −2.2° to +1.6° | −11.8° to +10.3° | 11.2° |
| Garyk | +3.6° to +5.3° | −3.4° to +12.0° | 6.2° |
| The crossing | | | 11.0° |

No coast of Caren or Garyk comes within 8° of the about 20° magnetic latitude that the greatest storms reach (see
auroras below), so there are no auroras over either, ever. Checked at 451 pole positions across the box; none breaks
a limit.

*Auroras* (Stage 6): only around the magnetic poles, in an oval at about 65°–75° magnetic latitude, lower in strong
storms; great storms reach about 20°–25°, rarely. A compass-declination readout by place and date is planned; the
owner is to be asked before it goes into the panel.

*Implementation:* Stage 6 of the physical history and climate programme (`ROADMAP.md`). Its tests check that the
pole stays in the box, that Caren's and Garyk's coasts stay within the magnetic latitudes above, and that neither
ever sees an aurora.

## Caren (from the world's author, 18 November 2026)

*Name:* the city the source map labels "Dubor" is **Dubos** (the author's spelling). The label and everything derived
from it are corrected with the next climate and weather work (`data/eym/caren-labels.json`, then the cartography asset
and the atlas snapshot made from it).

*Climate, as the author describes it:*

- The Dubos area is tropical, along the equator.
- Most of Caren is forest: rainforest, seasonal dry forest and cooler highland forest, with savanna between.
- Seasons exist but are much milder than on Earth's temperate lands: a small yearly swing of temperature (larger toward
  Caren's north end, about 16° N) together with wet and dry seasons. This follows from Caren's latitudes; nothing is
  forced.
- Caren's main desert lies north of the equator, in a basin ringed by mountains: an enclosed desert (the Tarim, Great
  Basin and central-Iran pattern), dry because the ranges block moisture from every direction.
- Smaller deserts occur elsewhere, as around Ecuador and Peru: rain shadows behind single ranges that block the moist
  trade winds, and coastal desert where a cold upwelling current runs offshore in their lee.

How the model meets this (the enclosed basin, the smaller deserts, the tests and what is shown first) is in
`ROADMAP.md`, consolidated addenda, item 7. Caren's coastline is unchanged; its mountains, rivers and lakes stay where
the source map draws them, though Caren is god-shaped, so heights may be set without tectonic cause.

## The previous campaign (public to the owner)

The history engine starts from this.

- Caren was divided north from south by an artificial mountain range, which collapsed at the end of the previous
  campaign (the party brought it down). It is the *Sondel Range*, the range in the middle of Caren (owner, 19 November
  2026). Before the fall it ran across the whole continent, from the west coast to the east coast; what is left is the
  stretch in the middle. It is drawn as recent ruin (rubble, landslides,
  dammed lakes, new passes), never as tectonic mountains, and the climate model is to support the terrain both before
  and after the fall, switching at the fall's date.
- Sailing around the range was historically fatal: a magical barrier, not a physical one.
- The northern realms developed as ordinary magical civilisations. The southern city-states each had an artifact or pact
  that gave its society an edge at a cost, all now destroyed:
  - Dubos: lethal trials of adulthood, extended lifespans, fast births;
  - the orc city: its monolith;
  - Dree: a masterwork caste system;
  - the southeastern holy city: a transmutation ring, and curfew rings;
  - the first southern city: magically enforced collectivism.
- The present era: the upheaval after the pacts were destroyed nearly became a continent-wide war, averted by peace
  accords that favoured some states over others. The two leading military powers are the orcs and the Goliaths of
  Dubos, with an unstable border between them; the orcs are the rising central power, and the other states are caught
  between. The Exilarchs (exiled angels, order taken to extremes) are trying to break back into reality.
- For the history engine: per-city pact modifiers (birth and death rates, lifespan, class structure, cohesion,
  productivity), each with its cost; the present starts from two great powers, buffer states, the treaty's winners and
  losers (grievance), and the Exilarchs as an outside threat. *The treaty's terms and signatories, and where the orc
  city and the border lie: for the world's author.*
- Garyk canon belongs to the current campaign and stays out of the repository.

## Ages of Eym and its life (from the world's author, 19 November 2026)

- **Eym formed about 3.5 billion years ago** (Earth: 4.5). The system's age in `docs/system-orbital-distances.csv`
  (`system_age_gyr_est`) is 3.5 for Mitkear, Eym and the three other rocky planets (it was 5.8; nothing in the
  system is older than its star).
- **Life began about 2.5 billion years ago.**
- **Forests and complex life** (the plants and animals the gods placed) have existed long enough for coal and oil to
  have formed as on Earth: they are treated as present for the last several hundred million years.
- **Mitkear's brightness stays exactly 1.00 solar luminosity** (the climate is calibrated to it). A Sun-like star 3.5
  billion years old would be about 9% dimmer than today's Sun, so Mitkear's mass is recorded as about **1.02 solar
  masses**: a star that much heavier is about as bright at 3.5 billion years as the Sun is now. Luminosity, orbits,
  the 350-day year and the climate are unchanged.
- **Resources that depend on deep time are no longer blocked** (applied in the Resources step):
  - banded iron formations in old continental cores (Garyk's old core; the old inland belts of Gaffa, Khohalis and
    Demani), roughly 1.5 to 2.5 billion years old, from the oxygenation of the oceans by early life;
  - coal in swamp basins of the last several hundred million years, placed with the plate history (which spans the
    last 420 million years);
  - oil and gas in suitable marine sedimentary basins of the same era;
  - Caren's resources follow its own rulebook (below), not these rules.

## Canon update of 19 November 2026 (from the world's author)

Applied in the Resources, climate and Ecology steps.

*Caren's ores and minerals: European-style deposits.* Caren is god-shaped, so Europe's pattern of deposits is its
rulebook instead of tectonic rules, placed by analogous settings on Caren's own relief:

- varied and moderate: many small-to-medium deposits widely spread, rather than a few giant ones; gold modest;
- old granite highlands and ranges: tin and tungsten (the Cornwall pattern); silver, lead, zinc, copper and cobalt in
  veins (the Harz and Erzgebirge "ore mountains" pattern);
- a coal belt along the foothills of old ranges (the Wales, Ruhr and Silesia pattern);
- iron ore in sedimentary basins (the Lorraine pattern), and some rich iron in old hard rock (the Kiruna pattern);
- salt from ancient evaporite basins (the Hallstatt, Wieliczka and Cheshire patterns), plus Caren's enclosed desert
  basin;
- copper and pyrite belts (the Rio Tinto pattern);
- building and fine stone (marble, slate, limestone), and occasional specialities (mercury, for one).

The resulting provinces are reported and shown to the owner before they are finalised.

*Plants and animals: by habitat, confirmed.* Each Earth species lives wherever its habitat exists on Eym, the wild
ancestors of crops and livestock included. This is canon, no longer a provisional default.

*Caren's dividing wall was the Sondel Range.* It collapsed at the end of the previous campaign, about 50 years before
the campaign's present ("about 50 years ago" is the best there is: owner, 19 November 2026; the model's fall date is
50 years before the present); a central mountain remains. The fallen parts are drawn as recent ruin (rubble,
landslides, dammed lakes, new passes), never as tectonic mountains. **The source map shows Caren after the fall**
(owner, 19 November 2026): its Sondel Range is the mountain left in the middle, with land on either side, and is
present-day terrain as drawn. Before the fall the range ran from the east coast to the west coast; that wall is not
on the map and is rebuilt only for the terrain and climate before the fall.

*Caren's smaller deserts, the basin's drainage, canon eruptions and earthquakes:* nothing is fixed beyond what the
source map shows. They are derived from the map and the physics; the model's own dated eruptions and earthquakes
stand, with no canon fixed points.

*Garyk:* the world's author is building Garyk with this tool. The generated physical geography (mountains, rivers,
deserts, climate) is his working draft, not something to match against hidden canon. Peoples and history on Garyk
stay GM-only, as recorded.

*Supernatural places:* Eym has many (dead-magic and wild-magic zones, ley lines, places where other planes press
close). Their details are to come from the owner. They are recorded as existing and given a placeholder layer;
nothing is generated until the owner supplies them.

## Eym is about 80% water (canon change from the world's author, 19 November 2026)

Eym's ocean becomes about 80% of its surface (it was 98.6%) by enlarging the three far continents, with the least
possible change to the rest of the world. To be done before the Resources step.

- *Target:* ocean about 80% (land about 20%, about 102 million km²); the plate fit's ocean share becomes about
  0.795 to 0.805.
- *Fixed:* Eym's size, mass, gravity, orbit, moons, day and year. Caren and Garyk keep their exact outlines; the
  Caren–Garyk crossing and the strait corridor are unchanged.
- *The split* (each within about 5%, the total holding the ocean target): Gaffa about 65 million km², Khohalis about
  19 million km², Demani about 15 million km². Gaffa is the largest; the other two are enlarged less.
- *The governing rule, least change:* the present tectonic world is treated as fixed and the targets are met with the
  smallest change to it, by these means in this order, a later one only where the earlier cannot supply enough land:
  (a) raise each continent's own flooded margins (shelves and shallow continental crust), moving no plate boundary;
  (b) attach island arcs, microcontinents and terranes already next to its active margins, as accretion at existing
  subduction zones; (c) extend land outward along existing geology (continue ranges, widen basins and margins) in the
  direction the plate motions already support; (d) only if still short, the smallest adjustments to the plate layout,
  history or rates, each justified and reported. Kept wherever possible: the plates' number and boundaries, their
  poles and speeds, the hotspots and plumes, the mantle's pattern, the history's stages and dates, and the sea floor
  away from the growing continents.
- *Shapes:* Khohalis and Demani stay recognisably the same shapes, enlarged, their present coasts the core of the new
  outlines. Gaffa may be reshaped more freely, its growth still coming from the existing plate geology in the order
  above. Growth is directed away from Caren, Garyk and the strait corridor wherever there is a choice, with a stated
  minimum clearance, reported. All three stay outside the detailed scope (no Continent, Region or Local detail).
- *The change is measured and kept small:* before and after, how many plate boundaries moved and how far; changes to
  plate speeds and poles; how much of the sea-floor depth grid changed and where; changes to currents, sea
  temperatures, rainfall and seasons near Caren and Garyk. Of two fits that meet the targets, the one with the
  smaller change is chosen.
- *What follows from it:* every downstream stage is run again (sea floor, currents and tides, climate and weather,
  erosion and wind, rivers, geology and soils; stored tiles refresh through their fingerprints). The aquaplanet
  addendum is revised: Eym is no longer nearly an aquaplanet. Expected: ocean gyres the size of basins with stronger
  boundary currents; strong monsoons over the large continents; continental interiors with big seasonal swings;
  larger ice ages if new land reaches high latitudes (Stage 5); the El Niño-like pattern moved to the widest
  remaining equatorial ocean. The weather's calibration and the cyclone counts are checked again.
- *Caren's canon is checked afterwards* (tropical Dubos, mild seasons, the enclosed desert basin north of the
  equator, mostly forested). If the change would break it, that is reported before going on; Caren is not adjusted.
- *Shown to the owner before submitting:* the new globe; before-and-after outlines of the three continents; the
  measures of change; before-and-after climate maps for Caren and Garyk.

*First finding (19 November 2026, measured on the present plates):* Khohalis's plate (50 million km²) and Demani's
(51 million km²) can hold their new sizes. Gaffa's plate is 29.5 million km², less than half of Gaffa's 65 million
km²: Gaffa cannot reach its size on its own plate by means (a) to (c) alone. Either it becomes a composite continent
lying across existing plate boundaries, none of them moved (as Eurasia lies on several plates), or its plate is
enlarged by moving boundaries (means d). The owner decides.

## Still the author's to decide (defaults until he answers)

- *Peoples, gods and magic in the history engine:* Pathfinder defaults for every setting, including which magical
  effects are switched on, the gods' accord, the per-realm setting of who counts as people, and monster settings. The
  engine itself waits for his answers to the questions in `ROADMAP.md` (later programmes, 3.1).
- *Caren:* the peace treaty's terms and signatories; where the orc city and its border with Dubos lie.
- *Supernatural places:* which, where and what they do (owner to supply; nothing generated until then).
- *Fire:* whether monsters start fires as well as lightning and people.
- *Aquatic peoples* on shelves and reefs.
- *Planar lenses:* the strengths of the resemblance and the specific places; seeded defaults until he decides. The
  tectonic anchors for Creation's Forge and the Void are an optional suggestion for him.
- *Spoilers:* Garyk canon is GM-only and is kept outside the repository.
