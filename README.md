# deuceandsmash.com

Static site, published by Vercel from this repo. **Every push to `main` goes live within about a minute.**

| Path | What it is |
|---|---|
| `/` (`index.html`) | Public landing page |
| `/smashdex/` | SmashDex: member-facing app (SDX Rating, Matchup Dex). Holding page for now |
| `/members/` | Redirects to `/smashdex/` |
| `/admin/` | Club staff tool: member database, Smash/SDX ratings, open-play entry (PIN) |
| `/tournaments/` | Tournament admin & scoreboards |
| `/ops/` | Owners-only ops dashboard (Google sign-in) |
| `/ops/entry/` | Front-desk booking entry (club account + owners) |
| `/bazaar/` | Bazaar: public listing of gear for sale (new + pre-owned). Firebase project `deuceandsmash-bazaar` |
| `/bazaar/admin/` | Bazaar owners' admin (Google sign-in, owners only) |
| `google376c53379fc20b77.html` | Google Search Console verification — keep |

## Rules that keep the site working

1. **Change the site only through this repo.** Do not run `vercel deploy` from a local folder:
   a folder with just the landing page replaces the whole site and takes down every other page
   (this happened on 29 Oct 2026).
2. **Do not add a `vercel.json` with a catch-all route** (`"/(.*)" → "/index.html"`).
   It sends `/members`, `/tournaments` and `/ops` to the landing page.
3. After a push, check `/`, `/smashdex/`, `/members/` (redirect), `/admin/`, `/tournaments/`, `/ops/`, `/ops/entry/` and `/bazaar/` all load.

## Member IDs (since 14 Nov 2026)

Every match in `openPlayMatches` stores `teamAIds` / `teamBIds` (member keys) next to `teamA` / `teamB` (names),
and every open-play session stores `playerIds`. Member keys never change, even on rename. The staff tool heals
missing/stale IDs on load and shows names from the IDs, so renaming a member keeps their history.
Each member has a permanent public `dexNo` (shown as "Dex #0042"); `meta/dexCounter` holds the last issued number.
Pre-migration backup: `backups/2026-11-14-pre-smashdex` in the `deuceandsmash-club` database.
