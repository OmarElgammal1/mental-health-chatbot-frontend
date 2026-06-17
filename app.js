const chatArea = document.getElementById("chat-area");
const input = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const settingsBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings-panel");
const settingsSave = document.getElementById("settings-save");
const settingsCancel = document.getElementById("settings-cancel");
const clearBtn = document.getElementById("clear-btn");
const themeBtn = document.getElementById("theme-btn");
const apiUrlInput = document.getElementById("api-url");
const apiEndpointInput = document.getElementById("api-endpoint");

const STORAGE_KEY = "willow_settings";
const SESSION_KEY = "willow_session";
const defaults = {
  apiUrl: "https://omarelgammal1-mental-health-chatbot-backend.hf.space/",
  endpoint: "/chat",
  theme: null, // null => follow system preference
};

function loadSettings() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
  } catch {
    return { ...defaults };
  }
}

function saveSettings(s) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

let settings = loadSettings();

// ── Session state ──

let sessionId = null;
let messages = []; // [{ role: "user"|"bot", text, time, userMessage? }]

function loadSession() {
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (stored && Array.isArray(stored.messages)) {
      sessionId = stored.sessionId || null;
      messages = stored.messages;
    }
  } catch {
    sessionId = null;
    messages = [];
  }
}

function saveSession() {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ sessionId, messages }));
}

function clearSession() {
  sessionId = null;
  messages = [];
  localStorage.removeItem(SESSION_KEY);
}

// ── Theme ──

const prefersDark =
  window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");

function resolvedTheme() {
  if (settings.theme === "dark" || settings.theme === "light") {
    return settings.theme;
  }
  return prefersDark && prefersDark.matches ? "dark" : "light";
}

function applyTheme() {
  document.documentElement.dataset.theme = resolvedTheme();
}

themeBtn.addEventListener("click", () => {
  settings.theme = resolvedTheme() === "dark" ? "light" : "dark";
  saveSettings(settings);
  applyTheme();
});

if (prefersDark) {
  prefersDark.addEventListener("change", () => {
    if (!settings.theme) applyTheme();
  });
}

applyTheme();

// ── Settings panel ──

settingsBtn.addEventListener("click", () => {
  const open = settingsPanel.classList.toggle("open");
  if (open) {
    apiUrlInput.value = settings.apiUrl;
    apiEndpointInput.value = settings.endpoint;
    apiUrlInput.focus();
  }
});

settingsCancel.addEventListener("click", () =>
  settingsPanel.classList.remove("open")
);

settingsSave.addEventListener("click", () => {
  settings.apiUrl = apiUrlInput.value.replace(/\/+$/, "") || defaults.apiUrl;
  settings.endpoint = apiEndpointInput.value || defaults.endpoint;
  saveSettings(settings);
  settingsPanel.classList.remove("open");
});

// ── Input handling ──

input.addEventListener("input", () => {
  sendBtn.disabled = !input.value.trim();
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 120) + "px";
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (input.value.trim()) send();
  }
});

sendBtn.addEventListener("click", send);

// ── Quick prompts ──

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("prompt-chip")) {
    input.value = e.target.dataset.prompt;
    input.dispatchEvent(new Event("input"));
    send();
  }
});

// ── Clear chat ──

function renderWelcome() {
  chatArea.innerHTML = `
    <div class="welcome">
      <div class="welcome-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 21c-4 0-7-3-7-7C4 7 11 3 20 3c0 9-4 16-9 18z"/><path d="M11 21C11 14 14 8 20 3"/>
        </svg>
      </div>
      <h2>Welcome to Willow</h2>
      <p>A safe space to talk about how you're feeling. I'm here to listen and help with questions about anxiety, depression, stress, and more.</p>
      <div class="quick-prompts">
        <button class="prompt-chip" data-prompt="I've been feeling really anxious lately">Feeling anxious</button>
        <button class="prompt-chip" data-prompt="How can I manage stress at work?">Managing stress</button>
        <button class="prompt-chip" data-prompt="I'm having trouble sleeping because of my worries">Trouble sleeping</button>
        <button class="prompt-chip" data-prompt="What are some coping strategies for depression?">Coping strategies</button>
      </div>
    </div>`;
}

clearBtn.addEventListener("click", () => {
  clearSession();
  renderWelcome();
  input.focus();
});

// ── Chat logic ──

function removeWelcome() {
  const welcome = chatArea.querySelector(".welcome");
  if (welcome) welcome.remove();
}

// Avatars: a sprouting leaf for Willow (growth, care), a soft person for the user.
const BOT_AVATAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 4 13c4 0 7 3 7 7z"/><path d="M13 20a7 7 0 0 1 7-7c0 4-3 7-7 7z"/><path d="M11 20v-6a8 8 0 0 1 1-4"/></svg>`;
const USER_AVATAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6"/></svg>`;

function avatarFor(role) {
  return role === "user" ? USER_AVATAR : BOT_AVATAR;
}

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function addMessage(role, text, time = Date.now()) {
  const div = document.createElement("div");
  div.className = `message ${role}`;

  div.innerHTML = `
    <div class="avatar">${avatarFor(role)}</div>
    <div class="bubble-wrap">
      <div class="bubble">${escapeHtml(text)}</div>
      <div class="msg-time">${formatTime(time)}</div>
    </div>`;

  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
  return div;
}

let messageId = 0;

function addBotMessage(text, userMessage, time = Date.now()) {
  const id = ++messageId;
  const div = document.createElement("div");
  div.className = "message bot";

  div.innerHTML = `
    <div class="avatar">${BOT_AVATAR}</div>
    <div class="bubble-wrap">
      <div class="bubble markdown">${marked.parse(text)}</div>
      <div class="msg-meta">
        <span class="msg-time">${formatTime(time)}</span>
        <div class="msg-actions">
          <button class="fb-btn copy-btn" data-action="copy" title="Copy" aria-label="Copy message">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <div class="feedback-btns" data-id="${id}">
            <button class="fb-btn" data-vote="up" title="Helpful" aria-label="Mark response as helpful">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
            </button>
            <button class="fb-btn" data-vote="down" title="Not helpful" aria-label="Mark response as not helpful">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>`;

  div.querySelector(".copy-btn").addEventListener("click", (e) => {
    copyMessage(e.currentTarget, text);
  });

  div.querySelectorAll(".feedback-btns .fb-btn").forEach((btn) => {
    btn.addEventListener("click", () => sendFeedback(btn, userMessage, text));
  });

  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

async function copyMessage(btn, text) {
  try {
    await navigator.clipboard.writeText(text);
    btn.classList.add("copied");
    setTimeout(() => btn.classList.remove("copied"), 1200);
  } catch {}
}

async function sendFeedback(btn, userMessage, botResponse) {
  const wrap = btn.closest(".feedback-btns");
  if (wrap.classList.contains("voted")) return;

  const vote = btn.dataset.vote;
  wrap.classList.add("voted");
  btn.classList.add("selected");

  try {
    const res = await fetch(settings.apiUrl + "/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vote,
        session_id: sessionId,
        user_message: userMessage,
        bot_response: botResponse,
      }),
    });
    if (!res.ok) throw new Error("Feedback failed");
  } catch {
    // Revert so a vote that didn't register isn't shown as recorded
    wrap.classList.remove("voted");
    btn.classList.remove("selected");
    showFeedbackHint(wrap);
  }
}

function showFeedbackHint(wrap) {
  let hint = wrap.parentElement.querySelector(".fb-hint");
  if (!hint) {
    hint = document.createElement("span");
    hint.className = "fb-hint";
    wrap.parentElement.appendChild(hint);
  }
  hint.textContent = "Couldn't send feedback — try again.";
  setTimeout(() => hint.remove(), 3000);
}

function addError(text) {
  const div = document.createElement("div");
  div.className = "message bot";
  div.innerHTML = `
    <div class="avatar">${BOT_AVATAR}</div>
    <div class="bubble error-bubble">${escapeHtml(text)}</div>`;
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

let stillThinkingTimer = null;

function showTyping() {
  const div = document.createElement("div");
  div.className = "message bot";
  div.id = "typing";
  div.innerHTML = `
    <div class="avatar">${BOT_AVATAR}</div>
    <div class="bubble">
      <div class="typing-indicator" aria-label="Assistant is typing"><span></span><span></span><span></span></div>
      <div class="still-thinking" hidden>Still thinking…</div>
    </div>`;
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
  chatArea.setAttribute("aria-busy", "true");

  stillThinkingTimer = setTimeout(() => {
    const hint = div.querySelector(".still-thinking");
    if (hint) hint.hidden = false;
  }, 6000);
}

function hideTyping() {
  clearTimeout(stillThinkingTimer);
  const el = document.getElementById("typing");
  if (el) el.remove();
  chatArea.setAttribute("aria-busy", "false");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function send() {
  const text = input.value.trim();
  if (!text || input.disabled) return;

  removeWelcome();

  const userTime = Date.now();
  addMessage("user", text, userTime);
  messages.push({ role: "user", text, time: userTime });
  saveSession();

  input.value = "";
  input.style.height = "auto";
  input.disabled = true;
  sendBtn.disabled = true;

  showTyping();

  try {
    const url = settings.apiUrl + settings.endpoint;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, session_id: sessionId }),
    });

    hideTyping();

    if (!res.ok) {
      if (res.status === 429) {
        throw new Error(
          "You're sending messages too quickly. Please wait a moment and try again."
        );
      }
      const errText = await res.text().catch(() => "");
      throw new Error(
        `Server returned ${res.status}${errText ? ": " + errText : ""}`
      );
    }

    const data = await res.json();

    if (data.session_id) sessionId = data.session_id;

    const reply =
      data.response || data.answer || data.message || data.reply || data.text;
    const replyText = reply || JSON.stringify(data, null, 2);

    const botTime = Date.now();
    addBotMessage(replyText, text, botTime);
    messages.push({ role: "bot", text: replyText, time: botTime, userMessage: text });
    saveSession();
  } catch (err) {
    hideTyping();
    if (err.name === "TypeError" && err.message === "Failed to fetch") {
      addError(
        `Could not connect to ${settings.apiUrl}. Make sure your backend is running and CORS is enabled.`
      );
    } else {
      addError(err.message);
    }
  } finally {
    input.disabled = false;
    sendBtn.disabled = !input.value.trim();
    input.focus();
  }
}

// ── Restore session on load ──

function restoreSession() {
  loadSession();
  if (!messages.length) {
    renderWelcome();
    return;
  }
  chatArea.innerHTML = "";
  for (const m of messages) {
    if (m.role === "user") {
      addMessage("user", m.text, m.time);
    } else {
      addBotMessage(m.text, m.userMessage || "", m.time);
    }
  }
}

restoreSession();
