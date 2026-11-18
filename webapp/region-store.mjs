// Where the map server keeps the region layer: a Supabase project. Pictures go in a public bucket (anyone
// may read a tile by its address), shapes in a private one, and a table lists what has been made. Only the
// server writes, with the project's service key, which never leaves the server and is never logged.
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EYM_TILES_BUCKET (eym-tiles), EYM_SHAPES_BUCKET (eym-shapes)
// Without the URL and the key there is no store, and tiles are simply made each time they are asked for.

import { createHash } from "node:crypto";

/** The store, or null where it is not set up. `fetchImpl` is the fetch to use (tests pass their own). */
export function regionStore(env = process.env, fetchImpl = globalThis.fetch) {
  const url = String(env.SUPABASE_URL ?? "").replace(/\/+$/, ""), key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? "");
  if (!url || !key || !fetchImpl) return null;
  const tiles = env.EYM_TILES_BUCKET || "eym-tiles", shapes = env.EYM_SHAPES_BUCKET || "eym-shapes", auth = { authorization: `Bearer ${key}`, apikey: key };
  const call = (path, init = {}) => fetchImpl(`${url}${path}`, { ...init, headers: { ...auth, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20000) });
  const fail = async (what, r) => new Error(`${what} failed (${r.status}): ${(await r.text().catch(() => "")).slice(0, 160)}`);
  return {
    buckets: { tiles, shapes },
    /** The public address of a picture. */
    publicUrl: (path) => `${url}/storage/v1/object/public/${tiles}/${path}`,
    /** A stored picture's bytes, or null if it has not been made. */
    async read(path) {
      const r = await fetchImpl(`${url}/storage/v1/object/public/${tiles}/${path}`, { signal: AbortSignal.timeout(20000) });
      if (r.status === 200) return Buffer.from(await r.arrayBuffer());
      if (r.status === 404 || r.status === 400) return null; // Supabase answers 400 for an object that is not there
      throw await fail("Reading from the store", r);
    },
    /** A file's bytes from a private bucket (the shapes), or null if it is not there. */
    async readPrivate(bucket, path) {
      const r = await call(`/storage/v1/object/authenticated/${bucket}/${path}`);
      if (r.status === 200) return Buffer.from(await r.arrayBuffer());
      if (r.status === 404 || r.status === 400) return null;
      throw await fail("Reading from the store", r);
    },
    /** Put a file in a bucket (replacing one already there). */
    async write(bucket, path, bytes, type) {
      const r = await call(`/storage/v1/object/${bucket}/${path}`, { method: "POST", headers: { "content-type": type, "x-upsert": "true", "cache-control": "max-age=31536000" }, body: bytes });
      if (!r.ok) throw await fail("Writing to the store", r);
    },
    /** Note a tile in the table (replacing its earlier note, and its date: a tile made again is dated when it was made again). */
    async record(row) {
      const r = await call("/rest/v1/eym_tiles?on_conflict=layer,kind,z,x,y", { method: "POST", headers: { "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ ...row, made_at: new Date().toISOString() }) });
      if (!r.ok) throw await fail("Recording the tile", r);
    },
    /** The tiles of a layer, kind and frame already made (under these rules, when `rulesVersion` is given), as a set of "x,y". */
    async listed(layer, kind, z, rulesVersion = null) {
      const made = new Set();
      for (let from = 0; ; from += 1000) {
        const rules = rulesVersion ? `&rules_version=eq.${encodeURIComponent(rulesVersion)}` : "";
        const r = await call(`/rest/v1/eym_tiles?select=x,y&layer=eq.${layer}&kind=eq.${kind}&z=eq.${z}${rules}&order=x,y&offset=${from}&limit=1000`);
        if (!r.ok) throw await fail("Listing the tiles", r);
        const rows = await r.json(); for (const row of rows) made.add(`${row.x},${row.y}`);
        if (rows.length < 1000) return made;
      }
    },
    /** The tiles of a layer, kind and frame already made, with the version each was made under: a Map of "x,y" to it. */
    async versions(layer, kind, z) {
      const made = new Map();
      for (let from = 0; ; from += 1000) {
        const r = await call(`/rest/v1/eym_tiles?select=x,y,rules_version&layer=eq.${layer}&kind=eq.${kind}&z=eq.${z}&order=x,y&offset=${from}&limit=1000`);
        if (!r.ok) throw await fail("Listing the tiles", r);
        const rows = await r.json(); for (const row of rows) made.set(`${row.x},${row.y}`, row.rules_version);
        if (rows.length < 1000) return made;
      }
    },
    /** Every file under a folder of a bucket, at any depth, as full paths (Supabase lists one level at a time; folders have no id). */
    async files(bucket, folder) {
      const out = [], walk = async (prefix) => {
        for (let offset = 0; ; offset += 1000) {
          const r = await call(`/storage/v1/object/list/${bucket}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }) });
          if (!r.ok) throw await fail("Listing the store", r);
          const entries = await r.json();
          for (const e of entries) { if (e.id) out.push(`${prefix}/${e.name}`); else await walk(`${prefix}/${e.name}`); }
          if (entries.length < 1000) return;
        }
      };
      await walk(folder.replace(/\/+$/, ""));
      return out;
    },
    /** Delete files from a bucket by their full paths (at most 1000 a call). Returns how many the store says it removed. */
    async remove(bucket, paths) {
      if (!paths.length) return 0;
      if (paths.length > 1000) throw new Error("At most 1000 files are removed at a time");
      const r = await call(`/storage/v1/object/${bucket}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ prefixes: paths }) });
      if (!r.ok) throw await fail("Removing from the store", r);
      return (await r.json()).length;
    },
  };
}

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
