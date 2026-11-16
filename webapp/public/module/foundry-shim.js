// A stand-in for the parts of Foundry VTT the Eym Planet Map module uses, so the module's real scripts,
// template, styles and data run unchanged in a plain web page (the map server's "Module preview").
// It provides: settings (kept in this browser), one GM user, notifications, dialogs, hooks, and a window
// frame that renders the module's Handlebars template. It is not Foundry: there are no scenes, tokens or
// files, so "Create scene" and saving to the world's data folder report that they need Foundry.
const MODULE_ID = "eym-planet-map", STORE = "eym-preview:";

// ---------------------------------------------------------------- hooks, notifications
const hooks = new Map();
globalThis.Hooks = {
  on: (name, fn) => { (hooks.get(name) ?? hooks.set(name, []).get(name)).push({ fn, once: false }); },
  once: (name, fn) => { (hooks.get(name) ?? hooks.set(name, []).get(name)).push({ fn, once: true }); },
  callAll: async (name, ...args) => { const list = hooks.get(name) ?? []; hooks.set(name, list.filter((h) => !h.once)); for (const h of list) await h.fn(...args); },
};
const toast = (kind) => (message) => {
  const host = document.getElementById("notifications"), note = Object.assign(document.createElement("li"), { className: `notification ${kind}`, textContent: String(message) });
  host.append(note); setTimeout(() => note.remove(), kind === "error" ? 9000 : 5000); return note;
};
globalThis.ui = { notifications: { info: toast("info"), warn: toast("warning"), error: toast("error") } };

// ---------------------------------------------------------------- settings, user, module
const registered = new Map();
const read = (key) => { try { const raw = localStorage.getItem(STORE + key); return raw == null ? undefined : JSON.parse(raw); } catch { return undefined; } };
const user = { id: "preview-gm", name: "Preview GM", isGM: true };
const moduleRecord = { id: MODULE_ID, active: true, api: null };
globalThis.game = {
  user, users: { activeGM: user, contents: [user] }, userId: user.id,
  world: { id: "eym-preview", title: "Module preview" }, release: { generation: 14, build: 370 },
  modules: new Map([[MODULE_ID, moduleRecord]]),
  settings: {
    register: (moduleId, key, data) => registered.set(`${moduleId}.${key}`, data),
    get: (moduleId, key) => { const k = `${moduleId}.${key}`, data = registered.get(k); if (!data) throw new Error(`"${k}" is not a registered setting`); const value = read(k); return value === undefined ? structuredClone(data.default) : value; },
    set: async (moduleId, key, value) => { const k = `${moduleId}.${key}`, data = registered.get(k); if (!data) throw new Error(`"${k}" is not a registered setting`); try { localStorage.setItem(STORE + k, JSON.stringify(value)); } catch { /* private window: kept for this page only */ } data.onChange?.(value); return value; },
    registered,
  },
};

// ---------------------------------------------------------------- a small Handlebars (if / unless / values)
const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function renderTemplate(source, context) {
  const lookup = (path) => path.split(".").reduce((v, k) => v?.[k], context);
  let out = source.replace(/{{!--[\s\S]*?--}}/g, "");
  // Innermost blocks first, until none are left.
  const block = /{{#(if|unless) ([\w.]+)}}((?:(?!{{#(?:if|unless) )[\s\S])*?){{\/\1}}/;
  for (let guard = 0; block.test(out) && guard < 500; guard += 1) out = out.replace(block, (_, kind, path, body) => { const [yes, no = ""] = body.split("{{else}}"); return Boolean(lookup(path)) === (kind === "if") ? yes : no; });
  return out.replace(/{{{([\w.]+)}}}/g, (_, path) => String(lookup(path) ?? "")).replace(/{{([\w.]+)}}/g, (_, path) => escapeHtml(lookup(path)));
}

// ---------------------------------------------------------------- application window, dialogs
const merged = (cls) => { const chain = []; for (let c = cls; c && c !== Object; c = Object.getPrototypeOf(c)) if (Object.hasOwn(c, "DEFAULT_OPTIONS")) chain.unshift(c.DEFAULT_OPTIONS); const out = { classes: [], window: {}, position: {} }; for (const o of chain) { out.classes.push(...(o.classes ?? [])); Object.assign(out.window, o.window); Object.assign(out.position, o.position); for (const [k, v] of Object.entries(o)) if (!["classes", "window", "position"].includes(k)) out[k] = v; } return out; };
class ApplicationV2 {
  static DEFAULT_OPTIONS = {};
  constructor(options = {}) { this.options = { ...merged(this.constructor), ...options }; this.rendered = false; this.element = null; }
  get id() { return this.options.id; }
  get title() { return this.options.window?.title ?? ""; }
  async _prepareContext() { return {}; }
  _onRender() {}
  _onClose() {}
  bringToFront() { this.element?.scrollIntoView?.({ block: "nearest" }); }
  async close(options = {}) { if (!this.rendered) return this; this._onClose(options); this.element?.remove(); this.element = null; this.rendered = false; document.body.classList.remove("has-app"); return this; }
}
const HandlebarsApplicationMixin = (Base) => class extends Base {
  async render(options = {}) {
    const context = await this._prepareContext(options), parts = [];
    for (const [name, part] of Object.entries(this.constructor.PARTS ?? {})) {
      const response = await fetch(`/${part.template}`); if (!response.ok) throw new Error(`template ${part.template}: ${response.status}`);
      parts.push(`<div data-application-part="${name}">${renderTemplate(await response.text(), context)}</div>`);
    }
    this.element?.remove();
    const frame = document.createElement("div"); frame.id = this.options.id ?? ""; frame.className = ["application", ...this.options.classes].join(" ");
    frame.innerHTML = `<header class="window-header"><i class="window-icon ${escapeHtml(this.options.window?.icon ?? "")}"></i><h1 class="window-title">${escapeHtml(this.title)}</h1><button type="button" class="header-control" data-action="close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></header><section class="window-content">${parts.join("")}</section>`;
    frame.querySelector('[data-action="close"]').addEventListener("click", () => this.close());
    document.getElementById("app-host").append(frame); document.body.classList.add("has-app");
    this.element = frame; this.rendered = true;
    await this._onRender(context, options);
    return this;
  }
};
class DialogV2 {
  /** A modal with buttons; resolves with the pressed button's callback result (or its action). */
  static wait({ window: win = {}, content = "", buttons = [], rejectClose = false } = {}) {
    return new Promise((resolve, reject) => {
      const dialog = document.createElement("dialog"); dialog.className = "application dialog";
      dialog.innerHTML = `<header class="window-header"><h1 class="window-title">${escapeHtml(win.title ?? "")}</h1></header><form class="window-content dialog-form" method="dialog"><div class="dialog-content standard-form">${content}</div><footer class="form-footer">${buttons.map((b) => `<button type="button" data-action="${escapeHtml(b.action)}"${b.default ? " autofocus" : ""}>${escapeHtml(b.label ?? b.action)}</button>`).join("")}</footer></form>`;
      const finish = (value, failed = false) => { dialog.close(); dialog.remove(); failed ? reject(new Error("Dialog was dismissed")) : resolve(value); };
      for (const b of buttons) dialog.querySelector(`[data-action="${CSS.escape(b.action)}"]`).addEventListener("click", async (event) => finish(b.callback ? await b.callback(event, event.currentTarget, dialog) : b.action));
      dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(null, rejectClose); });
      document.body.append(dialog); dialog.showModal();
    });
  }
  static async confirm({ window: win, content, rejectClose = false } = {}) {
    return DialogV2.wait({ window: win, content, rejectClose, buttons: [{ action: "yes", label: "Yes", default: true, callback: () => true }, { action: "no", label: "No", callback: () => false }] });
  }
}
globalThis.foundry = {
  applications: { api: { ApplicationV2, HandlebarsApplicationMixin, DialogV2 }, apps: {} },
  utils: { randomID: (n = 16) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 62]).join("") },
};

// ---------------------------------------------------------------- start the module as Foundry would
export async function startModule() {
  const manifest = await (await fetch(`/modules/${MODULE_ID}/module.json`)).json();
  for (const href of manifest.styles ?? []) document.head.append(Object.assign(document.createElement("link"), { rel: "stylesheet", href: `/modules/${MODULE_ID}/${href}` }));
  for (const src of manifest.esmodules ?? []) await import(`/modules/${MODULE_ID}/${src}`);
  await Hooks.callAll("init"); await Hooks.callAll("setup"); await Hooks.callAll("ready");
  return { manifest, open: () => moduleRecord.api?.open?.(), settings: registered };
}
