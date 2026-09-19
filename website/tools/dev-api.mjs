/* Runs the Netlify function over a plain node server, backed by a folder of
   JSON files, so the API can be exercised end to end without deploying. Same
   handler, same routes -- only the storage differs, and that swap lives in
   lib/store.mjs. */
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "../../netlify/functions/api.mjs";

/* Serve the built site from the same origin as the API, the way Netlify will,
   so local testing exercises the real paths rather than a CORS special case. */
const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "_site");
const TYPES = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript",
                ".json":"application/json", ".jpg":"image/jpeg", ".jpeg":"image/jpeg",
                ".png":"image/png", ".svg":"image/svg+xml", ".webp":"image/webp",
                ".ico":"image/x-icon", ".txt":"text/plain", ".woff2":"font/woff2" };

async function staticFile(urlPath){
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if(rel.endsWith("/")) rel += "index.html";
  const file = path.join(SITE, rel);
  if(!file.startsWith(SITE)) return null;
  try{
    const body = await fs.readFile(file);
    return { body, type: TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" };
  }catch{ return null; }
}

const PORT = Number(process.env.PORT || 8799);

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const url  = "http://localhost:" + PORT + req.url;

  /* /api is the function; everything else is a file, same as in production */
  if(!req.url.startsWith("/api")){
    const f = await staticFile(req.url);
    if(f){ res.writeHead(200, { "content-type": f.type }); return res.end(f.body); }
    res.writeHead(404); return res.end("not found");
  }

  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : body
  });

  let out;
  try { out = await handler(request); }
  catch (e) { out = new Response(JSON.stringify({ error: String(e) }), { status: 500 }); }

  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(Buffer.from(await out.arrayBuffer()));
}).listen(PORT, () => console.log("dev api on http://localhost:" + PORT));
