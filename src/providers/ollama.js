// Ollama: local models, unlimited, no account or key required.
// Install from https://ollama.com then pull a model, e.g. `ollama pull llama3.2`.
// Docs: https://github.com/ollama/ollama/blob/main/docs/api.md

import { ndjson } from "./stream-util.js";

export const name = "ollama";

export const defaultModel = "llama3.2";

function baseUrl() {
  return process.env.OLLAMA_BASE_URL || "http://localhost:11434";
}

// Opt-in: only considered configured when OLLAMA_BASE_URL is explicitly set
// (set it to http://localhost:11434 to use a local install). This keeps a
// fresh, unconfigured install from advertising a provider that isn't running,
// so users get the clear "add a key" message instead of a fetch error.
export function isConfigured() {
  return Boolean(process.env.OLLAMA_BASE_URL);
}

export async function chat({ messages, model, signal }) {
  const res = await fetch(`${baseUrl()}/api/chat`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || defaultModel,
      messages,
      stream: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ollama ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  return { text: data.message?.content ?? "" };
}

// Yields text deltas as they arrive (Ollama streams newline-delimited JSON).
export async function* stream({ messages, model, signal }) {
  const res = await fetch(`${baseUrl()}/api/chat`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || defaultModel,
      messages,
      stream: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ollama ${res.status}: ${body.slice(0, 300)}`);
  }

  for await (const obj of ndjson(res.body)) {
    const delta = obj.message?.content;
    if (delta) yield delta;
    if (obj.done) return;
  }
}
