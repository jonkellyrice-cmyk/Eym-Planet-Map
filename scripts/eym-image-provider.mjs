// Painting a reference map with an image model. One adapter for now: OpenAI's image-edit endpoint
// (POST {baseUrl}/images/edits, multipart). Any server that speaks the same API — an open-weight model
// on Dave's GPU or the Glassbox inference service behind an OpenAI-compatible gateway — works by
// changing the base URL. The API key is passed in by the caller from a client-scope setting (the GM's
// browser only) and is sent to the configured base URL and nowhere else; it is never logged.

export const DEFAULT_IMAGE_BASE_URL = "https://api.openai.com/v1";

/** Models offered in the settings ("custom" takes a typed name). Sizes are what each accepts natively. */
export const IMAGE_MODELS = Object.freeze([
  Object.freeze({ id: "gpt-image-1.5", label: "OpenAI gpt-image-1.5", sizes: ["1536x1024", "1024x1536", "1024x1024"], inputFidelity: true }),
  Object.freeze({ id: "gpt-image-1", label: "OpenAI gpt-image-1", sizes: ["1536x1024", "1024x1536", "1024x1024"], inputFidelity: true }),
  Object.freeze({ id: "gpt-image-1-mini", label: "OpenAI gpt-image-1-mini (cheaper)", sizes: ["1536x1024", "1024x1536", "1024x1024"], inputFidelity: false }),
  Object.freeze({ id: "gpt-image-2", label: "OpenAI gpt-image-2", sizes: ["1536x1024", "1024x1536", "1024x1024"], inputFidelity: false }),
]);
export const DEFAULT_IMAGE_MODEL = "gpt-image-1.5";
export const IMAGE_QUALITIES = Object.freeze({ low: "Low (quick drafts)", medium: "Medium", high: "High (final maps)" });
export const DEFAULT_IMAGE_QUALITY = "high";

const modelInfo = (model) => IMAGE_MODELS.find((m) => m.id === model) ?? { id: model, sizes: ["1536x1024", "1024x1536", "1024x1024"], inputFidelity: false };

/** The model size closest in shape to the map; the painted image is scaled to the map's exact size afterwards. */
export function nearestModelSize(model, width, height) {
  const want = Math.log(width / height);
  return modelInfo(model).sizes.map((s) => { const [w, h] = s.split("x").map(Number); return { s, d: Math.abs(Math.log(w / h) - want) }; }).sort((a, b) => a.d - b.d)[0].s;
}

/** Only https, or plain http to this machine or a private address (a local or VPC model server). */
export function checkBaseUrl(text) {
  let url; try { url = new URL(String(text ?? "").trim() || DEFAULT_IMAGE_BASE_URL); } catch { return { ok: false, reason: "not a URL" }; }
  const host = url.hostname, local = host === "localhost" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith(".local");
  if (url.protocol === "https:" || (url.protocol === "http:" && local)) return { ok: true, url: url.href.replace(/\/+$/, "") };
  return { ok: false, reason: "use https (plain http only to a local or private address)" };
}

/** The request for one painting: endpoint and multipart fields (no network, no key). */
export function editRequest({ baseUrl = DEFAULT_IMAGE_BASE_URL, model = DEFAULT_IMAGE_MODEL, quality = DEFAULT_IMAGE_QUALITY, prompt, images, width, height }) {
  const base = checkBaseUrl(baseUrl); if (!base.ok) throw new Error(`Image server address: ${base.reason}`);
  if (!images?.length) throw new Error("No reference image to paint over");
  const fields = [["model", model], ["prompt", prompt], ["size", nearestModelSize(model, width, height)], ["quality", quality], ["n", "1"], ["output_format", "png"]];
  if (modelInfo(model).inputFidelity) fields.push(["input_fidelity", "high"]);
  return { url: `${base.url}/images/edits`, fields, images: images.slice(0, 16) };
}

/** A readable reason for a failed request (never echoes the key). */
export function explainFailure(status, body) {
  const detail = body?.error?.message ? `: ${String(body.error.message).slice(0, 300)}` : "";
  if (status === 401) return "The image server rejected the API key (check it in Image generator settings)";
  if (status === 403) return `The image server refused this request${detail}`;
  if (status === 429) return `The image server is rate-limiting or the account is out of credit${detail}`;
  if (status === 400) return `The image server could not use this request${detail}`;
  return `The image server answered ${status}${detail}`;
}

/** Paint: send the reference image(s) and prompt; resolve to the painted image as a PNG Blob. */
export async function paintMap({ apiKey, baseUrl, model, quality, prompt, images, width, height }, fetchImpl = globalThis.fetch) {
  if (!apiKey) throw new Error("No image API key is set in this browser (Image generator settings)");
  const request = editRequest({ baseUrl, model, quality, prompt, images, width, height }), form = new FormData();
  for (const [key, value] of request.fields) form.append(key, value);
  for (const image of request.images) form.append("image[]", image.blob, image.name);
  let response;
  try { response = await fetchImpl(request.url, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form }); }
  catch (error) { throw new Error(`Could not reach the image server (${error?.message ?? "network error"})`); }
  let body = null; try { body = await response.json(); } catch { /* not JSON */ }
  if (!response.ok) throw new Error(explainFailure(response.status, body));
  const item = body?.data?.[0];
  if (item?.b64_json) { const bytes = Uint8Array.from(atob(item.b64_json), (c) => c.charCodeAt(0)); return { blob: new Blob([bytes], { type: "image/png" }), size: request.fields.find(([k]) => k === "size")[1], revisedPrompt: item.revised_prompt ?? null, usage: body.usage ?? null }; }
  if (item?.url) { const fetched = await fetchImpl(item.url); if (!fetched.ok) throw new Error(`Could not download the painted image (${fetched.status})`); return { blob: await fetched.blob(), size: request.fields.find(([k]) => k === "size")[1], revisedPrompt: item.revised_prompt ?? null, usage: body.usage ?? null }; }
  throw new Error("The image server returned no image");
}
