import { createClient } from '@supabase/supabase-js';
import { verifyTelegramInitData } from './_lib/telegram.js';

function send(res, status, body) { return res.status(status).json(body); }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const { TELEGRAM_BOT_TOKEN: botToken, SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (!botToken || !url || !key) return send(res, 500, { error: 'Server configuration missing' });

  const telegramUser = verifyTelegramInitData(req.headers['x-telegram-init-data'], botToken);
  if (!telegramUser?.id) return send(res, 401, { error: 'Telegram authentication failed. Reopen the Mini App.' });

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('id,telegram_id,username,display_name')
    .eq('telegram_id', telegramUser.id).maybeSingle();
  if (profileError) return send(res, 500, { error: 'Не удалось загрузить профиль игрока' });
  if (!profile) return send(res, 404, { error: 'Профиль не найден. Открой КАЮК BET и повтори вход.' });

  if (req.method === 'GET') {
    const roomId = String(req.query?.room_id || '');
    if (roomId) {
      const { data: room, error } = await supabase.from('poker_rooms').select('*').eq('id', roomId).maybeSingle();
      if (error) return send(res, 500, { error: 'Не удалось загрузить комнату' });
      if (!room) return send(res, 404, { error: 'Комната не найдена' });
      const { data: seats, error: seatsError } = await supabase.from('poker_room_players')
        .select('id,user_id,seat,joined_at').eq('room_id', room.id).order('seat');
      if (seatsError) return send(res, 500, { error: 'Не удалось загрузить игроков' });
      const ids = (seats || []).map(s => s.user_id);
      const { data: players, error: playersError } = ids.length
        ? await supabase.from('profiles').select('id,username,display_name').in('id', ids)
        : { data: [], error: null };
      if (playersError) return send(res, 500, { error: 'Не удалось загрузить имена игроков' });
      return send(res, 200, { room, players: (seats || []).map(s => {
        const p = (players || []).find(x => x.id === s.user_id);
        return { ...s, name: p?.display_name || p?.username || 'Игрок', is_me: s.user_id === profile.id };
      }), me: profile.id });
    }

    const { data: rooms, error } = await supabase.from('poker_rooms').select('*')
      .in('status', ['waiting','starting']).order('created_at', { ascending: false }).limit(40);
    if (error) return send(res, 500, { error: 'Не удалось загрузить список столов' });
    const ids = (rooms || []).map(r => r.id);
    const { data: seats, error: seatsError } = ids.length
      ? await supabase.from('poker_room_players').select('room_id,user_id,seat').in('room_id', ids).order('seat')
      : { data: [], error: null };
    if (seatsError) return send(res, 500, { error: 'Не удалось загрузить участников столов' });
    const userIds = [...new Set((seats || []).map(s => s.user_id))];
    const { data: players, error: playersError } = userIds.length
      ? await supabase.from('profiles').select('id,username,display_name').in('id', userIds)
      : { data: [], error: null };
    if (playersError) return send(res, 500, { error: 'Не удалось загрузить игроков' });
    return send(res, 200, {
      rooms: (rooms || []).map(room => {
        const members = (seats || []).filter(s => s.room_id === room.id);
        return { ...room, players: members.map(s => {
          const p = (players || []).find(x => x.id === s.user_id);
          return { id: s.user_id, seat: s.seat, name: p?.display_name || p?.username || 'Игрок' };
        }), player_count: members.length, is_member: members.some(s => s.user_id === profile.id) };
      }),
      me: profile.id
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return send(res, 400, { error: 'Некорректный запрос' });

  let result;
  if (body.action === 'create') {
    const capacity = Number(body.capacity);
    const title = String(body.title || 'Стол друзей').trim();
    if (!Number.isInteger(capacity) || capacity < 2 || capacity > 6) return send(res, 400, { error: 'Выбери от 2 до 6 игроков' });
    const { data, error } = await supabase.rpc('poker_create_room', {
      p_user_id: profile.id, p_title: title, p_capacity: capacity
    });
    result = { data, error };
  } else if (body.action === 'join') {
    const code = String(body.code || '').trim().toUpperCase();
    if (!/^[A-F0-9]{6}$/.test(code)) return send(res, 400, { error: 'Проверь код комнаты' });
    const { data, error } = await supabase.rpc('poker_join_room', { p_user_id: profile.id, p_code: code });
    result = { data, error };
  } else if (body.action === 'leave') {
    const roomId = String(body.room_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(roomId)) return send(res, 400, { error: 'Некорректная комната' });
    const { data, error } = await supabase.rpc('poker_leave_room', { p_user_id: profile.id, p_room_id: roomId });
    result = { data, error };
  } else {
    return send(res, 400, { error: 'Неизвестное действие' });
  }

  if (result.error) {
    const message = String(result.error.message || 'Poker action failed');
    console.warn('[poker]', result.error.code, message);
    return send(res, /не найден|уже находишься|нет свободных мест|уже запускается|нельзя покинуть|не находишься|должно быть/i.test(message) ? 409 : 500, { error: message });
  }
  return send(res, 200, { ok: true, ...result.data });
}
