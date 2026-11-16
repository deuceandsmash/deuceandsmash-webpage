// Member-submitted scores (SmashDex "Record score"), shared by /smashdex and /admin.
//
// Stored at submissions/{sid}:
//   by        member id of the submitter (always players[0])
//   at        ms timestamp when submitted
//   date      "YYYY-MM-DD" the match was played (local date)
//   club      club slug from /clubs, or "other" with clubOther = typed name
//   format    "openplay" (Casual) | "competitive"
//   rotate    true when partners change between sets (same four players)
//   players   [submitter, partner-of-set-1, opponent, opponent]; a newcomer is "new:<key>"
//   newcomers {key: {name, level}}
//   sets      [{A:[id,id], B:[id,id], a, b, tb?:{a,b}, early?:true}]  (a/b = games for team A/B)
//   early     true when a set ended before a normal finish (time ran out)
//   status    "pending" | "disputed" | "confirmed" (staff) | "void" (staff)
//   confirms  {memberId: ms}
//   dispute   {by, at, reason, sets?:[index], fix?:{index:{a,b}}, note?}
//
// A pending score counts once an eligible player confirms, or automatically 24 hours after it was submitted.
// A disputed score: the disputed sets stop counting until staff resolve it; the other sets count after 24 hours.

export const DAY_MS = 864e5;
export const MAX_SETS = { fixed: 5, rotate: 6 };
export const NEW_LEVELS = [
  ['Beginner', 0.75], ['Beginner+', 1.5], ['Lower Intermediate', 2.5], ['Intermediate', 3.5], ['Intermediate High', 4.0],
];
export const levelSeed = lv => (NEW_LEVELS.find(x => x[0] === lv) || NEW_LEVELS[1])[1];

const arr = v => Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : [];
export const playersOf = s => arr(s.players);
export const setsOfSub = s => arr(s.sets).map(x => ({ ...x, A: arr(x.A), B: arr(x.B) }));
export const isNew = id => typeof id === 'string' && id.startsWith('new:');

// Players who may confirm: anyone who was an opponent of the submitter in at least one set (members only)
export function confirmers(s) {
  const by = s.by, out = new Set();
  for (const x of setsOfSub(s)) {
    const opp = x.A.includes(by) ? x.B : x.B.includes(by) ? x.A : [];
    opp.forEach(id => { if (!isNew(id)) out.add(id); });
  }
  return [...out];
}
export const canDispute = (s, mid) => playersOf(s).includes(mid) && mid !== s.by;

// Effective state at time `now`: pending | confirmed | auto | disputed | void
export function subState(s, now = Date.now()) {
  if (!s) return 'void';
  if (s.status === 'void') return 'void';
  if (s.status === 'confirmed') return 'confirmed';
  if (s.status === 'disputed') return 'disputed';
  const ok = confirmers(s), c = s.confirms || {};
  if (Object.keys(c).some(id => ok.includes(id))) return 'confirmed';
  if (now - (+s.at || 0) >= DAY_MS) return 'auto';
  return 'pending';
}
export const counts = st => st === 'confirmed' || st === 'auto';
export const hoursLeft = (s, now = Date.now()) => Math.max(0, Math.ceil(((+s.at || 0) + DAY_MS - now) / 36e5));

// Key used as the player's "name" inside the rating engine for a newcomer
export const newKey = (sid, id) => `~new:${sid}:${id.slice(4)}`;

// Turn submissions into rating-engine matches. Consecutive sets with the same pairing form one match,
// so a fixed-pair match is one match and a rotating session is one match per pairing.
//   nameOf(memberId) -> engine name;  opts.include(sid, s, state) -> also count a not-yet-counted sub (previews)
export function subsToMatches(subs, nameOf, now = Date.now(), opts = {}) {
  const out = [], seeds = {};
  for (const [sid, s] of Object.entries(subs || {})) {
    const st = subState(s, now);
    const forced = opts.include && opts.include(sid, s, st);
    if (!forced && !(counts(st) || st === 'disputed')) continue;
    if (st === 'void') continue;
    if (st === 'disputed' && !forced && now - (+s.at || 0) < DAY_MS) continue;
    const skip = new Set(st === 'disputed' && !forced ? (arr(s.dispute?.sets).length ? arr(s.dispute.sets).map(Number) : setsOfSub(s).map((_, i) => i)) : []);
    const nm = id => isNew(id) ? newKey(sid, id) : nameOf(id);
    for (const id of playersOf(s)) if (isNew(id)) {
      const nc = (s.newcomers || {})[id.slice(4)] || {};
      seeds[newKey(sid, id)] = { seed: levelSeed(nc.level), newcomer: true, label: nc.name || 'New player' };
    }
    let block = null, bi = 0;
    setsOfSub(s).forEach((x, i) => {
      if (skip.has(i)) { block = null; return; }
      const A = x.A.map(nm), B = x.B.map(nm);
      if (A.some(n => !n) || B.some(n => !n) || A.length !== 2 || B.length !== 2) { block = null; return; }
      const sig = [...A].sort().join('|') + '#' + [...B].sort().join('|');
      if (!block || block.sig !== sig) {
        block = { sig, m: { id: `s:${sid}:${bi++}`, sub: sid, date: s.date, format: s.format || 'openplay', status: 'confirmed', club: s.club === 'other' ? 'other' : (s.club || 'deuce-and-smash'), clubOther: s.clubOther || null,
          enteredAt: new Date(+s.at || 0).toISOString(), teamA: A, teamB: B, teamAIds: x.A, teamBIds: x.B, setsData: [], a: 0, b: 0 } };
        out.push(block.m);
      }
      // Keep the engine's team order: flip the score if this set lists the teams the other way round
      const flip = block.m.teamA[0] !== A[0] && block.m.teamA[0] !== A[1];
      const sa = flip ? x.b : x.a, sb = flip ? x.a : x.b;
      block.m.setsData.push({ a: +sa, b: +sb, tb: x.tb || null });
      block.m.a += +sa; block.m.b += +sb;
    });
  }
  return { matches: out, seeds };
}

// Valid padel set: 6–0…6–4, 7–5, 7–6 (tie-break). "early" allows any score up to 7 that isn't 0–0.
export function validSet(a, b, early) {
  if (a == null || b == null || a === '' || b === '') return false;
  a = +a; b = +b;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 7 || b > 7) return false;
  if (early) return a + b > 0;
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6)) || (hi === 6 && lo === 6);
}
export const needsTb = (a, b) => (+a === 6 && +b === 6) || (+a === 7 && +b === 6) || (+a === 6 && +b === 7);
export function validTb(tb) {
  if (!tb) return false; const a = +tb.a, b = +tb.b;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return false;
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return hi >= 7 && hi - lo >= 2 && (hi === 7 || hi - lo === 2);
}
// Normalise 6–6 + tie-break to 7–6 for storage
export function finalSet(x) {
  if (+x.a === 6 && +x.b === 6 && x.tb) return +x.tb.a > +x.tb.b ? { ...x, a: 7, b: 6 } : { ...x, a: 6, b: 7 };
  return x;
}
