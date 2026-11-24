// User accounts (Supabase Auth) and plan status (the Market Radar backend in cloud/).
// The session is encrypted with the OS keychain before it touches disk.
const fs = require('fs');
const path = require('path');

let cfg = {};
try {
  cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cloud.json'), 'utf8'));
} catch {}

// Network failures get a readable message instead of "fetch failed".
async function request(url, opts) {
  try {
    return await fetch(url, opts);
  } catch {
    throw new Error("Can't reach the account server. Check your internet connection and try again.");
  }
}

const enabled = () => !!(cfg.supabaseUrl && cfg.supabaseAnonKey && cfg.apiBase);

class Account {
  constructor(file, safeStorage) {
    this.file = file;
    this.safe = safeStorage;
    this.session = null;
    this.me = null; // { email, plan, periodEnd }
    try {
      const enc = fs.readFileSync(file);
      this.session = JSON.parse(this.safe.decryptString(enc));
      this.me = this.session.me || null;
    } catch {}
  }

  save() {
    if (!this.session) return fs.rmSync(this.file, { force: true });
    if (!this.safe.isEncryptionAvailable()) return; // keep the session in memory only
    fs.writeFileSync(this.file, this.safe.encryptString(JSON.stringify({ ...this.session, me: this.me })));
  }

  status() {
    return {
      enabled: enabled(),
      paywall: enabled() && !!cfg.paywall,
      signedIn: !!this.session,
      email: this.me?.email || this.session?.user?.email || null,
      plan: this.me?.plan || 'free',
      periodEnd: this.me?.periodEnd || null,
    };
  }

  async auth(kind, email, password) {
    if (!enabled()) throw new Error('Accounts are not switched on yet');
    const url = kind === 'signup' ? `${cfg.supabaseUrl}/auth/v1/signup` : `${cfg.supabaseUrl}/auth/v1/token?grant_type=password`;
    const res = await request(url, {
      method: 'POST',
      headers: { apikey: cfg.supabaseAnonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error_description || d.msg || d.message || 'Sign-in failed');
    if (!d.access_token) return { needsConfirm: true }; // email confirmation is on
    this.session = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000, user: { email: d.user?.email } };
    await this.refreshPlan();
    return this.status();
  }

  async token() {
    if (!this.session) throw new Error('Sign in first');
    if (Date.now() > this.session.expires_at - 60e3) {
      const res = await request(`${cfg.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: cfg.supabaseAnonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: this.session.refresh_token }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.access_token) {
        this.signOut();
        throw new Error('Your session expired. Please sign in again.');
      }
      Object.assign(this.session, { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 });
      this.save();
    }
    return this.session.access_token;
  }

  async api(pathname, body) {
    const res = await request(`${cfg.apiBase}${pathname}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || `Request failed (${res.status})`);
    return d;
  }

  // Plan check. Offline: keep the last known plan for up to 3 days.
  async refreshPlan() {
    if (!enabled() || !this.session) return this.status();
    try {
      this.me = { ...(await this.api('/api/me')), checkedAt: Date.now() };
    } catch (e) {
      if (!this.me?.checkedAt || Date.now() - this.me.checkedAt > 3 * 864e5) this.me = { ...(this.me || {}), plan: 'free' };
      if (/sign in/i.test(e.message)) throw e;
    }
    this.save();
    return this.status();
  }

  checkoutUrl(interval) {
    return this.api('/api/checkout', { interval }).then((d) => d.url);
  }
  portalUrl() {
    return this.api('/api/portal', {}).then((d) => d.url);
  }

  signOut() {
    this.session = null;
    this.me = null;
    this.save();
    return this.status();
  }
}

module.exports = { Account, accountsEnabled: enabled };
