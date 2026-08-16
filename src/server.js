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
import { route, availableProviders } from "./router.js";

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
