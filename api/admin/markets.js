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
  const check = [...params.entries()].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256','WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256',secret).update(check).digest('hex');
  const a = Buffer.from(expected,'hex'), b = Buffer.from(hash,'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return null;
  try { return JSON.parse(params.get('user') || 'null'); } catch { return null; }
}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  const { TELEGRAM_BOT_TOKEN: token, SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, ADMIN_TELEGRAM_ID: adminId } = process.env;
  if (!token || !url || !key || !adminId) return res.status(500).json({error:'Server configuration missing: check ADMIN_TELEGRAM_ID and Supabase variables'});
  const user = verifyTelegramInitData(req.headers['x-telegram-init-data'],token);
  if (!user?.id) return res.status(401).json({error:'Telegram authentication failed. Reopen the Mini App.'});
  const isAdmin = String(user.id) === String(adminId);
  const db = createClient(url,key,{auth:{persistSession:false}});

  if (req.method === 'GET') {
    const {data: matches,error} = await db.from('manual_matches').select('*').order('start_time',{ascending:true}).limit(100);
    if (error) return res.status(500).json({error:'Не удалось загрузить матчи'});
    let pendingBets = [];
    if (isAdmin) {
      const {data,error: betError} = await db.from('bets').select('id,user_id,event_title,selection,stake,odds,status,created_at,potential_payout').eq('status','pending').order('created_at',{ascending:true}).limit(100);
      if (betError) return res.status(500).json({error:'Не удалось загрузить ставки для расчёта'});
      pendingBets = data || [];
    }
    return res.status(200).json({matches:matches||[],pendingBets,isAdmin});
  }
  if (req.method !== 'POST') { res.setHeader('Allow','GET, POST'); return res.status(405).json({error:'Method not allowed'}); }
  if (!isAdmin) return res.status(403).json({error:'Нет доступа администратора'});

  let body=req.body;
  if (typeof body==='string') { try { body=JSON.parse(body); } catch { body=null; } }
  const action=String(body?.action||'');
  if (action==='saveMatch') {
    const league=String(body.league||'').trim(), home_team=String(body.home_team||'').trim(), away_team=String(body.away_team||'').trim();
    const start_time=new Date(body.start_time).toISOString();
    const markets=body.markets;
    if (!league || !home_team || !away_team || home_team===away_team || !Number.isFinite(Date.parse(body.start_time)) || !markets || typeof markets!=='object') return res.status(400).json({error:'Заполни лигу, команды, дату и коэффициенты'});
    const clean={};
    for (const k of ['П1','X','П2']) {
      const v=markets[k];
      if (v!=='' && v!==null && v!==undefined) {
        const n=Number(v);
        if (!Number.isFinite(n) || n<1.01 || n>1000) return res.status(400).json({error:'Коэффициенты должны быть от 1.01 до 1000'});
        clean[k]=n;
      }
    }
    if (!Object.keys(clean).length) return res.status(400).json({error:'Добавь хотя бы один коэффициент'});
    const row={league,home_team,away_team,start_time,status:body.status==='CLOSED'?'CLOSED':'NS',markets:clean,created_by:user.id,updated_at:new Date().toISOString()};
    let query;
    if (body.id) query=await db.from('manual_matches').update(row).eq('id',body.id).select('*').single();
    else query=await db.from('manual_matches').insert(row).select('*').single();
    if (query.error) return res.status(500).json({error:'Не удалось сохранить матч'});
    return res.status(200).json({ok:true,match:query.data});
  }
  if (action==='toggleMatch') {
    if (!body.id || !['NS','CLOSED'].includes(body.status)) return res.status(400).json({error:'Некорректный статус матча'});
    const {data,error}=await db.from('manual_matches').update({status:body.status,updated_at:new Date().toISOString()}).eq('id',body.id).select('*').single();
    if (error) return res.status(500).json({error:'Не удалось изменить статус матча'});
    return res.status(200).json({ok:true,match:data});
  }
  if (action==='settleBet') {
    if (!body.id || !['won','lost','void'].includes(body.result)) return res.status(400).json({error:'Выбери результат расчёта'});
    const {data,error}=await db.rpc('admin_settle_bet',{p_bet_id:body.id,p_result:body.result,p_admin_telegram_id:user.id});
    if (error) return res.status(400).json({error:error.message==='Bet already settled'?'Эта ставка уже рассчитана':'Не удалось рассчитать ставку. Проверь SQL в Supabase.'});
    return res.status(200).json(data);
  }
  return res.status(400).json({error:'Неизвестное действие администратора'});
}
