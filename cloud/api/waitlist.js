// POST /api/waitlist { email } — the landing page's "Join the Pro waitlist" form.
const { admin, cors, readJson, fail } = require('../lib/shared');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return fail(res, 405, 'Use POST');
  const { email } = await readJson(req);
  const clean = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean) || clean.length > 254) return fail(res, 400, 'Enter a valid email address');
  const { error } = await admin().from('waitlist').upsert({ email: clean, source: 'landing' }, { onConflict: 'email', ignoreDuplicates: true });
  if (error) return fail(res, 500, 'Could not save right now');
  res.status(200).json({ ok: true });
};
