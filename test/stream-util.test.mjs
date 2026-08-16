// Unit tests for the streaming parsers, including the tricky cases:
// a line split across two network chunks, and a final line with no
// trailing newline.

import { test } from "node:test";
import assert from "node:assert/strict";
import { sseData, ndjson } from "../src/providers/stream-util.js";
import { bufferStream } from "./helpers.mjs";

async function collect(gen) {
  const out = [];
  for await (const x of gen) out.push(x);
  return out;
}

test("sseData parses data lines and ignores others", async () => {
  const out = await collect(
    sseData(bufferStream([": comment\n", "data: hello\n", "\n", "data: world\n\n"]))
  );
  assert.deepEqual(out, ["hello", "world"]);
});

test("sseData reassembles a line split across chunks", async () => {
  const out = await collect(sseData(bufferStream(["data: hel", "lo\n"])));
  assert.deepEqual(out, ["hello"]);
});

test("sseData flushes a final line without a trailing newline", async () => {
  const out = await collect(sseData(bufferStream(["data: last"])));
  assert.deepEqual(out, ["last"]);
});

test("ndjson parses objects per line", async () => {
  const out = await collect(
    ndjson(bufferStream(['{"a":1}\n', '{"b":', '2}\n']))
  );
  assert.deepEqual(out, [{ a: 1 }, { b: 2 }]);
});

test("ndjson flushes a final object without a trailing newline", async () => {
  const out = await collect(ndjson(bufferStream(['{"done":true}'])));
  assert.deepEqual(out, [{ done: true }]);
});
