import { createClient } from '@supabase/supabase-js';
import { verifyTelegramInitData } from './_lib/telegram.js';

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

async function getPlayer(req, res, supabase) {
  const user = verifyTelegramInitData(req.headers['x-telegram-init-data'], process.env.TELEGRAM_BOT_TOKEN);
  if (!user?.id) {
    fail(res, 401, 'Telegram authentication failed. Reopen the Mini App.');
    return null;
  }

  let { data: profile, error } = await supabase
    .from('profiles')
    .select('id,telegram_id,username,display_name')
    .eq('telegram_id', user.id)
    .maybeSingle();
  if (error) {
    fail(res, 500, 'Profile lookup failed');
    return null;
  }
  if (!profile) {
    const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Игрок';
    const created = await supabase.from('profiles').insert({
      telegram_id: user.id,
      username: user.username || null,
      display_name: displayName
    }).select('id,telegram_id,username,display_name').single();
    if (created.error) {
      const retry = await supabase.from('profiles').select('id,telegram_id,username,display_name').eq('telegram_id', user.id).maybeSingle();
      if (retry.error || !retry.data) {
        fail(res, 500, 'Could not create player profile');
        return null;
      }
      profile = retry.data;
    } else profile = created.data;
  }

  const { error: balanceError } = await supabase.from('balances').upsert(
    { user_id: profile.id, balance: 0 },
    { onConflict: 'user_id', ignoreDuplicates: true }
  );
  if (balanceError) {
    fail(res, 500, 'Balance initialization failed');
    return null;
  }
  return { user, profile };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (!url || !key || !process.env.TELEGRAM_BOT_TOKEN) return fail(res, 500, 'Server configuration missing');
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const player = await getPlayer(req, res, supabase);
  if (!player) return;

  const { profile } = player;
  if (req.method === 'GET') {
    const [balanceQ, stateQ, catalogQ, inventoryQ, giftQ, loanQ] = await Promise.all([
      supabase.from('balances').select('balance').eq('user_id', profile.id).single(),
      supabase.from('luna_state').select('*').eq('user_id', profile.id).maybeSingle(),
      supabase.from('luna_catalog').select('item_id,category,title,description,price,icon,effect,sort_order').eq('active', true).order('sort_order'),
      supabase.from('luna_inventory').select('item_id,purchased_at').eq('user_id', profile.id),
      supabase.from('luna_daily_gifts').select('amount,claimed_at').eq('user_id', profile.id).eq('reward_date', new Date().toISOString().slice(0,10)).maybeSingle(),
      supabase.from('luna_loans').select('id,principal,total_due,due_at,created_at').eq('user_id', profile.id).is('repaid_at', null).maybeSingle()
    ]);
    const queryError = [balanceQ,stateQ,catalogQ,inventoryQ,giftQ,loanQ].find(q => q.error);
    if (queryError) return fail(res, 500, 'Could not load Luna data');

    let state = stateQ.data;
    if (!state) {
      const created = await supabase.from('luna_state').insert({ user_id: profile.id }).select('*').single();
      if (created.error) return fail(res, 500, 'Could not initialize Luna state');
      state = created.data;
    }
    let loan = loanQ.data;
    if (loan) {
      const lateDays = Math.max(0, Math.ceil((Date.now() - new Date(loan.due_at).getTime()) / 86400000));
      loan = { ...loan, lateDays, currentDue: Math.ceil(Number(loan.total_due) * Math.pow(1.1, lateDays)) };
    }
    return res.status(200).json({
      profile,
      balance: balanceQ.data.balance,
      state,
      catalog: catalogQ.data || [],
      inventory: inventoryQ.data || [],
      dailyGift: giftQ.data || null,
      loan
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return fail(res, 405, 'Method not allowed');
  }

  const body = req.body || {};
  let result;
  if (body.action === 'gift') {
    result = await supabase.rpc('luna_claim_daily_gift', { p_user_id: profile.id });
  } else if (body.action === 'purchase' && typeof body.itemId === 'string') {
    result = await supabase.rpc('luna_purchase_item', { p_user_id: profile.id, p_item_id: body.itemId });
  } else if (body.action === 'loan') {
    result = await supabase.rpc('luna_take_loan', { p_user_id: profile.id, p_amount: Number(body.amount) });
  } else if (body.action === 'repay') {
    result = await supabase.rpc('luna_repay_loan', { p_user_id: profile.id });
  } else if (body.action === 'care' && body.state && typeof body.state === 'object') {
    const fields = ['hunger','thirst','mood','energy','comfort'];
    const update = { user_id: profile.id, updated_at: new Date().toISOString() };
    for (const field of fields) {
      const value = Number(body.state[field]);
      if (!Number.isInteger(value) || value < 0 || value > 100) return fail(res, 400, 'Invalid care value');
      update[field] = value;
    }
    const saved = await supabase.from('luna_state').upsert(update, { onConflict: 'user_id' }).select('*').single();
    if (saved.error) return fail(res, 500, 'Could not save Luna state');
    return res.status(200).json({ ok: true, state: saved.data });
  } else {
    return fail(res, 400, 'Unknown Luna action');
  }

  if (result.error) {
    const message = String(result.error.message || 'Action failed');
    const status = /Insufficient balance|already|active loan|No active loan|between 1000/i.test(message) ? 400 : 500;
    return fail(res, status, message);
  }
  return res.status(200).json(result.data);
}
