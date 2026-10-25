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
    .digest();

  const receivedHash = Buffer.from(hash, 'hex');
  if (
    calculatedHash.length !== receivedHash.length ||
    !crypto.timingSafeEqual(calculatedHash, receivedHash)
  ) return null;

  try {
    return JSON.parse(params.get('user') || 'null');
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    TELEGRAM_BOT_TOKEN: botToken,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey
  } = process.env;

  if (!botToken || !supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration missing' });
  }

  const telegramUser = verifyTelegramInitData(
    req.headers['x-telegram-init-data'],
    botToken
  );

  if (!telegramUser?.id) {
    return res.status(401).json({
      error: 'Telegram authentication failed. Reopen the Mini App.'
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  }

  const stake = Number(body?.stake);
  if (![10, 20, 30, 50, 100].includes(stake)) {
    return res.status(400).json({ error: 'Invalid stake' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_id', telegramUser.id)
    .maybeSingle();

  if (profileError) {
    console.error('Football slots profile lookup failed:', profileError.message);
    return res.status(500).json({ error: 'Profile lookup failed' });
  }

  if (!profile) {
    return res.status(404).json({
      error: 'Player profile not found. Open the main app first.'
    });
  }

  // The database RPC must atomically debit the stake, determine the result,
  // credit any payout and record the spin. Never calculate payouts in the client.
  const { data, error } = await supabase.rpc('spin_football_slots', {
    p_user_id: profile.id,
    p_stake: stake
  });

  if (error) {
    if (error.message?.includes('Insufficient balance')) {
      return res.status(400).json({ error: 'Недостаточно средств' });
    }
    if (error.message?.includes('Invalid stake')) {
      return res.status(400).json({ error: 'Недопустимая ставка' });
    }

    console.error('Football slots RPC failed:', error.message);
    return res.status(500).json({
      error: 'Не удалось выполнить вращение. Попробуй позже.'
    });
  }

  return res.status(200).json(data);
}
