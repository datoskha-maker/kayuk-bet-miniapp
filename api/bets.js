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
  if (!Number.isSafeInteger(stake) || stake < 1 || !Array.isArray(picks) || picks.length < 1 || picks.length > 50) {
    return res.status(400).json({ error: 'Проверь сумму ставки и купон' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: manualMatches, error: manualError } = await supabase.from('manual_matches').select('id,league,home_team,away_team,start_time,status,markets').eq('status','NS');
  if (manualError) return res.status(503).json({ error: 'Не удалось загрузить линию. Попробуй позже.' });

  const usedMatches = new Set();
  let odds = 1;
  const events = [];
  const selections = [];
  for (const pick of picks) {
    const match = String(pick?.match || '');
    const selection = String(pick?.sel || '');
    const manual = (manualMatches || []).find(m => (pick?.manualId && String(m.id) === String(pick.manualId)) || `${m.home_team} — ${m.away_team}` === match);
    if (!manual || new Date(manual.start_time).getTime() <= Date.now() || manual.status !== 'NS' || usedMatches.has(String(manual.id))) {
      return res.status(400).json({ error: 'Исход недоступен: матч начался, линия устарела или коэффициент отсутствует' });
    }
    let selectedOdd;
    let selectionLabel = selection;
    if (Array.isArray(manual.markets)) {
      const marketName = String(pick?.market || '');
      const outcomeName = String(pick?.outcome || selection);
      const market = manual.markets.find(m => m && m.name === marketName);
      const outcome = market && Array.isArray(market.outcomes) ? market.outcomes.find(o => o && o.name === outcomeName) : null;
      if (!market || !outcome) return res.status(400).json({ error: 'Исход недоступен: рынок или исход больше не существует' });
      selectedOdd = Number(outcome.odd);
      selectionLabel = `${marketName} — ${outcomeName}`;
    } else {
      const market = manual.markets || {};
      if (!Object.hasOwn(market, selection)) return res.status(400).json({ error: 'Исход недоступен: рынок или исход больше не существует' });
      selectedOdd = Number(market[selection]);
    }
    const clientOdd = Number(pick?.odd);
    if (!Number.isFinite(selectedOdd) || selectedOdd < 1.01 || selectedOdd > 1000 || !Number.isFinite(clientOdd) || Math.abs(clientOdd - selectedOdd) > 0.0001) {
      return res.status(409).json({ error: 'Коэффициент изменился. Обнови линию и собери купон заново.' });
    }
    usedMatches.add(String(manual.id));
    odds *= selectedOdd;
    events.push(match);
    selections.push(`${selectionLabel} (${match})`);
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
  try {
    const { data: player } = await supabase.from('profiles').select('display_name,telegram_id').eq('id', profile.id).maybeSingle();
    if (player?.telegram_id) {
      const message = `🎟️ Ставка принята · КАЮК BET\nМатчи: ${events.join(' + ')}\nИсход: ${selections.join(' + ')}\nСумма: ${stake.toLocaleString('ru-RU')} ₽\nКоэффициент: ${Number(odds.toFixed(4))}\nВозможная выплата: ${Math.round(stake * odds).toLocaleString('ru-RU')} ₽\nТолько виртуальные средства.`;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: player.telegram_id, text: message, disable_web_page_preview: true }) });
    }
  } catch (notificationError) { console.warn('Bet notification failed:', notificationError?.message || notificationError); }
  return res.status(200).json({ ok: true, bet: data, odds: Number(odds.toFixed(4)) });
}
