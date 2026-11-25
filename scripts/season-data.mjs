// Builds the Honours input exactly as SmashDex does in the browser (smashdex/index.html → compute()):
// same matches, same member-recorded scores, same rating engine, same "SDX going into each match".
import { DSR } from '../shared/dsr.js';
import { subsToMatches, markDuplicates } from '../shared/subs.js';
import * as H from '../shared/honours.js';

const setsOf = m => (Array.isArray(m.setsData) && m.setsData.length) ? m.setsData : [{ a: m.a, b: m.b }];
const validMatch = m => m.status === 'confirmed' && DSR.W[m.format];

// db = { profiles, openPlayMatches, adjustments, submissions }; upTo = last date to count (YYYY-MM-DD); now = ms
export function buildRows(db, upTo, now = Date.now()) {
  const P = db.profiles || {}, idNames = {};
  for (const m of Object.values(db.openPlayMatches || {})) for (const [ids, nms] of [[m.teamAIds, m.teamA], [m.teamBIds, m.teamB]])
    if (Array.isArray(ids) && Array.isArray(nms)) ids.forEach((id, i) => { if (id && !P[id]?.name && nms[i]) idNames[id] = String(nms[i]); });
  const nameOf = id => P[id]?.name || idNames[id];
  const ms = Object.entries(db.openPlayMatches || {}).map(([id, m]) => {
    const x = { id, ...m };
    if (Array.isArray(x.teamA) && Array.isArray(x.teamAIds)) x.teamA = x.teamA.map((n, i) => nameOf(x.teamAIds[i]) || n);
    if (Array.isArray(x.teamB) && Array.isArray(x.teamBIds)) x.teamB = x.teamB.map((n, i) => nameOf(x.teamBIds[i]) || n);
    return x;
  });
  const seeds = {};
  for (const p of Object.values(P)) if (p && p.seed != null && p.name) seeds[p.name] = { seed: +p.seed, assessedAt: p.seedFrom || null };
  const adj = [];
  for (const [mid, a] of Object.entries(db.adjustments || {})) {
    const name = nameOf(mid); if (!name) continue;
    if (a.self) adj.push({ ...a.self, name, by: 'self', id: `${mid}-self` });
    for (const [k, x] of Object.entries(a.admin || {})) adj.push({ ...x, name, by: 'admin', id: `${mid}-${k}` });
  }
  const dups = markDuplicates(db.submissions || {}, db.openPlayMatches || {}, now);
  const sx = subsToMatches(db.submissions || {}, id => P[id]?.name, now, { dups });
  for (const [k, v] of Object.entries(sx.seeds)) if (!seeds[k]) seeds[k] = v;
  const all = ms.concat(sx.matches).filter(m => String(m.date || '') <= upTo);
  const ratings = DSR.compute(seeds, all, upTo, adj.filter(a => String(a.date || '') <= upTo)).players;
  const pre = {};
  for (const p of Object.values(ratings)) for (const h of p.hist || []) if (h.id && !h.manual) { const o = (pre[h.id] ||= {}); if (!(p.name in o)) o[p.name] = h.r - h.delta; }
  const rOf = name => ratings[name]?.r ?? DSR.DEFAULT_SEED;
  const preR = (m, id) => { const nm = nameOf(id); const v = nm ? pre[m.id]?.[nm] : null; return v != null ? v : (nm ? rOf(nm) : null); };
  const rows = H.rowsFrom(all.filter(validMatch), setsOf, preR);
  const levels = {};
  for (const [id, p] of Object.entries(P)) if (p?.name) levels[id] = H.levelOf(rOf(p.name));
  for (const [id, nm] of Object.entries(idNames)) if (!levels[id]) levels[id] = H.levelOf(rOf(nm));
  return { rows, levels };
}
