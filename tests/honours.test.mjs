// Run: node tests/honours.test.mjs
import assert from 'node:assert/strict';
import * as H from '../shared/honours.js';

const m = (id, date, A, B, sets, rA = [3, 3], rB = [3, 3], club) => ({ id, date, teamAIds: A, teamBIds: B, setsData: sets, club, _rA: rA, _rB: rB });
const setsOf = x => x.setsData;
const preR = (x, id) => (x.teamAIds.includes(id) ? x._rA[x.teamAIds.indexOf(id)] : x._rB[x.teamBIds.indexOf(id)]);

// points per set
const row = { a: 6, b: 4, rA: [2.5, 2.5], rB: [4.2, 4.1] };
assert.deepEqual(H.setPoints(row, 'A'), { pts: 4, kind: 'ws', res: 'W' }, 'win vs stronger = 4');
assert.equal(H.setPoints(row, 'B').pts, 1, '6-4 loss is close = 1');
assert.equal(H.setPoints({ a: 6, b: 1, rA: [3, 3], rB: [3, 3] }, 'B').pts, 0, '1-6 clear loss = 0');
assert.equal(H.setPoints({ a: 6, b: 1, rA: [3, 3], rB: [3.5, 3.9] }, 'A').pts, 3, 'same band = equal = 3');
assert.equal(H.setPoints({ a: 6, b: 1, rA: [5, 5], rB: [3, 3] }, 'A').pts, 2, 'win vs weaker = 2');
assert.equal(H.setPoints({ a: 12, b: 12, rA: [3, 3], rB: [3, 3] }, 'A').res, 'D', 'tie');
assert.ok(H.isClose(14, 16) && !H.isClose(10, 14) && H.isClose(5, 7) && !H.isClose(4, 7), 'close-loss threshold');

// formula: 64 pts from 32 sets at 1.72 → 478 (K=15); 3 strong wins → 525
assert.equal(H.scoreOf(64, 32, 1.72), 478);
assert.equal(H.scoreOf(12, 3, 1.72), 525);
assert.equal(H.scoreOf(33, 14, 1.72, 8), 531, 'pair with K=8');

// table: ranking, min sets, club filter, levels, l5, streaks
const ms = [
  m('m1', '2026-11-02', ['a', 'b'], ['c', 'd'], [{ a: 6, b: 2 }, { a: 6, b: 4 }]),
  m('m2', '2026-11-03', ['a', 'c'], ['b', 'd'], [{ a: 6, b: 3 }]),
  m('m3', '2026-11-04', ['a', 'd'], ['b', 'c'], [{ a: 7, b: 5 }]),
  m('m4', '2026-11-05', ['b', 'c'], ['a', 'd'], [{ a: 6, b: 0 }], [3, 3], [3, 3], 'other-club'),
  m('m5', '2026-10-30', ['a', 'b'], ['c', 'd'], [{ a: 6, b: 0 }]),
];
const rows = H.rowsFrom(ms, setsOf, preR);
assert.equal(rows.length, 6);
const t = H.table(rows, { from: '2026-11-01', to: '2026-11-30', levels: { a: 'i', b: 'i', c: 'b', d: 'a' } });
assert.equal(t.ranked.length + t.warming.length, 4);
assert.equal(t.ranked[0].id, 'a', 'a won all 4 home sets in Nov');
assert.equal(t.ranked[0].w, 4); assert.equal(t.ranked[0].streak, 4); assert.deepEqual(t.ranked[0].l5, ['W', 'W', 'W', 'W']);
assert.ok(!t.all.a.days || t.all.a.days === 3, 'days counted');
assert.ok(rows.some(r => r.club === 'other-club') && t.all.b.sets === 4, 'other-club set excluded from home table');
const tAll = H.table(rows, { club: 'all', min: 1 });
assert.equal(tAll.all.b.sets, 6, 'all clubs + all dates include Oct and other club');
assert.deepEqual(H.byLevel(t.ranked, 'i').map(x => x.id), t.ranked.filter(x => x.level === 'i').map(x => x.id));

// pairs
const pr = H.pairs(rows, { from: '2026-11-01', to: '2026-11-30', min: 1 });
assert.ok(pr.all['a+b'].sets === 2 && pr.all['a+b'].w === 2, 'a+b together 2 sets, 2 wins');

// court regular
const cr = H.courtRegular(rows, '2026-11-05');
assert.equal(cr.list[0].days, 4); assert.equal(cr.list[0].strip.length, 30); assert.equal(cr.list[0].strip.filter(Boolean).length, 4);

// projections
const me = { pts: 64, sets: 32 };
assert.equal(H.project(me, [4], 1.72).score, 489);
assert.equal(H.winsToPass(me, 484, 1.72), 1);

// months
assert.equal(H.prevMonth('2027-01'), '2026-12'); assert.equal(H.monthBounds('2027-02').to, '2027-02-28'); assert.equal(H.monthLabel('2026-11'), 'Nov ’26');

// close
const cl = H.closeSeason(rows, '2026-11', { a: 'i', b: 'i', c: 'b', d: 'a' }, { closedAt: 1, min: 1, minDays: 1 });
assert.equal(cl.meta.ranked, t.ranked.length);
assert.equal(cl.seals.a[0].kind, 'gold');
assert.ok(cl.seals.a.some(s => s.type === 'level' && s.level === 'i'), 'a is Intermediate champion');
assert.ok(Object.values(cl.seals).flat().some(s => s.type === 'regular'), 'court regular holder');
assert.ok(cl.standings.a.l5.length === 4);

// qualification: 10 sets on 4 days; provisional until 3 qualify
assert.equal(H.HONOURS.MIN_SEASON, 10); assert.equal(H.HONOURS.MIN_SEASON_DAYS, 4);
assert.deepEqual(H.needOf({ sets: 9, days: 3 }, 10, 4), { sets: 1, days: 1 });
assert.ok(t.provisional && t.qualified === 0, 'nobody has 10 sets: provisional board');
assert.ok(t.ranked.every(x => x.sets >= 3) && t.ranked.every(x => !x.q), 'provisional ranks 3+ sets, none qualified');
// build a month where 3 players qualify and a hot starter doesn't
const big = [];
for (let d = 1; d <= 8; d++) for (let k = 0; k < 2; k++) big.push(m(`q${d}${k}`, `2026-11-${String(d).padStart(2, '0')}`, ['p1', 'p2'], ['p3', 'p4'], [{ a: 6, b: k ? 4 : 5 }]));
big.push(m('hs1', '2026-11-20', ['hot', 'p4'], ['p2', 'p3'], [{ a: 6, b: 0 }, { a: 6, b: 0 }, { a: 6, b: 1 }, { a: 6, b: 0 }, { a: 6, b: 2 }]));
const bt = H.table(H.rowsFrom(big, setsOf, preR), { from: '2026-11-01', to: '2026-11-30', min: 10, minDays: 4 });
assert.ok(!bt.provisional && bt.qualified === 4, 'four qualified: not provisional');
assert.ok(!bt.ranked.some(x => x.id === 'hot'), '5-0 on one day is not on the board');
assert.deepEqual(bt.all.hot.need, { sets: 5, days: 3 }); assert.equal(bt.warming[0].id, 'hot');
const bc = H.closeSeason(H.rowsFrom(big, setsOf, preR), '2026-11', {}, {});
assert.ok(!bc.seals.hot?.some(s => s.type === 'season'), 'no seal for a non-qualifier');
assert.equal(bc.standings.hot.rank, null); assert.equal(bc.meta.minDays, 4);
console.log('honours: all tests passed');
