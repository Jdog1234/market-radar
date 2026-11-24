// GET /api/me — the signed-in user's plan, used by the app to unlock Pro features.
const { admin, cors, userFrom, fail } = require('../lib/shared');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const user = await userFrom(req);
  if (!user) return fail(res, 401, 'Sign in first');
  const { data } = await admin().from('profiles').select('plan, current_period_end').eq('id', user.id).maybeSingle();
  const periodEnd = data?.current_period_end ? Date.parse(data.current_period_end) : null;
  // A Pro plan whose paid period has lapsed (webhook missed) counts as free.
  const pro = data?.plan === 'pro' && (!periodEnd || periodEnd > Date.now() - 3 * 864e5);
  res.status(200).json({ email: user.email, plan: pro ? 'pro' : 'free', periodEnd });
};
