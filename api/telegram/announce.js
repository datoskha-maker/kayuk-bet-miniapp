import crypto from 'node:crypto';

function parseBody(body) {
  if (body && typeof body === 'object') return body;
  try { return JSON.parse(body || '{}'); } catch { return {}; }
}

function safeEqualHex(a, b) {
  if (!/^[a-f0-9]{64}$/i.test(String(a || '')) || !/^[a-f0-9]{64}$/i.test(String(b || ''))) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

function verifyTelegramInitData(initData, botToken) {
  if (typeof initData !== 'string' || !initData || initData.length > 8192) return null;
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash) return null;
  const pairs = [];
  for (const [key, value] of params.entries()) if (key !== 'hash') pairs.push([key, value]);
  pairs.sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = pairs.map(([key, value]) => `${key}=${value}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (!safeEqualHex(receivedHash, calculatedHash)) return null;
  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || authDate > now + 60 || now - authDate > 86400) return null;
  let user;
  try { user = JSON.parse(params.get('user') || 'null'); } catch { return null; }
  if (!user || !user.id) return null;
  return { user, authDate };
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === String(req.headers.host || ''); } catch { return false; }
}

async function telegramCall(token, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    const error = new Error(result.description || `Telegram API error ${response.status}`);
    error.telegramDescription = result.description || '';
    throw error;
  }
  return result.result;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Запрос отклонён' });

  const body = parseBody(req.body);
  const action = String(body.action || '');
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminId = String(process.env.ADMIN_TELEGRAM_ID || '');
  const chatId = process.env.TELEGRAM_GROUP_CHAT_ID;

  if (!botToken || !adminId) return res.status(503).json({ error: 'Не настроены Telegram bot token или ID администратора' });
  const auth = verifyTelegramInitData(body.initData, botToken);
  if (!auth) return res.status(401).json({ error: 'Открой панель через Telegram, используя команду /announce боту.' });
  if (String(auth.user.id) !== adminId) return res.status(403).json({ error: 'Доступ разрешён только администратору КАЮК BET.' });

  if (action === 'auth') {
    const displayName = [auth.user.first_name, auth.user.last_name].filter(Boolean).join(' ');
    return res.status(200).json({ ok: true, displayName });
  }
  if (action === 'repairWebhook') {
    const webhookUrl = 'https://kayuk-bet-miniapp-9nfa.vercel.app/api/telegram/webhook';
    const payload = { url: webhookUrl, allowed_updates: ['message', 'edited_message'], drop_pending_updates: false };
    if (process.env.TELEGRAM_WEBHOOK_SECRET) payload.secret_token = process.env.TELEGRAM_WEBHOOK_SECRET;
    try {
      await telegramCall(botToken, 'setWebhook', payload);
      const info = await telegramCall(botToken, 'getWebhookInfo', {});
      return res.status(200).json({ ok: true, url: info.url || '', pendingUpdateCount: Number(info.pending_update_count || 0), lastErrorMessage: info.last_error_message || null, detail: 'Webhook направлен на действующий домен проекта. Ожидающие обновления не удалялись.' });
    } catch (error) {
      console.error('Telegram webhook repair failed:', error?.message || error);
      return res.status(502).json({ error: 'Не удалось восстановить webhook: ' + (error.telegramDescription || error.message || 'неизвестная ошибка') });
    }
  }
  if (!chatId) return res.status(503).json({ error: 'Не настроен TELEGRAM_GROUP_CHAT_ID в Production' });

  if (action === 'check') {
    let me;
    try {
      me = await telegramCall(botToken, 'getMe', {});
    } catch (error) {
      console.error('Telegram announce getMe failed:', error?.message || 'unknown error');
      return res.status(502).json({
        error: 'ЭТАП 1/3 — проверка токена бота не пройдена: ' + (error.telegramDescription || error.message || 'неизвестная ошибка'),
        diagnostic: { stage: 'getMe', tokenAccepted: false }
      });
    }

    let webhookInfo = null;
    try {
      const info = await telegramCall(botToken, 'getWebhookInfo', {});
      webhookInfo = {
        url: info.url || '',
        pendingUpdateCount: Number(info.pending_update_count || 0),
        lastErrorDate: info.last_error_date || null,
        lastErrorMessage: info.last_error_message || null,
        hasCustomCertificate: Boolean(info.has_custom_certificate),
        allowedUpdates: info.allowed_updates || []
      };
    } catch (error) {
      webhookInfo = { diagnosticError: error.telegramDescription || error.message || 'unknown error' };
    }

    let chat;
    try {
      chat = await telegramCall(botToken, 'getChat', { chat_id: chatId });
    } catch (error) {
      console.error('Telegram announce getChat failed:', error?.message || 'unknown error');
      return res.status(502).json({
        error: 'ЭТАП 2/3 — токен принят (' + (me.username ? '@' + me.username : 'бот') + '), но Telegram не находит целевую беседу: ' + (error.telegramDescription || error.message || 'неизвестная ошибка') + '. Webhook: ' + (webhookInfo?.url || 'НЕ НАСТРОЕН') + '; ожидающих обновлений: ' + (webhookInfo?.pendingUpdateCount ?? '?') + '; последняя ошибка доставки: ' + (webhookInfo?.lastErrorMessage || 'нет') + '. Настроенный ID беседы: ' + String(chatId) + '. Проверьте ID и что в группе добавлен именно этот бот.',
        diagnostic: { stage: 'getChat', tokenAccepted: true, botUsername: me.username || null, configuredChatId: String(chatId), webhookInfo }
      });
    }

    let member;
    try {
      member = await telegramCall(botToken, 'getChatMember', { chat_id: chatId, user_id: me.id });
    } catch (error) {
      console.error('Telegram announce getChatMember failed:', error?.message || 'unknown error');
      return res.status(502).json({
        error: 'ЭТАП 3/3 — беседа найдена (' + (chat.title || chat.username || 'Telegram-беседа') + '), но не удалось проверить участника-бота: ' + (error.telegramDescription || error.message || 'неизвестная ошибка'),
        diagnostic: { stage: 'getChatMember', tokenAccepted: true, botUsername: me.username || null, chatFound: true }
      });
    }

    const canSend = member.status === 'creator' || member.status === 'administrator' ||
      (member.status === 'member' && member.can_send_messages !== false) ||
      (member.status === 'restricted' && member.can_send_messages === true);
    return res.status(200).json({
      ok: true,
      botUsername: me.username ? '@' + me.username : 'бот',
      chatTitle: chat.title || chat.username || 'Telegram-беседа',
      memberStatus: member.status,
      canSend,
      webhookInfo,
      detail: canSend
        ? 'Все три этапа пройдены: токен действителен, беседа найдена, бот может отправлять сообщения.'
        : 'Беседа найдена, но Telegram не разрешает боту отправлять сообщения. Проверьте ограничения и права участника.'
    });
  }

  if (action !== 'send') return res.status(400).json({ error: 'Неизвестное действие' });
  const message = String(body.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Напиши текст сообщения' });
  if (message.length > 4000) return res.status(400).json({ error: 'Максимум 4000 символов' });

  try {
    const result = await telegramCall(botToken, 'sendMessage', {
      chat_id: chatId,
      text: message,
      disable_web_page_preview: true
    });
    return res.status(200).json({ ok: true, message_id: result?.message_id });
  } catch (error) {
    console.error('Telegram announce failed:', error?.message || 'unknown error');
    return res.status(502).json({ error: 'Telegram отклонил отправку: ' + (error.telegramDescription || error.message || 'неизвестная ошибка') });
  }
}
