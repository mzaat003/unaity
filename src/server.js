// Minimal HTTP front door for the router.
//
//   POST /chat   { "prompt": "hello", "provider"?: "...", "model"?: "..." }
//   GET  /health
//
// Start with:  npm start

import "dotenv/config";
import express from "express";
import { route, availableProviders } from "./router.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

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

const port = process.env.PORT || 3000;
app.listen(port, () => {
  const providers = availableProviders();
  console.log(`unaity listening on http://localhost:${port}`);
  console.log(
    providers.length
      ? `Configured providers: ${providers.join(", ")}`
      : "No providers configured yet — add a key in .env (see .env.example)."
  );
});
