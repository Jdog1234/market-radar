// Shared helpers for the Vercel functions. All secrets come from environment variables
// set in the Vercel dashboard (see README.md); nothing secret lives in this repo.
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing environment variable ${k}`);
  return v;
};

// Server-side Supabase client (service role: bypasses row-level security).
const admin = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const stripe = () => new Stripe(env('STRIPE_SECRET_KEY'));

// The app and the landing page call these endpoints from other origins.
function cors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0]);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

// The signed-in user, from the Supabase access token the app sends as "Bearer <token>".
async function userFrom(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  return error ? null : data.user;
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
}

const fail = (res, status, message) => res.status(status).json({ error: message });

module.exports = { env, admin, stripe, cors, userFrom, readJson, fail };
