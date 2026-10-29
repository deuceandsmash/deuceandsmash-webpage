# deuceandsmash.com

Static site, published by Vercel from this repo. **Every push to `main` goes live within about a minute.**

| Path | What it is |
|---|---|
| `/` (`index.html`) | Public landing page |
| `/members/` | Members portal & Smash Ratings |
| `/tournaments/` | Tournament admin & scoreboards |
| `/ops/` | Owners-only ops dashboard (Google sign-in) |
| `/ops/entry/` | Front-desk booking entry (club account + owners) |
| `google376c53379fc20b77.html` | Google Search Console verification — keep |

## Rules that keep the site working

1. **Change the site only through this repo.** Do not run `vercel deploy` from a local folder:
   a folder with just the landing page replaces the whole site and takes down every other page
   (this happened on 29 Oct 2026).
2. **Do not add a `vercel.json` with a catch-all route** (`"/(.*)" → "/index.html"`).
   It sends `/members`, `/tournaments` and `/ops` to the landing page.
3. After a push, check `/`, `/members/`, `/tournaments/`, `/ops/` and `/ops/entry/` all load.
