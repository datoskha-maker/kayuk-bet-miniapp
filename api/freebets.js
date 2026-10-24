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
  if (!botToken || !supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server configuration missing' });

  const user = verifyTelegramInitData(req.headers['x-telegram-init-data'], botToken);
  if (!user?.id) return res.status(401).json({ error: 'Telegram authentication failed. Reopen the Mini App.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const freebetId = String(body?.freebetId || '');
  const pick = body?.pick;
  if (!freebetId || !pick || typeof pick !== 'object') return res.status(400).json({ error: 'Выбери фрибет и один исход' });

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: profile, error: profileError } = await supabase.from('profiles').select('id,telegram_id,display_name').eq('telegram_id', user.id).maybeSingle();
  if (profileError) return res.status(500).json({ error: 'Не удалось загрузить профиль' });
  if (!profile) return res.status(404).json({ error: 'Профиль не найден' });

  const { data: fb, error: fbError } = await supabase.from('freebets').select('id,nominal,remaining,status').eq('id', freebetId).eq('user_id', profile.id).maybeSingle();
  if (fbError) return res.status(500).json({ error: 'Не удалось проверить фрибет' });
  if (!fb || fb.status !== 'active' || Number(fb.remaining) <= 0) return res.status(400).json({ error: 'Фрибет уже использован или недоступен' });

  const { data: manualMatches, error: manualError } = await supabase.from('manual_matches').select('id,home_team,away_team,start_time,status,markets').eq('status', 'NS');
  if (manualError) return res.status(503).json({ error: 'Не удалось загрузить линию' });

  const match = String(pick.match || '');
  const manual = (manualMatches || []).find(m => (pick.manualId && String(m.id) === String(pick.manualId)) || `${m.home_team} — ${m.away_team}` === match);
  if (!manual || new Date(manual.start_time).getTime() <= Date.now()) return res.status(400).json({ error: 'Матч уже начался или недоступен' });

  const marketName = String(pick.market || '');
  const outcomeName = String(pick.outcome || pick.sel || '');
  const market = Array.isArray(manual.markets) ? manual.markets.find(m => m && m.name === marketName) : null;
  const outcome = market && Array.isArray(market.outcomes) ? market.outcomes.find(o => o && o.name === outcomeName) : null;
  const odd = Number(outcome?.odd);
  const clientOdd = Number(pick.odd);
  if (!outcome || !Number.isFinite(odd) || odd < 1.01 || odd > 1000 || !Number.isFinite(clientOdd) || Math.abs(clientOdd - odd) > 0.0001) {
    return res.status(409).json({ error: 'Исход или коэффициент изменился. Обнови линию.' });
  }

  const stake = Number(fb.remaining);
  const selection = `${marketName} — ${outcomeName} (${manual.home_team} — ${manual.away_team})`;
  const eventTitle = `${manual.home_team} — ${manual.away_team}`;
  const { data, error } = await supabase.rpc('place_freebet_bet', {
    p_user_id: profile.id,
    p_freebet_id: fb.id,
    p_event_title: eventTitle,
    p_selection: selection,
    p_stake: stake,
    p_odds: odd
  });
  if (error) {
    console.error('place_freebet_bet failed', { code: error.code, message: error.message, details: error.details });
    const message = String(error.message || '');
    const conflict = /not active|owner mismatch|Stake must equal|not found/i.test(message);
    return res.status(conflict ? 409 : 500).json({ error: conflict ? 'Фрибет уже недоступен. Обнови страницу.' : 'Не удалось принять ставку фрибетом.' });
  }

  try {
    const text = `🎁 Ставка фрибетом принята · КАЮК BET\nМатч: ${eventTitle}\nИсход: ${marketName} — ${outcomeName}\nФрибет: ${stake.toLocaleString('ru-RU')} ₽\nКоэффициент: ${odd}\nПри выигрыше прибыль: ${Math.round(stake * (odd - 1)).toLocaleString('ru-RU')} ₽\nТолько виртуальные средства.`;
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: user.id, text, disable_web_page_preview: true }) });
  } catch (e) { console.warn('Freebet notification failed:', e?.message || e); }

  return res.status(200).json({ ok: true, bet: data, stake, odds: odd });
}
