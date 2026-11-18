// Closes a SmashDex season: writes the frozen record to seasons/YYYY-MM in the Realtime Database.
// Runs from GitHub Actions at 00:30 IST on the 2nd of every month (.github/workflows/close-season.yml).
//
//   node scripts/close-season.mjs                 close last month (IST), skip if already closed
//   node scripts/close-season.mjs 2026-11         close a given month
//   node scripts/close-season.mjs 2026-11 --force rewrite a month that is already closed
//   node scripts/close-season.mjs 2026-11 --dry   print what would be written, write nothing
//
// Needs FIREBASE_SERVICE_ACCOUNT (the service-account JSON) in the environment, except for --dry with --file.
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import fs from 'node:fs';
import * as H from '../shared/honours.js';
import { buildRows } from './season-data.mjs';

const DB_URL = 'https://deuceandsmash-club-default-rtdb.asia-southeast1.firebasedatabase.app';
const args = process.argv.slice(2);
const force = args.includes('--force'), dry = args.includes('--dry');
const fileArg = args.find(a => a.startsWith('--file='))?.slice(7); // offline test: a JSON export of the database
const istNow = new Date(Date.now() + 5.5 * 36e5);
const month = args.find(a => /^\d{4}-\d{2}$/.test(a)) || H.prevMonth(istNow.toISOString().slice(0, 7));

if (month < H.HONOURS.FIRST_SEASON) { console.log(`${month} is before the first season (${H.HONOURS.FIRST_SEASON}). Nothing to do.`); process.exit(0); }
const { to } = H.monthBounds(month);
if (istNow.toISOString().slice(0, 10) <= to && !force) { console.log(`${month} hasn't finished yet. Nothing to do.`); process.exit(0); }

let db, root;
if (fileArg) root = JSON.parse(fs.readFileSync(fileArg, 'utf8'));
else {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) { console.error('FIREBASE_SERVICE_ACCOUNT is not set.'); process.exit(1); }
  initializeApp({ credential: cert(JSON.parse(sa)), databaseURL: DB_URL });
  db = getDatabase();
}
const read = async path => fileArg ? path.split('/').reduce((o, k) => o?.[k], root) ?? null : (await db.ref(path).get()).val();

const existing = await read(`seasons/${month}/meta`);
if (existing && !force) { console.log(`${month} is already closed (at ${new Date(existing.closedAt).toISOString()}). Use --force to rewrite it.`); process.exit(0); }

const [profiles, openPlayMatches, adjustments, submissions, settings] = await Promise.all(
  ['profiles', 'openPlayMatches', 'adjustments', 'submissions', 'honoursSettings'].map(read));
const { rows, levels } = buildRows({ profiles, openPlayMatches, adjustments, submissions }, to);
const st = settings || {}, num = (v, d) => (isFinite(+v) && +v > 0 ? +v : d);
const record = H.closeSeason(rows, month, levels, {
  K: num(st.K, H.HONOURS.K), min: num(st.MIN_SEASON, H.HONOURS.MIN_SEASON),
  K_PAIR: num(st.K_PAIR, H.HONOURS.K_PAIR), MIN_PAIR: num(st.MIN_PAIR, H.HONOURS.MIN_PAIR), closedAt: Date.now(),
});

const name = id => profiles?.[id]?.name || id;
console.log(`Season ${month}: ${record.meta.ranked} ranked, ${record.meta.warming} warming up, club average ${record.meta.clubAvg}`);
for (const [id, x] of Object.entries(record.standings).sort((a, b) => a[1].rank - b[1].rank).slice(0, 5)) console.log(`  ${x.rank}. ${name(id)}  ${x.score}  (${x.sets} sets)`);
for (const [id, list] of Object.entries(record.seals)) console.log(`  seal → ${name(id)}: ${list.map(s => s.type + (s.place ? s.place : s.level ? ':' + s.level : '')).join(', ')}`);

if (dry) { console.log('Dry run: nothing written.'); process.exit(0); }
await db.ref(`seasons/${month}`).set(record);
console.log(`Wrote seasons/${month}.`);
process.exit(0);
