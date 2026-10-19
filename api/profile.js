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
  if (!authDate || Math.abs(Date.now() / 1000 - authDate) > 300) {
    return null;
  }

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const a = Buffer.from(calculatedHash, 'hex');
  const b = Buffer.from(hash, 'hex');

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    return JSON.parse(params.get('user') || 'null');
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const initData = req.headers['x-telegram-init-data'];

  if (!botToken || !process.env.SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server configuration missing' });
  }
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
  const user = verifyTelegramInitData(initData, botToken);

  if (!user || !user.id) {
    return res.status(401).json({ error: 'Telegram authentication failed' });
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, telegram_id, username, display_name')
    .eq('telegram_id', user.id)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: 'Database query failed' });
  }

  if (!profile) {
    return res.status(404).json({
      error: 'Profile not found',
      telegram_id: user.id
    });
  }

  const { data: balance, error: balanceError } = await supabase
    .from('balances')
    .select('balance')
    .eq('user_id', profile.id)
    .maybeSingle();

  if (balanceError) {
    return res.status(500).json({ error: 'Balance query failed' });
  }

  return res.status(200).json({
    profile,
    balance: balance?.balance ?? 0
  });
}
