// The "one brain": takes a prompt (or full message list) and dispatches it
// to the first configured provider in PROVIDER_ORDER. If that provider errors
// or is rate-limited, it falls through to the next one automatically.

import * as openrouter from "./providers/openrouter.js";
import * as groq from "./providers/groq.js";
import * as gemini from "./providers/gemini.js";
import * as ollama from "./providers/ollama.js";

const REGISTRY = {
  openrouter,
  groq,
  gemini,
  ollama,
};

function orderedProviders() {
  const raw = process.env.PROVIDER_ORDER || "openrouter,groq,gemini,ollama";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((n) => REGISTRY[n])
    .filter(Boolean);
}

// Which providers currently have credentials / a reachable config.
export function availableProviders() {
  return orderedProviders()
    .filter((p) => p.isConfigured())
    .map((p) => p.name);
}

function normalizeMessages({ prompt, messages, system }) {
  if (Array.isArray(messages) && messages.length) return messages;
  const out = [];
  if (system) out.push({ role: "system", content: system });
  out.push({ role: "user", content: prompt ?? "" });
  return out;
}

/**
 * Route one request through the fallback chain.
 *
 * @param {object} opts
 * @param {string} [opts.prompt]      Simple single-turn prompt.
 * @param {Array}  [opts.messages]    Full [{role, content}] list (overrides prompt).
 * @param {string} [opts.system]      Optional system prompt (used with prompt).
 * @param {string} [opts.provider]    Force a specific provider (skip fallback).
 * @param {string} [opts.model]       Override the provider's default model.
 * @returns {Promise<{text, provider, model, attempts}>}
 */
function pickCandidates(opts) {
  let candidates = orderedProviders().filter((p) => p.isConfigured());
  if (opts.provider) {
    const forced = REGISTRY[opts.provider];
    if (!forced) throw new Error(`unknown provider: ${opts.provider}`);
    candidates = [forced];
  }
  if (!candidates.length) {
    throw new Error(
      "No providers configured. Add at least one key in .env " +
        "(see .env.example)."
    );
  }
  return candidates;
}

export async function route(opts = {}) {
  const messages = normalizeMessages(opts);
  const candidates = pickCandidates(opts);

  const attempts = [];
  for (const provider of candidates) {
    const model = opts.model || provider.defaultModel;
    try {
      const { text } = await provider.chat({
        messages,
        model,
        signal: opts.signal,
      });
      return { text, provider: provider.name, model, attempts };
    } catch (err) {
      attempts.push({ provider: provider.name, error: String(err.message || err) });
      // fall through to the next provider
    }
  }

  const summary = attempts
    .map((a) => `${a.provider}: ${a.error}`)
    .join(" | ");
  throw new Error(`All providers failed. ${summary}`);
}

/**
 * "Ask all brains at once": fan the same conversation out to EVERY configured
 * provider in parallel, streaming each one's reply as it arrives.
 *
 * Callbacks (all optional):
 *   opts.onDelta(providerName, textChunk, model)  — a chunk from one provider
 *   opts.onDone(providerName, fullText, model)    — that provider finished
 *   opts.onError(providerName, errorMessage, model) — that provider failed
 *
 * Never rejects for individual provider failures — each result records ok.
 * @returns {Promise<Array<{provider, model, ok, text?, error?}>>}
 */
export function routeAllStream(opts = {}) {
  const messages = normalizeMessages(opts);
  const candidates = orderedProviders().filter((p) => p.isConfigured());
  if (!candidates.length) {
    throw new Error(
      "No providers configured. Add at least one key in .env " +
        "(see .env.example)."
    );
  }

  const runs = candidates.map(async (provider) => {
    const model = opts.model || provider.defaultModel;
    let text = "";
    try {
      for await (const delta of provider.stream({
        messages,
        model,
        signal: opts.signal,
      })) {
        text += delta;
        opts.onDelta?.(provider.name, delta, model);
      }
      opts.onDone?.(provider.name, text, model);
      return { provider: provider.name, model, ok: true, text };
    } catch (err) {
      const error = String(err.message || err);
      opts.onError?.(provider.name, error, model);
      return { provider: provider.name, model, ok: false, error };
    }
  });

  return Promise.all(runs);
}

/**
 * Streaming version of route(). Calls opts.onDelta(textChunk, provider, model)
 * for each piece of text as it arrives. Falls back to the next provider only
 * if a provider fails BEFORE emitting anything (once text has streamed to the
 * client we can't cleanly restart, so mid-stream errors propagate).
 *
 * @returns {Promise<{text, provider, model, attempts}>} the full assembled text.
 */
export async function routeStream(opts = {}) {
  const messages = normalizeMessages(opts);
  const candidates = pickCandidates(opts);

  const attempts = [];
  for (const provider of candidates) {
    const model = opts.model || provider.defaultModel;
    let text = "";
    try {
      for await (const delta of provider.stream({
        messages,
        model,
        signal: opts.signal,
      })) {
        text += delta;
        opts.onDelta?.(delta, provider.name, model);
      }
      return { text, provider: provider.name, model, attempts };
    } catch (err) {
      if (text) throw err; // already streamed output — don't restart elsewhere
      attempts.push({ provider: provider.name, error: String(err.message || err) });
    }
  }

  const summary = attempts
    .map((a) => `${a.provider}: ${a.error}`)
    .join(" | ");
  throw new Error(`All providers failed. ${summary}`);
}
