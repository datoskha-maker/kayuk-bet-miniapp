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
    .map(([key, value]) => `${key}=${value}`).join('\n');
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

  const { TELEGRAM_BOT_TOKEN: token, SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, ADMIN_TELEGRAM_ID: adminId } = process.env;
  if (!token || !url || !key || !adminId) {
    return res.status(500).json({ error: 'Server configuration missing: проверь серверные переменные Vercel' });
  }

  const admin = verifyTelegramInitData(req.headers['x-telegram-init-data'], token);
  if (!admin?.id) return res.status(401).json({ error: 'Не удалось подтвердить Telegram-профиль. Переоткрой Mini App.' });
  if (String(admin.id) !== String(adminId)) return res.status(403).json({ error: 'Выдавать фрибеты может только администратор' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const targetTelegramId = String(body?.targetTelegramId || '');
  const nominal = Number(body?.nominal);
  if (!/^\d{1,20}$/.test(targetTelegramId) || ![1000, 2000, 3500, 5000].includes(nominal)) {
    return res.status(400).json({ error: 'Выбери игрока и номинал фрибета 1 000, 2 000, 3 500 или 5 000 ₽' });
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: player, error: playerError } = await db.from('profiles')
    .select('id,telegram_id,display_name,username')
    .eq('telegram_id', targetTelegramId).maybeSingle();
  if (playerError) return res.status(500).json({ error: 'Не удалось найти игрока в базе' });
  if (!player) return res.status(404).json({ error: 'Игрок не найден. Попроси его открыть Mini App хотя бы один раз.' });

  const { data: freebet, error: grantError } = await db.from('freebets').insert({
    user_id: player.id,
    nominal,
    remaining: nominal,
    status: 'active',
    granted_by: admin.id
  }).select('id,nominal,remaining,status,granted_at').single();

  if (grantError) {
    console.error('Freebet grant failed:', grantError.message);
    return res.status(500).json({ error: 'Не удалось выдать фрибет. Проверь, что SQL-таблицы созданы.' });
  }

  const { error: txError } = await db.from('freebet_transactions').insert({
    freebet_id: freebet.id,
    user_id: player.id,
    amount: nominal,
    type: 'granted',
    note: 'Фрибет выдан администратором'
  });
  if (txError) {
    console.error('Freebet transaction log failed:', txError.message);
    return res.status(500).json({ error: 'Фрибет создан, но журнал не записан. Не выдавай повторно; проверь таблицу freebet_transactions.' });
  }

  let notified = false;
  const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  const playerName = player.display_name || player.username || 'Игрок';
  let notificationMessage = 'Фрибет выдан, но уведомление в беседу не отправлено.';
  if (!groupChatId) {
    notificationMessage = 'Фрибет выдан, но не настроен TELEGRAM_GROUP_CHAT_ID в Vercel.';
  } else {
    try {
      const message = `🎁 ФРИБЕТ ВЫДАН · КАЮК BET\n\n👤 Игрок: ${playerName}${player.username ? ' · @' + player.username.replace(/^@/, '') : ''}\n💰 Номинал: ${nominal.toLocaleString('ru-RU')} ₽\n⚽ Фрибет уже доступен в Mini App!\n\nТолько виртуальные средства.`;
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: groupChatId, text: message, disable_web_page_preview: true })
      });
      const result = await response.json();
      notified = Boolean(response.ok && result.ok);
      notificationMessage = notified
        ? 'Фрибет выдан, уведомление отправлено в Telegram-беседу.'
        : 'Фрибет выдан, но Telegram не отправил сообщение в беседу. Проверь ID беседы и права бота.';
      if (!notified) console.warn('Freebet group notification failed:', result.description || 'Telegram API error');
    } catch (error) {
      console.warn('Freebet group notification failed:', error?.message || error);
      notificationMessage = 'Фрибет выдан, но уведомление в беседу не отправлено.';
    }
  }

  return res.status(200).json({
    ok: true,
    freebet,
    player: playerName,
    groupNotificationSent: notified,
    message: notificationMessage
  });
}
