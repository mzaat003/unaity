// Frontend for unaity: talks to the /chat and /health endpoints, keeps the
// running conversation for context, and shows which provider answered.

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
  let botEl = null; // created on the first streamed chunk
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

  try {
    const res = await fetch("./chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: history,
        provider: providerSel.value || undefined,
      }),
    });

    if (!res.ok) {
      // Non-SSE failure (e.g. validation error) comes back as plain JSON.
      const data = await res.json().catch(() => ({}));
      typing.remove();
      addMessage(data.error || "Something went wrong.", "error");
      return;
    }

    // Parse the SSE stream: events are separated by blank lines.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let finished = false;

    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const events = buf.split("\n\n");
      buf = events.pop();
      for (const event of events) {
        const line = event.trim();
        if (!line.startsWith("data:")) continue;
        const data = JSON.parse(line.slice(5));
        if (data.delta) {
          appendDelta(data.delta);
        } else if (data.done) {
          if (!botEl) appendDelta("(empty response)");
          if (botEl) {
            const v = document.createElement("span");
            v.className = "via";
            v.textContent = `— via ${data.provider} · ${data.model}`;
            botEl.appendChild(v);
          }
          history.push({ role: "assistant", content: botText });
          finished = true;
        } else if (data.error) {
          typing.remove();
          addMessage(data.error, "error");
          finished = true;
        }
      }
    }

    if (!botEl && !finished) {
      typing.remove();
      addMessage("Connection dropped before a reply arrived.", "error");
    }
  } catch (err) {
    typing.remove();
    addMessage(String(err), "error");
  } finally {
    send.disabled = false;
    input.focus();
  }
});
