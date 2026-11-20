// The lunar calendar's pages as HTML (scripts/moon-calendar.mjs lays the calendar out; this draws it). Pure: plain
// data in, a string out, so the same pages can be drawn in the module's window, in a test or on a server.
// Every control carries a `data-action` (and what it needs) for the window to act on; nothing here reads the clock.

import { EVENT_TYPES, MOON_DISPLAY, MOON_KEYS, austarmYearKind, eventList, monthGrid, monthTitle, yearSummary } from "./moon-calendar.mjs";
import { calendarMs } from "./eym-almanac.mjs";
import { HOLIDAY_MONTH } from "./universal-time.mjs";

const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const two = (n) => String(n).padStart(2, "0");
/** The short badge for an event on a day of the grid. */
export function badgeText(event) {
  switch (event.type) {
    case "double-full": return "DOUBLE FULL";
    case "double-dark": return "DOUBLE DARK";
    case "occultation": return "CHATARM CROSSES AUSTARM";
    case "solar-eclipse": return `${event.kind.toUpperCase()} SOLAR ECLIPSE · ${MOON_DISPLAY[event.moon].name.toUpperCase()}`;
    case "lunar-eclipse": return `${event.kind.toUpperCase()} LUNAR ECLIPSE · ${MOON_DISPLAY[event.moon].name.toUpperCase()}`;
    case "great-tide": return "GREAT TIDE";
    case "slack-tide": return "SLACK TIDE";
    case "alignment": return event.name.replace(/^the /, "").toUpperCase();
    default: return event.label.toUpperCase();
  }
}

/** A moon's face as a small drawing: the lit share on the side it grows from (waxing on the right). */
export function moonGlyph(moon, size = 22) {
  const look = MOON_DISPLAY[moon.key], r = size / 2 - 1, c = size / 2, f = Math.min(1, Math.max(0, moon.illuminated)), rx = Math.abs(1 - 2 * f) * r;
  // The lit part: a half disc on the lit side, widened (gibbous) or narrowed (crescent) by the terminator's ellipse.
  const side = moon.waxing ? 1 : 0, lit = `M${c} ${c - r}A${r} ${r} 0 0 ${side} ${c} ${c + r}A${rx.toFixed(2)} ${r} 0 0 ${f > 0.5 ? side : 1 - side} ${c} ${c - r}Z`;
  return `<svg class="oscm-moon-glyph" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(look.name)} ${Math.round(f * 100)}%"><circle cx="${c}" cy="${c}" r="${r}" fill="${look.dark}"/><path d="${lit}" fill="${look.color}"/><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${look.color}" stroke-opacity=".45"/></svg>`;
}

const localClass = (local) => (local ? (local.visible ? " is-seen" : " is-unseen") : "");
function badge(event, local) {
  const title = `${event.label}${event.rare.length ? ` (rare: ${event.rare.join("; ")})` : ""}${local ? `: ${local.note}` : ""}`;
  return `<button type="button" class="oscm-moon-badge is-${event.type}${event.rare.length ? " is-rare" : ""}${localClass(local)}" data-action="open-sky" data-time="${Math.round(local?.visible ? local.timeMs : event.timeMs)}" title="${esc(title)}">${event.rare.length ? "★ " : ""}${esc(badgeText(event))}</button>`;
}

/** The header's note on Austarm and the calendar, from the model's own numbers for this year. */
export function austarmNote(calendar, year) {
  const now = austarmYearKind(calendar, year), full = now.kind === "full-moon", nth = (d) => `${d}${d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"}`;
  return `Austarm keeps the calendar: its round of phases is the month's 28 days, so it shows the same phase on the same date every month (to within a day; it wanders ${now.wanderDeg.toFixed(0)}° either way through the year), and each year the phase flips by half a cycle. Year ${year} is a <strong>${full ? "full-moon year" : "dark-moon year"}</strong>: Austarm is ${full ? "full" : "dark"} at mid-month (about the ${nth(full ? now.fullDay : now.darkDay)}) and ${full ? "dark" : "full"} as the month turns (about the ${nth(full ? now.darkDay : now.fullDay)}).`;
}

/** The month page: a grid of nights with both moons' faces, their lit shares and the day's badges. */
export function renderMonth(calendar, { year, month, place = null, today = null }) {
  const grid = monthGrid(calendar, year, month), seen = place ? new Map(eventList(calendar, year, { place }).map((e) => [e.id, e])) : null;
  const cell = (d) => {
    const isToday = today && today.year === year && today.month === month && today.day === d.day;
    const moons = d.moons.map((m) => `<span class="oscm-moon-face" title="${esc(`${m.name}: ${m.phase.toLowerCase()}, ${Math.round(m.illuminated * 100)}% lit`)}">${moonGlyph(m)}<small>${Math.round(m.illuminated * 100)}%</small></span>`).join("");
    const exact = d.phases.map((e) => `<span class="oscm-moon-exact" title="${esc(`${e.label} at ${two(e.date.hour)}:${two(e.date.minute)}`)}">${esc(MOON_DISPLAY[e.moon].name[0])}${e.type === "full" ? "○" : e.type === "new" ? "●" : e.type === "first-quarter" ? "◐" : "◑"}</span>`).join("");
    const badges = d.events.map((e) => badge(seen?.get(e.id) ?? e, seen?.get(e.id)?.local ?? null)).join("");
    return `<td class="oscm-moon-day${d.rare ? " is-rare" : ""}${isToday ? " is-today" : ""}"><div class="oscm-moon-day-head"><button type="button" class="oscm-moon-daynum" data-action="open-sky" data-time="${calendarNight(year, month, d.day)}" title="Look up on this night">${d.day}</button><span class="oscm-moon-exacts">${exact}</span></div><div class="oscm-moon-faces">${moons}</div><div class="oscm-moon-badges">${badges}</div></td>`;
  };
  return `<table class="oscm-moon-month${month === HOLIDAY_MONTH ? " is-holiday" : ""}"><thead><tr>${grid.weekdays.map((w) => `<th>${esc(w.slice(0, 3))}</th>`).join("")}</tr></thead><tbody>${grid.weeks.map((week) => `<tr>${week.map(cell).join("")}</tr>`).join("")}</tbody></table>`;
}
/** The moment a night of the calendar is looked at when its day is clicked: 22:00 of that date. */
export const calendarNight = (year, month, day) => calendarMs(year, month, day, 22);

/** The year page: thirteen small blocks with the days that hold events marked, and the year's counts. */
export function renderYear(calendar, { year, today = null }) {
  const summary = yearSummary(calendar, year), c = summary.counts;
  const block = (m) => `<button type="button" class="oscm-moon-block${m.month === HOLIDAY_MONTH ? " is-holiday" : ""}" data-action="show-month" data-month="${m.month}"><span class="oscm-moon-block-title">${esc(m.title)}</span><span class="oscm-moon-block-days">${m.days.map((d) => { const top = ["alignment", "double-full", "double-dark", "solar-eclipse", "lunar-eclipse", "occultation"].find((t) => d.types.includes(t)); const isToday = today && today.year === year && today.month === m.month && today.day === d.day; return `<i class="${top ? `is-${top}` : d.types.length ? "is-tide" : ""}${d.rare ? " is-rare" : ""}${isToday ? " is-today" : ""}" title="${esc(`${d.day} ${m.title}${d.types.length ? `: ${d.types.map((t) => EVENT_TYPES[t]).join(", ")}` : ""}`)}"></i>`; }).join("")}</span></button>`;
  const counts = [["double-full", c.doubleFulls, "double full"], ["double-dark", c.doubleDarks, "double dark"], ["occultation", c.crossings, "crossing"], ["solar-eclipse", c.solarEclipses, "solar eclipse"], ["lunar-eclipse", c.lunarEclipses, "lunar eclipse"], ["great-tide", c.greatTideDays, "great-tide day"], ["slack-tide", c.slackTideDays, "slack-tide day"]];
  return `<div class="oscm-moon-year"><p class="oscm-moon-counts">${counts.map(([type, n, word]) => `<span class="oscm-moon-count is-${type}"><b>${n}</b> ${word}${n === 1 ? "" : word.endsWith("s") ? "" : "s"}</span>`).join("")}${c.alignments ? `<span class="oscm-moon-count is-alignment"><b>${c.alignments}</b> alignment${c.alignments === 1 ? "" : "s"}</span>` : ""}${c.rare ? `<span class="oscm-moon-count is-rare"><b>★ ${c.rare}</b> rare</span>` : ""}</p><div class="oscm-moon-blocks">${summary.months.map(block).join("")}</div></div>`;
}

/** The event list: time, event and lunar mansion, with what is seen from the place, filtered by type. */
export function renderEvents(calendar, { year, place = null, types = null, monthName }) {
  const all = Object.keys(EVENT_TYPES), on = new Set(types ?? all.filter((t) => !["full", "new", "first-quarter", "last-quarter", "great-tide", "slack-tide"].includes(t)));
  const events = eventList(calendar, year, { place, types: on });
  const filters = all.map((t) => `<label class="oscm-moon-filter"><input type="checkbox" data-action="filter" value="${t}"${on.has(t) ? " checked" : ""}> ${esc(EVENT_TYPES[t])}</label>`).join("");
  const rows = events.map((e) => `<tr class="is-${e.type}${e.rare.length ? " is-rare" : ""}${localClass(e.local)}" data-action="open-sky" data-time="${Math.round(e.local?.visible ? e.local.timeMs : e.timeMs)}"><td>${e.date.day} ${esc(monthName(e.date.month))}</td><td>${two(e.date.hour)}:${two(e.date.minute)}</td><td>${e.rare.length ? "★ " : ""}${esc(e.label)}${e.rare.length ? ` <em>${esc(e.rare.join("; "))}</em>` : ""}</td><td>${esc(e.mansion.name)}</td>${place ? `<td>${e.local.visible ? "seen" : "not seen"}: ${esc(e.local.note)}</td>` : ""}</tr>`).join("");
  return `<div class="oscm-moon-events"><div class="oscm-moon-filters">${filters}</div><table><thead><tr><th>Date</th><th>Time</th><th>Event</th><th>Mansion</th>${place ? "<th>From here</th>" : ""}</tr></thead><tbody>${rows || `<tr><td colspan="5">No events of these kinds this year.</td></tr>`}</tbody></table></div>`;
}

/**
 * The whole window's contents: the header (where and when, the ways about, the note on Austarm), the tabs and the
 * chosen page. `state` is { year, month, tab: "month" | "year" | "events", place: { latDeg, lonDeg, name } | null,
 * types, today: { year, month, day } | null }; `monthName` names a month.
 */
export function renderMoonCalendar(calendar, state, { monthName = monthTitle } = {}) {
  const { year, month, tab = "month", place = null, today = null } = state;
  const page = tab === "year" ? renderYear(calendar, { year, today }) : tab === "events" ? renderEvents(calendar, { year, place, types: state.types, monthName }) : renderMonth(calendar, { year, month, place, today });
  const tabButton = (id, label) => `<button type="button" class="oscm-moon-tab${tab === id ? " is-on" : ""}" data-action="tab" data-tab="${id}">${label}</button>`;
  const legend = MOON_KEYS.map((k) => `<span class="oscm-moon-legend">${moonGlyph({ key: k, illuminated: 0.5, waxing: true }, 14)} ${MOON_DISPLAY[k].name}</span>`).join("");
  return `<div class="oscm-moon-calendar" data-tab="${tab}">
  <header class="oscm-moon-head">
    <div class="oscm-moon-nav"><button type="button" data-action="step-year" data-by="-1" title="The year before">«</button><button type="button" data-action="step-month" data-by="-1" title="The month before">‹</button><h2>${tab === "month" ? `${esc(monthTitle(month))}, ` : ""}year ${year}</h2><button type="button" data-action="step-month" data-by="1" title="The month after">›</button><button type="button" data-action="step-year" data-by="1" title="The year after">»</button><button type="button" class="oscm-moon-now" data-action="now" title="The campaign clock's date">Now</button></div>
    <div class="oscm-moon-tabs">${tabButton("month", "Month")}${tabButton("year", "Year")}${tabButton("events", "Events")}</div>
    <div class="oscm-moon-place"><label>Seen from <input type="text" name="moonPlaceName" list="oscm-moon-places" value="${esc(place?.name ?? "")}" placeholder="a place"></label><label>°N <input type="number" name="moonPlaceLat" min="-90" max="90" step="0.1" value="${place ? place.latDeg : ""}"></label><label>°E <input type="number" name="moonPlaceLon" min="-180" max="180" step="0.1" value="${place ? place.lonDeg : ""}"></label><button type="button" data-action="set-place">Set</button>${place ? `<button type="button" data-action="clear-place" title="Show every event alike">Anywhere</button>` : ""}</div>
    <p class="oscm-moon-note">${austarmNote(calendar, year)}</p>
    <p class="oscm-moon-key">${legend}<span>Lit share under each face.</span><span class="oscm-moon-key-rare">★ rare: two uncommon things on one night.</span>${place ? `<span class="oscm-moon-key-seen">Bright: seen from ${esc(place.name || "here")}. Grey: not seen from there.</span>` : ""}<span>Click a night or an event to look up at the sky then.</span></p>
  </header>
  <section class="oscm-moon-page">${page}</section>
</div>`;
}
