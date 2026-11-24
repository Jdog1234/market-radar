// Pro subscriptions through Gumroad license keys. A subscriber pastes the key from their
// Gumroad receipt; the app checks it with Gumroad's public license API (no server or secret
// needed). The key is encrypted with the OS keychain before it touches disk.
const fs = require('fs');
const path = require('path');

let cfg = {};
try {
  cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cloud.json'), 'utf8'));
} catch {}

const VERIFY_URL = 'https://api.gumroad.com/v2/licenses/verify';
const RECHECK_MS = 12 * 3600e3; // re-verify twice a day
const OFFLINE_GRACE_MS = 3 * 864e5; // keep Pro for 3 days if Gumroad can't be reached

const enabled = () => !!(cfg.gumroadProductId && cfg.checkoutUrl);

// Network failures get a readable message instead of "fetch failed".
async function request(url, opts) {
  try {
    return await fetch(url, opts);
  } catch {
    throw new Error("Can't reach Gumroad to check your license. Check your internet connection and try again.");
  }
}

// Is this purchase an active subscription? Gumroad sets these timestamps to when the
// membership ends (they can be in the future while a cancelled period runs out).
function activePlan(p, now = Date.now()) {
  if (!p || p.refunded || p.chargebacked || (p.disputed && !p.dispute_won)) return false;
  for (const k of ['subscription_ended_at', 'subscription_cancelled_at', 'subscription_failed_at']) {
    if (p[k] && Date.parse(p[k]) <= now) return false;
  }
  return true;
}

class Account {
  constructor(file, safeStorage) {
    this.file = file;
    this.safe = safeStorage;
    this.lic = null; // { key, plan, email, subscriptionId, recurrence, endsAt, checkedAt }
    try {
      this.lic = JSON.parse(this.safe.decryptString(fs.readFileSync(file)));
    } catch {}
  }

  save() {
    if (!this.lic) return fs.rmSync(this.file, { force: true });
    if (!this.safe.isEncryptionAvailable()) return; // keep it in memory only
    fs.writeFileSync(this.file, this.safe.encryptString(JSON.stringify(this.lic)));
  }

  status() {
    const l = this.lic;
    return {
      enabled: enabled(),
      paywall: enabled() && !!cfg.paywall,
      signedIn: !!l, // a license key is saved
      email: l?.email || null,
      plan: l?.plan || 'free',
      periodEnd: l?.endsAt || null,
      recurrence: l?.recurrence || null,
      keyHint: l?.key ? `••••${l.key.slice(-4)}` : null,
    };
  }

  async verify(key) {
    const res = await request(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ product_id: cfg.gumroadProductId, license_key: key, increment_uses_count: 'false' }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.status === 404 || d.success === false) throw new Error("That license key wasn't found. Copy it exactly from your Gumroad receipt.");
    if (!res.ok) throw new Error(`Gumroad couldn't check the key right now (error ${res.status}). Try again in a minute.`);
    return d.purchase || {};
  }

  // Save a key the user pasted, after Gumroad confirms it.
  async activate(key) {
    if (!enabled()) throw new Error('Subscriptions are not switched on yet');
    key = String(key || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{8}(-[A-Z0-9]{8}){3}$/.test(key)) throw new Error('A license key looks like XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX');
    const p = await this.verify(key);
    this.lic = this.fromPurchase(key, p);
    this.save();
    if (this.lic.plan !== 'pro') throw new Error('This subscription has ended. Renew it on Gumroad, then click Check again.');
    return this.status();
  }

  fromPurchase(key, p) {
    const ends = ['subscription_ended_at', 'subscription_cancelled_at', 'subscription_failed_at'].map((k) => p[k]).find(Boolean);
    return { key, plan: activePlan(p) ? 'pro' : 'free', email: p.email || null, subscriptionId: p.subscription_id || null, recurrence: p.recurrence || null, endsAt: ends || null, checkedAt: Date.now() };
  }

  // Re-check the saved key. Offline: keep the last known plan for up to 3 days.
  async refreshPlan({ force = false } = {}) {
    if (!enabled() || !this.lic) return this.status();
    if (!force && Date.now() - (this.lic.checkedAt || 0) < RECHECK_MS) return this.status();
    try {
      this.lic = this.fromPurchase(this.lic.key, await this.verify(this.lic.key));
    } catch (e) {
      if (/wasn't found/.test(e.message)) this.lic.plan = 'free'; // key disabled or refunded
      else if (Date.now() - (this.lic.checkedAt || 0) > OFFLINE_GRACE_MS) this.lic.plan = 'free';
      if (force) {
        this.save();
        throw e;
      }
    }
    this.save();
    return this.status();
  }

  checkoutUrl(interval) {
    return `${cfg.checkoutUrl}${cfg.checkoutUrl.includes('?') ? '&' : '?'}wanted=true${interval === 'year' ? '&recurrence=yearly' : ''}`;
  }

  // Gumroad's page for changing the card or cancelling.
  portalUrl() {
    return this.lic?.subscriptionId ? `https://app.gumroad.com/subscriptions/${encodeURIComponent(this.lic.subscriptionId)}/manage` : 'https://app.gumroad.com/library';
  }

  signOut() {
    this.lic = null;
    this.save();
    return this.status();
  }
}

module.exports = { Account, accountsEnabled: enabled, activePlan };
