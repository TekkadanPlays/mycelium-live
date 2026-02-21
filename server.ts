import path from "path";
import fs from "fs";

// Mycelium Live — Bun middleware server
// Serves the Inferno SPA, proxies OME API, handles admission webhooks

const PORT = parseInt(process.env.PORT || "8080", 10);
const OME_API_HOST = process.env.OME_API_HOST || "localhost";
const OME_API_PORT = process.env.OME_API_PORT || "8081";
const OME_API_TOKEN = process.env.OME_API_ACCESS_TOKEN || "mycelium-ome-token";
const STREAM_KEY = process.env.STREAM_KEY || "";

const root = import.meta.dir;
const publicDir = path.join(root, "dist/public");
const indexHtml = path.join(publicDir, "index.html");

// OME API uses Basic auth where the base64-decoded value must match <AccessToken>
const omeAuthHeader = "Basic " + btoa(OME_API_TOKEN);

function omeApiUrl(path: string): string {
  return `http://${OME_API_HOST}:${OME_API_PORT}${path}`;
}

async function proxyToOme(req: Request, apiPath: string): Promise<Response> {
  const url = omeApiUrl(apiPath);
  const headers: Record<string, string> = {
    Authorization: omeAuthHeader,
    "Content-Type": "application/json",
  };

  try {
    const omeRes = await fetch(url, {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined,
    });

    return new Response(omeRes.body, {
      status: omeRes.status,
      headers: {
        "Content-Type": omeRes.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return Response.json({ error: "OME API unreachable", detail: String(err) }, { status: 502 });
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // --- OME API proxy ---
    if (pathname.startsWith("/api/ome/")) {
      const apiPath = pathname.replace("/api/ome", "");
      return proxyToOme(req, apiPath);
    }

    // --- Admission webhook (OME calls this) ---
    if (pathname === "/api/admission" && req.method === "POST") {
      try {
        const body = await req.json();
        console.log("[admission]", JSON.stringify(body));

        // If a stream key is configured, validate it
        if (STREAM_KEY && body.request?.direction === "incoming") {
          const requestUrl = body.request?.url || "";
          // OME sends the stream key as the stream name in the URL
          // e.g. rtmp://host/app/STREAM_KEY
          const streamName = requestUrl.split("/").pop() || "";
          if (streamName !== STREAM_KEY && streamName !== "stream") {
            return Response.json({ allowed: false, reason: "Invalid stream key" });
          }
        }

        return Response.json({ allowed: true });
      } catch {
        return Response.json({ allowed: true });
      }
    }

    // --- Stream status shortcut ---
    if (pathname === "/api/status") {
      try {
        const res = await fetch(omeApiUrl("/v1/vhosts/default/apps/app/streams"), {
          headers: { Authorization: omeAuthHeader },
        });
        if (!res.ok) return Response.json({ online: false, streams: [] });
        const data = await res.json();
        const streams = data.response || [];
        return Response.json({ online: streams.length > 0, streams });
      } catch {
        return Response.json({ online: false, streams: [] });
      }
    }

    // --- Static file serving ---
    // Try to serve the file directly
    const filePath = path.join(publicDir, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return new Response(Bun.file(filePath));
    }

    // SPA fallback — serve index.html for all non-file routes
    if (fs.existsSync(indexHtml)) {
      return new Response(Bun.file(indexHtml), {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("Not found — run `bun run build` first", { status: 404 });
  },
});

console.log(`🍄 Mycelium Live server running on http://localhost:${server.port}`);
console.log(`   OME API proxy: http://${OME_API_HOST}:${OME_API_PORT}`);
console.log(`   Static files: ${publicDir}`);
