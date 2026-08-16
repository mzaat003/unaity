// Frontend for unaity: talks to the /chat/stream and /chat/all endpoints,
// keeps the running conversation for context, and shows which provider
// answered. "All brains" mode streams every provider side by side.

const chat = document.getElementById("chat");
const empty = document.getElementById("empty");
const form = document.getElementById("form");
const input = document.getElementById("input");
const send = document.getElementById("send");
const providerSel = document.getElementById("provider");

// Full conversation history sent on each request so models keep context.
const history = [];

// Register the service worker (makes the app installable on Android).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}

// Populate the provider dropdown from whatever keys are configured server-side.
fetch("./health")
  .then((r) => r.json())
  .then((h) => {
    for (const p of h.providers || []) {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      providerSel.appendChild(opt);
    }
  })
  .catch(() => {});

function addMessage(text, cls, via) {
  if (empty) empty.remove();
  const el = document.createElement("div");
  el.className = `msg ${cls}`;
  el.textContent = text;
  if (via) {
    const v = document.createElement("span");
    v.className = "via";
    v.textContent = `— via ${via}`;
    el.appendChild(v);
  }
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
  return el;
}

function addTyping() {
  if (empty) empty.remove();
  const el = document.createElement("div");
  el.className = "msg bot";
  el.innerHTML = '<span class="dots"><span>●</span><span>●</span><span>●</span></span>';
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
  return el;
}

// Read an SSE response body, calling onEvent(parsedJson) per `data:` event.
async function readSse(res, onEvent) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split("\n\n");
    buf = events.pop();
    for (const event of events) {
      const line = event.trim();
      if (!line.startsWith("data:")) continue;
      if (onEvent(JSON.parse(line.slice(5))) === false) return;
    }
  }
}

// --- single-brain streaming (default and forced-provider modes) ---
async function streamOne(typing) {
  let botEl = null;
  let botText = "";

  const appendDelta = (delta) => {
    if (!botEl) {
      typing.remove();
      botEl = addMessage("", "bot");
    }
    botText += delta;
    botEl.textContent = botText;
    chat.scrollTop = chat.scrollHeight;
  };

  const res = await fetch("./chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: history,
      provider: providerSel.value || undefined,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    typing.remove();
    addMessage(data.error || "Something went wrong.", "error");
    return;
  }

  let finished = false;
  await readSse(res, (data) => {
    if (data.delta) {
      appendDelta(data.delta);
    } else if (data.done) {
      if (!botEl) appendDelta("(empty response)");
      const v = document.createElement("span");
      v.className = "via";
      v.textContent = `— via ${data.provider} · ${data.model}`;
      botEl.appendChild(v);
      history.push({ role: "assistant", content: botText });
      finished = true;
      return false;
    } else if (data.error) {
      typing.remove();
      addMessage(data.error, "error");
      finished = true;
      return false;
    }
  });

  if (!finished && !botEl) {
    typing.remove();
    addMessage("Connection dropped before a reply arrived.", "error");
  }
}

// --- "ask all brains at once": one card per provider, streaming in parallel ---
async function streamAll(typing) {
  const cards = {}; // provider -> {el, textNode, text}
  let winner = null; // first provider to finish successfully

  const ensureCard = (provider, model) => {
    if (cards[provider]) return cards[provider];
    typing.remove();
    const el = document.createElement("div");
    el.className = "msg bot";
    const label = document.createElement("span");
    label.className = "brain";
    label.textContent = `${provider} · ${model}`;
    const textNode = document.createElement("span");
    el.appendChild(label);
    el.appendChild(textNode);
    chat.appendChild(el);
    cards[provider] = { el, textNode, text: "" };
    chat.scrollTop = chat.scrollHeight;
    return cards[provider];
  };

  const res = await fetch("./chat/all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: history }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    typing.remove();
    addMessage(data.error || "Something went wrong.", "error");
    return;
  }

  await readSse(res, (data) => {
    if (data.delta) {
      const card = ensureCard(data.provider, data.model);
      card.text += data.delta;
      card.textNode.textContent = card.text;
      chat.scrollTop = chat.scrollHeight;
    } else if (data.done && data.provider) {
      const card = ensureCard(data.provider, data.model);
      if (!winner && card.text) {
        winner = { provider: data.provider, text: card.text };
        card.el.querySelector(".brain").textContent += "  ⚡ fastest";
      }
    } else if (data.error && data.provider) {
      const card = ensureCard(data.provider, data.model);
      card.el.classList.add("error");
      card.textNode.textContent = card.text || data.error;
    } else if (data.allDone) {
      // Keep the fastest successful answer as conversation context.
      if (winner) history.push({ role: "assistant", content: winner.text });
      return false;
    } else if (data.error) {
      typing.remove();
      addMessage(data.error, "error");
      return false;
    }
  });

  if (!Object.keys(cards).length) {
    typing.remove();
    addMessage("No brains answered.", "error");
  }
}

// Auto-grow the textarea.
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 140) + "px";
});

// Enter sends, Shift+Enter makes a newline (desktop convenience).
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer:fine)").matches) {
    e.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  addMessage(text, "user");
  history.push({ role: "user", content: text });
  input.value = "";
  input.style.height = "auto";
  send.disabled = true;

  const typing = addTyping();
  try {
    if (providerSel.value === "__all__") {
      await streamAll(typing);
    } else {
      await streamOne(typing);
    }
  } catch (err) {
    typing.remove();
    addMessage(String(err), "error");
  } finally {
    send.disabled = false;
    input.focus();
  }
});
