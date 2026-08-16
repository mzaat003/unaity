// Ollama: local models, unlimited, no account or key required.
// Install from https://ollama.com then pull a model, e.g. `ollama pull llama3.2`.
// Docs: https://github.com/ollama/ollama/blob/main/docs/api.md

export const name = "ollama";

export const defaultModel = "llama3.2";

function baseUrl() {
  return process.env.OLLAMA_BASE_URL || "http://localhost:11434";
}

// Treated as "configured" whenever a base URL is set. It may still fail at
// call time if Ollama isn't actually running — the router falls past it then.
export function isConfigured() {
  return Boolean(baseUrl());
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
