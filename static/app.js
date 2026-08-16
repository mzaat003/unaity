// unaity — backend-free client. Runs entirely in your browser and talks to
// OpenRouter directly. Your API key is stored ONLY in this browser's
// localStorage: never uploaded, never committed, never visible to other
// visitors of the public page.

const OR_BASE = "https://openrouter.ai/api/v1";
const LS_KEY = "unaity.key";
const LS_MODEL = "unaity.model";
const LS_COMPARE = "unaity.compare";
const LS_SPEAK = "unaity.speak";
const LS_VOICE = "unaity.voice";

// Used only if the live model list can't be fetched. IDs may drift over time;
// the live list (fetched below) is preferred.
const FALLBACK_FREE = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemini-2.0-flash-exp:free",
  "qwen/qwen-2.5-72b-instruct:free",
];

const $ = (id) => document.getElementById(id);
const chat = $("chat");
const empty = $("empty");
const form = $("form");
const input = $("input");
const send = $("send");
const modelSel = $("model");
const overlay = $("overlay");

const history = [];
let freeModels = [];

// ---- key storage -----------------------------------------------------------
const getKey = () => localStorage.getItem(LS_KEY) || "";
const setKey = (k) => localStorage.setItem(LS_KEY, k);
const clearKey = () => localStorage.removeItem(LS_KEY);

// ---- settings / setup overlay ---------------------------------------------
function openOverlay(firstRun) {
  $("cardTitle").textContent = firstRun ? "Welcome to unaity" : "Settings";
  $("cardIntro").style.display = firstRun ? "block" : "none";
  $("keyInput").value = firstRun ? "" : getKey();
  $("compare").checked = localStorage.getItem(LS_COMPARE) === "1";
  $("saveKey").textContent = firstRun ? "Save & start" : "Save";
  $("closeSettings").style.display = firstRun ? "none" : "block";
  $("forget").style.display = firstRun ? "none" : "block";
  overlay.classList.add("show");
  $("keyInput").focus();
}
function closeOverlay() { overlay.classList.remove("show"); }

$("gear").addEventListener("click", () => openOverlay(false));
$("closeSettings").addEventListener("click", closeOverlay);
$("saveKey").addEventListener("click", () => {
  const k = $("keyInput").value.trim();
  if (!k) { $("keyInput").focus(); return; }
  setKey(k);
  localStorage.setItem(LS_COMPARE, $("compare").checked ? "1" : "0");
  closeOverlay();
  boot();
});
$("forget").addEventListener("click", () => {
  clearKey();
  closeOverlay();
  openOverlay(true);
});

// ---- model list ------------------------------------------------------------
async function loadModels() {
  try {
    const res = await fetch(`${OR_BASE}/models`);
    if (!res.ok) throw new Error("models fetch failed");
    const data = await res.json();
    freeModels = (data.data || [])
      .filter((m) => {
        const p = m.pricing || {};
        return Number(p.prompt) === 0 && Number(p.completion) === 0;
      })
      .map((m) => m.id)
      .sort();
  } catch {
    freeModels = [];
  }
  if (!freeModels.length) freeModels = FALLBACK_FREE.slice();

  modelSel.innerHTML = "";
  for (const id of freeModels) {
    const opt = document.createElement("option");
    opt.value = id;
    // Shorten the label: drop the ":free" suffix for readability.
    opt.textContent = id.replace(/:free$/, "");
    modelSel.appendChild(opt);
  }
  const saved = localStorage.getItem(LS_MODEL);
  if (saved && freeModels.includes(saved)) modelSel.value = saved;
}
modelSel.addEventListener("change", () =>
  localStorage.setItem(LS_MODEL, modelSel.value)
);

// ---- voice (free, uses the phone's built-in voices) ------------------------
const synth = window.speechSynthesis || null;
const voiceSel = $("voice");
const speakerBtn = $("speaker");
let voices = [];

// Names commonly used for female voices across iOS / Android / Windows.
const FEMALE_HINT = /(female|woman|samantha|karen|moira|tessa|fiona|victoria|serena|allison|ava|susan|zira|hazel|catherine|amelie|amélie|joana|paulina|luciana|monica|mónica|google uk english female|google us english female|nicky|aria|jenny|sonia|libby|natasha|clara|elsa|isha|swara|salli|joanna|kendra|kimberly|ivy|emma|amy)/i;

const isFemale = (v) => FEMALE_HINT.test(v.name);
const isEnglish = (v) => /^en(-|_|$)/i.test(v.lang);

function labelVoice(v) {
  const region = (v.lang || "").replace("_", "-");
  return `${v.name} (${region})${isFemale(v) ? " ♀" : ""}`;
}

function loadVoices() {
  if (!synth) return;
  const all = synth.getVoices();
  if (!all.length) return; // will fire again via onvoiceschanged
  // Order: English female first, then other female, then the rest.
  voices = all.slice().sort((a, b) => {
    const score = (v) => (isFemale(v) ? 0 : 2) + (isEnglish(v) ? 0 : 1);
    return score(a) - score(b);
  });

  voiceSel.innerHTML = "";
  for (const v of voices) {
    const opt = document.createElement("option");
    opt.value = v.name;
    opt.textContent = labelVoice(v);
    voiceSel.appendChild(opt);
  }
  const saved = localStorage.getItem(LS_VOICE);
  if (saved && voices.some((v) => v.name === saved)) {
    voiceSel.value = saved;
  } else {
    // Default to the first (best) female English voice we found.
    const def = voices.find((v) => isFemale(v) && isEnglish(v)) || voices[0];
    if (def) { voiceSel.value = def.name; localStorage.setItem(LS_VOICE, def.name); }
  }
}

if (synth) {
  loadVoices();
  synth.onvoiceschanged = loadVoices;
} else if (voiceSel) {
  // No speech support on this browser — hide the controls gracefully.
  voiceSel.disabled = true;
  const hint = $("voiceHint");
  if (hint) hint.textContent = "Your browser doesn't support voice output.";
}

voiceSel && voiceSel.addEventListener("change", () =>
  localStorage.setItem(LS_VOICE, voiceSel.value)
);

const speakOn = () => localStorage.getItem(LS_SPEAK) === "1";
function refreshSpeakerBtn() {
  if (!speakerBtn) return;
  const on = speakOn();
  speakerBtn.textContent = on ? "🔊" : "🔈";
  speakerBtn.title = on ? "Voice ON — tap to mute" : "Voice OFF — tap to turn on";
}
speakerBtn && speakerBtn.addEventListener("click", () => {
  localStorage.setItem(LS_SPEAK, speakOn() ? "0" : "1");
  if (!speakOn() && synth) synth.cancel(); // just turned off → stop talking
  refreshSpeakerBtn();
});
refreshSpeakerBtn();

// Speak text with the chosen voice. `force` ignores the on/off toggle
// (used by the Test button so you can preview a voice while muted).
function speak(text, force) {
  if (!synth || (!speakOn() && !force)) return;
  if (!text || !text.trim()) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text.slice(0, 4000));
  const chosen = voices.find((v) => v.name === (voiceSel && voiceSel.value));
  if (chosen) { u.voice = chosen; u.lang = chosen.lang; }
  u.rate = 1; u.pitch = 1;
  synth.speak(u);
}

$("testVoice") && $("testVoice").addEventListener("click", () =>
  speak("Hi! This is how I'll read your answers out loud.", true)
);

// ---- rendering -------------------------------------------------------------
function addMessage(text, cls, via) {
  if (empty && empty.parentNode) empty.remove();
  const el = document.createElement("div");
  el.className = `msg ${cls}`;
  el.textContent = text;
  if (via) {
    const v = document.createElement("span");
    v.className = "via";
    v.textContent = `— ${via}`;
    el.appendChild(v);
  }
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
  return el;
}
function addTyping() {
  if (empty && empty.parentNode) empty.remove();
  const el = document.createElement("div");
  el.className = "msg bot";
  el.innerHTML = '<span class="dots"><span>●</span><span>●</span><span>●</span></span>';
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
  return el;
}

// ---- OpenRouter streaming call --------------------------------------------
// Calls onDelta(text) for each chunk. Throws on HTTP error.
async function streamModel(model, messages, onDelta, signal) {
  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${getKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const handleLine = (line) => {
    const t = line.trim();
    if (!t.startsWith("data:")) return;
    const payload = t.slice(5).trim();
    if (payload === "[DONE]") return;
    let delta;
    try { delta = JSON.parse(payload).choices?.[0]?.delta?.content; } catch { return; }
    if (delta) onDelta(delta);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    lines.forEach(handleLine);
  }
  if (buf.trim()) handleLine(buf);
}

// ---- single-model send -----------------------------------------------------
async function sendOne(typing) {
  const model = modelSel.value;
  let botEl = null;
  let text = "";
  const append = (d) => {
    if (!botEl) { typing.remove(); botEl = addMessage("", "bot"); }
    text += d;
    botEl.textContent = text;
    chat.scrollTop = chat.scrollHeight;
  };
  try {
    await streamModel(model, history, append);
    if (!botEl) append("(empty response)");
    const v = document.createElement("span");
    v.className = "via";
    v.textContent = `— ${model.replace(/:free$/, "")}`;
    botEl.appendChild(v);
    history.push({ role: "assistant", content: text });
    speak(text);
    return true;
  } catch (err) {
    typing.remove();
    addMessage(friendly(err), "error");
    return false;
  }
}

// ---- compare mode: ask 3 models at once -----------------------------------
async function sendAll(typing) {
  const models = freeModels.slice(0, 3);
  typing.remove();
  let winner = null;
  const cards = models.map((model) => {
    const el = document.createElement("div");
    el.className = "msg bot";
    const label = document.createElement("span");
    label.className = "brain";
    label.textContent = model.replace(/:free$/, "");
    const textNode = document.createElement("span");
    el.appendChild(label);
    el.appendChild(textNode);
    chat.appendChild(el);
    return { model, el, textNode, label, text: "" };
  });
  chat.scrollTop = chat.scrollHeight;

  await Promise.all(
    cards.map((card) =>
      streamModel(card.model, history, (d) => {
        card.text += d;
        card.textNode.textContent = card.text;
        chat.scrollTop = chat.scrollHeight;
      })
        .then(() => {
          if (!winner && card.text) {
            winner = card.text;
            card.label.textContent += "  ⚡ fastest";
          }
        })
        .catch((err) => {
          card.el.classList.add("error");
          card.textNode.textContent = friendly(err);
        })
    )
  );
  if (winner) {
    history.push({ role: "assistant", content: winner });
    speak(winner); // read the fastest answer aloud
    return true;
  }
  return false;
}

// Make common OpenRouter errors human-readable.
function friendly(err) {
  const m = String(err.message || err);
  if (m.startsWith("401")) return "Invalid API key. Open ⚙️ Settings and re-enter it.";
  if (m.startsWith("402")) return "This model needs credit. Pick a free model, or add credit on OpenRouter.";
  if (m.startsWith("429")) return "Rate limited — wait a moment and try again, or switch models.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Network error reaching OpenRouter. Check your connection.";
  return m;
}

// ---- input handling --------------------------------------------------------
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 140) + "px";
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer:fine)").matches) {
    e.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!getKey()) { openOverlay(true); return; }
  const text = input.value.trim();
  if (!text) return;

  if (synth) synth.cancel(); // stop reading the previous answer
  addMessage(text, "user");
  history.push({ role: "user", content: text });
  input.value = "";
  input.style.height = "auto";
  send.disabled = true;

  const typing = addTyping();
  let recorded = false;
  try {
    const compare = localStorage.getItem(LS_COMPARE) === "1";
    recorded = compare ? await sendAll(typing) : await sendOne(typing);
  } catch (err) {
    typing.remove();
    addMessage(friendly(err), "error");
  } finally {
    // Drop the user turn if no reply landed, so history stays valid on retry.
    if (!recorded && history.at(-1)?.role === "user") history.pop();
    send.disabled = false;
    input.focus();
  }
});

// ---- boot ------------------------------------------------------------------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}

async function boot() {
  await loadModels();
  if (!getKey()) openOverlay(true);
}
boot();
