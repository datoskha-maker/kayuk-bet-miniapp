import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

function verifyTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const authDate = Number(params.get('auth_date'));
  if (!authDate || Math.abs(Date.now() / 1000 - authDate) > 86400) return null;

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const a = Buffer.from(calculatedHash, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try { return JSON.parse(params.get('user') || 'null'); } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { TELEGRAM_BOT_TOKEN: botToken, SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: serviceKey } = process.env;
  if (!botToken || !supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration missing' });
  }

  const user = verifyTelegramInitData(req.headers['x-telegram-init-data'], botToken);
  if (!user?.id) return res.status(401).json({ error: 'Telegram authentication failed. Reopen the Mini App.' });

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  let { data: profile, error } = await supabase
    .from('profiles')
    .select('id, telegram_id, username, display_name')
    .eq('telegram_id', user.id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'Database profile query failed' });

  if (!profile) {
    const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Игрок';
    const inserted = await supabase.from('profiles').insert({
      telegram_id: user.id,
      username: user.username || null,
      display_name: displayName
    }).select('id, telegram_id, username, display_name').single();

    if (inserted.error) {
      // A parallel first request may have created the profile already.
      const retry = await supabase.from('profiles')
        .select('id, telegram_id, username, display_name')
        .eq('telegram_id', user.id).maybeSingle();
      if (retry.error || !retry.data) return res.status(500).json({ error: 'Could not create player profile' });
      profile = retry.data;
    } else {
      profile = inserted.data;
    }
  }

  let { data: balanceRow, error: balanceError } = await supabase
    .from('balances').select('balance').eq('user_id', profile.id).maybeSingle();
  if (balanceError) return res.status(500).json({ error: 'Balance query failed' });

  if (!balanceRow) {
    const insertedBalance = await supabase.from('balances')
      .insert({ user_id: profile.id, balance: 100000 })
      .select('balance').single();
    if (insertedBalance.error) {
      const retry = await supabase.from('balances').select('balance').eq('user_id', profile.id).maybeSingle();
      if (retry.error || !retry.data) return res.status(500).json({ error: 'Could not initialize player balance' });
      balanceRow = retry.data;
    } else {
      balanceRow = insertedBalance.data;
      await supabase.from('transactions').insert({
        user_id: profile.id, amount: 100000, type: 'bonus', note: 'Стартовый виртуальный баланс'
      });
    }
  }

  const { data: bets, error: betsError } = await supabase
    .from('bets')
    .select('id, event_title, selection, stake, odds, status, potential_payout, created_at, settled_at')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (betsError) return res.status(500).json({ error: 'Bet history query failed' });

  const { data: balances, error: leadersError } = await supabase
    .from('balances').select('user_id, balance').order('balance', { ascending: false }).limit(20);
  if (leadersError) return res.status(500).json({ error: 'Leaderboard query failed' });

  const userIds = (balances || []).map(row => row.user_id);
  let leaderProfiles = [];
  if (userIds.length) {
    const { data, error: leaderProfilesError } = await supabase
      .from('profiles').select('id, display_name, username').in('id', userIds);
    if (leaderProfilesError) return res.status(500).json({ error: 'Leaderboard profile query failed' });
    leaderProfiles = data || [];
  }


  const { data: allBets, error: allBetsError } = await supabase.from('bets').select('user_id, stake, odds, status, potential_payout').order('created_at', { ascending: false }).limit(5000);
  if (allBetsError) return res.status(500).json({ error: 'Leaderboard statistics query failed' });
  const statsByUser = new Map();
  for (const bet of allBets || []) {
    const stat = statsByUser.get(bet.user_id) || { bets: 0, won: 0, lost: 0, pending: 0, profit: 0 };
    stat.bets++;
    if (bet.status === 'won') { stat.won++; stat.profit += Number(bet.potential_payout || Math.round(Number(bet.stake) * Number(bet.odds))); stat.profit -= Number(bet.stake) || 0; }
    else if (bet.status === 'lost') { stat.lost++; stat.profit -= Number(bet.stake) || 0; }
    else if (bet.status === 'pending') stat.pending++;
    statsByUser.set(bet.user_id, stat);
  }
  const cash = (allBets || []).reduce((acc, bet) => {
    acc.totalBets++; acc.turnover += Number(bet.stake) || 0;
    if (bet.status === 'won') acc.payouts += Number(bet.potential_payout || Math.round(Number(bet.stake) * Number(bet.odds))) || 0;
    else if (bet.status === 'void') acc.payouts += Number(bet.stake) || 0;
    return acc;
  }, { totalBets: 0, turnover: 0, payouts: 0 });
  const leaders = (balances || []).map(row => {
    const p = leaderProfiles.find(item => item.id === row.user_id);
    return { name: p?.display_name || p?.username || 'Игрок', balance: row.balance, user_id: row.user_id, ...(statsByUser.get(row.user_id) || { bets: 0, won: 0, lost: 0, pending: 0, profit: 0 }) };
  }).sort((a, b) => b.balance - a.balance);

  const isAdmin = Boolean(process.env.ADMIN_TELEGRAM_ID && String(user.id) === String(process.env.ADMIN_TELEGRAM_ID));
  let adminPlayers = [];
  if (isAdmin) {
    const { data: allBalances, error: allBalancesError } = await supabase
      .from('balances').select('user_id, balance').order('balance', { ascending: false }).limit(500);
    if (allBalancesError) return res.status(500).json({ error: 'Admin player list query failed' });
    const allIds = (allBalances || []).map(row => row.user_id);
    let allProfiles = [];
    if (allIds.length) {
      const { data, error: allProfilesError } = await supabase
        .from('profiles').select('id, telegram_id, display_name, username').in('id', allIds);
      if (allProfilesError) return res.status(500).json({ error: 'Admin profile list query failed' });
      allProfiles = data || [];
    }
    adminPlayers = (allBalances || []).map(row => {
      const p = allProfiles.find(item => item.id === row.user_id);
      return { telegram_id: p?.telegram_id, name: p?.display_name || p?.username || 'Игрок', username: p?.username || null, balance: row.balance };
    }).filter(p => p.telegram_id !== undefined);
  }

  return res.status(200).json({
    profile,
    isAdmin,
    balance: balanceRow?.balance ?? 0,
    history: bets || [],
    leaders,
    adminPlayers,
    cash,
    playerStats: statsByUser.get(profile.id) || { bets: 0, won: 0, lost: 0, pending: 0, profit: 0 }
  });
}
