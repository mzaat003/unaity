// OpenRouter: one key -> hundreds of models via an OpenAI-compatible API.
// Docs: https://openrouter.ai/docs

const BASE_URL = "https://openrouter.ai/api/v1/chat/completions";

export const name = "openrouter";

// A free model by default so it works out of the box. Override per-request.
export const defaultModel = "meta-llama/llama-3.3-70b-instruct:free";

export function isConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export async function chat({ messages, model, signal }) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || defaultModel,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`openrouter ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? "" };
}
