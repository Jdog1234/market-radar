// POST /api/portal — Stripe's billing page (change card, cancel, invoices). Returns { url }.
const { env, admin, stripe, cors, userFrom, fail } = require('../lib/shared');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return fail(res, 405, 'Use POST');
  const user = await userFrom(req);
  if (!user) return fail(res, 401, 'Sign in first');
  const { data } = await admin().from('profiles').select('stripe_customer_id').eq('id', user.id).maybeSingle();
  if (!data?.stripe_customer_id) return fail(res, 400, 'No subscription yet');
  const session = await stripe().billingPortal.sessions.create({ customer: data.stripe_customer_id, return_url: env('SITE_URL') });
  res.status(200).json({ url: session.url });
};
