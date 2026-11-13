import crypto from 'node:crypto';

const COOKIE = 'kayuk_announce_session';
const SESSION_TTL = 8 * 60 * 60;

function parseBody(body) {
  if (body && typeof body === 'object') return body;
  try { return JSON.parse(body || '{}'); } catch { return {}; }
}
function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}
function getCookie(req, name) {
  const raw = String(req.headers.cookie || '');
  const entry = raw.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
}
function validSession(req, secret) {
  const token = getCookie(req, COOKIE);
  const [expires, signature, extra] = token.split('.');
  if (!expires || !signature || extra || !/^\d+$/.test(expires) || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, sign(expires, secret));
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === String(req.headers.host || ''); } catch { return false; }
}
function setSessionCookie(res, token, maxAge) {
  res.setHeader('Set-Cookie', token
    ? `${COOKIE}=${encodeURIComponent(token)}; Path=/api/telegram; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`
    : `${COOKIE}=; Path=/api/telegram; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
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
  const panelPassword = process.env.ANNOUNCE_PANEL_PASSWORD;
  const sessionSecret = process.env.ANNOUNCE_SESSION_SECRET;
  if (!panelPassword || !sessionSecret || sessionSecret.length < 32) {
    return res.status(503).json({ error: 'Панель ещё не настроена в Vercel Environment Variables' });
  }

  if (action === 'login') {
    if (!safeEqual(body.password, panelPassword)) return res.status(401).json({ error: 'Неверный пароль' });
    const expires = String(Math.floor(Date.now() / 1000) + SESSION_TTL);
    const token = expires + '.' + sign(expires, sessionSecret);
    setSessionCookie(res, token, SESSION_TTL);
    return res.status(200).json({ ok: true });
  }

  if (action === 'logout') {
    setSessionCookie(res, '', 0);
    return res.status(200).json({ ok: true });
  }

  if (!validSession(req, sessionSecret)) return res.status(401).json({ error: 'Сессия истекла. Войди снова.' });
  if (action !== 'send') return res.status(400).json({ error: 'Неизвестное действие' });

  const message = String(body.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Напиши текст сообщения' });
  if (message.length > 4000) return res.status(400).json({ error: 'Максимум 4000 символов' });

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!botToken || !chatId) return res.status(503).json({ error: 'Не настроены TELEGRAM_BOT_TOKEN или TELEGRAM_GROUP_CHAT_ID' });

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
