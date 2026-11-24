// Small fetch wrapper: browser-like headers, timeout, retry, in-memory TTL cache.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const cache = new Map();

// Circuit breaker: when a host starts refusing us (403/429), stop calling it for a while
// and let callers fall back to other sources, instead of hammering it into a longer ban.
const blockedUntil = new Map();
const BLOCK_MS = 20 * 60e3;
const hostOf = (url) => new URL(url).host;
const isBlocked = (url) => (blockedUntil.get(hostOf(url)) || 0) > Date.now();

async function get(url, { json = false, ttlMs = 0, timeoutMs = 15000, retries = 1, headers = {} } = {}) {
  const key = url;
  const hit = cache.get(key);
  if (ttlMs && hit && Date.now() - hit.at < ttlMs) return hit.value;
  if (isBlocked(url)) throw new Error(`${hostOf(url)} is temporarily refusing requests`);

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': UA,
          Accept: json ? 'application/json, text/plain, */*' : '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          ...headers,
        },
      });
      if (res.status === 403 || res.status === 429) {
        blockedUntil.set(hostOf(url), Date.now() + BLOCK_MS);
        throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { blocked: true });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const value = json ? await res.json() : await res.text();
      if (ttlMs) cache.set(key, { at: Date.now(), value });
      return value;
    } catch (err) {
      lastErr = err;
      if (err.blocked) break;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

// Run async fn over items with a concurrency limit; failures resolve to null.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx], idx);
      } catch {
        out[idx] = null;
      }
    }
  });
  await Promise.all(workers);
  return out;
}

module.exports = { get, mapLimit, isBlocked };
