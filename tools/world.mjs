// npm run world: change an input, run this, read the report.
//
// It carries a change to Eym's inputs through everything made from them and says what moved:
//   1. runs the build (tools/build-generated.mjs) until it is finished, the plate fit's many steps included;
//   2. checks the world against the standing rules (tools/world-checks.mjs);
//   3. compares the world with a commit (HEAD unless --base names another), layer by layer, flagging what a person
//      should look at (tools/world-snapshot.mjs), and draws the standard before-and-after pictures;
//   4. writes the report to reports/world/latest/ (report.md and its pictures; not committed).
// It changes nothing but the derived data the build writes, and (only with --accept-pins) the managed pins.
//
//   node tools/world.mjs                      rebuild, check, compare with HEAD, write the report
//   node tools/world.mjs --no-build           check and compare only
//   node tools/world.mjs --base v0.25.5       compare with another commit or tag
//   node tools/world.mjs --accept-pins --note "why"   record the managed pins as they now stand
//   node tools/world.mjs --out some/folder    write the report elsewhere
// Exit status: 0 when no rule that must hold is broken, 1 otherwise.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compareWorlds, loadWorld, refReader, summarizeWorld, treeReader } from "./world-snapshot.mjs";
import { managedPinsOf, readPins, worldChecks } from "./world-checks.mjs";
import { BIOME_COLOURS, worldPictures } from "./world-maps.mjs";
import { describeOverrides } from "../scripts/eym-overrides.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

/** Run the build until it has nothing left to do (the plate fit works in steps and asks to be run again). */
export function buildToCompletion({ log = console.log, maxRounds = 200 } = {}) {
  for (let round = 1; round <= maxRounds; round += 1) {
    const out = execFileSync(process.execPath, ["tools/build-generated.mjs"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "inherit"] });
    const last = out.trim().split("\n").at(-1) ?? "";
    if (!/not finished/.test(out)) { log(`Build: ${last}${round > 1 ? ` (after ${round} rounds)` : ""}`); return { rounds: round, changed: /made again/.test(out) }; }
    if (round % 5 === 0) log(`Build: the plate fit is still working (round ${round})…`);
  }
  throw new Error(`The build did not finish in ${maxRounds} rounds`);
}

/** The report as Markdown, from the pieces. */
export function reportMarkdown({ base, comparison, checks, pinsMoved, pictures, overrides = [] }) {
  const failed = checks.filter((c) => !c.ok && c.level === "must"), warned = checks.filter((c) => !c.ok && c.level !== "must"), out = [];
  const verdict = failed.length || comparison.errors.length ? "BROKEN: a rule that must hold does not" : comparison.same ? "No change to the world" : comparison.flags.length ? `Changed: ${comparison.flags.length} thing${comparison.flags.length === 1 ? "" : "s"} to look at` : "Changed: nothing past the look-at thresholds";
  out.push(`# World change report`, ``, `Compared with \`${base}\`. **${verdict}.**`, ``);
  if (comparison.errors.length || failed.length) { out.push(`## Errors`, ``); for (const e of comparison.errors) out.push(`- ${e}`); for (const c of failed) out.push(`- Rule broken: ${c.rule}${c.detail ? ` (${c.detail})` : ""}`); out.push(``); }
  if (comparison.flags.length) { out.push(`## Look at`, ``); for (const f of comparison.flags) out.push(`- ${f}`); out.push(``); }
  if (warned.length) { out.push(`## Warnings`, ``); for (const c of warned) out.push(`- ${c.rule}: ${c.detail}`); out.push(``); }
  if (pinsMoved.length) { out.push(`## Managed pins that moved`, ``, `Accept them with \`node tools/world.mjs --accept-pins --note "…"\` once the changes above are accepted.`, ``); for (const p of pinsMoved) out.push(`- ${p.key}: ${p.from ?? "none"} → ${p.to}`); out.push(``); }
  out.push(`## Hand-authored overrides in force`, ``, overrides.length ? overrides.map((o) => `- ${o}`).join("\n") : `None.`, ``);
  out.push(`## What changed, layer by layer`, ``);
  for (const s of comparison.sections) { out.push(`### ${s.title}`, ``); for (const line of s.lines) out.push(`- ${line}`); out.push(``); }
  if (pictures.length) {
    out.push(`## Pictures`, ``); for (const p of pictures) out.push(`![${p.title}](${p.name})`, ``, `*${p.title}.*`, ``);
    out.push(`Biome colours (red, green, blue): ${Object.entries(BIOME_COLOURS).map(([k, v]) => `${k} (${v.join(", ")})`).join("; ")}.`, ``);
  }
  out.push(`## Standing rules`, ``, `${checks.filter((c) => c.ok).length} of ${checks.length} hold.`, ``);
  for (const c of checks) out.push(`- ${c.ok ? "holds" : c.level === "must" ? "BROKEN" : "warning"}: ${c.rule}${c.detail ? ` (${c.detail})` : ""}`);
  return `${out.join("\n")}\n`;
}

/** Record the managed pins as they stand in the working tree; returns what moved. */
export function acceptPins(note) {
  const pins = readPins(), now = managedPinsOf(loadWorld(treeReader())), moved = [];
  for (const [key, value] of Object.entries(now)) if (pins.managed[key]?.value !== value) { moved.push({ key, from: pins.managed[key]?.value ?? null, to: value }); pins.managed[key] = { value, note }; }
  if (moved.length) writeFileSync(new URL("world-pins.json", import.meta.url), `${JSON.stringify(pins, null, 2)}\n`);
  return moved;
}

/** Check and compare the working tree with a commit; write the report. Returns { ok, comparison, checks, dir }. */
export async function reportWorld({ base = "HEAD", out = "reports/world/latest", log = console.log } = {}) {
  const now = loadWorld(treeReader()), then = loadWorld(refReader(base));
  const after = summarizeWorld(now), before = summarizeWorld(then), comparison = compareWorlds(before, after), checks = await worldChecks(now, { current: true });
  const pins = readPins(), managed = managedPinsOf(now), pinsMoved = Object.keys(managed).filter((k) => pins.managed[k]?.value !== managed[k]).map((k) => ({ key: k, from: pins.managed[k]?.value ?? null, to: managed[k] }));
  const pictures = before && after && !comparison.same ? worldPictures(before, after) : [];
  const dir = `${root}${out.replace(/\/$/, "")}`; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  for (const p of pictures) writeFileSync(`${dir}/${p.name}`, p.png);
  writeFileSync(`${dir}/report.md`, reportMarkdown({ base, comparison, checks, pinsMoved, pictures, overrides: describeOverrides(now.overrides) }));
  const failed = checks.filter((c) => !c.ok && c.level === "must"), ok = failed.length === 0 && comparison.errors.length === 0;
  log(`Report: ${out}/report.md (${pictures.length} picture${pictures.length === 1 ? "" : "s"})`);
  log(ok ? (comparison.same ? "The world is unchanged." : `The world changed; ${comparison.flags.length} to look at${pinsMoved.length ? `; ${pinsMoved.length} managed pin${pinsMoved.length === 1 ? "" : "s"} moved` : ""}.`) : `BROKEN: ${[...comparison.errors, ...failed.map((c) => c.rule)].join("; ")}`);
  for (const f of comparison.flags) log(`  look at: ${f}`);
  for (const c of checks.filter((x) => !x.ok && x.level !== "must")) log(`  warning: ${c.rule}: ${c.detail}`);
  return { ok, comparison, checks, pinsMoved, dir };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), value = (flag, fallback) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
  if (args.includes("--accept-pins")) {
    const note = value("--note", ""); if (!note) { console.error('Say why: --accept-pins --note "what changed the world"'); process.exit(1); }
    const moved = acceptPins(note); console.log(moved.length ? moved.map((m) => `Recorded ${m.key}: ${m.from ?? "none"} → ${m.to}`).join("\n") : "The managed pins already record the world as it is.");
    process.exit(0);
  }
  if (!args.includes("--no-build")) buildToCompletion();
  const result = await reportWorld({ base: value("--base", "HEAD"), out: value("--out", "reports/world/latest") });
  process.exit(result.ok ? 0 : 1);
}
