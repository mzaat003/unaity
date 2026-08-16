// Small helpers for parsing streaming HTTP bodies.
// - sseData: yields the payload of each `data:` line in an SSE stream
// - ndjson:  yields each parsed JSON object from a newline-delimited stream

export async function* sseData(body) {
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith("data:")) yield t.slice(5).trim();
    }
  }
  // Flush a final line that arrived without a trailing newline.
  const t = buf.trim();
  if (t.startsWith("data:")) yield t.slice(5).trim();
}

export async function* ndjson(body) {
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (t) yield JSON.parse(t);
    }
  }
  // Flush a final object that arrived without a trailing newline.
  const t = buf.trim();
  if (t) yield JSON.parse(t);
}
