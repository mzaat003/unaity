# unaity

**One brain across many AIs.** `unaity` is a small router that takes a single
prompt and dispatches it to whichever AI provider you want — through each
provider's **official API** — and automatically falls back to the next one when
a provider is rate-limited or down.

Instead of juggling dozens of separate website logins, you sign up **once** per
provider, create **one API key** each, and get access to hundreds of models
behind a single endpoint.

```
your app / CLI  ->  unaity router  ->  ┌─ OpenRouter (100s of models, many free)
                                       ├─ Groq       (free, very fast)
                                       ├─ Gemini     (free API tier)
                                       └─ Ollama     (local, unlimited, no key)
```

## Launch it

unaity comes in two forms. Pick the one that fits — both are free.

### ⭐ Free forever, no server, no card: GitHub Pages (recommended)

The `static/` folder is a **backend-free** version of unaity that runs entirely
in your browser and talks to OpenRouter directly. There's nothing to run and
nothing to pay for — it hosts on GitHub Pages as static files.

1. Push this repo to GitHub (you're likely already there).
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**
   (one tap, doable from a phone). The included workflow does the rest on every
   push to `main`.
3. You get a permanent URL like `https://<you>.github.io/unaity/`. Open it on
   any phone or laptop; on Android, Chrome's **⋮ → Install app** makes it a
   home-screen app.
4. First time, it asks for a free [OpenRouter key](https://openrouter.ai/keys).

**Your key is stored only in your browser** (localStorage) — never uploaded,
never in the code, never visible to other visitors of the public page. On a new
device you just open the URL and paste the key once. Tip: set a **$0 credit
limit** on OpenRouter to stay strictly on free models.

This version uses OpenRouter (one key → hundreds of models). "Compare mode"
asks three free models at once.

### The full server version (all providers, local or hosted)

Runs the Node server with the multi-provider router (OpenRouter, Groq, Gemini,
Ollama) and keeps your keys server-side.

**On your own computer** (2 minutes):

```bash
npm install
cp .env.example .env          # then paste ONE free key into .env
npm start                     # open http://localhost:3000
```

Open that URL in any browser on the same Wi-Fi (use your computer's LAN IP,
e.g. `http://192.168.1.20:3000`, from your phone).

**On free hosting:** this repo ships a `render.yaml` for a one-click
[Render](https://render.com) Blueprint deploy, and a `Dockerfile` for Railway,
Fly.io, Cloud Run, or any Docker host.

> Either way you need **one** provider key first (they're free — see the table
> below). unaity never creates accounts for you; you make one key by hand, once.

## Why API keys instead of many accounts

The website login pages for these services aren't meant to be driven by code —
they're guarded by CAPTCHAs and verification, and scripting mass signups
violates their terms. The **API** is the sanctioned, stable path: one account,
one key, as many calls as the plan allows. Several providers give this away for
free, so you get breadth without farming accounts.

## Setup

Requires **Node.js 18+** (uses built-in `fetch`).

```bash
npm install
cp .env.example .env
```

Then open `.env` and paste in the keys you want. You only need **one** to start.
Create each key by hand (links are in `.env.example`):

| Provider   | Free tier | Get a key |
|------------|-----------|-----------|
| OpenRouter | many free models | https://openrouter.ai/keys |
| Gemini     | generous free API | https://aistudio.google.com/apikey |
| Groq       | free            | https://console.groq.com/keys |
| Ollama     | fully local, no key | https://ollama.com |

> A single dedicated Google account for these signups (to keep them out of your
> personal inbox) is perfectly fine. What unaity does **not** do is create
> accounts for you or automate signups — you make each account/key yourself, once.

## Use it

**Command line:**

```bash
npm run ask -- "explain quantum entanglement simply"
npm run ask -- --provider groq "write a haiku about the sea"
npm run ask -- --model "google/gemini-2.0-flash-exp:free" "hello"
npm run ask -- --all "which of you explains recursion best?"   # ask every brain
```

**HTTP server:**

```bash
npm start
# then, from anywhere:
curl -s localhost:3000/chat \
  -H 'content-type: application/json' \
  -d '{"prompt":"give me three startup ideas"}'
```

**Streaming:** the web UI and CLI stream replies word-by-word automatically.
For your own integrations, `POST /chat/stream` returns Server-Sent Events —
`{"delta": "..."}` chunks followed by `{"done": true, "provider": "...", "model": "..."}`
(or `{"error": "..."}`). Plain `POST /chat` stays available for simple
request/response use.

Check what's wired up:

```bash
curl -s localhost:3000/health
# { "ok": true, "providers": ["openrouter","groq"] }
```

## Web app + Android app (same thing, free)

`unaity` ships a mobile-friendly chat UI that is also an installable **PWA**
(Progressive Web App). Start the server and open it in any browser:

```bash
npm start
# open http://localhost:3000  (works on any phone or laptop on your network)
```

- **On a laptop:** open the URL in Chrome/Edge/Safari — that's your web version.
- **On Android:** open the URL in Chrome, tap the **⋮ menu → "Install app"** (or
  "Add to Home screen"). It lands on your home screen and runs fullscreen like a
  native app. **No Play Store, no fee, no separate codebase** — one app, everywhere.
- **On iPhone:** Share → "Add to Home Screen" does the same thing.

To reach it from your phone while the server runs on your laptop, both on the
same Wi-Fi, use the laptop's LAN IP (e.g. `http://192.168.1.20:3000`).

### Make it reachable from anywhere (free)

The API-only providers (OpenRouter, Groq, Gemini) work from any host, so you can
deploy the server to a free tier and reach it from any device, anywhere:

- **Render**, **Railway**, or **Fly.io** free tiers — push this repo, set your
  keys as environment variables, done.
- **Cloudflare Tunnel** / **ngrok** — expose your laptop's `localhost:3000`
  publicly for free without deploying.

> Note: **Ollama** (local models) only runs where it's installed, so it won't be
> available on a cloud host — the router just falls past it to the API providers.

## How routing works

The `PROVIDER_ORDER` in `.env` sets the priority. The router tries the first
configured provider; if it errors or is rate-limited, it moves to the next,
and reports which one actually answered. Force a specific one with
`--provider` (CLI) or `"provider"` (HTTP).

## Ask all brains at once

Pick **🧠 All brains** in the web app's dropdown (or `--all` on the CLI) to fan
one prompt out to **every configured provider in parallel**. Each brain streams
its answer into its own card side by side, so you can compare them; the first to
finish is tagged ⚡ and its answer is kept as conversation context.

For your own integrations, `POST /chat/all` returns one SSE stream multiplexing
all providers: `{"provider","model","delta"}` chunks, `{"provider","done"}` per
provider, and a final `{"allDone":true,"results":[...]}`. Providers that fail
send `{"provider","error"}` without stopping the others.

## Layout

```
src/
  router.js          the brain: provider selection + fallback
  app.js             builds the Express app (routes + serves the web app)
  server.js          starts the app on a port
  cli.js             command-line entry point
  providers/
    openrouter.js    each file wraps one official API behind chat()/stream()
    groq.js
    gemini.js
    ollama.js
    stream-util.js   shared SSE / NDJSON parsers
public/              the installable web app (PWA)
  index.html         mobile-first chat UI
  app.js             frontend logic (calls /chat, keeps context)
  manifest.webmanifest  + service-worker.js  -> installable on Android/iOS
  icon-192.png / icon-512.png
scripts/
  gen-icons.mjs      regenerates the icons (dependency-free PNG writer)
test/                automated tests (node:test) against mock providers
```

## Tests

```bash
npm test
```

Runs a dependency-free `node:test` suite that spins up mock providers on
localhost and exercises the stream parsers, the router's fallback and
all-brains fan-out, and every HTTP endpoint — no real API keys or network
needed. Run it after any change to catch regressions.

## Point a provider at a custom endpoint

`OPENROUTER_BASE_URL` / `GROQ_BASE_URL` let you aim those providers at any
OpenAI-compatible server — a local **LM Studio** or **vLLM**, or a proxy —
instead of the default hosted API. Handy for fully local, fully free setups.

Adding a provider is one file: export `name`, `defaultModel`, `isConfigured()`,
and `chat({ messages, model, signal })`, then list it in `src/router.js`.
