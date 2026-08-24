"use strict";

const http = require("node:http");
const os = require("node:os");

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const environment = process.env.APP_ENV ?? "unknown";

function burnCpu(milliseconds) {
  const end = Date.now() + Math.max(0, Math.min(milliseconds, 2000));
  let value = 0;
  while (Date.now() < end) {
    value += Math.sqrt(Math.random() * 1000);
  }
  return value;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (url.pathname === "/work") {
    const duration = Number.parseInt(url.searchParams.get("ms") ?? "100", 10);
    burnCpu(Number.isFinite(duration) ? duration : 100);
  }

  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      message: "Hello from ECS on Amazon Linux 2023",
      environment,
      hostname: os.hostname(),
      path: url.pathname,
      timestamp: new Date().toISOString()
    })
  );
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Listening on port ${port}`);
});

