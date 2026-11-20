# Eym canon notes

Decisions about Eym that come from its world's author, Dave, or are recorded on his behalf by the owner. The code
follows these; where a value had to be chosen to meet them, the measured values are given so that a later change can
be checked against the intent. Settings that are still the author's to decide are listed at the end, with the
default the code uses until he answers.

## The principle: Eym is natural first (owner and the world's author, 20 November 2026)

> Eym is natural first. Tectonics, currents, weather, erosion, geology and life follow physics and
> evolution. Dave's rationale: the gods prefer low-energy solutions. They spent aeons fighting the
> Exilarchs and had little power to spare, so they nudged natural processes (a plume placed, a rift
> steered, evolution guided, an event timed; one large event or several small ones) instead of working
> real divine magic. A nudge looks natural and leaves ordinary geological or biological evidence. Real,
> physically manifested magic is used only where no nudge could work (the Sondel Range; the old sea
> barrier). Every "god-shaped", "exempt", "without cause", "placed by the gods" or "set down whole" in
> canon, ROADMAP and code is replaced by the natural process plus any recorded nudge, or by the named
> manifested phenomenon.

Where physics gives a different number from the one in the data (a peak's height, a desert's rainfall), the number
is reported and not forced. The source map of Caren is authoritative for its outline, names, rivers, lakes,
forests, peaks and the desert's place.

*The nudges* (each looks natural and leaves ordinary evidence):

| Nudge | When | What it did | The evidence it left |
|---|---|---|---|
| The rift steered | 210 to 190 million years ago | As the First Land rifted apart, the gods steered the rift so that the fragment split off took Caren's shape and came to rest where Caren lies. | An ordinary rifted margin: smooth coasts and wide shelves all round Caren, and rocks that match the First Land's across the sea. |
| The northern plume | 10 to 5 million years ago | A small plume was placed beneath northern Caren. Under the thick old crust it lifts the land into a plateau and never breaks through. | A broad dome of raised land with rivers cut down into it, warm springs, and no young volcanic rock. |
| Evolution steered | from about 2.5 billion years ago | Life evolved naturally and was steered, in many small steps, so that Eym's plants and animals turned out as Earth's did, in spite of Eym's different ocean and climate. | An Earth-like fossil record: microbes from about 2.5 billion years ago, land plants by 470 to 420 million, forests and coal by 360 to 300 million. No horizon at which life was placed. |

The plume under the islands west of Caren is recorded as a natural outlier, not a nudge: it stands far from the
margins of the mantle's two upwellings, where the other plumes rise, as a few of Earth's do.

*Real magic* (physically manifested, where no nudge could work):

| What | Where and when | What it was | In the models |
|---|---|---|---|
| The Sondel Range | Across Caren from coast to coast, until it fell about 50 years before the campaign's present | An artificial mountain range. What is left is a ruin in the middle of Caren. | Drawn as recent ruin (rubble, landslides, dammed lakes, new passes), never as tectonic mountains. The coast-to-coast wall is rebuilt only for the terrain and climate before the fall. |
| The old sea barrier | The seas at either end of the Sondel Range, until the fall | Storms that arose on each side only when a crossing was attempted. | Not in the climate or ocean models: it left no lasting mark on climate or currents. A hazard of the time before the fall, for the history engine. |

## Caren's natural history (owner and the world's author, 20 November 2026)

Caren is treated as Garyk is: its outline is the owner's map and never changes, and the plate record explains it.
It replaces the earlier "shaped by the gods and set down whole". Caren spans about **9.9° S to 8.7° N** (an earlier
note said its north end reached about 16° N; that was wrong).

*Timeline* (it fits the plate history: assembly 420 to 320 million years ago, break-up 210 to 190):

- *The core* (about 1.5 to 2 billion years old): old continental crust with a thick, cold, buoyant root (a craton).
- *The ancient belt* (about 380 to 300 million years ago): the core is caught in the First Land's assembly and an
  ancient mountain belt rises along it (as Europe's Variscan belt did). Deep in the thickened crust, rock melts into
  great bodies of granite that cool underground and never erupt (as in Cornwall).
- *Wearing down* (from about 320 million years ago): the belt erodes; limestone and sandstone gather in basins,
  marble where they were baked and squeezed.
- *Rifting* (210 to 190 million years ago): the First Land rifts and Caren is a fragment split off (the rift
  steered: a nudge). Since then it rides the Caren Plate, today at about 9 mm a year.
- *The Arluna impact* (before any people; tens of millions to about 200 million years ago): see below.
- *The northern uplift* (about 10 to 5 million years ago to the present): see below.

*As built (`data/eym/tectonics.json`, `caren`):* turned back whole onto the First Land, Caren sat on its rim about
2,100 km from its centre, a rift's width (60 km) from its neighbours; it has drifted about 9,000 km since, 43 mm a
year on average (the three far continents drifted farther and as fast), and its plate has slowed to 8.9 mm a year.
No plate boundary, pole or speed changed.

*Rocks.* "The Godstone" is the people's name for Caren's white quartzite and its massive white leucogranite: natural
rocks, the hardest of the ancient belt. The granites carry veins round them; quartzite carries little ore.

*Ores* (none needs a volcano; Europe's pattern of deposits, which the canon of 19 November gave Caren as its
rulebook, now follows from this history):

- tin, tungsten, and silver, lead, zinc and copper in veins, round the granite bodies (from the granites' own fluids);
- coal in the foothill basins of the ancient belt (about 320 to 300 million years old);
- copper beds, lead and zinc from basin brines, ironstone, and salt from dried-up seas, in the old basins;
- skymetals at the Arluna structure, and as the skymetal model gives.

*Earthquakes* (the world's author: as small as may be first, as seldom as may be second, and spread out). Caren lies
far inside its plate, as Australia does. The young uplift is taken up on many small faults across a broad zone (old
faults of the ancient belt, the swell's margins), not on one great fault: mostly under magnitude 4, now and then 4
to 5, rarely 5 to 6, never more; spread over the whole land, with no one place that shakes most. *As built:* 66
small faults over Caren, together about one quake of 3.5 to 4 a year, one of 4 to 5 every two years, one over 5
in a generation, none of 6 (`scripts/eym-quakes.mjs`).

*Erosion* follows each rock: quartzite and massive granite wear very slowly; limestone weathers to caves and
sinkholes; rivers, deltas and soils follow.

*The northern plateau and its peaks.* North of the Sondel the interior is a plateau of about
1,200 to 2,000 m: the buoyant old root, and a broad swell of the mantle over the last 5 to 10 million years (the
northern plume: a nudge), as southern Africa was raised. Every northern coast rises to it by a long, gentle ramp
over 100 to 300 km (a slope of 0.4 to 2%), with no escarpment and no cliff coast but where the map shows one: a broad
dome. The Myra, Thran and Palma (and the Drong and Molkath) are drawn wide on the map: real channels a few
kilometres wide, navigable far inland, their lowest 50 to 100 km wide tidal estuaries; long and gentle, with rapids
and no great falls. Mt. Weth and Mt. Shila (each alone) and Mt. Oplin and Mt. Danrich (a short range) are massifs of
quartzite and massive granite from the ancient belt, raised as blocks on the swell (as the Rwenzori is: a range on
the equator, not volcanic, with glaciers), kept high by their hardness and by the crust's rebound as the valleys
round them are cut. Mt. Weth is not a volcano. Their heights are worked out from that and reported. The lakes (Luin,
Surnet, Whitswell, Havamere, Nal, Rochest, Conera) lie in shallow sags of the warped plateau, as Lake Victoria does.
The Trate Hills and the Sarven Hills are hills (about 500 to 1,500 m).

*As built (0.34.0; `scripts/eym-caren-relief.mjs`, dials in `scripts/eym-world-inputs.mjs`, measured in
`data/eym/caren.json`):*

- *The plateau* stands at 1,340 to 1,870 m (the middle four fifths of it; 1,630 m in the middle), about 10.6 °C cooler
  than the coast. It is held up by crust 35 to 41 km thick (36 km under the lowlands) and a swell of the mantle that
  pushes up 960 m at most; nothing is left unsupported.
- *The ramps:* from the west coast 145 km at a mean slope of 1.0%, from the north 125 km at 1.4%, from the east 135 km
  at 1.0%; the steepest 10 km anywhere is 1.7%. No land within 12 km of a northern coast stands above 124 m. With the
  tan country now low ground, Caren has no cliff coast at all (it had three short stretches): confirmed by the owner,
  20 November 2026.
- *The great rivers* lie in valleys cut through the dome: the Myra (310 km of drawn band, 73 m above the sea at its
  head), the Thran (277 km, 62 m), the Palma (142 km, 22 m; the tracing had taken it for a lake) and the unnamed
  water by Menera (109 km, 12 m: an inlet of the sea, confirmed by the owner). Their real channels are up to 3 km wide,
  and each great river (the Drong, the Molkath, the Taunmis and the Sherval too) widens to as much as 7 km over its
  tidal 75 km.
- *The peaks, as the physics gives them:* a massif of hard rock on an old, worn continent stands at most about
  2,300 m above the land round it (Earth's largest, as Mulanje); small faults add about 300 m (no fault here gives a
  great earthquake) and the crust's rebound about 300 m more: 2,900 m above the plateau. That makes **Mt. Oplin
  4,567 m, Mt. Shila 3,992 m, Mt. Danrich 3,582 m and Mt. Weth 3,437 m**. The data had peaks of about 5,300 m. None
  reaches the snow line (about 4,800 m): no natural summit of Caren has snow all year or a glacier. Higher peaks
  would need a block thrown up some two kilometres on great faults, as the Rwenzori was, which the canon's small
  earthquakes rule out. The owner accepts the peaks as computed (20 November 2026).
- *Caren's highest summits* are in what is left of the Sondel Range (up to 5,608 m, as the map's heights were; not
  natural, and the only snow that lies all year), then the four massifs. The Trate Hills reach 1,312 m and the
  Sarven Hills 1,366 m.
- *The tan country* is low, dry ground (about 350 m round the Sondel's remnant), not upland.
- *The lakes:* Lake Luin lies on the plateau at 1,290 m; the others in the lowlands (the Nal Lakes at 147 to 361 m,
  Whitswell 177 m, Havamere 170 to 176 m, the Arluna Lakes about 163 m, the Xel Lakes 103 to 145 m, Surnet 108 m).
- *Bedrock:* white quartzite in the Sondel's remnant and the massifs' peaks; massive white leucogranite in the
  massifs' shoulders and the granite hills; the old core laid bare (granite and gneiss) on the plateau; marble, slate
  and coal-bearing sandstone in the foothills; limestone and sandstone in the lowlands.

*The Arluna Lakes:* one great impact structure 150 to 200 km across (as
Manicouagan is), on the old core, from before any people. The lakes lie in its ring trough round a central uplift,
and Dubos stands near the centre. It is a skymetal district: the ore lies in the melt sheet under the uplift and
the ring. Optional, for the world's author: that this was the impact that left Eym's worldwide trace of skymetal.
*As built (0.34.0):* a ring 195 km across centred at 3.25° S, 0.79° E, through the middles of the five lakes; a
central uplift of 250 m, a trough 60 m deep and a low rim of 150 m; Dubos stands inside the ring. Its age is set
only as a range (20 to 200 million years) until the world's author fixes it; the ore bodies are placed with
Resources.

*The Molkath desert* (checked against the models in 0.35.0 and again, with the rain as a budget of the air's water, in 0.36.0, and not reached: see "As measured", below; it replaces the earlier "basin north of the equator ringed
by mountains"). A desert of sand and rock in the tan country of the Molkath Confederation round what is left of the
Sondel Range, at about 0° to 4° N, between the Drong and the Molkath. It was there before the range fell. The cause
is natural (as for the Chalbi Desert by Lake Turkana, at 3° N, with 150 to 250 mm of rain a year): a low, hot basin;
a low wind jet funnelled between the northern plateau and the southern uplands, its air sinking and drying; rain
shadows of the higher ground round it; and a surface of quartz sand and bare rock from weathered quartzite. Before
the fall the coast-to-coast wall made the funnel and the shadow stronger. The aim is 100 to 250 mm a year in both
eras; if the models cannot reach it by natural means the shortfall is reported, and nothing is tuned or made magical
without the world's author's word.

*Climate* (checked against the models in 0.35.0 and 0.36.0: see "As measured", below). South Caren is tropical wet and dry: savanna with patches of forest
(the Arluna, Calmond, Ewash and Holy Grove forests), the Minisa Forest's conifers being tropical pines on sandy or
high ground, palms on the Chom Islands and the eastern islets, and Dree often stormy. North of the Sondel the plateau
has a mild rhythm of four seasons: a warm rainy season, leaf fall, a cool dry season with frost at night, and
green-up before the rains; the coasts stay hot and humid, the foothills warm. Mt. Weth and Mt. Oplin and Danrich cast
dry rain shadows to their south-west, in the lee of the north-east trade winds. Snow and frost go by height (the air
cools 6.5 °C for each kilometre): the lowlands never see snow; at 1,500 to 2,000 m there is frost on clear nights of
the dry season and almost no snow; at 2,500 to 4,000 m snow now and then in cold, wet spells; above about 4,800 m
snow all year and small glaciers, if the summits are that high. Forest of a temperate kind grows only where height
makes it cool enough, and is called highland forest.

*The sea west of Caren* (built in 0.35.0: nine islands, 3,433 km² together, the largest 1,528 km², 890 km and more off Caren, on a ridge of twenty sunken volcanoes whose crest is 300 m down; they lie outside the detailed maps and are drawn on the globe). A plume under the Caren Plate at about 1° N, 14° W has built a cluster of
volcanic islands on a shallow ridge (1° S to 4° N, 12° to 16° W), 800 to 1,200 km off Caren's west coast: a cluster
and not a chain, because the plate moves so slowly (as at Cape Verde). Cold water wells up where the equator's deep
current meets the ridge, and along Caren's western coasts when the north-east trades blow hardest. Expected, and to
be checked, not assumed: a tongue of cold water toward Caren's west coast; northern Caren cooler and drier, with a
cool, foggy season of drizzle on its western coasts; the rain belt south of the equator over Caren for more of the
year.

*As measured (0.36.0; the rain is the planet's, `scripts/eym-rain.mjs`, dials `rain`; Caren's temperatures
`scripts/eym-caren-climate.mjs`; the survey is `data/eym/caren.json`, `climate`).* The rain is now a budget of the
water the air carries, month by month, for the whole planet: the air is followed along each season's wind, taking up
water over the sea (less over cold water), raining by how full it is, wrung out on high ground and dry behind it,
given water back by the land, thinned in wind gaps, and mixing with the air round it. It was fitted to one thing only,
the rain by latitude of an all-ocean Eym; no number was set for any place. The rule can make deserts (a basin behind a
3,000 m range across the trades gets about 120 mm on the equator; a coast under air from a sea 4 °C colder loses three
fifths of its rain). What the canon expects of Caren, and what this physics gives:

| The canon expects | Found? | What the model gives |
|---|---|---|
| A tongue of cold water toward Caren's west coast | yes | 0.7 °C colder than its latitude's all year, 1.1 °C over the islands' ridge (the islands add about half a degree in one four-degree square; most of the tongue was there before them) |
| The western coasts' sea swinging 5 to 8 °C through the year | no | 0.5 °C |
| The rain belt south of the equator over Caren for more of the year | no | 4 months of 12 |
| Northern Caren cooler | yes | 21.0 °C in the mean against 24.5 °C in the south; the plateau 14.9 °C |
| Northern Caren drier | no | 2,545 mm against the south's 1,651 mm: the belt stands over the north for more of the year, and the high ground wrings the air (north-west 2,207 mm, north-east 3,220 mm) |
| A cool plateau with a mild rhythm of seasons | yes | 14.9 °C, the months 2.9 °C apart |
| A dry season on the plateau with frost at night | no | No dry month; the coldest nights 5.7 °C. Ground frost begins near 2,500 m, air frost near 3,250 m |
| Frost on clear dry-season nights at 1,500 to 2,000 m | no | The coldest nights at 1,750 m are 7.4 °C |
| A rain shadow south-west of Mt. Weth | no | 1,956 mm to its south-west against 1,362 mm to its north-east: the air reaches it from the south-east and south for much of the year, not the north-east, and a lone massif is flowed round |
| A rain shadow south-west of Mt. Oplin and Mt. Danrich, round Menera | no | Mt. Oplin 2,636 mm against 3,794 mm (a third less); Mt. Danrich 3,802 mm against 4,192 mm; Menera 1,948 mm with two dry months |
| South Caren tropical wet and dry | yes | 1,651 mm a year with three to four dry months; Dree 1,716 mm with four |
| Snow all year only above about 4,800 m; none in the lowlands | yes | None to 2,500 m; now and then, in cold, wet spells, from about 3,250 m; all year from 4,800 m |
| The Molkath desert arid (100 to 250 mm), today and before the fall | no | See below |

*The Molkath country, side by side.* It is measured as the map's tan ground round the Sondel's remnant. The trades
blow from the east off a warm sea, so the remnant's west side is its lee:

| Side of the remnant | Today (least, middle, most) | Dry months | With the wall standing | Dry months |
|---|---|---|---|---|
| West (the lee) | 640, 1,536, 1,936 mm | 5.4 | 354, 1,228, 2,134 mm | 5.8 |
| East (windward) | 2,274, 4,420, 8,184 mm | 0.4 | 1,550, 2,102, 4,816 mm | 1.3 |
| North | 2,082, 2,562, 3,182 mm | 0 | 1,996, 2,410, 3,760 mm | 1.0 |
| South | 1,006, 2,608, 6,964 mm | 0.9 | 842, 2,240, 9,910 mm | 1.8 |

So the physics gives a dry-season country in the remnant's lee (the driest low ground of Caren lies west of it, 600
to 1,300 mm with five to eight dry months), not a desert, and a very wet windward side. What would dry it, tried on
the model and not applied: a range of 1,500 m or more across the wind between the Molkath country and the east coast
(the low ground behind it falls to a few hundred millimetres), or a sea to the east colder by several degrees (which
the ocean model does not give: that sea is a warm pool). The map shows neither. The decision is the world's author's;
a place can be set apart by a recorded exception with its reason (`data/eym/overrides.json`).

*The map against the rain* (where they disagree; neither is overridden): of Caren's squares that are mostly forest on
the map, one has under 900 mm (1.5° N 3.5° W, 574 mm, in the remnant's lee); of its mostly open squares, sixteen have
over 2,500 mm (the east, between 4° S and 4° N); all nine of its mostly tan squares have over 1,000 mm.

*Dree's storms* were looked for in two years of the daily weather (0.35.0): no gale and no tropical storm came within
400 km of it. Its wet season brings 200 to 390 mm a month.

*The map still rules what is drawn.* Forest is where the map draws forest; the map's tan country is dry grassland
whatever the rain (so the Molkath country is drawn as the map draws it); and country the map leaves open is open:
savanna where the dry season is long (the south), woodland and grassland where it is short. A forest is rainforest
only where its dry season is short; highland forest is called highland forest.

## Planet-wide (owner and the world's author, 20 November 2026)

- *Life* evolved naturally and was steered (a nudge, above). There is no evolution simulation: the outcome is fixed,
  Earth's species by habitat.
- *The far continents' growth:* every area added to Gaffa, Khohalis and Demani for the 80%-water world has a
  tectonic origin in the plate record (`data/eym/growth.json`, `origins`): a raised shelf, a belt of terranes swept
  up on a leading edge, a raised rifted margin, crust of a neighbouring plate welded on along a suture, or the far
  shoulder of a rift.
- *The magnetic pole* wanders naturally over long spans. The loop and the box below are the campaign era's (a
  thousand years either side of the calendar's start, until the world's author says otherwise); the history engine's
  long spans are not held to them. In the campaign's era neither Caren nor Garyk sees an aurora.

## The wanderers' resonant orbits and the Great Alignment (canon change from the world's author, 20 November 2026)

Every 68 Eym years all four wanderers and Eym stand in one line with Mitkear: the **Great Alignment**. It falls on
14 March. The last was in year 0, the next is in year 68, then year 136. It is real physics only: no turning nodes,
no transits, nothing scripted. The sky is drawn from the same orbits.

*The orbits* (`docs/system-orbital-distances.csv`). Eccentricities and inclinations
are as they were, and no node or apsis precesses:

| Wanderer | Period, Eym days | Years | Distance, AU | Phase at the epoch | Orbits in 68 years |
|---|---|---|---|---|---|
| Bruthi | 233⅓ (700/3) | 2/3 | 0.763136 | 112.6743° (was 132°) | 102 |
| Eym | 350 | 1 | 1 | 190° (unchanged) | 68 |
| Esonth | 466⅔ (1400/3) | 4/3 | 1.211432 | 52.5336° (was 78°) | 51 |
| Lilta | 661.111… (350 × 17/9) | 17/9 | 1.528038 | 79.5207° (was 265°) | 36 |
| Iarn | 1700 | 34/7 | 2.868006 | 70.0205° (was 8°) | 14 |

The distances follow from the old ones by Kepler's third law (a ∝ P^(2/3)), the star's mass unchanged; the fields
worked out from them (nearest and farthest distance, mean speed) follow. Eym, both its moons and Iarn's moon Enoch
are unchanged, and so are Eym's year, calendar, seasons, eclipses and tides.

*The physics.* Bruthi : Eym : Esonth go round in 2 : 3 : 4 years: a true chain of mean-motion resonances, of the kind
Jupiter's Galilean moons and the worlds of TRAPPIST-1 keep. Lilta (17/9 of a year) and Iarn (34/7) are
near-commensurate with it. The model is Keplerian, so the pattern repeats exactly; in reality each alignment would
come within a degree or two and vary a little from cycle to cycle.

*What is seen* (measured from the model; `tests/eym-almanac.test.mjs`):

- *The Great Alignment* (years 0, 68, 136; 14 March). At 08:00 the five lie within 0.004° of one line round Mitkear,
  and within 0.5° from midnight until mid-afternoon. From Eym, Esonth, Lilta and Iarn stand together opposite Mitkear,
  up all night (Lilta and Iarn within 0.4° of the point opposite; Esonth 1.2° from it, because its orbit is tilted),
  and Bruthi is lost beside Mitkear. Between years 0 and 136 the five never come within 10° of one line except within
  a week of those three days.
- *The Lesser Alignment* (years 34, 102, 170; 14 March): Eym, Bruthi, Lilta and Iarn in one line, with Esonth beyond
  Mitkear, within 1° of the far side.
- *The Esonth opposition line* (every fourth year, 14 March): Bruthi, Eym and Esonth in one line with Mitkear.
- *Bruthi never transits Mitkear.* It passes Mitkear every year near 14 March. In even years it passes in front, on
  14 March, 0.86° from Mitkear's centre: more than three of Mitkear's discs (0.27° in radius) clear. In odd years it
  passes behind, on the far side of its orbit, and there it does go behind the disc (0.19° from the centre, on
  12 March): that is not a transit and cannot be seen.
- *The almanac* (`scripts/eym-almanac.mjs`) lists for any year the true lines above and the close meetings of
  wanderers in Eym's sky: two within 1°, three within 3°, all four within 10°, each at least 20° from Mitkear, in
  three dimensions with the inclinations. A year has between none and a few. The sky's panel shows the year's list.
  The names of the lines are working names; the world's author may rename them.

## The names in the registry, the code and the data (owner, 20 November 2026)

The registry, the code, the data files and their folders call things by the names people use: the star and its
system **Mitkear**, the world **Eym**, and the wanderers **Bruthi**, **Esonth**, **Lilta** and **Iarn**. Until
then they carried working names. The two moons keep their registry keys (White Moon, Red Moon) and are shown as
Austarm and Chatarm.

- *Nothing drawn changed.* Wherever a name feeds a seed (the surveys of the moons and Iarn, the place names of the
  wanderers' maps, the bodies' turning at the epoch, small variations of their air), the word the seed was first
  drawn from is used; those words are kept in one place, `scripts/seed-words.mjs`, and shown nowhere. Every data
  file was made again and compared: Eym's surface, its tiles and every other body's survey are the same.
- *One thing that did change:* one of the naming roots of the wanderers' own place names was the old working name
  of Bruthi, so ten place names on the maps of Bruthi, Esonth and Lilta now begin "Bruthi…" (as in Bruthistrand Sea).
- *History is left as written:* the changelog and the roadmap keep the working names where they record what was
  done under them.

## Eym's magnetic field (confirmed by the world's author; recorded 18 November 2026)

*The author's intent:* the north magnetic pole lies over open ocean; there are no compass oddities at Garyk; there
are never auroras over Caren or Garyk. (Since 20 November 2026 this holds for the campaign's era; over the history
engine's long spans the pole wanders naturally: see "Planet-wide", above.)

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
over open ocean: there is no land between 77° and 82° N from 75° to 105° E. (When this was written the nearest coast,
Khohalis, was about 2,670 km away. Since Khohalis was grown, 20 November 2026, its north-west coast near 79° N, 112° E
is the nearest land: 277 km from the eastern end of the pole's loop. The pole is still over open sea, with less to
spare; the world's checks hold it to at least 150 km, and the owner accepts the 277 km.)

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
storms; great storms reach about 20°–25°, rarely. A compass-declination readout by place and date was planned; the
owner decided against it (20 November 2026): declination does not matter where the campaign plays.

*Implementation:* Stage 6 of the physical history and climate programme (`ROADMAP.md`). Its tests check that the
pole stays in the box, that Caren's and Garyk's coasts stay within the magnetic latitudes above, and that neither
ever sees an aurora.

*As built (Stage 6, 20 November 2026; `scripts/eym-magnetic.mjs`, dials in `scripts/eym-world-inputs.mjs`):* the pole
goes once round a long, narrow loop inside the box (79.05°–79.95° N, 81°–99° E) every 26 years, at 12 to 46 km a
year. Surveyed at 72 places round the loop over every coast point (`data/eym/magnetic.json`): Caren's coasts lie at
magnetic latitudes −11.6° to +10.1° and its compass is off by at most 11.1°; Garyk's at −3.0° to +11.6° and 5.8°.
The south magnetic pole (the antipode, near 79.5° S, 90° W) is 2,376 km from the nearest land (Demani). The night's
activity runs from 0 (quiet) to 9 (a severe storm) by rule from the date, a storm on about one night in twenty,
oftener near the top of an 11-year cycle; the oval lies at 65°–75° of magnetic latitude when quiet and its edge moves
2° toward the equator with each level; a great storm comes about three times a century, lasts one to three days and
is seen down to 20°–25°, never below 20°. Caren and Garyk are at least 8° clear of that.

## Caren (from the world's author, 18 November 2026)

*Names (confirmed by the owner and the world's author, 20 November 2026).* The source map is authoritative for Caren's
names. Every label in `data/eym/caren-labels.json` carries one of these, each name once (the cartography asset and the
atlas snapshot are made from that file):

- *Realms:* New Fae'run, Cius League, Molkath Confederation, Federation of Vinon.
- *Capitals* (a star on the map): Bostain, Geniv, Lyla.
- *North-west:* Fae'mel Forest, Lake Luin, Var Dylon, Andal, Mt. Weth, Aren, Myra River, Khovd, Achak Forest, Selendel,
  Cykon, Lake Surnet, Mar'amu, Ognum.
- *North:* Piramus, Bostain, Central Valley, Rach, Thran River, Mt. Shila, Hadree Forest, Vercome, Fort Demak.
- *North-east:* Centarm, Rigala, Palma River, Terr, Mt. Oplin, Mt. Danrich, Menera, Alamak, Zamerio, Jennu Forest,
  Nalgari, Nal Lakes, Lipka.
- *Centre:* Sondel Range, Drong River, Molkath River, Eern, Plangi, Slem, Dylal, Tarun, Kelmat, Umata, Bhunhed, Angoria,
  Merios, Malam, Bestead, Augaknoll.
- *Arluna:* Arluna Lakes, Arluna, Dubos, Xoln, Oraph, Maitbe, Clenos.
- *West:* Seaton, Turic, Lucern, Lake Whitswell, Val-de-Galles, Geniv, Mater Forest, Lake Havamere, Winthur, Riefell,
  Bemm, Magstead, Lake Sile, Chom, Chom Islands.
- *East:* Bejaa, Reme, Lake Rochest, Andatias, Betoban, Telti, Lake Conera, Lyla, Valdak, Grazm, Ico, Calda.
- *South:* Holy Grove, Piety, Schlum Bi, Vlens, Xel Lakes, Glaset, Gorax, Ytery, Fort Zanix, Blaudis, Sarven Hills,
  Colkirk, Taunmis River, Dree, Calmond Forest, Calmond, Zorento.
- *South-west:* Nerin, Quaton, Trate Hills, Ewash, Ewash Forest, Yakat, Minisa Forest, Chilla, Khaelum, Sherval River,
  Steknen, Orlu'ka.

One town is on the map but was not in the list: **Folo**, on New Fae'run's west coast, the north-west port the steamer
to Garyk sails from (the label first read "Pouk"; owner, 20 November 2026). Which label took which name, and the
matches still to be checked against the map, are in the changelog (0.32.2).

*Climate, as the author describes it:*

- The Dubos area is tropical, along the equator.
- Most of Caren is forest: rainforest, seasonal dry forest and cooler highland forest, with savanna between.
- Seasons exist but are much milder than on Earth's temperate lands: a small yearly swing of temperature (larger
  toward Caren's north end, at 8.7° N, and on its northern plateau) together with wet and dry seasons. This follows
  from Caren's latitudes and heights; nothing is forced.
- Caren's main desert is the Molkath desert, round what is left of the Sondel Range at about 0° to 4° N (see
  "Caren's natural history", above; an earlier note placed it in a basin ringed by mountains north of the equator).
- Smaller deserts occur elsewhere, as around Ecuador and Peru: rain shadows behind single ranges that block the moist
  trade winds, and coastal desert where a cold upwelling current runs offshore in their lee.

How the model meets this (the enclosed basin, the smaller deserts, the tests and what is shown first) is in
`ROADMAP.md`, consolidated addenda, item 7. Caren's coastline is unchanged; its mountains, rivers and lakes stay where
the source map draws them, and their heights follow from Caren's natural history (above).

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
- **Forests and complex life** evolved (steered by the gods: see the nudges, above): land plants by 470 to 420 million
  years ago, forests and coal by 360 to 300 million, so coal and oil have formed as on Earth.
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
  - Caren's resources follow from its own history (below, and "Caren's natural history").

## Canon update of 19 November 2026 (from the world's author)

Applied in the Resources, climate and Ecology steps.

*Caren's ores and minerals: European-style deposits.* Europe's pattern of deposits is Caren's rulebook: since 20
November 2026 it follows from Caren's own history (an ancient collision belt with granite bodies, worn down, and
basins over an old core, as Europe's is), placed by the matching settings on Caren's own relief:

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

*Decided (owner, 19 November 2026):* Gaffa is a composite continent, no plate boundary moved. The growth leans to
spread the three out: Khohalis westward, Gaffa and Demani eastward, with at least 1,800 km of sea between the three,
at least 3,500 km between new land and Garyk or the strait corridor, and Caren far clear (at least 6,000 km). The
world's author approved the first outlines drawn on that basis (Gaffa a broad eastern mass with a long arm running
south-west through its present core; Khohalis and Demani their present shapes, enlarged). The work is shown in
three steps: outlines and relief; sea floor and currents, with the check of Caren's canon; the revised climate.

*Done (20 November 2026).* The world as rebuilt:

- *Sizes:* ocean 79.86% (it was 98.6%). Gaffa 65.1 million km², Khohalis 19.7, Demani 15.0, as approved by the
  world's author; a fourth archipelago was accreted into Khohalis. Caren's and Garyk's outlines are byte-identical.
- *Least change:* no plate boundary moved; the plates' poles, speeds and history are unchanged (the tectonic record is
  byte-identical). The grown land is kept apart from the plate fit (`data/eym/growth.json`).
- *Caren's canon holds:* Dubos is tropical rainforest (25.7 °C); the seasons are mild (the widest yearly range
  anywhere on Caren is under 5 °C; the months run 22.9 to 23.7 °C); 148 of its 175 climate cells are forest; the
  enclosed dry basin north of the equator remains (9 steppe cells). Its yearly rain is 2,785 mm (2,831 before).
- *Garyk:* yearly rain 1,694 mm (1,591 before, the gain in the wet months); months 18.0 to 21.6 °C (18.7 to 21.1
  before); a weak monsoon wind (0.7 m/s on a trade of 5).
- *Expectations met:* one great basin with a warm boundary current up Gaffa's east coast and cold water and upwelling
  on the other side; strong monsoons over Gaffa; large seasonal swings in the interiors (some 35 °C deep inside Gaffa
  at 45° N); more meandering jets and more blocking, most in the north. The aquaplanet addendum is revised
  (`ROADMAP.md`).
- *Expectations not met:* Garyk does not get more or stronger tropical cyclones (14 within 900 km in eight years
  before and after; worldwide 352 against 461, land now lying where some were born). Caren's El Niño-like swing in
  rainfall is smaller, not larger (its yearly wetness ranged from 0.70 to 1.43 of normal, and ranges from 0.90 to
  1.14 now), because the oscillation's basin is now the 132° of ocean east of Caren and Caren lies 5° outside its
  western edge.
- *Decided (owner, 20 November 2026):* Caren is the western shore of that basin. The lands that shut the basin in
  share in the side they stand on, so all of Caren (not only its east coast) has dry years when the basin warms and
  wet years when it cools: its rivers' yearly wetness runs from 0.60 to about 1.4 of normal, with some eighteen dry
  years (under 0.85) and twenty wet ones (over 1.15) in a century. Garyk has none of it (0.85 to 1.15).
- *Left for Stage 5:* ice sheets on Khohalis and Demani and their feedback on the temperatures there. Until then the
  cold of Khohalis is from temperature alone (1,665 of its 3,494 climate cells class as ice cap).

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
