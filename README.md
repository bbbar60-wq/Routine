# Routine

A personal operating system for one person's whole life — work, research,
training, sport, health, learning, money, goals and the journal that gives the
numbers their context.

Everything runs locally. The data lives in a single SQLite file on your machine
and never leaves it.

---

## Running it — the desktop icon

Double-click **Routine** on the desktop. That's the whole thing: it starts the
server if it isn't already up and opens the app in your browser. No terminal,
no commands, no window.

On a machine that has just cloned this repo, that same first click also does
everything else that's needed — installs dependencies, creates the database,
builds the UI — and shows a console while it works so you can watch progress.
It's a few minutes once; every click after that takes about a second.

Three shortcuts get installed:

| Shortcut | What it does |
|---|---|
| **Routine** | Start (if needed) and open. Silent — nothing flashes on screen. |
| **Stop Routine** | Shuts the server down. |
| **Routine (Dev)** | Hot reload + visible logs, for when you're editing the code. |

### Installing the shortcuts

Run once, after cloning:

```bash
powershell -ExecutionPolicy Bypass -File scripts\install-shortcuts.ps1
```

Add `-StartMenu` to also put it in the Start menu, or `-Remove` to take the
shortcuts away again. Re-running is safe — it just overwrites them.

If you want Routine to come up at login, put a copy of the **Routine** shortcut
in `shell:startup`.

### Or from a terminal

```bash
npm run dev      # API on :5181 + Vite on :5180, hot reload  → http://127.0.0.1:5180
npm run build && npm start    # one process, UI + API        → http://127.0.0.1:5181
```

### Sign in

Seeding creates one account with a **known, public default password** — it is
written in this file and in `server/seed.mjs`:

| | |
|---|---|
| email | `rezabz2005@gmail.com` |
| password | `routine2026` |

Change it in **Settings → Profile → Change password** the first time you sign
in. That stores a scrypt hash and signs out every other session. Nothing is
exposed in the meantime — the server only ever binds `127.0.0.1`, so it is not
reachable from your network, let alone the internet — but a default password
should not stay a default.

To seed with your own credentials instead:

```bash
SEED_EMAIL=you@example.com SEED_NAME=You SEED_PASSWORD=something-better npm run seed
```

If you'd rather start from an empty database, delete `data/routine.db*` and
reload — the first account you create becomes the owner. After that, sign-up is
closed unless you set `ROUTINE_ALLOW_SIGNUP=1`.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API + Vite together, with hot reload on both |
| `npm run build` | Typecheck, then build the UI into `dist/` |
| `npm start` | Production: one process serving UI + API |
| `npm run seed` | Seed demo data (only if the account is empty) |
| `npm run reset` | Wipe this account's data and reseed it |
| `npm test` | API test suite (needs a server running) |
| `npm run typecheck` | TypeScript, no emit |
| `scripts\install-shortcuts.ps1` | Create the desktop shortcuts (`-Remove` to undo) |
| `scripts\launch.ps1` | The launcher the icon runs (`-Mode prod\|dev`) |
| `scripts\stop.ps1` | Stop the server and any supervisors |
| `scripts\make-icon.py` | Regenerate `assets/routine.ico` from the logo mark |

---

## What's in it

| Page | What it tracks |
|---|---|
| **Today** | The command centre: habits due, tasks on deck, live focus timer, 7-day momentum, goals, deadlines |
| **Habits** | A tap-to-log consistency grid, streaks (current + best), completion rates |
| **Tasks** | Tasks with priority, due dates, estimates, and projects with their own progress and logged time |
| **Focus** | Start/stop timer or log past sessions; time split by area of life |
| **Journal** | A daily entry with mood, highlight, gratitude and tags; full-text search |
| **Gym** | Workouts → exercises → sets, with volume trends and estimated 1RM records |
| **Sports** | Football, running, swimming and anything else outside the gym |
| **Health** | Sleep, mood, energy, stress, weight, body fat, water, steps |
| **Learning** | Courses with progress, a paper/book library, and a study-time log |
| **Goals** | Year / quarter / month targets with progress you can nudge from the card |
| **Finance** | Income and spending in Toman (or USD/EUR), category breakdown, monthly budgets |
| **Insights** | Cross-cutting analytics: a year heatmap, time allocation, habit rates, training volume, and a sleep↔mood correlation |
| **Settings** | Profile, theme, calendar, targets, currency, and full JSON export/import |

`Ctrl`/`Cmd` + `K` opens the command palette from anywhere.

---

## How it's built

**No backend dependencies at all.** The server is `node:http` + `node:sqlite` +
`node:crypto` — nothing from npm. That means no native build step and nothing
that can break when a registry is slow or unreachable. It needs Node ≥ 22.5 for
the built-in SQLite module.

```
server/
  index.mjs        HTTP server, router, static file serving
  db.mjs           schema + query helpers (node:sqlite)
  auth.mjs         scrypt hashing, sessions, CSRF
  http.mjs         body parsing, errors, cookies, rate limiting
  validate.mjs     declarative request validation
  lib/dates.mjs    date arithmetic (UTC, DST-proof)
  routes/          auth · core · body · life · insights
  seed.mjs         ~140 days of demo history
src/
  lib/             api client, dates (incl. Jalali), domain colours, formatting
  components/ui/   buttons, fields, modals, toasts, chips
  components/charts/  hand-built SVG charts
  components/layout/  shell, sidebar, command palette
  pages/           one file per page
```

The frontend is Vite + React 19 + TypeScript + Tailwind v4. Charts are
hand-built SVG rather than a charting library — it keeps the bundle small and
lets every mark follow the same design rules.

### Security

- Passwords hashed with **scrypt** (N=16384), random per-user salt, compared in constant time.
- Sessions are opaque random tokens; only their SHA-256 digest is stored. The cookie is `httpOnly` + `SameSite=Lax`, so the browser never exposes a token to JS.
- **CSRF**: every write must echo a session-bound token in `X-CSRF-Token`. A cross-site page can't set custom headers or read the cookie.
- Every query is parameterised, and every row is scoped by `user_id` — a wrong id returns 404, never someone else's data.
- Request bodies are validated field-by-field before they reach SQL.
- Rate limits on sign-in (10 per 15 min) and sign-up (5/hour), plus a global API ceiling.
- Production sends CSP, HSTS-adjacent headers, `X-Frame-Options: DENY`, nosniff, and a strict referrer policy. Static serving is contained to `dist/` — path traversal returns 404.
- Failed sign-ins run a dummy hash so a missing account and a wrong password take the same time.

### Design

Dark-first, built on a three-layer token system (primitive → semantic →
component). No component references a raw hex.

Eight "areas of life" each own a hue. That palette was **run through a
colour-vision validator** in both themes: every adjacent pair clears the CVD and
normal-vision separation floors, and every step clears 3:1 against its own
surface. Every text/surface pair in the app was checked against WCAG AA (4.5:1)
numerically, not by eye. A domain colour is always paired with its name — colour
never carries meaning on its own.

Persian (Jalali) dates come from the platform's own `ca-persian` calendar, shown
alongside Gregorian throughout.

### Where the data lives

`data/routine.db` (plus `-wal` / `-shm`). Back it up by copying that file, or use
**Settings → Export backup** for portable JSON. Restoring replaces everything in
the account, so export first.

`data/.secret` holds the HMAC key used to derive CSRF tokens. Keep it; deleting it
just invalidates open sessions.

---

## Configuration

Read from the environment; all optional.

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `5181` | Port the API/server listens on |
| `HOST` | `127.0.0.1` | Bind address. Loopback on purpose — widen it and your life data is on the network |
| `NODE_ENV` | — | `production` serves `dist/` and sends the full CSP |
| `ROUTINE_DATA_DIR` | `./data` | Where the database and secret live |
| `ROUTINE_DB` | `<data>/routine.db` | Database file path |
| `ROUTINE_SECRET` | generated into `data/.secret` | HMAC key backing CSRF tokens |
| `ROUTINE_ALLOW_SIGNUP` | unset | `1` keeps registration open after the first account |
| `SEED_EMAIL` / `SEED_NAME` / `SEED_PASSWORD` | see above | Credentials `npm run seed` creates |

## Licence

MIT — see [LICENSE](LICENSE).

The two bundled typefaces are not mine and are not covered by that licence.
Instrument Sans and Geist Mono are used unmodified under the SIL Open Font
License 1.1, with the full text shipped beside them in `public/fonts/`.

## Notes for this machine

The app lives at `C:\devstore\routine-app` and is surfaced at
`…\Desktop\Routine\app` through a directory junction. That's deliberate: npm's
installer removes and recreates `node_modules`, which fights OneDrive sync, so
the real files sit outside OneDrive. `.npmrc` pins the npmjs registry and caps
`maxsockets=3`, both of which are needed for installs to finish here.
