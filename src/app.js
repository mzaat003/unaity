// Builds the Express app: the web app (PWA) plus the chat endpoints.
// Kept separate from server.js so tests can import `app` without binding a port.
//
//   GET  /health
//   POST /chat         { prompt | messages, provider?, model? }  -> JSON
//   POST /chat/stream  same body                                 -> SSE (single brain)
//   POST /chat/all     { prompt | messages, model? }             -> SSE (all brains)

import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  route,
  routeStream,
  routeAllStream,
  availableProviders,
} from "./router.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // Serve the installable web app (PWA) from /public.
  app.use(express.static(join(__dirname, "..", "public")));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, providers: availableProviders() });
  });

  app.post("/chat", async (req, res) => {
    const { prompt, messages, system, provider, model } = req.body || {};
    if (!hasInput(prompt, messages)) {
      return res.status(400).json({ error: "Provide `prompt` or `messages`." });
    }
    try {
      const result = await route({ prompt, messages, system, provider, model });
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: String(err.message || err) });
    }
  });

  // Streaming (single brain). SSE events:
  //   {delta, provider, model}  — a chunk of text
  //   {done, provider, model}   — finished
  //   {error}                   — routing failed
  app.post("/chat/stream", async (req, res) => {
    const { prompt, messages, system, provider, model } = req.body || {};
    if (!hasInput(prompt, messages)) {
      return res.status(400).json({ error: "Provide `prompt` or `messages`." });
    }
    const { send, abort } = openSse(req, res);
    try {
      const result = await routeStream({
        prompt,
        messages,
        system,
        provider,
        model,
        signal: abort.signal,
        onDelta: (delta, prov, mod) => send({ delta, provider: prov, model: mod }),
      });
      send({ done: true, provider: result.provider, model: result.model });
    } catch (err) {
      if (!abort.signal.aborted) send({ error: String(err.message || err) });
    }
    res.end();
  });

  // "Ask all brains at once" (every configured provider in parallel). SSE events:
  //   {provider, model, delta}   — a chunk from one provider
  //   {provider, model, done}    — that provider finished
  //   {provider, model, error}   — that provider failed (others keep going)
  //   {allDone, results}         — everything finished
  //   {error}                    — request-level failure (no provider field)
  app.post("/chat/all", async (req, res) => {
    const { prompt, messages, system, model } = req.body || {};
    if (!hasInput(prompt, messages)) {
      return res.status(400).json({ error: "Provide `prompt` or `messages`." });
    }
    const { send, abort } = openSse(req, res);
    try {
      const results = await routeAllStream({
        prompt,
        messages,
        system,
        model,
        signal: abort.signal,
        onDelta: (provider, delta, mod) => send({ provider, model: mod, delta }),
        onDone: (provider, _text, mod) => send({ provider, model: mod, done: true }),
        onError: (provider, error, mod) => send({ provider, model: mod, error }),
      });
      send({
        allDone: true,
        results: results.map(({ provider, model: mod, ok }) => ({
          provider,
          model: mod,
          ok,
        })),
      });
    } catch (err) {
      if (!abort.signal.aborted) send({ error: String(err.message || err) });
    }
    res.end();
  });

  return app;
}

function hasInput(prompt, messages) {
  return Boolean(prompt) || (Array.isArray(messages) && messages.length > 0);
}

// Opens a Server-Sent Events response and wires up client-disconnect aborting.
// Watches the response 'close' (not the request): req 'close' fires as soon as
// the request body is consumed, which would abort our own stream immediately.
function openSse(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) abort.abort();
  });

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  return { send, abort };
}
