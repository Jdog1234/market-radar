// POST /api/checkout { interval: "month" | "year" } — starts a Stripe Checkout for Pro.
// Returns { url } for the app to open in the browser.
const { env, admin, stripe, cors, userFrom, readJson, fail } = require('../lib/shared');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return fail(res, 405, 'Use POST');
  const user = await userFrom(req);
  if (!user) return fail(res, 401, 'Sign in first');
  const { interval } = await readJson(req);
  const price = interval === 'year' ? env('STRIPE_PRICE_PRO_YEARLY') : env('STRIPE_PRICE_PRO_MONTHLY');

  // Reuse the user's Stripe customer so billing history stays in one place.
  const db = admin();
  const { data: profile } = await db.from('profiles').select('stripe_customer_id').eq('id', user.id).maybeSingle();
  let customer = profile?.stripe_customer_id;
  if (!customer) {
    customer = (await stripe().customers.create({ email: user.email, metadata: { user_id: user.id } })).id;
    await db.from('profiles').upsert({ id: user.id, email: user.email, stripe_customer_id: customer });
  }

  const site = env('SITE_URL');
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${site}/thanks.html`,
    cancel_url: `${site}/#download`,
    subscription_data: { metadata: { user_id: user.id } },
  });
  res.status(200).json({ url: session.url });
};
