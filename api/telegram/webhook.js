import { createClient } from '@supabase/supabase-js';

async function telegram(method, token, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.description || 'Telegram API error');
  return data.result;
}

function openAppKeyboard() {
  const username = String(process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '');
  const url = username
    ? `https://t.me/${username}?startapp=group`
    : (process.env.MINI_APP_URL || 'https://kayuk-bet-miniapp.vercel.app');
  return { inline_keyboard: [[{ text: '🎰 Открыть КАЮК BET', url }]] };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token) return res.status(500).json({ error: 'Bot token is not configured' });
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized webhook' });
  }
  let update = req.body;
  if (typeof update === 'string') { try { update = JSON.parse(update); } catch { update = null; } }
  const message = update?.message || update?.edited_message;
  const chatId = message?.chat?.id;
  const text = String(message?.text || '').trim();
  if (!chatId || !text.startsWith('/')) return res.status(200).json({ ok: true });
  const command = text.split(/\s+/)[0].split('@')[0].toLowerCase();
  const groupOnly = ['group', 'supergroup'].includes(message.chat.type);
  try {
    if (['/start', '/bet', '/app'].includes(command)) {
      const greeting = groupOnly
        ? '⚽ КАЮК BET — виртуальная букмекерка вашей компании.\nОткрой Mini App, выбирай матч, ставь виртуальные монеты и следи за рейтингом.'
        : 'Добро пожаловать в КАЮК BET!\nОткрой приложение: баланс, ставки, история и рейтинг. Все средства виртуальные.';
      await telegram('sendMessage', token, { chat_id: chatId, text: greeting, reply_markup: openAppKeyboard(), disable_web_page_preview: true });
      return res.status(200).json({ ok: true });
    }
    if (['/line', '/matches'].includes(command)) {
      const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
      if (!url || !key) throw new Error('Supabase is not configured');
      const db = createClient(url, key, { auth: { persistSession: false } });
      const { data, error } = await db.from('manual_matches')
        .select('league,home_team,away_team,start_time,status,markets,result')
        .order('start_time', { ascending: true }).limit(20);
      if (error) throw error;
      const upcoming = (data || []).filter(m => !m.result && m.status === 'NS' && new Date(m.start_time).getTime() > Date.now()).slice(0, 8);
      const listing = upcoming.length ? upcoming.map(m => {
        const odds = ['П1', 'X', 'П2'].filter(k => m.markets?.[k] != null).map(k => `${k} ${Number(m.markets[k]).toFixed(2)}`).join(' · ');
        return `⚽ ${m.home_team} — ${m.away_team}\n🏆 ${m.league} · ${new Date(m.start_time).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} МСК\n${odds || 'Коэффициенты уточняются'}`;
      }).join('\n\n') : 'Сейчас нет предстоящих матчей в ручной линии.';
      await telegram('sendMessage', token, { chat_id: chatId, text: `📋 ЛИНИЯ КАЮК BET\n\n${listing}\n\nТолько виртуальные средства.`, reply_markup: openAppKeyboard(), disable_web_page_preview: true });
      return res.status(200).json({ ok: true });
    }
    if (command === '/help') {
      await telegram('sendMessage', token, { chat_id: chatId, text: 'Команды КАЮК BET:\n/bet — открыть приложение\n/line — предстоящие матчи\n/help — помощь', reply_markup: openAppKeyboard() });
    }
  } catch (error) { console.error('Telegram webhook error:', error?.message || error); }
  return res.status(200).json({ ok: true });
}
