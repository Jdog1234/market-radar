# Market Radar Cloud — accounts, subscriptions, waitlist

Small serverless backend for Market Radar. It runs on **Vercel** (free tier), stores users in **Supabase** (free tier) and takes payments with **Stripe**. You need all three accounts; the steps below take about 30–45 minutes. Do everything in **Stripe test mode** first; nothing charges real cards until you switch to live keys.

| Endpoint | Used by | What it does |
|---|---|---|
| `POST /api/waitlist` | Landing page | Saves an email to the Pro waitlist |
| `GET /api/me` | App | Returns the signed-in user's plan |
| `POST /api/checkout` | App | Opens Stripe Checkout for Pro (monthly or yearly) |
| `POST /api/portal` | App | Opens Stripe's billing page (change card, cancel) |
| `POST /api/stripe-webhook` | Stripe | Sets the user's plan when a subscription starts, renews or ends |

## 1. Supabase (users + database)
1. Create a project at supabase.com. Pick a strong database password and save it in your password manager.
2. **SQL Editor → New query**: paste all of `schema.sql`, then click **Run**.
3. **Authentication → Providers → Email**: leave it on. For the beta you can turn off "Confirm email" so sign-ups work right away.
4. **Project Settings → API**: copy the **Project URL**, the **anon public** key (safe to ship in the app) and the **service_role** key (secret: it only goes into Vercel, never into the app or GitHub).

## 2. Stripe (payments)
1. Create an account at stripe.com and stay in **Test mode**.
2. **Product catalog → Add product**: "Market Radar Pro" with two recurring prices, e.g. $19/month and $190/year. Copy both **price IDs** (`price_…`).
3. **Settings → Billing → Customer portal**: turn it on (lets users cancel or change their card).
4. **Developers → API keys**: copy the **secret key** (`sk_test_…`).

## 3. Vercel (hosting the API)
1. Sign in at vercel.com with your GitHub account. **Add New → Project**, import `Jdog1234/market-radar`, and set **Root Directory** to `cloud`.
2. Under **Environment Variables**, add:

| Name | Value |
|---|---|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key |
| `STRIPE_SECRET_KEY` | `sk_test_…` |
| `STRIPE_PRICE_PRO_MONTHLY` | monthly price ID |
| `STRIPE_PRICE_PRO_YEARLY` | yearly price ID |
| `STRIPE_WEBHOOK_SECRET` | from step 4 below (add it after) |
| `SITE_URL` | `https://jdog1234.github.io/market-radar` |
| `ALLOWED_ORIGINS` | `https://jdog1234.github.io,*` |

3. Deploy. Your API base is the project URL, e.g. `https://market-radar-cloud.vercel.app`.

## 4. Stripe webhook
**Developers → Webhooks → Add endpoint**: URL `https://<your-vercel-url>/api/stripe-webhook`, events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy the **signing secret** (`whsec_…`) into Vercel as `STRIPE_WEBHOOK_SECRET` and redeploy.

## 5. Connect the app and the site
- `market-radar/cloud.json`: set `supabaseUrl`, `supabaseAnonKey` (the **anon** key only) and `apiBase` (the Vercel URL). Keep `"paywall": false` until launch. Then bump the version and `npm run release`: every installed app gets accounts.
- `market-radar/docs/index.html`: set `WAITLIST_URL` to `https://<your-vercel-url>/api/waitlist` and push. The waitlist form appears on the landing page.

## 6. Test, then go live
1. In the app: create an account → Upgrade → pay with Stripe's test card `4242 4242 4242 4242` (any future date, any CVC) → the plan shows **PRO**.
2. Cancel from Manage billing → after the period ends the plan returns to FREE.
3. Going live: switch Stripe to live mode, create the same product and prices there, replace `STRIPE_SECRET_KEY`, the two price IDs and the webhook secret in Vercel with live ones, and only then set `"paywall": true` in `cloud.json`.

## Security notes
- Secrets live only in Vercel's environment variables. The app ships only the Supabase **anon** key, which row-level security limits to reading the user's own profile.
- Plans are only ever changed by the Stripe webhook, whose signature is verified.
- The paywall in the desktop app is a client-side check. That's fine for a beta, but once licensed data is served from this backend instead of fetched by each app, Pro data should be served only to Pro accounts.
