// The Eym map server as one Vercel function: every /api/* request (vercel.json rewrites them here).
// The page itself (webapp/public) is served as static files. Rendered maps are cached in /tmp; an
// instance that never saw a map rebuilds it from its id (deterministic), so nothing is lost when it is cold.
import { createMapHandler } from "../webapp/server.mjs";

export default createMapHandler();
