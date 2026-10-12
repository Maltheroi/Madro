// Minimal API gateway for the Docker-free local stack: forwards
// /auth/v1/* to Supabase Auth (GoTrue), mirroring the hosted Supabase URL layout.
import http from "node:http";

const port = Number(process.env.GATEWAY_PORT ?? 54321);
const authPort = Number(process.env.AUTH_PORT ?? 9999);

http
  .createServer((req, res) => {
    if (!req.url?.startsWith("/auth/v1")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Only /auth/v1 is available in the local stack" }));
      return;
    }
    const upstream = http.request(
      {
        host: "127.0.0.1",
        port: authPort,
        path: req.url.slice("/auth/v1".length) || "/",
        method: req.method,
        headers: req.headers,
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", (e) => {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    });
    req.pipe(upstream);
  })
  .listen(port, "127.0.0.1", () => console.log(`gateway listening on http://127.0.0.1:${port}`));
