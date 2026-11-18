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

## Still the author's to decide (defaults until he answers)

- *Life:* Earth's species plus Pathfinder's monsters, placed by the gods. Placement rule (by habitat, or by choice):
  default by habitat, provisional.
- *Peoples, gods and magic in the history engine:* Pathfinder defaults for every setting, including which magical
  effects are switched on, the gods' accord, the per-realm setting of who counts as people, and monster settings.
- *Fire:* whether monsters start fires as well as lightning and people.
- *Aquatic peoples* on shelves and reefs.
- *Planar lenses:* the strengths of the resemblance and the specific places; seeded defaults until he decides. The
  tectonic anchors for Creation's Forge and the Void are an optional suggestion for him.
- *Spoilers:* Garyk canon is GM-only and is kept outside the repository.
