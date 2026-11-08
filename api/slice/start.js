import { createClient } from '@supabase/supabase-js';
import { verifyTelegramInitData } from '../_lib/telegram.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { TELEGRAM_BOT_TOKEN: botToken, SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (!botToken || !url || !key) return res.status(500).json({ error: 'Server configuration missing' });
  const telegramUser = verifyTelegramInitData(req.headers['x-telegram-init-data'], botToken);
  if (!telegramUser?.id) return res.status(401).json({ error: 'Telegram authentication failed. Reopen the Mini App.' });
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('id').eq('telegram_id', telegramUser.id).maybeSingle();
  if (profileError || !profile) return res.status(profileError ? 500 : 404).json({ error: 'Player profile not found. Open the main app first.' });
  const { data: session, error } = await supabase
    .from('slice_game_sessions').insert({ user_id: profile.id })
    .select('id, started_at, expires_at').single();
  if (error) {
    console.error('KAYUK SLICE session start failed:', error.message);
    return res.status(500).json({ error: 'Не удалось начать игру. Попробуй ещё раз.' });
  }
  return res.status(200).json({ sessionId: session.id, startedAt: session.started_at, expiresAt: session.expires_at, durationSeconds: 60 });
}
