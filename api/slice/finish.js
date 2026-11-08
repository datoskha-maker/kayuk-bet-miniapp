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
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); } }
  const sessionId = String(body?.sessionId || '');
  const score = Number(body?.score);
  const maxCombo = Number(body?.maxCombo || 0);
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !Number.isSafeInteger(score) || score < 0 || !Number.isSafeInteger(maxCombo) || maxCombo < 0 || maxCombo > 1000) {
    return res.status(400).json({ error: 'Некорректный результат игры.' });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('id').eq('telegram_id', telegramUser.id).maybeSingle();
  if (profileError || !profile) return res.status(profileError ? 500 : 404).json({ error: 'Player profile not found.' });
  const { data, error } = await supabase.rpc('finish_kayuk_slice_game', {
    p_session_id: sessionId, p_user_id: profile.id, p_score: score, p_max_combo: maxCombo
  });
  if (error) {
    console.error('KAYUK SLICE finish failed:', error.message);
    const message = error.message || '';
    if (message.includes('already') || message.includes('expired') || message.includes('Score exceeds') || message.includes('Invalid')) {
      return res.status(400).json({ error: 'Результат не принят: сессия завершена, истекла или счёт превышает допустимый предел.' });
    }
    return res.status(500).json({ error: 'Не удалось зачислить результат. Обратись к администратору.' });
  }
  return res.status(200).json(data);
}
