// Integration tests: drive the real Express app (and the real router +
// provider code) against mock upstreams, exercising every endpoint plus
// fallback and the all-brains fan-out.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  resetEnv,
  openAIMock,
  ollamaMock,
  startApp,
  collectSse,
} from "./helpers.mjs";

beforeEach(() => resetEnv());

// Point groq + ollama at mocks. Returns a cleanup that closes everything.
async function withMocks({ groqFail = false, ollamaChunks } = {}) {
  const groq = await openAIMock({ fail: groqFail, chunks: ["G", "roq"] });
  const ollama = await ollamaMock({ chunks: ollamaChunks || ["Oll", "ama"] });
  process.env.GROQ_API_KEY = "test";
  process.env.GROQ_BASE_URL = groq.url;
  process.env.OLLAMA_BASE_URL = ollama.url;
  process.env.PROVIDER_ORDER = "groq,ollama";
  const app = await startApp();
  return {
    app,
    close: async () => {
      await app.close();
      await groq.close();
      await ollama.close();
    },
  };
}

test("GET /health lists configured providers", async () => {
  const { app, close } = await withMocks();
  try {
    const res = await fetch(`${app.url}/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true, providers: ["groq", "ollama"] });
  } finally {
    await close();
  }
});

test("POST /chat 400s when neither prompt nor messages given", async () => {
  const { app, close } = await withMocks();
  try {
    const res = await fetch(`${app.url}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  } finally {
    await close();
  }
});

test("POST /chat returns the first provider's answer", async () => {
  const { app, close } = await withMocks();
  try {
    const res = await fetch(`${app.url}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hi" }),
    });
    const body = await res.json();
    assert.equal(body.provider, "groq");
    assert.equal(body.text, "Groq");
  } finally {
    await close();
  }
});

test("POST /chat falls back to the next provider when the first fails", async () => {
  const { app, close } = await withMocks({ groqFail: true });
  try {
    const res = await fetch(`${app.url}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hi" }),
    });
    const body = await res.json();
    assert.equal(body.provider, "ollama");
    assert.equal(body.text, "Ollama");
    assert.equal(body.attempts.length, 1);
    assert.equal(body.attempts[0].provider, "groq");
  } finally {
    await close();
  }
});

test("POST /chat 502s with a clear message when nothing is configured", async () => {
  const app = await startApp(); // no provider env set
  try {
    const res = await fetch(`${app.url}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hi" }),
    });
    const body = await res.json();
    assert.equal(res.status, 502);
    assert.match(body.error, /No providers configured/);
  } finally {
    await app.close();
  }
});

test("POST /chat/stream streams deltas then a done event", async () => {
  const { app, close } = await withMocks();
  try {
    const res = await fetch(`${app.url}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hi" }),
    });
    const events = await collectSse(res);
    const text = events.filter((e) => e.delta).map((e) => e.delta).join("");
    assert.equal(text, "Groq");
    const done = events.at(-1);
    assert.equal(done.done, true);
    assert.equal(done.provider, "groq");
  } finally {
    await close();
  }
});

test("POST /chat/stream falls back before emitting, then streams", async () => {
  const { app, close } = await withMocks({ groqFail: true });
  try {
    const res = await fetch(`${app.url}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hi" }),
    });
    const events = await collectSse(res);
    const text = events.filter((e) => e.delta).map((e) => e.delta).join("");
    assert.equal(text, "Ollama");
    assert.equal(events.at(-1).provider, "ollama");
  } finally {
    await close();
  }
});

test("POST /chat/stream emits an error event when all providers fail", async () => {
  const groq = await openAIMock({ fail: true });
  process.env.GROQ_API_KEY = "test";
  process.env.GROQ_BASE_URL = groq.url;
  process.env.PROVIDER_ORDER = "groq";
  const app = await startApp();
  try {
    const res = await fetch(`${app.url}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hi" }),
    });
    const events = await collectSse(res);
    assert.equal(events.length, 1);
    assert.match(events[0].error, /All providers failed/);
  } finally {
    await app.close();
    await groq.close();
  }
});

test("POST /chat/all fans out to every provider, isolating failures", async () => {
  const { app, close } = await withMocks({ groqFail: true });
  try {
    const res = await fetch(`${app.url}/chat/all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hi" }),
    });
    const events = await collectSse(res);

    // ollama streamed its answer
    const ollamaText = events
      .filter((e) => e.provider === "ollama" && e.delta)
      .map((e) => e.delta)
      .join("");
    assert.equal(ollamaText, "Ollama");
    assert.ok(events.some((e) => e.provider === "ollama" && e.done));

    // groq reported an error but did not stop the run
    assert.ok(events.some((e) => e.provider === "groq" && e.error));

    // final summary reflects both outcomes
    const allDone = events.at(-1);
    assert.equal(allDone.allDone, true);
    const byName = Object.fromEntries(allDone.results.map((r) => [r.provider, r.ok]));
    assert.deepEqual(byName, { groq: false, ollama: true });
  } finally {
    await close();
  }
});
