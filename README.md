# Playhouse

A small games site. Codeword is the first one; the shell, saves and sign-in are
shared so the next game slots in beside it.

Next.js (App Router) · Supabase · deploys to Vercel.

## Run it

Node 24 lives outside the shell PATH on this machine:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
```

```bash
npm install && npm run dev
```

That is enough to play. **Supabase is optional** — see below.

## Sign-in is optional, deliberately

Playing needs no account and no backend. Progress is a `localStorage` entry, so
the site works offline and a first-time visitor is never stopped at a login wall
— the fastest way to lose someone who came to do a puzzle.

Signing in adds one thing: saves that follow you between devices. Anything
solved beforehand is carried up on first sign-in rather than lost.

To switch it on:

1. Create a project at supabase.com (I cannot create accounts for you).
2. Open `supabase/migrations/0001_init.sql`, copy its **contents**, and paste them
   into the Supabase SQL Editor (New query → paste → Run). Pasting the file
   *path* gets you `syntax error at or near "supabase"`.
3. Copy `.env.local.example` to `.env.local` and fill in the project URL and the
   anon/publishable key from **Project Settings → Data API**.
4. Under **Authentication → URL Configuration**, add
   `http://localhost:3000/auth/callback` and your deployed equivalent to the
   redirect allow-list.

With those unset the site still runs; `AuthBar` renders nothing rather than
offering a button that cannot work.

## How it fits together

```
src/games/codeword/engine.ts    pure solving logic — no DOM, no React
src/games/codeword/*.tsx        the board, the picker, the celebration
src/lib/progress.ts             localStorage, and Postgres when signed in
src/lib/supabase/client.ts      returns null when unconfigured, by design
src/data/codeword.json          80 puzzles, generated elsewhere
supabase/migrations/            schema + row-level security
```

**`engine.ts` is deliberately free of React.** It holds the word-slot model, the
across/down cursor, the rule that typing stays inside a word until it is solved,
and the rule that a letter may stand for only one number. That is the part worth
keeping, and it would move to a native app unchanged.

**Puzzles are imported as a module, not read from disk.** They are static
content: bundled, cached, and independent of where the server process was
started. Player state is the dynamic half and that is what Postgres holds.

**The payload carries no answer list.** The grid and key are all the board needs;
shipping the word list would hand the solution to anyone who opens devtools.

**Saves are keyed by grid fingerprint as well as puzzle id.** Ids are only unique
within a pack — two packs both numbering from CW-001 would otherwise restore
each other's letters onto different grids.

## Where the puzzles come from

`~/Documents/codeword` — a separate Node pipeline that compiles grids, proves
each has exactly one solution, and exports JSON. It never ships here; this app
only consumes its output.
