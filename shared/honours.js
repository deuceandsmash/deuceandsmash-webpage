// Honours: Season Score, All-time, Court Regular and Pairs. Pure functions, shared by /smashdex and the monthly
// season-close job (scripts/close-season.mjs), and testable with node. Rules: claude/smashdex-honours.md.
//
// Input is a flat list of counted sets (see rowsFrom). Everything is keyed by member id, never by name.
// A row: { mid, i, date, club, A:[id,id], B:[id,id], a, b, rA:[r,r], rB:[r,r] }   a/b = games (or points) for side A/B,
// rA/rB = each player's SDX going into that match.

export const HONOURS = {
  K: 15,              // phantom sets at the club average (individual boards)
  K_PAIR: 8,          // phantom sets for pairs (they play fewer sets together)
  MIN_SEASON: 10,     // sets to qualify for a season (podium, seals)…
  MIN_SEASON_DAYS: 4, // …played on at least this many different days (roughly once a week)
  MIN_ALL: 20,        // sets to qualify all-time…
  MIN_ALL_DAYS: 5,    // …on at least this many days
  PROV_MIN: 3,        // until PROV_TOP players qualify, the board is provisional and ranks everyone with this many sets
  PROV_TOP: 3,
  MIN_PAIR: 6,        // sets together to be ranked as a pair
  REGULAR_DAYS: 30,   // Court Regular window
  HOME: 'deuce-and-smash',
  DATA_START: '2026-10-18', // score recording began
  FIRST_SEASON: '2026-11',  // seasons and seals start here
  FALLBACK_AVG: 1.72, // club average before any sets exist
};

export const LEVELS = [
  { id: 'b', label: 'Beginner', range: 'SDX 0–2', lo: 0 },
  { id: 'i', label: 'Intermediate', range: 'SDX 2–4', lo: 2 },
  { id: 'a', label: 'Advanced', range: 'SDX 4+', lo: 4 },
];
export const levelOf = r => (r >= 4 - 1e-9 ? 'a' : r >= 2 - 1e-9 ? 'i' : 'b');
export const band = r => Math.max(0, Math.min(6, Math.floor((+r || 0) + 1e-9)));

const ok = id => typeof id === 'string' && id && !id.startsWith('new:') && !id.startsWith('~');
const monthOf = d => String(d || '').slice(0, 7);
export const pairKey = (p, q) => [p, q].sort().join('+');

// Counted matches -> one row per set. setsOf(m) gives that match's sets; preR(m, id) the SDX going in (or null).
export function rowsFrom(matches, setsOf, preR = () => null) {
  const out = [];
  for (const m of matches) {
    const A = m.teamAIds, B = m.teamBIds;
    if (!Array.isArray(A) || !Array.isArray(B) || A.length !== 2 || B.length !== 2 || ![...A, ...B].every(ok)) continue;
    const r = id => { const v = preR(m, id); return v == null || !isFinite(v) ? 0.5 : +v; };
    const rA = A.map(r), rB = B.map(r);
    setsOf(m).forEach((s, i) => {
      const a = +s.a, b = +s.b; if (!isFinite(a) || !isFinite(b) || a + b === 0) return;
      out.push({ mid: m.id, i, date: m.date, at: String(m.enteredAt || ''), club: m.club || HONOURS.HOME, A: [...A], B: [...B], a, b, rA, rB });
    });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || x.at.localeCompare(y.at) || x.i - y.i);
}

// A close loss: 2 games or fewer (about 10% of the points in points formats such as Mexicano)
export const isClose = (my, th) => th - my <= Math.max(2, Math.round((my + th) * 0.1));

// Points for one side of a set: win vs stronger 4, equal 3, weaker 2; tie or close loss 1; clear loss 0.
// "Stronger" compares the two pairs' average band (SDX bands, 0–6) going into the match.
export function setPoints(row, side) {
  const mine = side === 'A' ? row.rA : row.rB, theirs = side === 'A' ? row.rB : row.rA;
  const my = side === 'A' ? row.a : row.b, th = side === 'A' ? row.b : row.a;
  const own = (band(mine[0]) + band(mine[1])) / 2, opp = (band(theirs[0]) + band(theirs[1])) / 2;
  if (my > th) { const kind = opp > own + 0.25 ? 'ws' : opp < own - 0.25 ? 'ww' : 'we'; return { pts: kind === 'ws' ? 4 : kind === 'we' ? 3 : 2, kind, res: 'W' }; }
  if (my === th) return { pts: 1, kind: 't', res: 'D' };
  return isClose(my, th) ? { pts: 1, kind: 'cl', res: 'L' } : { pts: 0, kind: 'lc', res: 'L' };
}

export const steadied = (pts, sets, avg, K) => (pts + K * avg) / (sets + K);
export const toScore = v => Math.round(v / 4 * 1000);
export const scoreOf = (pts, sets, avg, K = HONOURS.K) => toScore(steadied(pts, sets, avg, K));

const blank = () => ({ pts: 0, sets: 0, w: 0, l: 0, t: 0, ws: 0, we: 0, ww: 0, cl: 0, lc: 0, days: new Set(), seq: [], streak: 0, best: 0, opp: {} });
function tally(acc, id, p, row, oppIds) {
  const x = acc[id] ||= blank();
  x.pts += p.pts; x.sets++; x[p.kind]++;
  if (p.res === 'W') { x.w++; x.streak++; x.best = Math.max(x.best, x.streak); } else { if (p.res === 'L') x.l++; else x.t++; x.streak = 0; }
  x.days.add(row.date); x.seq.push(p.res);
  for (const o of oppIds) { const h = x.opp[o] ||= { w: 0, l: 0 }; if (p.res === 'W') h.w++; else if (p.res === 'L') h.l++; }
}
const inRange = (row, o) => (!o.from || row.date >= o.from) && (!o.to || row.date <= o.to) && (o.club === 'all' || row.club === HONOURS.HOME);

// What a player still needs to qualify: { sets, days } (0 = done)
export const needOf = (x, min, minDays) => ({ sets: Math.max(0, min - (x.sets || 0)), days: Math.max(0, minDays - (x.days || 0)) });

// Individual table. opts: { from, to, club:'home'|'all', K, min, minDays, levels:{id:'b'|'i'|'a'}, provisional:true|false }
// Qualified = min sets on minDays different days. While fewer than PROV_TOP players qualify (and provisional !== false),
// the table is provisional: it ranks everyone with PROV_MIN+ sets, and each entry says whether they've qualified.
// Returns { avg, ranked, warming, all, provisional, qualified, min, minDays }. Entries carry rank, score, q, need, l5, streak, best, days.
export function table(rows, opts = {}) {
  const K = opts.K ?? HONOURS.K, min = opts.min ?? HONOURS.MIN_SEASON, minDays = opts.minDays ?? 0;
  const acc = {}; let tp = 0, tn = 0;
  for (const row of rows) {
    if (!inRange(row, opts)) continue;
    for (const side of ['A', 'B']) {
      const p = setPoints(row, side), ids = side === 'A' ? row.A : row.B, opp = side === 'A' ? row.B : row.A;
      for (const id of ids) { tally(acc, id, p, row, opp); tp += p.pts; tn++; }
    }
  }
  const avg = tn ? tp / tn : HONOURS.FALLBACK_AVG;
  const list = Object.entries(acc).map(([id, x]) => {
    const v = steadied(x.pts, x.sets, avg, K);
    const y = { id, ...x, days: x.days.size, l5: x.seq.slice(-5), v, score: toScore(v), level: opts.levels?.[id] || null };
    y.need = needOf(y, min, minDays); y.q = !y.need.sets && !y.need.days;
    return y;
  });
  const cmp = (a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const h = a.opp[b.id]; if (h && h.w !== h.l) return h.l - h.w; // head-to-head sets
    return b.w - a.w || b.days - a.days || b.v - a.v;
  };
  const qualified = list.filter(x => x.q).length;
  const provisional = opts.provisional !== false && qualified < HONOURS.PROV_TOP;
  const onBoard = provisional ? x => x.sets >= Math.min(min, HONOURS.PROV_MIN) : x => x.q;
  const ranked = list.filter(onBoard).sort(cmp);
  ranked.forEach((x, i) => { x.rank = i + 1; });
  // Warming up: closest to qualifying first
  const warming = list.filter(x => !onBoard(x)).sort((a, b) => (a.need.sets + a.need.days) - (b.need.sets + b.need.days) || b.sets - a.sets || b.score - a.score);
  return { avg, ranked, warming, all: Object.fromEntries(list.map(x => [x.id, x])), provisional, qualified, min, minDays };
}

// Rank within one level ('b'|'i'|'a'), keeping the club-wide scores
export function byLevel(ranked, lv) {
  const out = ranked.filter(x => x.level === lv).map(x => ({ ...x }));
  out.forEach((x, i) => { x.lrank = i + 1; });
  return out;
}

// Pairs: the partnership's own score, from sets the two played together (same side). K_PAIR phantom sets.
export function pairs(rows, opts = {}) {
  const K = opts.K ?? HONOURS.K_PAIR, min = opts.min ?? HONOURS.MIN_PAIR;
  const acc = {}; let tp = 0, tn = 0;
  for (const row of rows) {
    if (!inRange(row, opts)) continue;
    for (const side of ['A', 'B']) {
      const p = setPoints(row, side), ids = side === 'A' ? row.A : row.B, opp = side === 'A' ? row.B : row.A;
      const k = pairKey(ids[0], ids[1]);
      tally(acc, k, p, row, [pairKey(opp[0], opp[1])]); tp += p.pts; tn++;
    }
  }
  const avg = tn ? tp / tn : HONOURS.FALLBACK_AVG;
  const list = Object.entries(acc).map(([k, x]) => { const v = steadied(x.pts, x.sets, avg, K); return { key: k, ids: k.split('+'), ...x, days: x.days.size, l5: x.seq.slice(-5), v, score: toScore(v) }; });
  const ranked = list.filter(x => x.sets >= min).sort((a, b) => b.score - a.score || b.w - a.w || b.v - a.v);
  ranked.forEach((x, i) => { x.rank = i + 1; });
  return { avg, ranked, warming: list.filter(x => x.sets < min).sort((a, b) => b.sets - a.sets), all: Object.fromEntries(list.map(x => [x.key, x])) };
}

// Court Regular: most days played at the club in the last 30 days (today included). Ties: more sets in the window.
export function courtRegular(rows, today, days = HONOURS.REGULAR_DAYS) {
  const t = Date.parse(today + 'T00:00:00Z'), fromMs = t - (days - 1) * 864e5;
  const from = new Date(fromMs).toISOString().slice(0, 10);
  const acc = {};
  for (const row of rows) {
    if (row.club !== HONOURS.HOME || row.date < from || row.date > today) continue;
    for (const id of [...row.A, ...row.B]) { const x = acc[id] ||= { days: new Set(), sets: 0 }; x.days.add(row.date); x.sets++; }
  }
  const list = Object.entries(acc).map(([id, x]) => {
    const strip = []; for (let d = 0; d < days; d++) strip.push(x.days.has(new Date(fromMs + d * 864e5).toISOString().slice(0, 10)));
    return { id, days: x.days.size, sets: x.sets, strip };
  }).sort((a, b) => b.days - a.days || b.sets - a.sets);
  list.forEach((x, i) => { x.rank = i + 1; });
  return { from, to: today, list };
}

// Season Replay: the table as it stood at the end of each day of the month. -> [{ date, rank:{id:n}, score:{id:n} }]
export function replay(rows, month, opts = {}) {
  const days = [...new Set(rows.filter(r => monthOf(r.date) === month).map(r => r.date))].sort();
  return days.map(d => { const tb = table(rows, { ...opts, from: month + '-01', to: d });
    return { date: d, rank: Object.fromEntries(tb.ranked.map(x => [x.id, x.rank])), score: Object.fromEntries(tb.ranked.map(x => [x.id, x.score])) }; });
}

// What a set of planned results would do: add = [points per set], e.g. [4, 3, 1]
export function project(me, add, avg, K = HONOURS.K) {
  const pts = me.pts + add.reduce((s, x) => s + x, 0), sets = me.sets + add.length;
  return { pts, sets, score: scoreOf(pts, sets, avg, K), v: steadied(pts, sets, avg, K) };
}
// Fewest wins against a stronger pair that would pass a target score (null if more than `max`)
export function winsToPass(me, target, avg, K = HONOURS.K, max = 8) {
  for (let k = 1; k <= max; k++) if (project(me, Array(k).fill(4), avg, K).score > target) return k;
  return null;
}

export const monthBounds = month => { const [y, m] = month.split('-').map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}`, days: last }; };
export const prevMonth = month => { const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return d.toISOString().slice(0, 7); };
export const monthLabel = month => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) + ' ’' + String(y).slice(2); };

// Close a season: the frozen record written to seasons/YYYY-MM. levels = {id: 'b'|'i'|'a'} at close.
export function closeSeason(rows, month, levels, settings = {}) {
  const { from, to } = monthBounds(month);
  const K = settings.K ?? HONOURS.K, min = settings.min ?? HONOURS.MIN_SEASON, minDays = settings.minDays ?? HONOURS.MIN_SEASON_DAYS;
  const tb = table(rows, { from, to, club: 'home', K, min, minDays, levels, provisional: false });
  const pr = pairs(rows, { from, to, club: 'home', K: settings.K_PAIR ?? HONOURS.K_PAIR, min: settings.MIN_PAIR ?? HONOURS.MIN_PAIR });
  const cr = courtRegular(rows, to);
  const standings = {}, seals = {};
  const seal = (id, s) => (seals[id] ||= []).push(s);
  for (const x of tb.ranked) {
    standings[x.id] = { rank: x.rank, level: x.level || null, score: x.score, sets: x.sets, w: x.w, l: x.l, t: x.t, pts: x.pts,
      ws: x.ws, we: x.we, ww: x.ww, cl: x.cl, lc: x.lc, days: x.days, best: x.best, l5: x.l5.join('') };
  }
  // Played but didn't qualify: kept (unranked) so members can see their month in My seasons
  for (const x of tb.warming) {
    standings[x.id] = { rank: null, level: x.level || null, score: x.score, sets: x.sets, w: x.w, l: x.l, t: x.t, pts: x.pts,
      ws: x.ws, we: x.we, ww: x.ww, cl: x.cl, lc: x.lc, days: x.days, best: x.best, l5: x.l5.join('') };
  }
  const place = ['gold', 'silver', 'bronze'];
  tb.ranked.slice(0, 3).forEach((x, i) => seal(x.id, { type: 'season', place: i + 1, kind: place[i] }));
  for (const L of LEVELS) {
    const top = tb.ranked.find(x => x.level === L.id);
    if (top) { standings[top.id].lrank = 1; seal(top.id, { type: 'level', level: L.id, kind: 'navy' }); }
  }
  const pairOut = {};
  for (const x of pr.ranked) pairOut[x.key] = { rank: x.rank, score: x.score, sets: x.sets, w: x.w, l: x.l, t: x.t, ids: x.ids };
  pr.ranked.slice(0, 3).forEach((x, i) => x.ids.forEach(id => seal(id, { type: 'pairs', place: i + 1, kind: place[i], with: x.ids.find(y => y !== id) })));
  const holder = cr.list[0] || null;
  if (holder) seal(holder.id, { type: 'regular', days: holder.days, kind: 'green' });
  return {
    meta: { month, from, to, closedAt: settings.closedAt || null, K, min, minDays, K_PAIR: settings.K_PAIR ?? HONOURS.K_PAIR, minPair: settings.MIN_PAIR ?? HONOURS.MIN_PAIR,
      clubAvg: Math.round(tb.avg * 1000) / 1000, ranked: tb.ranked.length, warming: tb.warming.length },
    standings, pairs: pairOut,
    courtRegular: holder ? { id: holder.id, days: holder.days, sets: holder.sets } : null,
    seals,
  };
}
