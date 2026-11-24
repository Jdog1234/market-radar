// POST /api/stripe-webhook — Stripe tells us when a subscription starts, renews or ends,
// and we set the user's plan. The signature check proves the call really came from Stripe.
const { env, admin, stripe } = require('../lib/shared');

async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

async function setPlan(customerId, sub) {
  const active = ['active', 'trialing', 'past_due'].includes(sub.status);
  await admin()
    .from('profiles')
    .update({
      plan: active ? 'pro' : 'free',
      stripe_subscription_id: sub.id,
      current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    })
    .eq('stripe_customer_id', customerId);
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  let event;
  try {
    event = stripe().webhooks.constructEvent(await rawBody(req), req.headers['stripe-signature'], env('STRIPE_WEBHOOK_SECRET'));
  } catch (err) {
    return res.status(400).send(`Webhook signature check failed: ${err.message}`);
  }
  try {
    const obj = event.data.object;
    if (event.type === 'checkout.session.completed' && obj.subscription) {
      await setPlan(obj.customer, await stripe().subscriptions.retrieve(obj.subscription));
    } else if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
      await setPlan(obj.customer, obj);
    }
    res.status(200).json({ received: true });
  } catch (err) {
    // A 500 makes Stripe retry later.
    res.status(500).send(`Webhook handling failed: ${err.message}`);
  }
}

module.exports = handler;
// Stripe signs the raw body, so it must not be parsed before the signature check.
module.exports.config = { api: { bodyParser: false } };
