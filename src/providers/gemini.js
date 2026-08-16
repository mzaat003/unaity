// Google Gemini: generous free API tier. Uses its native REST shape,
// which differs from the OpenAI format, so we translate messages here.
// Docs: https://ai.google.dev/gemini-api/docs

export const name = "gemini";

export const defaultModel = "gemini-2.0-flash";

export function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

// Gemini splits the system prompt out and uses role "model" (not "assistant").
function toGeminiPayload(messages) {
  const systemParts = [];
  const contents = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push({ text: m.content });
      continue;
    }
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }
  const payload = { contents };
  if (systemParts.length) payload.systemInstruction = { parts: systemParts };
  return payload;
}

export async function chat({ messages, model, signal }) {
  const useModel = model || defaultModel;
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${useModel}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toGeminiPayload(messages)),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`gemini ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  return { text };
}
