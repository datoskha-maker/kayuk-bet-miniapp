import { createClient } from '@supabase/supabase-js';
import { handleKayukAiCommand, handleKayukAiMessage } from './kayuk-ai.js';

async function telegram(method, token, payload) {
  const endpoint = 'https://api.telegram.org/bot' + token + '/' + method;
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    throw new Error('Telegram fetch ' + method + ' failed: ' + String(error && error.message || error));
  }
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch {
    throw new Error('Telegram API ' + method + ' returned non-JSON: HTTP ' + response.status + ', body: ' + raw.slice(0, 300));
  }
  if (!response.ok || !data.ok) {
    throw new Error('Telegram API ' + method + ' failed: HTTP ' + response.status + ', error_code ' + String(data.error_code || 'unknown') + ', description: ' + String(data.description || 'Telegram API error'));
  }
  return data.result;
}

function openAppKeyboard(groupChat = false) {
  const appUrl = process.env.MINI_APP_URL || 'https://kayuk-bet-miniapp-9nfa.vercel.app';
  if (!groupChat) {
    // In a private chat, use a real Telegram Web App button so Telegram supplies initData.
    return { inline_keyboard: [[{
      text: '🎰 Открыть КАЮК BET',
      web_app: { url: appUrl }
    }]] };
  }
  const username = String(process.env.TELEGRAM_BOT_USERNAME || 'aeslibaba_bot').replace(/^@/, '');
  return { inline_keyboard: [[{
    text: '🎰 Открыть КАЮК BET',
    url: 'https://t.me/' + username + '?startapp=group'
  }]] };
}

function announcePanelKeyboard() {
  return {
    inline_keyboard: [[{
      text: '📝 Открыть панель отправки',
      web_app: { url: 'https://kayuk-bet-miniapp-9nfa.vercel.app/announce.html' }
    }]]
  };
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
  if (typeof update === 'string') {
    try { update = JSON.parse(update); } catch { update = null; }
  }

  const message = update && (update.message || update.edited_message);
  const chatId = message && message.chat && message.chat.id;
  const text = String((message && message.text) || '').trim();
  if (!chatId || !text) return res.status(200).json({ ok: true });

  // Admin can publish plain text from the private bot chat without using /announce.
  const adminId = String(process.env.ADMIN_TELEGRAM_ID || '');
  const senderId = String((message.from && message.from.id) || '');
  if (message.chat.type === 'private' && adminId && senderId === adminId && !text.startsWith('/')) {
    const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;
    if (!groupChatId) {
      await telegram('sendMessage', token, { chat_id: chatId, text: 'Не настроен ID целевой беседы. Обратись к настройкам КАЮК BET.' });
      return res.status(200).json({ ok: true });
    }
    if (text.length > 4000) {
      await telegram('sendMessage', token, { chat_id: chatId, text: 'Сообщение слишком длинное. Максимум 4000 символов.' });
      return res.status(200).json({ ok: true });
    }
    try {
      await telegram('sendMessage', token, {
        chat_id: groupChatId,
        text,
        disable_web_page_preview: true
      });
      await telegram('sendMessage', token, { chat_id: chatId, text: '✓ Сообщение опубликовано в беседе КАЮК BET.' });
    } catch (error) {
      console.error('Telegram private announcement failed:', error && (error.stack || error.message || error));
      try {
        await telegram('sendMessage', token, { chat_id: chatId, text: 'Не удалось отправить сообщение в беседу. Проверь права бота и попробуй ещё раз.' });
      } catch (notifyError) {
        console.error('Telegram private announcement notification failed:', notifyError && (notifyError.message || notifyError));
      }
    }
    return res.status(200).json({ ok: true });
  }

  const groupOnly = ['group', 'supergroup'].includes(message.chat.type);
  if (!text.startsWith('/')) {
    if (groupOnly && String(chatId) === String(process.env.TELEGRAM_GROUP_CHAT_ID || '') && process.env.OPENAI_API_KEY) {
      try {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('Supabase is not configured for КАЮК AI');
        const db = createClient(url, key, { auth: { persistSession: false } });
        await handleKayukAiMessage({
          update,
          message,
          db,
          sendTelegram: (method, payload) => telegram(method, token, payload)
        });
      } catch (error) {
        console.error('КАЮК AI message handler failed:', error && (error.stack || error.message || error));
      }
    }
    return res.status(200).json({ ok: true });
  }

  const command = text.split(/\s+/)[0].split('@')[0].toLowerCase();


  try {
    if (groupOnly && command.startsWith('/kayuk_')) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error('Supabase is not configured for КАЮК AI');
      const db = createClient(url, key, { auth: { persistSession: false } });
      const handled = await handleKayukAiCommand({
        command,
        message,
        db,
        sendTelegram: (method, payload) => telegram(method, token, payload)
      });
      if (handled) return res.status(200).json({ ok: true });
    }

    if (['/start', '/bet', '/app'].includes(command)) {
      const greeting = groupOnly
        ? '⚽ КАЮК BET — виртуальная букмекерка вашей компании.\nОткрой Mini App, выбирай матч, ставь виртуальные монеты и следи за рейтингом.'
        : 'Добро пожаловать в КАЮК BET!\nОткрой приложение: баланс, ставки, история и рейтинг. Все средства виртуальные.';
      await telegram('sendMessage', token, {
        chat_id: chatId,
        text: greeting,
        reply_markup: openAppKeyboard(groupOnly),
        disable_web_page_preview: true
      });
      return res.status(200).json({ ok: true });
    }

    if (command === '/announce') {
      const adminId = String(process.env.ADMIN_TELEGRAM_ID || '');
      const senderId = String((message.from && message.from.id) || '');
      if (!adminId || senderId !== adminId) return res.status(200).json({ ok: true });

      const announcement = text.replace(/^\/\S+\s*/, '').trim();
      if (!announcement) {
        if (groupOnly) {
          const username = String(process.env.TELEGRAM_BOT_USERNAME || 'aeslibaba_bot').replace(/^@/, '');
          await telegram('sendMessage', token, {
            chat_id: chatId,
            text: 'Чтобы открыть панель отправки, перейди в личный чат с ботом и напиши ему /announce.',
            reply_markup: {
              inline_keyboard: [[{
                text: 'Открыть личный чат с ботом',
                url: 'https://t.me/' + username
              }]]
            }
          });
        } else {
          await telegram('sendMessage', token, {
            chat_id: chatId,
            text: 'Панель отправки сообщений. Только твой Telegram-аккаунт имеет доступ.',
            reply_markup: announcePanelKeyboard()
          });
        }
        return res.status(200).json({ ok: true });
      }

      if (!groupOnly) {
        await telegram('sendMessage', token, {
          chat_id: chatId,
          text: 'Чтобы отправить сообщение в беседу, открой панель кнопкой выше: /announce'
        });
        return res.status(200).json({ ok: true });
      }

      if (announcement.length > 4000) {
        await telegram('sendMessage', token, {
          chat_id: chatId,
          text: 'Сообщение слишком длинное. Максимум 4000 символов.'
        });
        return res.status(200).json({ ok: true });
      }

      await telegram('sendMessage', token, {
        chat_id: chatId,
        text: announcement,
        disable_web_page_preview: true
      });
      return res.status(200).json({ ok: true });
    }

    if (['/id', '/chatid'].includes(command)) {
      await telegram('sendMessage', token, {
        chat_id: chatId,
        text: '🆔 ID этой беседы: ' + chatId
      });
      return res.status(200).json({ ok: true });
    }

    if (['/line', '/matches'].includes(command)) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error('Supabase is not configured');

      const db = createClient(url, key, { auth: { persistSession: false } });
      const result = await db.from('manual_matches')
        .select('league,home_team,away_team,start_time,status,markets,result')
        .order('start_time', { ascending: true }).limit(20);
      if (result.error) throw result.error;

      const upcoming = (result.data || [])
        .filter(function (m) {
          return !m.result && m.status === 'NS' && new Date(m.start_time).getTime() > Date.now();
        })
        .slice(0, 8);

      const listing = upcoming.length ? upcoming.map(function (m) {
        const odds = ['П1', 'X', 'П2']
          .filter(function (k) { return m.markets && m.markets[k] != null; })
          .map(function (k) { return k + ' ' + Number(m.markets[k]).toFixed(2); })
          .join(' · ');
        const date = new Date(m.start_time).toLocaleString('ru-RU', {
          timeZone: 'Europe/Moscow',
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
        return '⚽ ' + m.home_team + ' — ' + m.away_team + '\n🏆 ' + m.league + ' · ' + date + ' МСК\n' + (odds || 'Коэффициенты уточняются');
      }).join('\n\n') : 'Сейчас нет предстоящих матчей в ручной линии.';

      await telegram('sendMessage', token, {
        chat_id: chatId,
        text: '📋 ЛИНИЯ КАЮК BET\n\n' + listing + '\n\nТолько виртуальные средства.',
        reply_markup: openAppKeyboard(groupOnly),
        disable_web_page_preview: true
      });
      return res.status(200).json({ ok: true });
    }

    if (command === '/help') {
      await telegram('sendMessage', token, {
        chat_id: chatId,
        text: 'Команды КАЮК BET:\n/bet — открыть приложение\n/line — предстоящие матчи\n/announce — панель отправки сообщений (администратор)\n/kayuk_optin — включить память КАЮК AI\n/kayuk_optout — удалить свою память\n/kayuk_memory — посмотреть память\n/kayuk_privacy — правила памяти\n/help — помощь',
        reply_markup: openAppKeyboard(groupOnly)
      });
      return res.status(200).json({ ok: true });
    }
  } catch (error) {
    console.error('Telegram webhook error for command ' + command + ':', error && (error.stack || error.message || error));
  }

  return res.status(200).json({ ok: true });
}
