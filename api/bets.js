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

// Server-controlled demo markets; client odds are not trusted.
const markets = {
  'Спартак — Зенит': { 'П1': 2.5, 'X': 3.2, 'П2': 2.8 },
  'Краснодар — Динамо': { 'П1': 1.95, 'X': 3.5, 'П2': 3.9 },
  'Барселона — Арсенал': { 'П1': 2.1, 'X': 3.6, 'П2': 3.1 },
  'Реал — Интер': { 'П1': 1.85, 'X': 3.7, 'П2': 4.2 }
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { TELEGRAM_BOT_TOKEN: botToken, SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: serviceKey } = process.env;
  if (!botToken || !supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration missing' });
  }

  const user = verifyTelegramInitData(req.headers['x-telegram-init-data'], botToken);
  if (!user?.id) return res.status(401).json({ error: 'Telegram authentication failed. Reopen the Mini App.' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const stake = Number(body?.stake);
  const picks = body?.picks;
  if (!Number.isSafeInteger(stake) || stake < 1 || !Array.isArray(picks) || picks.length < 1 || picks.length > 4) {
    return res.status(400).json({ error: 'Проверь сумму ставки и купон' });
  }

  const usedMatches = new Set();
  let odds = 1;
  const events = [];
  const selections = [];
  for (const pick of picks) {
    const match = String(pick?.match || '');
    const selection = String(pick?.sel || '');
    const market = markets[match];
    if (!market || !Object.hasOwn(market, selection) || usedMatches.has(match)) {
      return res.status(400).json({ error: 'Выбранный исход недоступен' });
    }
    usedMatches.add(match);
    odds *= market[selection];
    events.push(match);
    selections.push(`${selection} (${match})`);
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('id').eq('telegram_id', user.id).maybeSingle();

  if (profileError) return res.status(500).json({ error: 'Не удалось загрузить профиль' });
  if (!profile) return res.status(404).json({ error: 'Профиль не найден. Сначала нужно создать профиль игрока.' });

  const { data, error } = await supabase.rpc('place_virtual_bet', {
    p_user_id: profile.id,
    p_event_title: events.join(' + '),
    p_selection: selections.join(' + '),
    p_stake: stake,
    p_odds: Number(odds.toFixed(4))
  });

  if (error) {
    const insufficient = /Insufficient balance|balance not found/i.test(error.message || '');
    return res.status(insufficient ? 400 : 500).json({
      error: insufficient ? 'Недостаточно виртуальных средств или баланс не создан' : 'Не удалось принять ставку'
    });
  }
  return res.status(200).json({ ok: true, bet: data, odds: Number(odds.toFixed(4)) });
}
