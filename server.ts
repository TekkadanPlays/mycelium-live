import path from "path";
import fs from "fs";

// Mycelium Live — Bun middleware server
// Serves the Inferno SPA, detects live streams via LLHLS probe, handles admission webhooks

const PORT = parseInt(process.env.PORT || "8080", 10);
const OME_HOST = process.env.OME_HOST || "127.0.0.1";
const OME_LLHLS_PORT = process.env.OME_LLHLS_PORT || "3333";
const STREAM_KEY = process.env.STREAM_KEY || "";

// Comma-separated list of hex pubkeys allowed to broadcast / access admin
const ALLOWED_PUBKEYS: string[] = (process.env.ALLOWED_PUBKEYS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const root = import.meta.dir;
const publicDir = path.join(root, "dist/public");
const indexHtml = path.join(publicDir, "index.html");
const dataDir = path.join(root, "data");
const profileCachePath = path.join(dataDir, "streamer-profile.json");

// Ensure data directory exists
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

interface CachedProfile {
  pubkey: string;
  name: string;
  displayName: string;
  picture: string;
  banner: string;
  nip05: string;
  lud16: string;
  updatedAt: number;
}

function loadCachedProfile(): CachedProfile | null {
  try {
    if (fs.existsSync(profileCachePath)) {
      return JSON.parse(fs.readFileSync(profileCachePath, "utf-8"));
    }
  } catch { /* ignore */ }
  return null;
}

function saveCachedProfile(profile: CachedProfile): void {
  fs.writeFileSync(profileCachePath, JSON.stringify(profile, null, 2));
}

// Default stream name used by OBS / RTMP ingest
const DEFAULT_STREAM = "stream";

// Probe the LLHLS manifest to check if a stream is live
async function checkStreamOnline(streamName: string): Promise<boolean> {
  try {
    const url = `http://${OME_HOST}:${OME_LLHLS_PORT}/app/${streamName}/llhls.m3u8`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

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
          if (streamName !== STREAM_KEY && streamName !== DEFAULT_STREAM) {
            return Response.json({ allowed: false, reason: "Invalid stream key" });
          }
        }

        return Response.json({ allowed: true });
      } catch {
        return Response.json({ allowed: true });
      }
    }

    // --- Allowed streamers list ---
    if (pathname === "/api/streamers") {
      return Response.json(
        { pubkeys: ALLOWED_PUBKEYS },
        { headers: { "Access-Control-Allow-Origin": "*" } },
      );
    }

    // --- Streamer profile cache ---
    if (pathname === "/api/profile" && req.method === "GET") {
      const cached = loadCachedProfile();
      return Response.json(
        cached || { pubkey: null },
        { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" } },
      );
    }

    if (pathname === "/api/profile" && req.method === "POST") {
      try {
        const body = await req.json() as { pubkey?: string; profile?: Record<string, string> };
        if (!body.pubkey || !body.profile) {
          return Response.json({ error: "Missing pubkey or profile" }, { status: 400 });
        }
        // Only allow known streamers to update the cache
        if (ALLOWED_PUBKEYS.length > 0 && !ALLOWED_PUBKEYS.includes(body.pubkey)) {
          return Response.json({ error: "Not an allowed streamer" }, { status: 403 });
        }
        const existing = loadCachedProfile();
        const profile: CachedProfile = {
          pubkey: body.pubkey,
          name: body.profile.name || existing?.name || "",
          displayName: body.profile.displayName || body.profile.display_name || existing?.displayName || "",
          picture: body.profile.picture || existing?.picture || "",
          banner: body.profile.banner || existing?.banner || "",
          nip05: body.profile.nip05 || existing?.nip05 || "",
          lud16: body.profile.lud16 || existing?.lud16 || "",
          updatedAt: Date.now(),
        };
        saveCachedProfile(profile);
        console.log(`[profile] Cached profile for ${body.pubkey.slice(0, 8)}...`);
        return Response.json({ ok: true }, { headers: { "Access-Control-Allow-Origin": "*" } });
      } catch {
        return Response.json({ error: "Invalid body" }, { status: 400 });
      }
    }

    // CORS preflight for /api/profile
    if (pathname === "/api/profile" && req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // --- Stream status (probe LLHLS manifest) ---
    // Note: /app/* paths are routed by HAProxy directly to OME port 3333
    if (pathname === "/api/status") {
      const online = await checkStreamOnline(DEFAULT_STREAM);
      return Response.json(
        { online, stream: online ? DEFAULT_STREAM : null },
        { headers: { "Access-Control-Allow-Origin": "*" } },
      );
    }

    // --- Static file serving ---
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
console.log(`   OME LLHLS probe: http://${OME_HOST}:${OME_LLHLS_PORT}`);
console.log(`   Static files: ${publicDir}`);
