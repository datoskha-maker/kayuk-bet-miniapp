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
  for (const [key, value] of params.entries()) {
    if (key !== 'hash') pairs.push([key, value]);
  }
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

  if (!botToken || !adminId) {
    return res.status(503).json({ error: 'Не настроены Telegram bot token или ID администратора' });
  }

  const auth = verifyTelegramInitData(body.initData, botToken);
  if (!auth) return res.status(401).json({ error: 'Открой панель через Telegram, используя команду /announce боту.' });
  if (String(auth.user.id) !== adminId) {
    return res.status(403).json({ error: 'Доступ разрешён только администратору КАЮК BET.' });
  }

  if (action === 'auth') {
    const displayName = [auth.user.first_name, auth.user.last_name].filter(Boolean).join(' ');
    return res.status(200).json({ ok: true, displayName });
  }

  if (action !== 'send') return res.status(400).json({ error: 'Неизвестное действие' });
  if (!chatId) return res.status(503).json({ error: 'Не настроен TELEGRAM_GROUP_CHAT_ID в Production' });

  const message = String(body.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Напиши текст сообщения' });
  if (message.length > 4000) return res.status(400).json({ error: 'Максимум 4000 символов' });

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      console.error('Telegram announce failed:', result.description || response.status);
      return res.status(502).json({ error: 'Telegram не принял сообщение. Проверь, что бот состоит в беседе и может писать.' });
    }
    return res.status(200).json({ ok: true, message_id: result.result?.message_id });
  } catch (error) {
    console.error('Telegram announce request failed:', error?.message || 'unknown error');
    return res.status(502).json({ error: 'Не удалось связаться с Telegram' });
  }
}
