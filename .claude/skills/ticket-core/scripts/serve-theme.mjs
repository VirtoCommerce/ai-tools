// Serves a vc-frontend build (the theme zip's default/ folder) and forwards the platform's paths to the backend,
// the way the cloud storefront does. No dependencies.
//   node serve-theme.mjs --root <dir> --port <port> --backend http://localhost:<port>
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  options[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
}
if (!options.root || !options.port || !options.backend) {
  console.error("Usage: node serve-theme.mjs --root <dir> --port <port> --backend http://localhost:<port>");
  process.exit(2);
}
const root = path.resolve(options.root);
const backend = new URL(options.backend);

// vc-frontend's vite.config.ts proxy list plus the cloud storefront's routes (vc-deploy-dev infra/environments.yml)
const proxied = [
  /^\/api\//,
  /^\/graphql/,
  /^\/ucp/,
  /^\/connect\//,
  /^\/revoke\/token/,
  /^\/\.well-known\//,
  /^\/cms-content\//,
  /^\/modules\//,
  /^\/externalsignin/,
  /^\/signin-oidc/,
  /^\/signin-google/,
  /^\/xapi/,
  /^\/files(\/|$)/,
];

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
};

function isProxied(url) {
  return proxied.some((pattern) => pattern.test(url));
}

function serveFile(request, response) {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  let file = path.join(root, pathname);
  const relative = path.relative(root, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    response.writeHead(403).end();
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, "index.html");
  }
  if (!fs.existsSync(file)) {
    // A page navigation is a storefront route, served by index.html; anything else that is missing is a 404
    if (!(request.headers.accept ?? "").includes("text/html")) {
      response.writeHead(404).end();
      return;
    }
    file = path.join(root, "index.html");
  }
  response.writeHead(200, {
    "Content-Type": types[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  fs.createReadStream(file).pipe(response);
}

// Like the dev server's proxy (changeOrigin): the backend sees its own host
function proxy(request, response) {
  const upstream = http.request(
    {
      hostname: backend.hostname,
      port: backend.port,
      method: request.method,
      path: request.url,
      headers: { ...request.headers, host: backend.host },
    },
    (answer) => {
      response.writeHead(answer.statusCode, answer.headers);
      answer.pipe(response);
    },
  );
  upstream.on("error", (error) => {
    console.error(`${request.method} ${request.url}: ${error.message}`);
    if (!response.headersSent) {
      response.writeHead(502, { "Content-Type": "text/plain" });
    }
    response.end(`The backend ${backend.origin} is not reachable: ${error.message}`);
  });
  request.pipe(upstream);
}

// WebSocket upgrades (GraphQL subscriptions): replay the handshake to the backend, then pass bytes both ways
function proxyUpgrade(request, socket, head) {
  if (!isProxied(request.url)) {
    socket.destroy();
    return;
  }
  const upstream = net.connect(Number(backend.port) || 80, backend.hostname, () => {
    const lines = [`${request.method} ${request.url} HTTP/${request.httpVersion}`];
    for (let i = 0; i < request.rawHeaders.length; i += 2) {
      const name = request.rawHeaders[i];
      lines.push(`${name}: ${name.toLowerCase() === "host" ? backend.host : request.rawHeaders[i + 1]}`);
    }
    upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (head.length) {
      upstream.write(head);
    }
    upstream.pipe(socket).pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
}

const server = http.createServer((request, response) =>
  isProxied(request.url) ? proxy(request, response) : serveFile(request, response),
);
server.on("upgrade", proxyUpgrade);
server.listen(Number(options.port), "localhost", () => {
  console.log(`Storefront from ${root} on http://localhost:${options.port}, backend ${backend.origin}`);
});
