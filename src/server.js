// Minimal HTTP front door for the router.
//
//   POST /chat   { "prompt": "hello", "provider"?: "...", "model"?: "..." }
//   GET  /health
//
// Start with:  npm start

import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { route, routeStream, availableProviders } from "./router.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: "1mb" }));

// Serve the installable web app (PWA) from /public.
app.use(express.static(join(__dirname, "..", "public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true, providers: availableProviders() });
});

app.post("/chat", async (req, res) => {
  const { prompt, messages, system, provider, model } = req.body || {};
  if (!prompt && !(Array.isArray(messages) && messages.length)) {
    return res.status(400).json({ error: "Provide `prompt` or `messages`." });
  }
  try {
    const result = await route({ prompt, messages, system, provider, model });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
});

// Streaming variant: Server-Sent Events. Each event is a JSON object:
//   {delta, provider, model}  — a chunk of text as it arrives
//   {done, provider, model}   — stream finished successfully
//   {error}                   — routing failed
app.post("/chat/stream", async (req, res) => {
  const { prompt, messages, system, provider, model } = req.body || {};
  if (!prompt && !(Array.isArray(messages) && messages.length)) {
    return res.status(400).json({ error: "Provide `prompt` or `messages`." });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Stop upstream provider calls if the client disconnects mid-stream.
  // (Watch the response, not the request: req 'close' fires as soon as the
  // request body is consumed, which would abort our own stream instantly.)
  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) abort.abort();
  });

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
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

const port = process.env.PORT || 3000;
// Bind 0.0.0.0 so the app is reachable from phones/laptops on your network.
app.listen(port, "0.0.0.0", () => {
  const providers = availableProviders();
  console.log(`unaity web app on http://localhost:${port}  (also on your LAN IP)`);
  console.log(
    providers.length
      ? `Configured providers: ${providers.join(", ")}`
      : "No providers configured yet — add a key in .env (see .env.example)."
  );
});
