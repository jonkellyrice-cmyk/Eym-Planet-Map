// The lunar calendar's window: a view of its own beside the map and the ground view of the sky, open to every
// player (anyone on Eym can see the moons; nothing of the GM's is on it). It only hosts the pages that
// scripts/moon-calendar-view.mjs draws from scripts/moon-calendar.mjs and acts on their controls.

import { loadAstronomyOrientations } from "./astronomy.mjs";
import { loadSystemRegistry } from "./system-data.mjs";
import { CAMPAIGN_START_MS, universalTimeParts } from "./universal-time.mjs";
import { createMoonCalendar, stepMonth } from "./moon-calendar.mjs";
import { renderMoonCalendar } from "./moon-calendar-view.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
/** Where the sky is looked up from when no place has been set: Dree, on Caren. */
export const DEFAULT_SKY_PLACE = Object.freeze({ latDeg: -6.79, lonDeg: 0.41, name: "Dree" });

export class MoonCalendarApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "eym-moon-calendar",
    classes: ["eym-planet-map", "eym-moon-calendar-window"],
    position: { width: 980, height: 780 },
    window: { title: "The Moons' Calendar", icon: "fa-solid fa-moon", resizable: true, minimizable: true },
  };
  static PARTS = { content: { template: "modules/eym-planet-map/templates/moon-calendar.hbs", scrollable: [""] } };

  /**
   * `moduleId`; `now()` gives the campaign clock's moment; `openSky({ latDeg, lonDeg, timeMs })` opens the ground
   * view of the sky there and then; `place` is where events are judged from to begin with (or null: anywhere);
   * `places` are named places to choose from: [{ name, latDeg, lonDeg }].
   */
  constructor({ moduleId = "eym-planet-map", now = () => CAMPAIGN_START_MS, openSky = () => {}, place = null, places = [] } = {}, options = {}) {
    super(options);
    this.moduleId = moduleId; this.now = now; this.openSky = openSky; this.places = places;
    const today = universalTimeParts(now());
    this.state = { year: today.year, month: today.month, tab: "month", place, types: null };
  }

  setPlace(place) { this.state.place = place; this.#draw(); }

  async #calendar() {
    this._calendar ??= (async () => {
      const [rows, orientationDocument, sky] = await Promise.all([loadSystemRegistry(this.moduleId), loadAstronomyOrientations(this.moduleId), fetch(`modules/${this.moduleId}/data/stellar/constellations.json`).then((r) => { if (!r.ok) throw new Error(`Sky data fetch failed (${r.status})`); return r.json(); })]);
      return createMoonCalendar({ rows, sky, orientations: orientationDocument.orientations });
    })();
    return this._calendar;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element.querySelector(".oscm-moon-root"); if (!root) return;
    root.addEventListener("click", (event) => this.#onClick(event));
    root.addEventListener("change", (event) => this.#onChange(event));
    void this.#draw();
  }

  async #draw() {
    const root = this.element?.querySelector?.(".oscm-moon-root"); if (!root) return;
    try {
      const calendar = await this.#calendar(), t = universalTimeParts(this.now());
      const list = this.places.length ? `<datalist id="oscm-moon-places">${this.places.map((p) => `<option value="${String(p.name).replace(/"/g, "&quot;")}"></option>`).join("")}</datalist>` : "";
      root.innerHTML = renderMoonCalendar(calendar, { ...this.state, today: { year: t.year, month: t.month, day: t.day } }) + list;
    } catch (error) {
      console.error(`${this.moduleId} | The moons' calendar could not be drawn`, error);
      root.innerHTML = `<p class="oscm-moon-loading">The moons' calendar could not be drawn.</p>`;
    }
  }

  #onClick(event) {
    const control = event.target.closest?.("[data-action]"); if (!control || control.tagName === "INPUT") return;
    const s = this.state, root = this.element.querySelector(".oscm-moon-root");
    switch (control.dataset.action) {
      case "tab": s.tab = control.dataset.tab; break;
      case "step-month": if (s.tab === "month") Object.assign(s, stepMonth(s.year, s.month, Number(control.dataset.by))); else s.year += Number(control.dataset.by); break;
      case "step-year": s.year += Number(control.dataset.by); break;
      case "now": { const t = universalTimeParts(this.now()); s.year = t.year; s.month = t.month; break; }
      case "show-month": s.month = Number(control.dataset.month); s.tab = "month"; break;
      case "clear-place": s.place = null; break;
      case "set-place": {
        const name = root.querySelector('[name="moonPlaceName"]')?.value.trim() ?? "", known = this.places.find((p) => p.name.toLowerCase() === name.toLowerCase());
        const lat = root.querySelector('[name="moonPlaceLat"]')?.value, lon = root.querySelector('[name="moonPlaceLon"]')?.value;
        // A known name gives its own place unless the numbers were typed too and differ from the place shown.
        const typed = lat !== "" && lon !== "" && Number(lat) >= -90 && Number(lat) <= 90 && Number(lon) >= -180 && Number(lon) <= 180;
        if (known && (!typed || !s.place || (Number(lat) === s.place.latDeg && Number(lon) === s.place.lonDeg))) s.place = { name: known.name, latDeg: known.latDeg, lonDeg: known.lonDeg };
        else if (typed) s.place = { name, latDeg: Number(lat), lonDeg: Number(lon) };
        else return ui.notifications?.warn("Give a known place, or a latitude from −90 to 90 and a longitude from −180 to 180.");
        break;
      }
      case "open-sky": { const place = s.place ?? DEFAULT_SKY_PLACE; return void this.openSky({ latDeg: place.latDeg, lonDeg: place.lonDeg, timeMs: Number(control.dataset.time) }); }
      default: return;
    }
    void this.#draw();
  }

  #onChange(event) {
    if (event.target?.dataset?.action !== "filter") return;
    const root = this.element.querySelector(".oscm-moon-root");
    this.state.types = [...root.querySelectorAll('input[data-action="filter"]:checked')].map((box) => box.value);
    void this.#draw();
  }
}
