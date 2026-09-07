import { appendVisit, clientIp, storageConfigured } from "./_store.js";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST, OPTIONS");
    res.json({ ok: false, error: "method_not_allowed" });
    return;
  }

  let body = req.body;
  if (Buffer.isBuffer(body)) {
    try {
      body = JSON.parse(body.toString("utf8") || "{}");
    } catch {
      body = {};
    }
  } else if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      body = {};
    }
  }
  if (!body || typeof body !== "object") body = {};

  const kind = body.kind === "pageview" ? "pageview" : "settings";

  // Only persist salary fields on settings saves; pageview is IP/UA/time only.
  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    kind,
    ip: clientIp(req),
    ua: String(req.headers["user-agent"] || "").slice(0, 512),
  };

  if (kind === "settings") {
    event.taxMode = body.taxMode === "pre" ? "pre" : "post";
    event.basis = body.basis === "annual" ? "annual" : "monthly";
    event.annual = Number(body.annual) || 0;
    event.monthly = Number(body.monthly) || 0;
    event.expatOn = !!body.expatOn;
    event.expatUsd = Number(body.expatUsd) || 0;
    event.wishPrice =
      body.wishPrice == null || body.wishPrice === ""
        ? null
        : Number(body.wishPrice) || 0;
    event.workStart = String(body.workStart || "").slice(0, 8);
    event.workEnd = String(body.workEnd || "").slice(0, 8);
    event.workDaysYear = Number(body.workDaysYear) || 0;

    // Don't log empty salary saves as "settings" noise — treat as soft skip.
    if (event.annual <= 0 && event.monthly <= 0) {
      res.statusCode = 204;
      res.end();
      return;
    }
  }

  if (!storageConfigured()) {
    res.statusCode = 202;
    res.json({
      ok: true,
      stored: false,
      warning: "KV not configured — set KV_REST_API_* or UPSTASH_REDIS_REST_*",
    });
    return;
  }

  const result = await appendVisit(event);
  if (!result.ok) {
    res.statusCode = 502;
    res.json({ ok: false, error: result.reason || "store_failed" });
    return;
  }

  res.statusCode = 204;
  res.end();
}
