import { createClient } from '@supabase/supabase-js';
import { verifyTelegramInitData } from '../_lib/telegram.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { TELEGRAM_BOT_TOKEN: botToken, SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (!botToken || !url || !key) return res.status(500).json({ error: 'Server configuration missing' });
  const telegramUser = verifyTelegramInitData(req.headers['x-telegram-init-data'], botToken);
  if (!telegramUser?.id) return res.status(401).json({ error: 'Telegram authentication failed. Reopen the Mini App.' });
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: me, error: meError } = await supabase.from('profiles').select('id').eq('telegram_id', telegramUser.id).maybeSingle();
  if (meError || !me) return res.status(meError ? 500 : 404).json({ error: 'Player profile not found.' });
  const scores = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data: page, error } = await supabase.from('slice_game_scores')
      .select('user_id, score, reward, max_combo, created_at')
      .order('score', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.error('KAYUK SLICE leaderboard failed:', error.message);
      return res.status(500).json({ error: 'Не удалось загрузить таблицу рекордов.' });
    }
    const batch = page || [];
    scores.push(...batch);
    if (batch.length < pageSize) break;
  }
  const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id, display_name, username');
  if (profilesError) return res.status(500).json({ error: 'Не удалось загрузить игроков.' });
  const names = new Map((profiles || []).map(p => [p.id, p.display_name || (p.username ? '@' + p.username : 'Игрок')]));
  const byUser = new Map();
  for (const row of scores) {
    const current = byUser.get(row.user_id) || { user_id: row.user_id, name: names.get(row.user_id) || 'Игрок', best_score: 0, games: 0, earned: 0, max_combo: 0 };
    current.games += 1;
    current.earned += Number(row.reward) || 0;
    current.max_combo = Math.max(current.max_combo, Number(row.max_combo) || 0);
    current.best_score = Math.max(current.best_score, Number(row.score) || 0);
    byUser.set(row.user_id, current);
  }
  const players = [...byUser.values()].sort((a, b) => b.best_score - a.best_score || b.earned - a.earned);
  const myRankIndex = players.findIndex(p => String(p.user_id) === String(me.id));
  return res.status(200).json({ players: players.slice(0, 20), myRank: myRankIndex < 0 ? null : myRankIndex + 1 });
}
