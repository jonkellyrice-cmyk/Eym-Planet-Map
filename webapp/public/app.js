// The map server's page: choose a place and a battle map, render it as pixel art, preview and download it.
const $ = (s) => document.querySelector(s), form = $("#form"), opt = (v, t) => Object.assign(document.createElement("option"), { value: v, textContent: t });
const KM_LAT = 111.2;
let options = null;

async function load() {
  options = await (await fetch("/api/options")).json();
  form.settlement.replaceChildren(...options.settlements.map((s) => opt(`${s.lat},${s.lon}`, `${s.name} (${s.kind})`)));
  const natural = document.createElement("optgroup"), fantastic = document.createElement("optgroup"); natural.label = "The natural world"; fantastic.label = "The fantastic";
  natural.append(...options.settings.filter((s) => s.group !== "fantastic").map((s) => opt(s.id, s.label))); fantastic.append(...options.settings.filter((s) => s.group === "fantastic").map((s) => opt(s.id, s.label)));
  form.setting.replaceChildren(opt("auto", "From the ground (automatic)"), natural, fantastic);
  form.size.replaceChildren(...options.sizes.map((s) => opt(s.id, s.label)));
  form.density.replaceChildren(...options.densities.map((d) => opt(d.id, d.label))); form.density.value = "fa-140";
  form.tier.replaceChildren(...options.tiers.map((t) => Object.assign(opt(t.tier, `Tier ${t.tier} — ${t.name}${t.available ? "" : ` (${t.note ?? "planned"})`}`), { disabled: !t.available }))); form.tier.value = "2";
  $("#features").replaceChildren(...options.featureCategories.map((c) => { const fs = document.createElement("fieldset"); fs.append(Object.assign(document.createElement("legend"), { textContent: c.label })); for (const f of options.features.filter((x) => x.category === c.id)) { const l = document.createElement("label"); l.append(Object.assign(document.createElement("input"), { type: "checkbox", name: "extra", value: f.id }), document.createTextNode(f.label)); fs.append(l); } return fs; }));
  $("#features").addEventListener("change", () => { const n = form.querySelectorAll('[name="extra"]:checked').length; $("#feature-count").textContent = n ? `(${n})` : ""; });
  $("#origin").textContent = location.origin;
}

function request() {
  const size = options.sizes.find((s) => s.id === form.size.value), density = options.densities.find((d) => d.id === form.density.value);
  let [columns, rows] = [size.columns, size.rows]; if (form.orientation.value === "landscape" && rows > columns) [columns, rows] = [rows, columns]; if (form.orientation.value === "portrait" && columns > rows) [columns, rows] = [rows, columns];
  let lat = Number(form.lat.value), lon = Number(form.lon.value);
  if (!form.lat.value || !form.lon.value) { const [slat, slon] = form.settlement.value.split(",").map(Number); lat = slat + Number(form.dy.value || 0) / KM_LAT; lon = slon + Number(form.dx.value || 0) / (KM_LAT * Math.cos((slat * Math.PI) / 180)); }
  const conditions = {}; if (form.snowDepthCm.value) conditions.snowDepthCm = Number(form.snowDepthCm.value); if (form.ground.value) conditions.ground = form.ground.value;
  return { center: [lat, lon], columns, rows, gridPx: density.px, setting: form.setting.value, extras: [...form.querySelectorAll('[name="extra"]:checked')].map((b) => b.value), conditions, tier: Number(form.tier.value) };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault(); const button = $("#render"); button.disabled = true; $("#status").textContent = "Rendering… (a first render takes a few seconds; repeats come from the cache)";
  try {
    const res = await fetch("/api/battle-maps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request()) }), m = await res.json();
    if (!res.ok) throw new Error(m.error ?? res.statusText);
    const base = `/api/battle-maps/${m.id}/files/`, link = (name, label) => { const li = document.createElement("li"), a = Object.assign(document.createElement("a"), { href: base + name, textContent: label, download: name }); li.append(a); return li; };
    $("#title").textContent = `${options.settings.find((s) => s.id === m.setting)?.label ?? m.setting} — Tier ${m.tier}`;
    $("#summary").textContent = `${m.spec.columns}×${m.spec.rows} squares · ${m.width}×${m.height} px (${m.native} px per square, ×${m.scale}) · floors: ${m.floors.length ? m.floors.join(", ") : "ground only"}`;
    $("#preview").src = base + m.files.preview;
    $("#files").replaceChildren(link(m.files.exterior, "Outside with roofs"), link(m.files.ground, "Ground (buildings opened)"), ...Object.entries(m.files.roofs).map(([f, n]) => link(n, `Roofs over floor ${f}`)), ...Object.entries(m.files.floors).map(([f, n]) => link(n, Number(f) < 0 ? "Basement" : Number(f) === 1 ? "Upper floor" : `Floor ${Number(f) + 1}`)));
    $("#notes").replaceChildren(...m.notes.map((t) => Object.assign(document.createElement("li"), { textContent: t })));
    $("#geometry").textContent = m.geometryHash; $("#result").hidden = false; $("#status").textContent = "";
  } catch (error) { $("#status").textContent = `Could not render: ${error.message}`; } finally { button.disabled = false; }
});

load().catch((error) => { $("#status").textContent = `Could not reach the server: ${error.message}`; });
