/**
 * Minimal Redis REST helper (Vercel KV or Upstash).
 * Env (either pair works):
 *   KV_REST_API_URL + KV_REST_API_TOKEN
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 */

const LIST_KEY = "work-ticker:visits";
const MAX_EVENTS = 500;

function redisCreds() {
  const url =
    process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    "";
  return url && token ? { url, token } : null;
}

async function redis(...command) {
  const creds = redisCreds();
  if (!creds) return { ok: false, reason: "no_kv" };
  const res = await fetch(creds.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      reason: "redis_error",
      error: data?.error || res.statusText,
    };
  }
  return { ok: true, result: data.result };
}

export function storageConfigured() {
  return !!redisCreds();
}

export async function appendVisit(event) {
  const payload = JSON.stringify(event);
  const push = await redis("LPUSH", LIST_KEY, payload);
  if (!push.ok) return push;
  await redis("LTRIM", LIST_KEY, 0, MAX_EVENTS - 1);
  return { ok: true };
}

export async function listVisits(limit = 200) {
  const n = Math.min(Math.max(1, Number(limit) || 200), MAX_EVENTS);
  const res = await redis("LRANGE", LIST_KEY, 0, n - 1);
  if (!res.ok) return res;
  const rows = [];
  for (const raw of res.result || []) {
    try {
      rows.push(typeof raw === "string" ? JSON.parse(raw) : raw);
    } catch {
      /* skip bad row */
    }
  }
  return { ok: true, visits: rows };
}

export function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) {
    return xf.split(",")[0].trim();
  }
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(",")[0].trim();
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.trim()) return real.trim();
  return req.socket?.remoteAddress || "";
}
