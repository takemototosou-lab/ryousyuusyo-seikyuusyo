import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || "/", `http://${request.headers.host}`).pathname);
  const file = pathname === "/" ? "index.html" : pathname.slice(1);
  const fullPath = normalize(join(root, file));

  if (!fullPath.startsWith(root)) {
    response.writeHead(403);
    response.end("forbidden");
    return;
  }

  try {
    const body = await readFile(fullPath);
    response.writeHead(200, { "content-type": types[extname(fullPath)] || "text/plain; charset=utf-8" });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${port}`);
});
