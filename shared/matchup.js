// Matchup Dex: rivalry and partnership records, set by set. Pure functions, shared by /smashdex (and testable with node).
//
// Input is a flat list of counted sets (see setRows). Everything is keyed by member id, never by name.
// A set: { mid, date, at, A:[id,id], B:[id,id], a, b, eA }   a/b = games for side A/B, eA = expected games share for A (or null)

const ok = id => typeof id === 'string' && id && !id.startsWith('new:') && !id.startsWith('~');
const has = (side, id) => side[0] === id || side[1] === id;
const pairKey = (p, q) => [p, q].sort().join('+');

// Counted matches -> one row per set. setsOf(m) gives that match's sets in team order; eOf(m) the expected share for team A.
export function setRows(matches, setsOf, eOf = () => null) {
  const out = [];
  for (const m of matches) {
    const A = m.teamAIds, B = m.teamBIds;
    if (!Array.isArray(A) || !Array.isArray(B) || A.length !== 2 || B.length !== 2 || ![...A, ...B].every(ok)) continue;
    const eA = eOf(m);
    setsOf(m).forEach((s, i) => {
      const a = +s.a, b = +s.b; if (!isFinite(a) || !isFinite(b) || a + b === 0) return;
      out.push({ mid: m.id, i, date: m.date, at: String(m.enteredAt || ''), A: [...A], B: [...B], a, b, eA });
    });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || x.at.localeCompare(y.at) || x.i - y.i);
}

// Orient a set to `me`'s side: { my, th, mate:[ids], opp:[ids], e }
export function orient(s, me) {
  if (has(s.A, me)) return { my: s.a, th: s.b, mate: s.A.filter(x => x !== me), opp: s.B, e: s.eA };
  if (has(s.B, me)) return { my: s.b, th: s.a, mate: s.B.filter(x => x !== me), opp: s.A, e: s.eA == null ? null : 1 - s.eA };
  return null;
}

// Summary of a list of oriented sets (oldest first in, newest first in `seq`)
export function summary(list) {
  const r = { n: list.length, w: 0, l: 0, d: 0, gf: 0, ga: 0, seq: [], dates: [], matches: [], eSum: 0, eN: 0, lastWin: null };
  for (const o of list) {
    r.gf += o.my; r.ga += o.th;
    if (o.my > o.th) { r.w++; r.lastWin = { date: o.date, my: o.my, th: o.th, mid: o.mid }; } else if (o.my < o.th) r.l++; else r.d++;
    r.seq.unshift(o.my > o.th ? 'W' : o.my < o.th ? 'L' : 'D');
    if (!r.dates.includes(o.date)) r.dates.push(o.date);
    if (!r.matches.includes(o.mid)) r.matches.push(o.mid);
    if (o.e != null) { r.eSum += o.e; r.eN++; }
  }
  r.first = r.dates[0] || null; r.last = r.dates[r.dates.length - 1] || null;
  r.sessions = r.dates.length;
  r.share = r.gf + r.ga ? r.gf / (r.gf + r.ga) : null;            // games won
  r.eShare = r.eN ? r.eSum / r.eN : null;                         // games the ratings expected
  return r;
}
const pick = (sets, me, test) => sets.map(s => ({ s, o: orient(s, me) })).filter(x => x.o && test(x.o, x.s)).map(x => ({ ...x.o, date: x.s.date, mid: x.s.mid }));

export const against = (sets, me, x) => summary(pick(sets, me, o => o.opp.includes(x)));
export const together = (sets, me, x) => summary(pick(sets, me, o => o.mate.includes(x)));
export const overall = (sets, me) => summary(pick(sets, me, () => true));
// A pair's record together (from p's side), any opponents
export const pairRecord = (sets, p, q) => summary(pick(sets, p, o => o.mate.includes(q)));
// Exactly these four: pair P against pair Q (from P[0]'s side)
export const fourRecord = (sets, P, Q) => summary(pick(sets, P[0], o => o.mate.includes(P[1]) && o.opp.includes(Q[0]) && o.opp.includes(Q[1])));

// Everyone I've played with or against: { id: { with: summary, vs: summary } }
export function people(sets, me) {
  const by = {};
  for (const s of sets) {
    const o = orient(s, me); if (!o) continue;
    const row = { ...o, date: s.date, mid: s.mid };
    for (const m of o.mate) ((by[m] ||= { with: [], vs: [] }).with).push(row);
    for (const x of o.opp) ((by[x] ||= { with: [], vs: [] }).vs).push(row);
  }
  const out = {};
  for (const [id, v] of Object.entries(by)) out[id] = { with: summary(v.with), vs: summary(v.vs) };
  return out;
}

// Pairs that me + partner faced together: [{ ids:[a,b], rec }] most sets first
export function pairsFaced(sets, me, partner) {
  const g = {};
  for (const x of pick(sets, me, o => o.mate.includes(partner))) { const k = pairKey(...x.opp); (g[k] ||= { ids: [...x.opp].sort(), list: [] }).list.push(x); }
  return Object.values(g).map(v => ({ ids: v.ids, rec: summary(v.list) })).sort((a, b) => b.rec.n - a.rec.n || b.rec.last.localeCompare(a.rec.last));
}

// Opponents both me and x have faced (excluding each other): [{ id, mine, theirs }]
export function commonGround(sets, me, x) {
  const mine = people(sets, me), theirs = people(sets, x), out = [];
  for (const id of Object.keys(mine)) {
    if (id === x || id === me || !theirs[id]) continue;
    if (mine[id].vs.n && theirs[id].vs.n) out.push({ id, mine: mine[id].vs, theirs: theirs[id].vs });
  }
  return out.sort((a, b) => (b.mine.n + b.theirs.n) - (a.mine.n + a.theirs.n));
}
// Partners both have had
export function sharedPartners(sets, me, x) {
  const mine = people(sets, me), theirs = people(sets, x);
  return Object.keys(mine).filter(id => id !== x && id !== me && mine[id].with.n && theirs[id]?.with.n);
}

// Verdicts (placeholder words, Ranjith may rename them)
export function verdictAgainst(r) {
  if (!r.n) return { key: 'blank', text: 'A blank page' };
  if (r.n < 3) return { key: 'early', text: 'Too early to call' };
  const diff = r.w - r.l, classic = r.n >= 20 ? 'Classic: ' : '';
  if (Math.abs(diff) <= 1) return { key: 'even', text: classic + 'Dead even' };
  if (diff >= 2) return { key: 'ahead', text: classic + "You've got their number" };
  return { key: 'behind', text: classic + 'Unfinished business' };
}
export function verdictTogether(r) {
  if (!r.n) return { key: 'blank', text: 'Never partnered' };
  if (r.n < 3) return { key: 'early', text: 'Too early to call' };
  const rate = r.w / r.n;
  if (r.n >= 5 && rate >= 2 / 3 - 1e-9) return { key: 'dream', text: 'Dream team' };
  if (r.n >= 5 && rate < 1 / 3) return { key: 'rhythm', text: 'Still finding the rhythm' };
  if (rate >= 0.5) return { key: 'solid', text: 'A solid pair' };
  return { key: 'work', text: 'A work in progress' };
}
// Chemistry: games won together minus the games the ratings expected, in percentage points. Needs 5+ sets with expectations.
export function chemistry(r) {
  if (r.eN < 5 || r.share == null) return null;
  return Math.round((r.share - r.eShare) * 100);
}
