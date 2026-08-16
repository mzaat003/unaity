// Groq: free, very fast inference via an OpenAI-compatible API.
// Docs: https://console.groq.com/docs

import { sseData } from "./stream-util.js";

const BASE_URL = "https://api.groq.com/openai/v1/chat/completions";

export const name = "groq";

export const defaultModel = "llama-3.3-70b-versatile";

export function isConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
}

export async function chat({ messages, model, signal }) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || defaultModel,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`groq ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? "" };
}

// Yields text deltas as they arrive (OpenAI-style SSE).
export async function* stream({ messages, model, signal }) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || defaultModel,
      messages,
      stream: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`groq ${res.status}: ${body.slice(0, 300)}`);
  }

  for await (const data of sseData(res.body)) {
    if (data === "[DONE]") return;
    const delta = JSON.parse(data).choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}
