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

// The server accepts only current odds from the cached API-Football feed.
function marketForMatch(match, cache) {
  const fixture = (cache.fixtures || []).find(f => `${f.home} — ${f.away}` === match);
  if (!fixture) return null;
  if (fixture.status !== 'NS' || !fixture.time || new Date(fixture.time).getTime() <= Date.now()) return null;
  const oddsUpdated = cache.odds_updated_at ? new Date(cache.odds_updated_at).getTime() : 0;
  if (!oddsUpdated || Date.now() - oddsUpdated > 5 * 60 * 60 * 1000) return null;
  const current = cache.odds?.[fixture.id];
  if (!current?.home || !current?.draw || !current?.away) return null;
  return { 'П1': Number(current.home), 'X': Number(current.draw), 'П2': Number(current.away) };
}

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

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: cache, error: cacheError } = await supabase.from('football_cache').select('fixtures, odds, odds_updated_at').eq('id', 1).maybeSingle();
  if (cacheError || !cache) return res.status(503).json({ error: 'Реальная линия пока не готова. Попробуй позже.' });

  const usedMatches = new Set();
  let odds = 1;
  const events = [];
  const selections = [];
  for (const pick of picks) {
    const match = String(pick?.match || '');
    const selection = String(pick?.sel || '');
    const market = marketForMatch(match, cache);
    if (!market || !Object.hasOwn(market, selection) || usedMatches.has(match)) {
      return res.status(400).json({ error: 'Исход недоступен: матч начался, линия устарела или коэффициент отсутствует' });
    }
    const selectedOdd = Number(pick?.odd);
    if (!Number.isFinite(selectedOdd) || Math.abs(selectedOdd - market[selection]) > 0.0001) {
      return res.status(409).json({ error: 'Коэффициент изменился. Обнови линию и собери купон заново.' });
    }
    usedMatches.add(match);
    odds *= market[selection];
    events.push(match);
    selections.push(`${selection} (${match})`);
  }

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
    // Keep the detailed database error in Vercel logs so failed bets can be diagnosed.
    console.error('place_virtual_bet failed', {
      code: error.code || null,
      message: error.message || null,
      details: error.details || null,
      hint: error.hint || null
    });
    const message = String(error.message || '');
    const insufficient = /Insufficient balance|balance not found/i.test(message);
    const missingFunction = /Could not find the function|function .* does not exist/i.test(message);
    const permission = /permission denied|not authorized/i.test(message);
    return res.status(insufficient ? 400 : 500).json({
      error: insufficient
        ? 'Недостаточно виртуальных средств или баланс не создан'
        : missingFunction
          ? 'На сервере не настроена функция приёма ставок. Нужно проверить SQL в Supabase.'
          : permission
            ? 'У базы нет разрешения на приём ставок. Нужно проверить права функции в Supabase.'
            : 'Не удалось принять ставку. Причина записана в лог сервера.',
      code: error.code || undefined
    });
  }
  return res.status(200).json({ ok: true, bet: data, odds: Number(odds.toFixed(4)) });
}
