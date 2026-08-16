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
```

**HTTP server:**

```bash
npm start
# then, from anywhere:
curl -s localhost:3000/chat \
  -H 'content-type: application/json' \
  -d '{"prompt":"give me three startup ideas"}'
```

Check what's wired up:

```bash
curl -s localhost:3000/health
# { "ok": true, "providers": ["openrouter","groq"] }
```

## How routing works

The `PROVIDER_ORDER` in `.env` sets the priority. The router tries the first
configured provider; if it errors or is rate-limited, it moves to the next,
and reports which one actually answered. Force a specific one with
`--provider` (CLI) or `"provider"` (HTTP).

## Layout

```
src/
  router.js          the brain: provider selection + fallback
  server.js          HTTP endpoint (/chat, /health)
  cli.js             command-line entry point
  providers/
    openrouter.js    each file wraps one official API behind chat()
    groq.js
    gemini.js
    ollama.js
```

Adding a provider is one file: export `name`, `defaultModel`, `isConfigured()`,
and `chat({ messages, model, signal })`, then list it in `src/router.js`.
