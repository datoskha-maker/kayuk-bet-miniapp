import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import pokerHandler from './_lib/poker-handler.js';

function verifyTelegramInitData(initData, botToken) {
  if (!initData) return { user: null, reason: 'missing_init_data' };
  if (!botToken) return { user: null, reason: 'missing_bot_token' };
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { user: null, reason: 'missing_hash' };
  params.delete('hash');

  const authDate = Number(params.get('auth_date'));
  if (!authDate) return { user: null, reason: 'missing_auth_date' };
  if (Math.abs(Date.now() / 1000 - authDate) > 86400) return { user: null, reason: 'auth_date_out_of_range' };

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const a = Buffer.from(calculatedHash, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { user: null, reason: 'hash_mismatch' };

  try {
    const user = JSON.parse(params.get('user') || 'null');
    return user?.id ? { user, reason: null } : { user: null, reason: 'invalid_user' };
  } catch {
    return { user: null, reason: 'invalid_user_json' };
  }
}

export default async function handler(req, res) {
  if (req.query?.scope === 'poker') return pokerHandler(req, res);
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { TELEGRAM_BOT_TOKEN: botToken, SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: serviceKey } = process.env;
  if (!botToken || !supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration missing' });
  }

  const auth = verifyTelegramInitData(req.headers['x-telegram-init-data'], botToken);
  if (!auth.user?.id) {
    console.warn('[profile] Telegram auth rejected:', auth.reason);
    return res.status(401).json({ error: 'Telegram authentication failed. Reopen the Mini App.' });
  }
  const user = auth.user;

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  if (req.query?.scope === 'luna-admin') {
    if (!process.env.ADMIN_TELEGRAM_ID || String(user.id) !== String(process.env.ADMIN_TELEGRAM_ID)) {
      return res.status(403).json({ error: 'Admin access denied' });
    }
    if (req.method !== 'GET') return res.status(405).json({ error: 'Admin monitor is read-only' });
    const [profilesQ, statesQ, balancesQ, inventoriesQ, activitiesQ, ordersQ, cartsQ, placementsQ, financeQ, bankLoansQ] = await Promise.all([
      supabase.from('profiles').select('id,telegram_id,username,display_name').order('created_at',{ascending:false}).limit(500),
      supabase.from('luna_state').select('*'),
      supabase.from('balances').select('user_id,balance'),
      supabase.from('luna_inventory').select('user_id,item_id,purchased_at'),
      supabase.from('luna_activity').select('user_id,event_type,details,created_at').order('created_at',{ascending:false}).limit(150),
      supabase.from('luna_lavka_orders').select('user_id,id,status,total,created_at,delivered_at,luna_lavka_order_items(title,quantity,item_id)').order('created_at',{ascending:false}).limit(100),
      supabase.from('luna_lavka_cart').select('user_id,item_id,quantity,updated_at'),
      supabase.from('luna_placements').select('user_id,item_id,x,y,scale,updated_at'),
      supabase.from('luna_financial_totals').select('user_id,credited_total,debited_total,credit_operations,debit_operations'),
      supabase.from('bank_loans').select('id,user_id,principal,total_due,due_at,status,late_days_applied,created_at,closed_at,defaulted_at').order('created_at',{ascending:false}).limit(1000)
    ]);
    const err=[profilesQ,statesQ,balancesQ,inventoriesQ,activitiesQ,ordersQ,cartsQ,placementsQ,financeQ,bankLoansQ].find(q=>q.error);
    if(err)return res.status(500).json({error:'Admin monitor data query failed'});
    const profiles=profilesQ.data||[], states=statesQ.data||[], balances=balancesQ.data||[], inventories=inventoriesQ.data||[], activities=activitiesQ.data||[], orders=ordersQ.data||[], carts=cartsQ.data||[], placements=placementsQ.data||[], finance=financeQ.data||[];
    const bankLoans=(bankLoansQ.data||[]).map(l=>{const lateDays=Math.max(0,Math.floor((Date.now()-new Date(l.due_at).getTime())/86400000));const unappliedLateDays=Math.max(0,lateDays-Number(l.late_days_applied||0));return {...l,lateDays,currentDue:Math.ceil(Number(l.total_due||0)*Math.pow(1.1,unappliedLateDays))};});
    const players=profiles.map(p=>({
      id:p.id,telegram_id:p.telegram_id,username:p.username,name:p.display_name||p.username||'Игрок',
      balance:Number(balances.find(b=>b.user_id===p.id)?.balance||0),
      finance:(()=>{const f=finance.find(x=>x.user_id===p.id)||{};return {credited:Number(f.credited_total||0),debited:Number(f.debited_total||0),net:Number(f.credited_total||0)-Number(f.debited_total||0),creditOperations:Number(f.credit_operations||0),debitOperations:Number(f.debit_operations||0)}})(),
      state:states.find(s=>s.user_id===p.id)||null,
      inventory:inventories.filter(i=>i.user_id===p.id),
      activity:activities.filter(a=>a.user_id===p.id).slice(0,20),
      orders:orders.filter(o=>o.user_id===p.id).slice(0,10),
      cart:carts.filter(x=>x.user_id===p.id),
      placements:placements.filter(x=>x.user_id===p.id)
    }));
    const financeTotals=players.reduce((a,p)=>({credited:a.credited+p.finance.credited,debited:a.debited+p.finance.debited,net:a.net+p.finance.net,creditOperations:a.creditOperations+p.finance.creditOperations,debitOperations:a.debitOperations+p.finance.debitOperations}),{credited:0,debited:0,net:0,creditOperations:0,debitOperations:0});
    const bankRegistry=bankLoans.map(l=>{const p=profiles.find(x=>x.id===l.user_id);return {...l,playerName:p?.display_name||p?.username||'Игрок',username:p?.username||null,telegram_id:p?.telegram_id??null};});
    const activeLoans=bankRegistry.filter(l=>l.status==='active');
    const bankTotals={loans:bankRegistry.length,activeLoans:activeLoans.length,issued:bankRegistry.reduce((s,l)=>s+Number(l.principal||0),0),outstanding:activeLoans.reduce((s,l)=>s+Number(l.currentDue||0),0),overdue:activeLoans.filter(l=>Number(l.lateDays||0)>0).length};
    return res.status(200).json({isAdmin:true,players,activity:activities,orders:orders.slice(0,50),financeTotals,bankRegistry,bankTotals,updatedAt:new Date().toISOString()});
  }
  let { data: profile, error } = await supabase
    .from('profiles')
    .select('id, telegram_id, username, display_name')
    .eq('telegram_id', user.id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'Database profile query failed' });

  if (!profile) {
    const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Игрок';
    const inserted = await supabase.from('profiles').insert({
      telegram_id: user.id,
      username: user.username || null,
      display_name: displayName
    }).select('id, telegram_id, username, display_name').single();

    if (inserted.error) {
      // A parallel first request may have created the profile already.
      const retry = await supabase.from('profiles')
        .select('id, telegram_id, username, display_name')
        .eq('telegram_id', user.id).maybeSingle();
      if (retry.error || !retry.data) return res.status(500).json({ error: 'Could not create player profile' });
      profile = retry.data;
    } else {
      profile = inserted.data;
    }
  }

  let { data: balanceRow, error: balanceError } = await supabase
    .from('balances').select('balance').eq('user_id', profile.id).maybeSingle();
  if (balanceError) return res.status(500).json({ error: 'Balance query failed' });

  if (!balanceRow) {
    const insertedBalance = await supabase.from('balances')
      .insert({ user_id: profile.id, balance: 0 })
      .select('balance').single();
    if (insertedBalance.error) {
      const retry = await supabase.from('balances').select('balance').eq('user_id', profile.id).maybeSingle();
      if (retry.error || !retry.data) return res.status(500).json({ error: 'Could not initialize player balance' });
      balanceRow = retry.data;
    } else {
      balanceRow = insertedBalance.data;
    }
  }


  // Luna uses this existing profile function to stay within the Vercel Hobby function limit.
  if (req.method === 'POST' || req.query?.scope === 'luna') {
    const lunaTick = await supabase.rpc('luna_tick_user', { p_user_id: profile.id });
    if (lunaTick.error) return res.status(500).json({ error: 'Could not update Luna status' });
    if (req.method === 'GET') {
      const orderTick = await supabase.rpc('luna_lavka_tick_orders', { p_user_id: profile.id });
      if (orderTick.error) return res.status(500).json({ error: 'Could not update delivery status' });
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const [stateQ, catalogQ, inventoryQ, giftQ, cardQ, loanQ, weeklyLoansQ, activityQ, placementsQ, cartQ, ordersQ] = await Promise.all([
        supabase.from('luna_state').select('*').eq('user_id', profile.id).maybeSingle(),
        supabase.from('luna_catalog').select('item_id,category,title,description,price,icon,effect,image_url,sort_order').eq('active', true).order('sort_order'),
        supabase.from('luna_inventory').select('item_id,purchased_at').eq('user_id', profile.id),
        supabase.from('luna_daily_gifts').select('amount,claimed_at').eq('user_id', profile.id).eq('reward_date', new Date().toISOString().slice(0,10)).maybeSingle(),
        supabase.from('bank_cards').select('account_number,design,gold_purchased').eq('user_id', profile.id).maybeSingle(),
        supabase.from('bank_loans').select('id,principal,total_due,due_at,created_at,late_days_applied').eq('user_id', profile.id).eq('status','active').maybeSingle(),
        supabase.from('bank_loans').select('principal,created_at').eq('user_id', profile.id).gte('created_at', weekAgo),
        supabase.from('luna_activity').select('event_type,details,created_at').eq('user_id', profile.id).order('created_at',{ascending:false}).limit(50),
        supabase.from('luna_placements').select('id,item_id,x,y,scale,updated_at').eq('user_id', profile.id),
        supabase.from('luna_lavka_cart').select('item_id,quantity,updated_at').eq('user_id', profile.id),
        supabase.from('luna_lavka_orders').select('id,status,address,latitude,longitude,total,created_at,delivered_at,luna_lavka_order_items(item_id,title,unit_price,quantity,effect)').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(15)
      ]);
      const queryError = [stateQ,catalogQ,inventoryQ,giftQ,cardQ,loanQ,weeklyLoansQ,activityQ,placementsQ,cartQ,ordersQ].find(q => q.error);
      if (queryError) return res.status(500).json({ error: 'Could not load Luna data' });
      let state = stateQ.data;
      if (!state) {
        const created = await supabase.from('luna_state').insert({ user_id: profile.id }).select('*').single();
        if (created.error) return res.status(500).json({ error: 'Could not initialize Luna state' });
        state = created.data;
      }
      let loan = loanQ.data;
      if (loan) {
        const lateDays = Math.max(0, Math.floor((Date.now() - new Date(loan.due_at).getTime()) / 86400000));
        const unappliedLateDays = Math.max(0, lateDays - Number(loan.late_days_applied || 0));
        loan = { ...loan, lateDays, currentDue: Math.ceil(Number(loan.total_due) * Math.pow(1.1, unappliedLateDays)) };
      }
      const balance = Number(balanceRow?.balance ?? 0);
      const weeklyLimit = balance < 1000000 ? 100000 : 200000;
      const weeklyUsed = (weeklyLoansQ.data || []).reduce((sum, item) => sum + Number(item.principal || 0), 0);
      return res.status(200).json({
        profile,
        balance,
        state,
        isAdmin: Boolean(process.env.ADMIN_TELEGRAM_ID && String(user.id) === String(process.env.ADMIN_TELEGRAM_ID)),
        catalog: catalogQ.data || [],
        inventory: inventoryQ.data || [],
        dailyGift: giftQ.data || null,
        activity: activityQ.data || [],
        placements: placementsQ.data || [],
        cart: cartQ.data || [],
        orders: ordersQ.data || [],
        loan,
        bank: {
          card: cardQ.data || null,
          loan,
          weeklyLimit,
          weeklyUsed,
          weeklyRemaining: Math.max(0, weeklyLimit - weeklyUsed),
          blocked: balance < 0
        }
      });
    }

    const body = req.body || {};
    let actionResult;
    if (body.action === 'activity') {
      const allowedEvents = ['phone_open','music_play','music_pause','camera_snap','game_action'];
      if (!allowedEvents.includes(body.eventType)) return res.status(400).json({error:'Invalid activity event'});
      const details = body.details && typeof body.details === 'object' && !Array.isArray(body.details) ? body.details : {};
      const saved = await supabase.from('luna_activity').insert({
        user_id: profile.id,
        event_type: body.eventType,
        details
      }).select('event_type,details,created_at').single();
      if (saved.error) return res.status(500).json({error:'Could not save Luna activity'});
      return res.status(200).json({ok:true,activity:saved.data});
    } else if (body.action === 'gift') {
      actionResult = await supabase.rpc('luna_claim_daily_gift', { p_user_id: profile.id });
    } else if (body.action === 'purchase' && typeof body.itemId === 'string') {
      actionResult = await supabase.rpc('luna_purchase_item', { p_user_id: profile.id, p_item_id: body.itemId });
    } else if (body.action === 'cafe_buy' && typeof body.itemId === 'string') {
      actionResult = await supabase.rpc('luna_buy_cafe_item', { p_user_id: profile.id, p_item_id: body.itemId });
    } else if (body.action === 'consume' && typeof body.itemId === 'string') {
      actionResult = await supabase.rpc('luna_buy_consumable', { p_user_id: profile.id, p_item_id: body.itemId });
    } else if (body.action === 'lavka_cart_set' && typeof body.itemId === 'string') {
      const quantity = Number(body.quantity);
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 20) return res.status(400).json({ error: 'Количество должно быть от 0 до 20' });
      actionResult = await supabase.rpc('luna_lavka_set_cart_item', { p_user_id: profile.id, p_item_id: body.itemId, p_quantity: quantity });
    } else if (body.action === 'lavka_checkout') {
      if (typeof body.orderKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.orderKey)) return res.status(400).json({ error: 'Некорректный номер заказа' });
      actionResult = await supabase.rpc('luna_lavka_checkout', { p_user_id: profile.id, p_idempotency_key: body.orderKey });
    } else if (body.action === 'lavka_order_tick') {
      actionResult = await supabase.rpc('luna_lavka_tick_orders', { p_user_id: profile.id });
    } else if (body.action === 'loan_quote') {
      actionResult = await supabase.rpc('bank_loan_quote', { p_user_id: profile.id, p_amount: Number(body.amount) });
    } else if (body.action === 'loan') {
      actionResult = await supabase.rpc('bank_take_loan', { p_user_id: profile.id, p_amount: Number(body.amount) });
    } else if (body.action === 'repay') {
      actionResult = await supabase.rpc('bank_repay_loan', { p_user_id: profile.id });
    } else if (body.action === 'card_gold') {
      actionResult = await supabase.rpc('bank_buy_gold_card', { p_user_id: profile.id });
    } else if (body.action === 'card' && ['midnight','barcelona','gold'].includes(body.card)) {
      const current = await supabase.from('luna_state').select('equipped').eq('user_id', profile.id).maybeSingle();
      if (current.error) return res.status(500).json({ error: 'Could not load Luna settings' });
      const equipped = { ...(current.data?.equipped || {}), card: body.card };
      const saved = await supabase.from('luna_state').upsert({ user_id: profile.id, equipped, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select('equipped').single();
      if (saved.error) return res.status(500).json({ error: 'Could not save card design' });
      return res.status(200).json({ ok: true, equipped: saved.data.equipped });
    } else if (body.action === 'placement_save' && typeof body.itemId === 'string' && body.position && typeof body.position === 'object') {
      const owned = await supabase.from('luna_inventory').select('item_id').eq('user_id', profile.id).eq('item_id', body.itemId).maybeSingle();
      if (owned.error || !owned.data) return res.status(400).json({ error: 'Item is not owned' });
      const item = await supabase.from('luna_catalog').select('category').eq('item_id', body.itemId).maybeSingle();
      if (item.error || !item.data || !['scratchers','toys','interior'].includes(item.data.category)) return res.status(400).json({ error: 'This item cannot be placed in the house' });
      const x = Number(body.position.x), y = Number(body.position.y), scale = Number(body.position.scale);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(scale) || x < 0 || x > 100 || y < 0 || y > 100 || scale < 0.25 || scale > 3) return res.status(400).json({ error: 'Invalid placement position' });
      const saved = await supabase.from('luna_placements').upsert({ user_id: profile.id, item_id: body.itemId, x, y, scale, updated_at: new Date().toISOString() }, { onConflict: 'user_id,item_id' }).select('id,item_id,x,y,scale,updated_at').single();
      if (saved.error) return res.status(500).json({ error: 'Could not save item placement' });
      return res.status(200).json({ ok: true, placement: saved.data });
    } else if (body.action === 'equip' && typeof body.slot === 'string' && typeof body.itemId === 'string') {
      const allowed = ['stadium','house','food','bed','scratchers','toys','interior'];
      if (!allowed.includes(body.slot)) return res.status(400).json({ error: 'Invalid equipment slot' });
      const owned = await supabase.from('luna_inventory').select('item_id').eq('user_id', profile.id).eq('item_id', body.itemId).maybeSingle();
      if (owned.error || !owned.data) return res.status(400).json({ error: 'Item is not owned' });
      const current = await supabase.from('luna_state').select('equipped').eq('user_id', profile.id).maybeSingle();
      if (current.error) return res.status(500).json({ error: 'Could not load Luna settings' });
      const equipped = { ...(current.data?.equipped || {}), [body.slot]: body.itemId };
      const saved = await supabase.from('luna_state').upsert({ user_id: profile.id, equipped, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select('equipped').single();
      if (saved.error) return res.status(500).json({ error: 'Could not save equipped item' });
      return res.status(200).json({ ok: true, equipped: saved.data.equipped });
    } else if (body.action === 'unequip' && typeof body.slot === 'string') {
      const allowed = ['stadium','house','food','bed','scratchers','toys','interior'];
      if (!allowed.includes(body.slot)) return res.status(400).json({ error: 'Invalid equipment slot' });
      const current = await supabase.from('luna_state').select('equipped').eq('user_id', profile.id).maybeSingle();
      if (current.error) return res.status(500).json({ error: 'Could not load Luna settings' });
      const equipped = { ...(current.data?.equipped || {}) };
      delete equipped[body.slot];
      const saved = await supabase.from('luna_state').upsert({ user_id: profile.id, equipped, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select('equipped').single();
      if (saved.error) return res.status(500).json({ error: 'Could not remove equipped item' });
      return res.status(200).json({ ok: true, equipped: saved.data.equipped });
    } else if (body.action === 'care' && body.state && typeof body.state === 'object') {
      const fields = ['hunger','thirst','mood','energy','comfort'];
      const update = { user_id: profile.id, updated_at: new Date().toISOString() };
      for (const field of fields) {
        const value = Number(body.state[field]);
        if (!Number.isInteger(value) || value < 0 || value > 100) return res.status(400).json({ error: 'Invalid care value' });
        update[field] = value;
      }
      const saved = await supabase.from('luna_state').upsert(update, { onConflict: 'user_id' }).select('*').single();
      if (saved.error) return res.status(500).json({ error: 'Could not save Luna state' });
      return res.status(200).json({ ok: true, state: saved.data });
    } else {
      return res.status(400).json({ error: 'Unknown Luna action' });
    }
    if (actionResult.error) {
      const message = String(actionResult.error.message || 'Action failed');
      const status = /Insufficient balance|Недостаточно средств|кафе|товара нет в меню|already|active loan|No active loan|between 1000|Weekly credit limit|negative balance|Enter a loan amount|gold card/i.test(message) ? 400 : 500;
      return res.status(status).json({ error: message });
    }
    return res.status(200).json(actionResult.data);
  }

  const { data: bets, error: betsError } = await supabase
    .from('bets')
    .select('id, event_title, selection, stake, odds, status, potential_payout, created_at')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (betsError) return res.status(500).json({ error: 'Bet history query failed' });

  const { data: balances, error: leadersError } = await supabase
    .from('balances').select('user_id, balance').order('balance', { ascending: false }).limit(20);
  if (leadersError) return res.status(500).json({ error: 'Leaderboard query failed' });

  const userIds = (balances || []).map(row => row.user_id);
  let leaderProfiles = [];
  if (userIds.length) {
    const { data, error: leaderProfilesError } = await supabase
      .from('profiles').select('id, display_name, username').in('id', userIds);
    if (leaderProfilesError) return res.status(500).json({ error: 'Leaderboard profile query failed' });
    leaderProfiles = data || [];
  }


  const { data: allBets, error: allBetsError } = await supabase.from('bets').select('user_id, stake, odds, status, potential_payout').order('created_at', { ascending: false }).limit(5000);
  if (allBetsError) return res.status(500).json({ error: 'Leaderboard statistics query failed' });
  const statsByUser = new Map();
  for (const bet of allBets || []) {
    const stat = statsByUser.get(bet.user_id) || { bets: 0, won: 0, lost: 0, pending: 0, profit: 0 };
    stat.bets++;
    if (bet.status === 'won') { stat.won++; stat.profit += Number(bet.potential_payout || Math.round(Number(bet.stake) * Number(bet.odds))); stat.profit -= Number(bet.stake) || 0; }
    else if (bet.status === 'lost') { stat.lost++; stat.profit -= Number(bet.stake) || 0; }
    else if (bet.status === 'pending') stat.pending++;
    statsByUser.set(bet.user_id, stat);
  }
  const cash = (allBets || []).reduce((acc, bet) => {
    acc.totalBets++; acc.turnover += Number(bet.stake) || 0;
    if (bet.status === 'won') acc.payouts += Number(bet.potential_payout || Math.round(Number(bet.stake) * Number(bet.odds))) || 0;
    else if (bet.status === 'void') acc.payouts += Number(bet.stake) || 0;
    return acc;
  }, { totalBets: 0, turnover: 0, payouts: 0 });
  const leaders = (balances || []).map(row => {
    const p = leaderProfiles.find(item => item.id === row.user_id);
    const stats = statsByUser.get(row.user_id) || { bets: 0, won: 0, lost: 0, pending: 0, profit: 0 }; return { name: p?.display_name || p?.username || 'Игрок', balance: row.balance, user_id: row.user_id, ...stats, winRate: stats.won + stats.lost ? Math.round(stats.won / (stats.won + stats.lost) * 100) : 0 };
  }).sort((a, b) => b.balance - a.balance);

  const isAdmin = Boolean(process.env.ADMIN_TELEGRAM_ID && String(user.id) === String(process.env.ADMIN_TELEGRAM_ID));
  let adminPlayers = [];
  if (isAdmin) {
    const { data: allBalances, error: allBalancesError } = await supabase
      .from('balances').select('user_id, balance').order('balance', { ascending: false }).limit(500);
    if (allBalancesError) return res.status(500).json({ error: 'Admin player list query failed' });
    const allIds = (allBalances || []).map(row => row.user_id);
    let allProfiles = [];
    if (allIds.length) {
      const { data, error: allProfilesError } = await supabase
        .from('profiles').select('id, telegram_id, display_name, username').in('id', allIds);
      if (allProfilesError) return res.status(500).json({ error: 'Admin profile list query failed' });
      allProfiles = data || [];
    }
    adminPlayers = (allBalances || []).map(row => {
      const p = allProfiles.find(item => item.id === row.user_id);
      return { telegram_id: p?.telegram_id, name: p?.display_name || p?.username || 'Игрок', username: p?.username || null, balance: row.balance };
    }).filter(p => p.telegram_id !== undefined);
  }

  return res.status(200).json({
    profile,
    isAdmin,
    balance: balanceRow?.balance ?? 0,
    history: bets || [],
    leaders,
    adminPlayers,
    cash,
    playerStats: statsByUser.get(profile.id) || { bets: 0, won: 0, lost: 0, pending: 0, profit: 0 }
  });
}
