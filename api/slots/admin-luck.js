import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

function verifyTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return null;
  params.delete('hash');
  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > 86400 || authDate > now + 60) return null;
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest();
  const receivedHash = Buffer.from(hash, 'hex');
  if (calculatedHash.length !== receivedHash.length || !crypto.timingSafeEqual(calculatedHash, receivedHash)) return null;
  try { return JSON.parse(params.get('user') || 'null'); } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminId = String(process.env.ADMIN_TELEGRAM_ID || '');
  const user = verifyTelegramInitData(req.headers['x-telegram-init-data'], token);
  if (!user?.id || !adminId || String(user.id) !== adminId) {
    return res.status(404).json({ error: 'Not found' });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Server configuration missing' });
  const db = createClient(url, key, { auth: { persistSession: false } });
  if (req.method === 'GET') {
    const { data, error } = await db.from('slot_admin_settings')
      .select('lucky_mode_enabled').eq('id', true).single();
    if (error) return res.status(500).json({ error: 'Settings unavailable' });
    return res.status(200).json({ enabled: !!data.lucky_mode_enabled });
  }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (typeof body?.enabled !== 'boolean') return res.status(400).json({ error: 'Invalid setting' });
  const { error } = await db.from('slot_admin_settings')
    .update({ lucky_mode_enabled: body.enabled, updated_at: new Date().toISOString() }).eq('id', true);
  if (error) return res.status(500).json({ error: 'Could not update setting' });
  return res.status(200).json({ enabled: body.enabled });
}
