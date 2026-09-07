import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, normalize, resolve, sep } from "node:path";
import { execFile } from "node:child_process";

const root = resolve(process.cwd());
const argumentsList = process.argv.slice(2);
const requestedPort = Number(argumentsList.find((argument) => !argument.startsWith("-")));
const port = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : 4173;
const shouldOpenBrowser = !argumentsList.includes("--no-open");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}

function runOpenCommand(command, argumentsForCommand, options = {}) {
  // A preview server remains useful even if a machine has no browser association.
  execFile(command, argumentsForCommand, options, () => {});
}

function openBrowser(url) {
  if (process.platform === "win32") {
    runOpenCommand("cmd", ["/c", "start", "", url], { windowsHide: true });
    return;
  }

  if (process.platform === "darwin") {
    runOpenCommand("open", [url]);
    return;
  }

  runOpenCommand("xdg-open", [url]);
}

const server = createServer((request, response) => {
  const pathname = decodeURIComponent((request.url || "/").split("?")[0]);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^[/\\]+/, "");
  const filePath = resolve(root, normalize(relativePath));

  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    sendText(response, 404, "Not found");
    return;
  }

  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  const url = `http://localhost:${port}`;
  console.log(`Makullveny preview: ${url}`);
  console.log("Press Ctrl+C to stop the server.");

  if (shouldOpenBrowser) {
    openBrowser(url);
  }
});
