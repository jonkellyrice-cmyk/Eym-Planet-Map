#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../scripts/system-data.mjs";
import { bodyOperationAssetPath, deriveBodyOperationTargets, validateBodyOperationsAsset, targetKey, bodyOperationsFeatureBudget, buildBodyOperationsRenderPlan } from "../scripts/body-operations.mjs";
import { generateBodyOperationAsset, serializeAsset } from "./generate-body-operations.mjs";
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const MAX_ASSET_BYTES=16*1024, MAX_CORPUS_BYTES=1024*1024;
const readJson=(p)=>JSON.parse(readFileSync(resolve(ROOT,p),"utf8"));
const rows=parseCsv(readFileSync(resolve(ROOT,"docs/system-orbital-distances.csv"),"utf8")), cart=readJson("data/planet-cartography/manifest.json"), manifest=readJson("data/body-operations/manifest.json");
const targets=deriveBodyOperationTargets(rows,cart), expected=new Set(targets.map(({row})=>targetKey(row.system,row.object))), actual=new Set(manifest.assets.map(a=>targetKey(a.system,a.body)));
if(rows.length!==12) throw new Error(`Canonical registry count changed: ${rows.length}`);
if(targets.length!==7) throw new Error(`Expected 7 eligible body-operation targets after canonical audit, found ${targets.length}`);
if(expected.size!==actual.size||[...expected].some(key=>!actual.has(key))) throw new Error("Manifest target coverage mismatch");
const cartKeys=new Set(cart.worlds.map(w=>targetKey(w.system,w.body)));
let corpusBytes=0;
for(const {row,operationalKind} of targets){
  if(cartKeys.has(targetKey(row.system,row.object))) throw new Error(`Inhabited cartography duplicated: ${row.system}/${row.object}`);
  const p=bodyOperationAssetPath(row.system,row.object), serialized=readFileSync(resolve(ROOT,p),"utf8"), bytes=Buffer.byteLength(serialized), asset=JSON.parse(serialized), errors=validateBodyOperationsAsset(asset); if(errors.length) throw new Error(`${p}: ${errors.join(", ")}`);
  corpusBytes+=bytes; if(bytes>MAX_ASSET_BYTES) throw new Error(`${p}: ${bytes} bytes exceeds ${MAX_ASSET_BYTES}-byte loading budget`);
  if(asset.canonicalType!==row.type) throw new Error(`${p}: canonical type mismatch`);
  if(asset.operationalKind!==operationalKind) throw new Error(`${p}: operational kind mismatch`);
  if(serialized!==serializeAsset(generateBodyOperationAsset(row))) throw new Error(`${p}: exact regeneration mismatch`);
  if(bodyOperationsFeatureBudget(asset,3,true)>64) throw new Error(`${p}: mobile feature budget exceeded`);
  for(const [zoom,mobile,maxFeatures,maxLabels] of [[1,true,18,18],[1.5,true,38,20],[3,true,64,20],[1,false,26,26],[1.5,false,60,32],[3,false,110,32]]){
    const plan=buildBodyOperationsRenderPlan(asset,zoom,mobile);
    if(plan.features.length>maxFeatures||plan.labels.length>maxLabels) throw new Error(`${p}: ${mobile?"mobile":"desktop"} ${plan.lod.id} render budget exceeded`);
  }
  if(asset.operationalKind==="giant"&&asset.features.some(f=>f.layer==="routes"||/surface route/i.test(f.operationalRole))) throw new Error(`${p}: gas giant has solid-surface route`);
}
if(corpusBytes>MAX_CORPUS_BYTES) throw new Error(`Operational corpus ${corpusBytes} bytes exceeds ${MAX_CORPUS_BYTES}-byte budget`);
console.log(`validated ${manifest.assets.length} body-operation assets across ${new Set(manifest.assets.map(a=>a.operationalKind)).size} families (${corpusBytes} bytes)`);
