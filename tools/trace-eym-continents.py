#!/usr/bin/env python3
"""Trace Caren and Garyk from their source maps into km-scale vector data.

One-off authoring step for Eym's surface (requires numpy, Pillow, scipy and
scikit-image; the rest of the module is plain JavaScript). The source maps are
not stored in the repository; their SHA-256 hashes are recorded instead.

    python3 tools/trace-eym-continents.py --caren caren.jpg --garyk garyk.jpg

Writes data/eym/traced-continents.json: for each continent, its coastlines
(mainland and islands), inland water (lakes and rivers), a relief grid, and
the pixel scale and origin used, so map labels in pixels can be placed too.
"""
import argparse, base64, hashlib, json, math
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import measure, morphology

SQ_MILE_KM2 = 2.589988110336
CONTINENTS = {
    # Caren: 590,000 square miles (its cartographer's figure); Garyk about four fifths of that.
    "caren": {"name": "Caren", "areaKm2": 590_000 * SQ_MILE_KM2, "riverRadiusPx": 18,
              # the legend box, compass rose and scale bar sit on the sea
              "forceSea": [(1015, 1830, 1152, 2048), (990, 30, 1110, 150), (930, 1980, 1152, 2048)]},
    "garyk": {"name": "Garyk", "areaKm2": 0.8 * 590_000 * SQ_MILE_KM2, "riverRadiusPx": 9, "forceSea": []},
}
MIN_ISLAND_KM2 = 60
SIMPLIFY_PX = 1.2
RELIEF_CELL_PX = 8

def load(path):
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.int32)
    return rgb, hashlib.sha256(Path(path).read_bytes()).hexdigest()

def water_mask(rgb, force_sea):
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    water = ((B - (R + G) / 2) > -8) & ((G - R) > 15)
    water = ndi.uniform_filter(water.astype(np.float32), 7) > 0.5
    for x0, y0, x1, y1 in force_sea: water[y0:y1, x0:x1] = True
    return water

def split_sea(water, radius):
    """Sea is open water reaching the map edge; narrower channels inland are rivers and lakes."""
    opened = ndi.binary_opening(water, structure=morphology.disk(radius))
    labels, _ = ndi.label(opened)
    edge = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    open_sea = np.isin(labels, list(edge))
    sea = ndi.binary_dilation(open_sea, structure=morphology.disk(radius + 1)) & water
    labels, _ = ndi.label(sea)  # keep only sea still joined to the edge after dilation
    edge = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    return np.isin(labels, list(edge))

def rings_of(mask, to_km):
    rings = []
    padded = np.pad(mask.astype(np.float32), 1)
    for contour in measure.find_contours(padded, 0.5):
        poly = measure.approximate_polygon(contour - 1, SIMPLIFY_PX)
        if len(poly) < 4: continue
        rings.append([to_km(x, y) for y, x in poly])
    return rings

def ring_area(ring):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1]))) / 2

def relief_grid(rgb, land, kind, to_km, km_per_px):
    """0 lowland, 1 upland, 2 mountains, 3 high peaks; plus forest cover, per 8-px cell."""
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = (R + G + B) / 3
    if kind == "caren":
        brown = (R > G) & (G > B) & (B > 50) & (R - B > 25)          # tan plateaus and mountain fills
        outline = (lum < 55) & (R >= G - 4) & land                   # ink of drawn peaks (not green trees)
        snow = (lum > 190) & (np.abs(R - B) < 30)                     # snow caps and peak clouds
        forest = (lum < 70) & (G > R + 4) & land                      # dark tree glyphs
    else:
        brown = np.zeros_like(land)
        outline = (lum < ndi.uniform_filter(lum.astype(np.float32), 11) - 16) & land   # thin dark hatching strokes
        snow = np.zeros_like(land)
        forest = np.zeros_like(land)
    h, w = land.shape
    rows, cols = math.ceil(h / RELIEF_CELL_PX), math.ceil(w / RELIEF_CELL_PX)
    def frac(m, smooth):
        f = ndi.uniform_filter(m.astype(np.float32), smooth)
        pad = np.zeros((rows * RELIEF_CELL_PX, cols * RELIEF_CELL_PX), np.float32); pad[:h, :w] = f
        return pad.reshape(rows, RELIEF_CELL_PX, cols, RELIEF_CELL_PX).mean(axis=(1, 3))
    landf = frac(land, 1)
    inland = frac(ndi.binary_erosion(land, iterations=14 if kind == 'caren' else 10), 1)        # beaches and coastal tint are not uplands
    brownf, outlinef, snowf, forestf = frac(brown & land, 25), frac(outline, 31), frac(snow & land, 31), frac(forest, 25)
    relief = np.zeros((rows, cols), np.uint8)
    if kind == "caren":
        relief[(brownf > 0.35) & (inland > 0.5)] = 1
        relief[(outlinef > 0.06) & (brownf > 0.25)] = 2
        relief[(snowf > 0.05) & (relief >= 1)] = 3
    else:
        relief[outlinef > 0.05] = 1
        relief[outlinef > 0.09] = 2
        relief[outlinef > 0.14] = 3
        relief[inland < 0.5] = 0
    relief[landf < 0.5] = 0
    forest_cells = ((forestf > 0.2) & (landf >= 0.5)).astype(np.uint8)
    x0, y0 = to_km(0, 0)
    return {"cellPx": RELIEF_CELL_PX, "cellKm": round(RELIEF_CELL_PX * km_per_px, 4), "rows": rows, "cols": cols,
            "northWestKm": [x0, y0], "codes": {"0": "lowland", "1": "upland", "2": "mountains", "3": "high peaks"},
            "reliefBase64": base64.b64encode(relief.tobytes()).decode(), "forestBase64": base64.b64encode(forest_cells.tobytes()).decode()}

def trace(kind, path):
    spec = CONTINENTS[kind]
    rgb, digest = load(path)
    water = water_mask(rgb, spec["forceSea"])
    sea = split_sea(water, spec["riverRadiusPx"])
    landsea = ~sea                         # land plus inland water: the continent's outline
    labels, count = ndi.label(landsea)
    sizes = ndi.sum(landsea, labels, range(1, count + 1))
    main = int(np.argmax(sizes)) + 1
    main_mask = labels == main
    km_per_px = math.sqrt(spec["areaKm2"] / sizes[main - 1])
    cy, cx = ndi.center_of_mass(main_mask)
    to_km = lambda x, y: [round((x - cx) * km_per_px, 1), round((cy - y) * km_per_px, 1)]
    coasts = []
    min_px = MIN_ISLAND_KM2 / km_per_px ** 2
    for index in np.argsort(-sizes):
        label = int(index) + 1
        if sizes[index] < min_px: break
        for ring in rings_of(labels == label, to_km):
            area = ring_area(ring)
            if area < MIN_ISLAND_KM2: continue
            coasts.append({"id": f"{kind}-{'mainland' if label == main else 'island'}-{len(coasts) + 1}",
                           "kind": "mainland" if label == main else "island", "areaKm2": round(area), "ring": ring})
    inland = water & ~sea
    inland_labels, inland_count = ndi.label(inland)
    waters = []
    for label in range(1, inland_count + 1):
        component = inland_labels == label
        px = int(component.sum())
        if px * km_per_px ** 2 < 40: continue
        skeleton_px = int(morphology.skeletonize(component).sum())
        width_px = px / max(1, skeleton_px)
        rings = rings_of(component, to_km)
        if not rings: continue
        ys, xs = np.nonzero(component)
        waters.append({"id": f"{kind}-water-{len(waters) + 1}", "kind": "river" if skeleton_px > 4 * width_px + 30 else "lake",
                       "areaKm2": round(px * km_per_px ** 2), "meanWidthKm": round(width_px * km_per_px, 1),
                       "centerKm": to_km(float(xs.mean()), float(ys.mean())), "rings": rings})
    land_only = landsea & ~inland
    return {"name": spec["name"], "sourceImage": {"sha256": digest, "widthPx": rgb.shape[1], "heightPx": rgb.shape[0]},
            "targetAreaKm2": round(spec["areaKm2"]), "kmPerPixel": round(km_per_px, 6), "originPx": [round(cx, 3), round(cy, 3)],
            "frame": "x east km, y north km from the mainland's centroid; map north is up",
            "mainlandAreaKm2": round(float(sizes[main - 1]) * km_per_px ** 2), "landAreaKm2": round(float(land_only.sum()) * km_per_px ** 2),
            "coasts": coasts, "inlandWater": waters, "relief": relief_grid(rgb, land_only, kind, to_km, km_per_px)}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--caren", required=True); parser.add_argument("--garyk", required=True)
    parser.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "data/eym/traced-continents.json"))
    args = parser.parse_args()
    result = {"schemaVersion": 1, "tool": "tools/trace-eym-continents.py", "continents": {"caren": trace("caren", args.caren), "garyk": trace("garyk", args.garyk)}}
    Path(args.out).write_text(json.dumps(result, separators=(",", ":")) + "\n")
    for key, c in result["continents"].items():
        print(key, f"{c['kmPerPixel']:.3f} km/px", "coasts", len(c["coasts"]), "islands", sum(x["kind"] == "island" for x in c["coasts"]),
              "inland", len(c["inlandWater"]), "rivers", sum(w["kind"] == "river" for w in c["inlandWater"]), "land km2", c["landAreaKm2"])
    print("bytes", Path(args.out).stat().st_size)

if __name__ == "__main__":
    main()
