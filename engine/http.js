// Small fetch wrapper: browser-like headers, timeout, retry, in-memory TTL cache.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const cache = new Map();

async function get(url, { json = false, ttlMs = 0, timeoutMs = 15000, retries = 1, headers = {} } = {}) {
  const key = url;
  const hit = cache.get(key);
  if (ttlMs && hit && Date.now() - hit.at < ttlMs) return hit.value;

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
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const value = json ? await res.json() : await res.text();
      if (ttlMs) cache.set(key, { at: Date.now(), value });
      return value;
    } catch (err) {
      lastErr = err;
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

module.exports = { get, mapLimit };
