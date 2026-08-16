// Test helpers: mock upstream providers and app bootstrapping, all on
// ephemeral localhost ports so tests never touch the real network.

import { createServer } from "node:http";
import { createApp } from "../src/app.js";

// Env keys that select/configure providers. Cleared between tests so each one
// starts from a known slate.
const PROVIDER_ENV = [
  "PROVIDER_ORDER",
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "GROQ_API_KEY",
  "GROQ_BASE_URL",
  "GEMINI_API_KEY",
  "OLLAMA_BASE_URL",
];

export function resetEnv() {
  for (const k of PROVIDER_ENV) delete process.env[k];
}

async function readBody(req) {
  let b = "";
  for await (const c of req) b += c;
  return b ? JSON.parse(b) : {};
}

function listen(handler) {
  return new Promise((resolve) => {
    const srv = createServer(handler);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      resolve({
        port,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => srv.close(r)),
      });
    });
  });
}

// An OpenAI-compatible chat/completions endpoint (used by groq/openrouter).
export function openAIMock({ chunks = ["Hi", " there"], fail = false } = {}) {
  return listen(async (req, res) => {
    const body = await readBody(req);
    if (fail) return void res.writeHead(500).end("boom");
    if (body.stream) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const c of chunks) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: chunks.join("") } }] }));
    }
  });
}

// An Ollama-compatible /api/chat endpoint (NDJSON stream).
export function ollamaMock({ chunks = ["Hey", " you"], fail = false } = {}) {
  return listen(async (req, res) => {
    const body = await readBody(req);
    if (fail) return void res.writeHead(500).end("boom");
    if (body.stream) {
      res.writeHead(200, { "Content-Type": "application/x-ndjson" });
      for (const c of chunks) {
        res.write(JSON.stringify({ message: { content: c }, done: false }) + "\n");
      }
      res.write(JSON.stringify({ message: { content: "" }, done: true }) + "\n");
      res.end();
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: { content: chunks.join("") }, done: true }));
    }
  });
}

// Start the unaity app on an ephemeral port.
export function startApp() {
  const app = createApp();
  return new Promise((resolve) => {
    const srv = app.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => srv.close(r)),
      });
    });
  });
}

// Collect all SSE `data:` events from a fetch Response body into an array.
export async function collectSse(res) {
  const events = [];
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const take = (part) => {
    const l = part.trim();
    if (l.startsWith("data:")) events.push(JSON.parse(l.slice(5)));
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop();
    parts.forEach(take);
  }
  if (buf.trim()) take(buf);
  return events;
}

// An async iterable of Buffers, for unit-testing the stream parsers directly.
export async function* bufferStream(strings) {
  for (const s of strings) yield Buffer.from(s);
}
