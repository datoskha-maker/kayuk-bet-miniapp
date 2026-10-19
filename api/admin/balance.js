import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

function verifyTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  params.delete('signature');
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Math.abs(Date.now() / 1000 - authDate) > 86400) return null;
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
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

  const { TELEGRAM_BOT_TOKEN: botToken, SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey, ADMIN_TELEGRAM_ID: adminId } = process.env;
  if (!botToken || !supabaseUrl || !serviceKey || !adminId) {
    return res.status(500).json({ error: 'Не настроен ADMIN_TELEGRAM_ID или серверные переменные окружения' });
  }

  const user = verifyTelegramInitData(req.headers['x-telegram-init-data'], botToken);
  if (!user?.id) return res.status(401).json({ error: 'Не удалось подтвердить Telegram-профиль' });
  if (String(user.id) !== String(adminId)) return res.status(403).json({ error: 'Изменять баланс может только администратор' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const targetTelegramId = String(body?.targetTelegramId || '');
  const newBalance = Number(body?.balance);
  if (!/^\d{1,20}$/.test(targetTelegramId) || !Number.isSafeInteger(newBalance) || newBalance < 0 || newBalance > 1000000000) {
    return res.status(400).json({ error: 'Укажи Telegram ID игрока и баланс от 0 до 1 000 000 000' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: target, error: targetError } = await supabase.from('profiles')
    .select('id, telegram_id, display_name, username').eq('telegram_id', targetTelegramId).maybeSingle();
  if (targetError) return res.status(500).json({ error: 'Не удалось найти игрока' });
  if (!target) return res.status(404).json({ error: 'Игрок не найден. Попроси его один раз открыть Mini App' });

  const { data: current, error: currentError } = await supabase.from('balances')
    .select('balance').eq('user_id', target.id).maybeSingle();
  if (currentError) return res.status(500).json({ error: 'Не удалось прочитать баланс игрока' });
  if (!current) return res.status(404).json({ error: 'У игрока ещё не создан баланс' });

  const oldBalance = Number(current.balance);
  const delta = newBalance - oldBalance;
  const { data: updated, error: updateError } = await supabase.from('balances')
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq('user_id', target.id).eq('balance', current.balance).select('balance').maybeSingle();
  if (updateError) return res.status(500).json({ error: 'Не удалось изменить баланс' });
  if (!updated) return res.status(409).json({ error: 'Баланс изменился одновременно. Обнови страницу и попробуй снова' });

  const { error: txError } = await supabase.from('transactions').insert({
    user_id: target.id,
    amount: delta,
    type: 'admin_adjustment',
    note: `Баланс изменён администратором: ${oldBalance} → ${newBalance}`,
    admin_telegram_id: user.id
  });
  if (txError) {
    return res.status(500).json({ error: 'Баланс изменён, но запись в журнал не сохранилась. Проверь таблицу transactions' });
  }

  return res.status(200).json({
    ok: true, telegram_id: target.telegram_id,
    name: target.display_name || target.username || 'Игрок',
    previousBalance: oldBalance, balance: newBalance
  });
}
