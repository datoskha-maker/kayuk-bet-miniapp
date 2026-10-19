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

async function notifyBetOwner(db, betId, status, payout) {
  try {
    const { data: bet } = await db.from('bets').select('id,user_id,event_title,selection,stake').eq('id', betId).maybeSingle();
    if (!bet) return;
    const { data: player } = await db.from('profiles').select('telegram_id,display_name').eq('id', bet.user_id).maybeSingle();
    if (!player?.telegram_id) return;
    const resultText = status === 'won' ? '🎉 СТАВКА ВЫИГРАЛА' : status === 'lost' ? '😬 Ставка проиграла' : '↩️ Ставка возвращена';
    const payoutText = Number(payout) > 0 ? `Начислено: ${Number(payout).toLocaleString('ru-RU')} ₽\n` : '';
    const message = `${resultText} · КАЮК BET\nМатч(и): ${bet.event_title}\nИсход: ${bet.selection}\nСумма ставки: ${Number(bet.stake).toLocaleString('ru-RU')} ₽\n${payoutText}Баланс обновлён. Только виртуальные средства.`;
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: player.telegram_id, text: message, disable_web_page_preview: true }) });
  } catch (error) { console.warn('Settlement notification failed:', error?.message || error); }
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
    const {data: matches,error} = await db.from('manual_matches').select('*').order('start_time',{ascending:false}).limit(1000);
    if (error) return res.status(500).json({error:'Не удалось загрузить матчи'});
    let pendingBets = [];
    if (isAdmin) {
      const {data,error: betError} = await db.from('bets').select('id,user_id,event_title,selection,stake,odds,status,created_at,potential_payout').eq('status','pending').order('created_at',{ascending:true}).limit(1000);
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
    const parsedStart = Date.parse(body.start_time);
    const markets=body.markets;
    if (!league || !home_team || !away_team || home_team===away_team || !Number.isFinite(parsedStart) || !markets || typeof markets!=='object') return res.status(400).json({error:'Заполни лигу, команды, дату и коэффициенты'});
    const start_time=new Date(parsedStart).toISOString();
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
    if (body.id) {
      const existing=await db.from('manual_matches').select('result').eq('id',body.id).maybeSingle();
      if(existing.error || !existing.data) return res.status(404).json({error:'Матч не найден'});
      if(existing.data.result) return res.status(409).json({error:'Итог уже рассчитан. Матч нельзя редактировать.'});
      query=await db.from('manual_matches').update(row).eq('id',body.id).select('*').single();
    }
    else query=await db.from('manual_matches').insert(row).select('*').single();
    if (query.error) return res.status(500).json({error:'Не удалось сохранить матч'});
    return res.status(200).json({ok:true,match:query.data});
  }
  if (action==='toggleMatch') {
    if (!body.id || !['NS','CLOSED'].includes(body.status)) return res.status(400).json({error:'Некорректный статус матча'});
    const existing=await db.from('manual_matches').select('result').eq('id',body.id).maybeSingle();
    if(existing.error || !existing.data) return res.status(404).json({error:'Матч не найден'});
    if(existing.data.result && body.status==='NS') return res.status(409).json({error:'Рассчитанный матч нельзя открыть повторно'});
    const {data,error}=await db.from('manual_matches').update({status:body.status,updated_at:new Date().toISOString()}).eq('id',body.id).select('*').single();
    if (error) return res.status(500).json({error:'Не удалось изменить статус матча'});
    return res.status(200).json({ok:true,match:data});
  }

  if (action==='settleMatch') {
    if (!body.id || !['П1','X','П2'].includes(body.result)) return res.status(400).json({error:'Выбери итоговый исход матча'});
    const {data: target,error: targetError}=await db.from('manual_matches').select('*').eq('id',body.id).maybeSingle();
    if(targetError || !target) return res.status(404).json({error:'Матч не найден'});
    if(target.result && target.result!==body.result) return res.status(409).json({error:'Для этого матча уже установлен другой итог'});
    if(!target.result) {
      const {data: updated,error: updateError}=await db.from('manual_matches')
        .update({result:body.result,status:'CLOSED',updated_at:new Date().toISOString()})
        .eq('id',body.id).is('result',null).select('*').maybeSingle();
      if(updateError) return res.status(500).json({error:'Не удалось сохранить итог матча'});
      if(!updated) {
        const retry=await db.from('manual_matches').select('*').eq('id',body.id).single();
        if(retry.error || retry.data.result!==body.result) return res.status(409).json({error:'Итог матча уже изменён другим запросом'});
      }
    }
    const {data: allMatches,error: matchesError}=await db.from('manual_matches').select('home_team,away_team,result');
    if(matchesError) return res.status(500).json({error:'Не удалось загрузить результаты матчей'});
    const resultByTitle=new Map((allMatches||[]).filter(m=>m.result).map(m=>[m.home_team+' — '+m.away_team,m.result]));
    const {data: pending,error: pendingError}=await db.from('bets')
      .select('id,user_id,event_title,selection,status,stake,potential_payout').eq('status','pending').order('created_at',{ascending:true}).limit(1000);
    if(pendingError) return res.status(500).json({error:'Итог сохранён, но не удалось загрузить ставки для расчёта. Повтори расчёт.'});
    let won=0,lost=0,waiting=0,skipped=0;
    for(const bet of pending||[]) {
      const titles=String(bet.event_title||'').split(' + ');
      const picks=String(bet.selection||'').split(' + ');
      if(!titles.length || titles.length!==picks.length) { skipped++; continue; }
      let hasLost=false,allResolved=true,allWon=true,related=false;
      for(let i=0;i<titles.length;i++) {
        const title=titles[i].trim();
        const parsed=picks[i].trim().match(/^(П1|X|П2) \((.*)\)$/);
        const chosen=parsed?.[1];
        const parsedTitle=parsed?.[2];
        if(title===target.home_team+' — '+target.away_team || parsedTitle===target.home_team+' — '+target.away_team) related=true;
        const finalResult=resultByTitle.get(title);
        if(!finalResult || !chosen) { allResolved=false; allWon=false; continue; }
        if(chosen!==finalResult) { hasLost=true; allWon=false; }
      }
      if(!related) continue;
      if(hasLost) {
        const {data:settlement,error}=await db.rpc('admin_settle_bet',{p_bet_id:bet.id,p_result:'lost',p_admin_telegram_id:user.id});
        if(error) { console.error('settle lost bet failed',bet.id,error.message); skipped++; } else { lost++; await notifyBetOwner(db,bet.id,'lost',settlement?.payout||0); }
      } else if(allResolved && allWon) {
        const {data:settlement,error}=await db.rpc('admin_settle_bet',{p_bet_id:bet.id,p_result:'won',p_admin_telegram_id:user.id});
        if(error) { console.error('settle won bet failed',bet.id,error.message); skipped++; } else { won++; await notifyBetOwner(db,bet.id,'won',settlement?.payout||bet.potential_payout||0); }
      } else waiting++;
    }
    return res.status(200).json({ok:true,matchId:body.id,result:body.result,won,lost,waiting,skipped});
  }

  if (action==='settleBet') {
    if (!body.id || !['won','lost','void'].includes(body.result)) return res.status(400).json({error:'Выбери результат расчёта'});
    const {data,error}=await db.rpc('admin_settle_bet',{p_bet_id:body.id,p_result:body.result,p_admin_telegram_id:user.id});
    if (error) return res.status(400).json({error:error.message==='Bet already settled'?'Эта ставка уже рассчитана':'Не удалось рассчитать ставку. Проверь SQL в Supabase.'});
    await notifyBetOwner(db,body.id,body.result,data?.payout||0);
    return res.status(200).json(data);
  }
  return res.status(400).json({error:'Неизвестное действие администратора'});
}
