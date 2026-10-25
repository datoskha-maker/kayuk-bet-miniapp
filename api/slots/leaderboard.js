import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

function verifyTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return null;
  params.delete('hash');
  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > 86400 || authDate > now + 60) return null;
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest();
  const receivedHash = Buffer.from(hash, 'hex');
  if (calculatedHash.length !== receivedHash.length || !crypto.timingSafeEqual(calculatedHash, receivedHash)) return null;
  try { return JSON.parse(params.get('user') || 'null'); } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { TELEGRAM_BOT_TOKEN: botToken, SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: serviceKey } = process.env;
  if (!botToken || !supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server configuration missing' });
  const telegramUser = verifyTelegramInitData(req.headers['x-telegram-init-data'], botToken);
  if (!telegramUser?.id) return res.status(401).json({ error: 'Telegram authentication failed. Reopen the Mini App.' });

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: spins, error: spinsError } = await supabase
    .from('slot_spins')
    .select('user_id, stake, payout');
  if (spinsError) {
    console.error('Casino leaderboard spins lookup failed:', spinsError.message);
    return res.status(500).json({ error: 'Не удалось загрузить итоги казино.' });
  }
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, display_name, username');
  if (profilesError) {
    console.error('Casino leaderboard profiles lookup failed:', profilesError.message);
    return res.status(500).json({ error: 'Не удалось загрузить игроков.' });
  }

  const profileById = new Map((profiles || []).map(p => [p.id, p]));
  const totals = new Map();
  for (const spin of spins || []) {
    const key = spin.user_id;
    if (!totals.has(key)) totals.set(key, { user_id: key, spins: 0, staked: 0, paid: 0 });
    const row = totals.get(key);
    row.spins += 1;
    row.staked += Number(spin.stake) || 0;
    row.paid += Number(spin.payout) || 0;
  }
  const players = [...totals.values()].map(row => {
    const profile = profileById.get(row.user_id) || {};
    return {
      user_id: row.user_id,
      name: profile.display_name || (profile.username ? '@' + profile.username : 'Игрок Каюка'),
      spins: row.spins,
      staked: row.staked,
      paid: row.paid,
      net: row.paid - row.staked
    };
  }).sort((a, b) => b.net - a.net || b.spins - a.spins);

  return res.status(200).json({ players });
}
