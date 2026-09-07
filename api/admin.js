import { listVisits, storageConfigured } from "./_store.js";

function authorized(req) {
  const secret = process.env.ADMIN_SECRET || "";
  if (!secret) return false;
  const q = req.query?.secret;
  if (typeof q === "string" && q === secret) return true;
  const auth = req.headers.authorization || "";
  if (auth === `Bearer ${secret}`) return true;
  const header = req.headers["x-admin-secret"];
  if (typeof header === "string" && header === secret) return true;
  return false;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    res.json({ ok: false, error: "method_not_allowed" });
    return;
  }

  if (!process.env.ADMIN_SECRET) {
    res.statusCode = 503;
    res.json({
      ok: false,
      error: "admin_secret_missing",
      hint: "Set ADMIN_SECRET in Vercel project env",
    });
    return;
  }

  if (!authorized(req)) {
    res.statusCode = 401;
    res.json({ ok: false, error: "unauthorized" });
    return;
  }

  if (!storageConfigured()) {
    res.statusCode = 503;
    res.json({
      ok: false,
      error: "kv_missing",
      hint: "Set KV_REST_API_URL + KV_REST_API_TOKEN (or Upstash REST pair)",
    });
    return;
  }

  const limit = Number(req.query?.limit) || 200;
  const result = await listVisits(limit);
  if (!result.ok) {
    res.statusCode = 502;
    res.json({ ok: false, error: result.reason || "list_failed" });
    return;
  }

  res.statusCode = 200;
  res.json({ ok: true, visits: result.visits });
}
