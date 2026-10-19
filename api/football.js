import { createClient } from '@supabase/supabase-js';

const BASE = 'https://v3.football.api-sports.io';
const LEAGUES = new Set([39, 140, 61, 135, 235]);
const LEAGUE_NAMES = {
  39: 'АПЛ',
  140: 'Ла Лига',
  61: 'Лига 1',
  135: 'Серия А',
  235: 'РПЛ'
};
const DAY = 86400000;

function isoDate(offset = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(Date.now() + offset * DAY));
  const part = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${part.year}-${part.month}-${part.day}`;
}
function stale(value, ms) {
  return !value || Date.now() - new Date(value).getTime() >= ms;
}
async function api(path, key) {
  const response = await fetch(BASE + path, {
    headers: { 'x-apisports-key': key },
    signal: AbortSignal.timeout(12000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors && Object.keys(payload.errors).length) {
    throw new Error('API-Football: ' + (JSON.stringify(payload.errors || payload).slice(0, 300)));
  }
  return Array.isArray(payload.response) ? payload.response : [];
}
function normalizeFixture(f) {
  return {
    id: Number(f.fixture?.id),
    leagueId: Number(f.league?.id),
    league: LEAGUE_NAMES[Number(f.league?.id)] || f.league?.name || 'Футбол',
    time: f.fixture?.date || null,
    status: f.fixture?.status?.short || 'NS',
    elapsed: f.fixture?.status?.elapsed ?? null,
    home: f.teams?.home?.name || 'Хозяева',
    away: f.teams?.away?.name || 'Гости',
    homeScore: f.goals?.home ?? null,
    awayScore: f.goals?.away ?? null
  };
}
function extract1x2(item) {
  const result = { home: null, draw: null, away: null, bookmaker: null, sourceUpdatedAt: null };
  for (const bookmaker of item.bookmakers || []) {
    const market = (bookmaker.bets || []).find(b => /match winner|full.?time result|1x2|winner \(incl/i.test(b.name || ''));
    if (!market) continue;
    const values = market.values || [];
    const find = (...names) => {
      const v = values.find(x => names.includes(String(x.value || '').trim().toLowerCase()));
      const n = Number(v?.odd);
      return Number.isFinite(n) && n >= 1.01 && n <= 1000 ? n : null;
    };
    result.home = find('home', '1');
    result.draw = find('draw', 'x');
    result.away = find('away', '2');
    if (result.home && result.draw && result.away) {
      result.bookmaker = bookmaker.name || null;
      result.sourceUpdatedAt = item.update || null;
      return result;
    }
  }
  return result;
}
function normalizeOdds(items) {
  const map = new Map();
  for (const item of items) {
    const id = Number(item.fixture?.id);
    if (!id) continue;
    const odds = extract1x2(item);
    if (odds.home && odds.draw && odds.away) map.set(id, odds);
  }
  return Object.fromEntries(map);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { API_FOOTBALL_KEY: apiKey, SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey } = process.env;
  if (!apiKey || !url || !serviceKey) {
    return res.status(500).json({ error: 'Не настроены API_FOOTBALL_KEY или параметры Supabase в Vercel.' });
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  let { data: cache, error } = await supabase.from('football_cache').select('*').eq('id', 1).maybeSingle();
  if (error) return res.status(500).json({ error: 'Не удалось прочитать кэш футбольных данных. Проверь таблицу football_cache в Supabase.' });
  if (!cache) {
    const inserted = await supabase.from('football_cache').insert({ id: 1 }).select('*').single();
    if (inserted.error) {
      const retry = await supabase.from('football_cache').select('*').eq('id', 1).maybeSingle();
      if (retry.error || !retry.data) return res.status(500).json({ error: 'Не удалось инициализировать кэш футбольных данных.' });
      cache = retry.data;
    } else cache = inserted.data;
  }

  let fixtures = Array.isArray(cache.fixtures) ? cache.fixtures : [];
  let odds = cache.odds && typeof cache.odds === 'object' ? cache.odds : {};
  let live = Array.isArray(cache.live) ? cache.live : [];
  const updates = {};
  const errors = [];

  try {
    if (stale(cache.fixtures_updated_at, 12 * 60 * 60 * 1000)) {
      const season = new Date().getUTCFullYear();
      const results = await Promise.all([...LEAGUES].map(async leagueId => {
        try {
          return await api('/fixtures?league=' + leagueId + '&season=' + season + '&from=' + isoDate(-3) + '&to=' + isoDate(7) + '&timezone=Europe%2FMoscow', apiKey);
        } catch (e) {
          errors.push('Календарь ' + (LEAGUE_NAMES[leagueId] || leagueId) + ': ' + e.message);
          return null;
        }
      }));
      const successful = results.filter(Array.isArray).flat();
      if (successful.length) {
        fixtures = successful.map(normalizeFixture).filter(f => LEAGUES.has(f.leagueId));
        updates.fixtures = fixtures;
        updates.fixtures_updated_at = new Date().toISOString();
      }
    }
  } catch (e) { errors.push('Календарь: ' + e.message); }

  try {
    if (stale(cache.odds_updated_at, 8 * 60 * 60 * 1000)) {
      const [today, tomorrow] = await Promise.all([
        api('/odds?date=' + isoDate(0), apiKey),
        api('/odds?date=' + isoDate(1), apiKey)
      ]);
      odds = normalizeOdds([...today, ...tomorrow].filter(x => LEAGUES.has(Number(x.league?.id))));
      updates.odds = odds;
      updates.odds_updated_at = new Date().toISOString();
    }
  } catch (e) { errors.push('Коэффициенты: ' + e.message); }

  try {
    if (stale(cache.live_updated_at, 30 * 60 * 1000)) {
      const rawLive = await api('/fixtures?live=all&timezone=Europe%2FMoscow', apiKey);
      live = rawLive.map(normalizeFixture).filter(f => LEAGUES.has(f.leagueId));
      updates.live = live;
      updates.live_updated_at = new Date().toISOString();
    }
  } catch (e) { errors.push('Live-счёт: ' + e.message); }

  if (Object.keys(updates).length) {
    updates.updated_at = new Date().toISOString();
    const saved = await supabase.from('football_cache').update(updates).eq('id', 1);
    if (saved.error) return res.status(500).json({ error: 'Не удалось сохранить кэш футбольных данных.' });
  }

  const liveById = new Map(live.map(f => [f.id, f]));
  const merged = new Map(fixtures.map(f => [f.id, f]));
  for (const f of live) merged.set(f.id, { ...(merged.get(f.id) || {}), ...f });

  // Persist every fixture we currently know so it remains available after it leaves the provider's calendar.
  const archiveCandidates = [...merged.values()].filter(f => Number.isFinite(Number(f.id)) && Number(f.id) > 0 && f.time);
  const { data: existingArchiveRows } = archiveCandidates.length
    ? await supabase.from('football_fixture_archive').select('fixture_id,odds').in('fixture_id', archiveCandidates.map(f => Number(f.id)))
    : { data: [] };
  const oldOdds = new Map((existingArchiveRows || []).map(row => [Number(row.fixture_id), row.odds]));
  const archiveRows = archiveCandidates.map(f => ({
    fixture_id: Number(f.id), league_id: Number(f.leagueId) || null, league: f.league || 'Футбол',
    start_time: f.time, status: f.status || 'NS', elapsed: f.elapsed ?? null,
    home_team: f.home || 'Хозяева', away_team: f.away || 'Гости',
    home_score: f.homeScore ?? null, away_score: f.awayScore ?? null,
    odds: odds[f.id] || oldOdds.get(Number(f.id)) || null, source_updated_at: new Date().toISOString(), last_seen_at: new Date().toISOString()
  }));
  if (archiveRows.length) {
    const archived = await supabase.from('football_fixture_archive').upsert(archiveRows, { onConflict: 'fixture_id' });
    if (archived.error) errors.push('Архив матчей не обновлён: запусти SQL из supabase/football-fixture-archive.sql в Supabase.');
  }
  const { data: archivedFixtures, error: archiveReadError } = await supabase.from('football_fixture_archive')
    .select('fixture_id,league_id,league,start_time,status,elapsed,home_team,away_team,home_score,away_score,odds')
    .order('start_time', { ascending: false }).limit(1000);
  if (archiveReadError) errors.push('Архив матчей недоступен: ' + archiveReadError.message);
  for (const a of archivedFixtures || []) {
    const archivedGame = {
      id: Number(a.fixture_id), leagueId: Number(a.league_id), league: a.league,
      time: a.start_time, status: a.status, elapsed: a.elapsed,
      home: a.home_team, away: a.away_team, homeScore: a.home_score, awayScore: a.away_score,
      archived: true
    };
    const current = merged.get(archivedGame.id);
    merged.set(archivedGame.id, { ...archivedGame, ...(current || {}) });
    if (!odds[archivedGame.id] && a.odds) odds[archivedGame.id] = a.odds;
  }
  const games = [...merged.values()]
    .filter(f => f.time && (new Date(f.time).getTime() > Date.now() - 4 * DAY || liveById.has(f.id) || f.archived))
    .sort((a, b) => new Date(a.time) - new Date(b.time))
    .map(f => ({
      ...f,
      odds: odds[f.id] || null,
      isLive: liveById.has(f.id),
      oddsUpdatedAt: cache.odds_updated_at || updates.odds_updated_at || null
    }));

  return res.status(200).json({
    games,
    updatedAt: new Date().toISOString(),
    refreshed: {
      fixtures: updates.fixtures_updated_at || cache.fixtures_updated_at || null,
      odds: updates.odds_updated_at || cache.odds_updated_at || null,
      live: updates.live_updated_at || cache.live_updated_at || null
    },
    warnings: errors
  });
}
