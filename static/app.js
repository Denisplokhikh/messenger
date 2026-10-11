// FastAPI Messenger Client Application

const state = {
  token: localStorage.getItem("access_token") || null,
  currentUser: null,
  chats: [],
  activeChat: null,
  ws: null,
  reconnectInterval: 3000,
  pingIntervalId: null,
};

// DOM Elements
const authModal = document.getElementById("auth-modal");
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const loginError = document.getElementById("login-error");
const registerError = document.getElementById("register-error");

const messengerView = document.getElementById("messenger-view");
const userAvatar = document.getElementById("user-avatar");
const currentUsername = document.getElementById("current-username");
const wsStatus = document.getElementById("ws-status");
const btnLogout = document.getElementById("btn-logout");

const userSearchInput = document.getElementById("user-search-input");
const searchResultsDropdown = document.getElementById("search-results-dropdown");
const chatsList = document.getElementById("chats-list");

const noChatSelected = document.getElementById("no-chat-selected");
const chatHeader = document.getElementById("chat-header");
const activeChatAvatar = document.getElementById("active-chat-avatar");
const activeChatTitle = document.getElementById("active-chat-title");
const activeChatSubtitle = document.getElementById("active-chat-subtitle");
const messagesContainer = document.getElementById("messages-container");
const messagesList = document.getElementById("messages-list");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");

const groupModal = document.getElementById("group-modal");
const btnCreateGroupModal = document.getElementById("btn-create-group-modal");
const btnCancelGroup = document.getElementById("btn-cancel-group");
const groupForm = document.getElementById("group-form");
const groupError = document.getElementById("group-error");

// --- API Helper ---
async function api(endpoint, options = {}) {
  const headers = options.headers || {};
  if (state.token) {
    headers["Authorization"] = `Bearer ${state.token}`;
  }
  const res = await fetch(endpoint, { ...options, headers });
  if (res.status === 401) {
    logout();
    throw new Error("Сессия истекла");
  }
  return res;
}

// --- Auth Tabs & Handlers ---
tabLogin.addEventListener("click", () => {
  tabLogin.classList.add("active");
  tabRegister.classList.remove("active");
  loginForm.classList.remove("hidden");
  registerForm.classList.add("hidden");
});

tabRegister.addEventListener("click", () => {
  tabRegister.classList.add("active");
  tabLogin.classList.remove("active");
  registerForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.classList.add("hidden");

  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;

  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("password", password);

  try {
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Ошибка входа");
    }
    state.token = data.access_token;
    localStorage.setItem("access_token", state.token);
    initApp();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.classList.remove("hidden");
  }
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  registerError.classList.add("hidden");

  const username = document.getElementById("reg-username").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;

  try {
    const res = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Ошибка регистрации");
    }
    // Auto login after register
    document.getElementById("login-username").value = username;
    document.getElementById("login-password").value = password;
    loginForm.requestSubmit();
  } catch (err) {
    registerError.textContent = err.message;
    registerError.classList.remove("hidden");
  }
});

function logout() {
  state.token = null;
  state.currentUser = null;
  state.activeChat = null;
  localStorage.removeItem("access_token");
  if (state.ws) {
    state.ws.close();
  }
  authModal.classList.remove("hidden");
  messengerView.classList.add("hidden");
}

btnLogout.addEventListener("click", logout);

// --- Initialization ---
async function initApp() {
  if (!state.token) {
    authModal.classList.remove("hidden");
    messengerView.classList.add("hidden");
    return;
  }

  try {
    const res = await api("/api/v1/auth/me");
    if (!res.ok) throw new Error("Не удалось получить профиль");
    state.currentUser = await res.json();

    authModal.classList.add("hidden");
    messengerView.classList.remove("hidden");

    currentUsername.textContent = state.currentUser.username;
    userAvatar.textContent = state.currentUser.username[0].toUpperCase();

    // Connect WebSocket
    connectWebSocket();

    // Load Chats
    await loadChats();
  } catch (err) {
    logout();
  }
}

// --- WebSocket Realtime ---
function setWsStatus(status, text) {
  wsStatus.className = `status-badge status-${status}`;
  wsStatus.textContent = text;
}

function connectWebSocket() {
  if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  setWsStatus("connecting", "● Соединение...");
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/api/v1/ws?token=${encodeURIComponent(state.token)}`;

  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    setWsStatus("online", "● В сети");
    // Heartbeat ping
    if (state.pingIntervalId) clearInterval(state.pingIntervalId);
    state.pingIntervalId = setInterval(() => {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ action: "ping" }));
      }
    }, 25000);
  };

  state.ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleWsMessage(data);
    } catch (e) {
      console.error("WS Parse error", e);
    }
  };

  state.ws.onclose = () => {
    setWsStatus("offline", "● Офлайн");
    if (state.pingIntervalId) clearInterval(state.pingIntervalId);
    // Reconnect if user still logged in
    if (state.token) {
      setTimeout(connectWebSocket, state.reconnectInterval);
    }
  };

  state.ws.onerror = () => {
    state.ws.close();
  };
}

function handleWsMessage(payload) {
  if (payload.event === "new_message") {
    const msg = payload.message;

    // If currently inside this chat, render the incoming message
    if (state.activeChat && state.activeChat.id === msg.chat_id) {
      appendMessageToView(msg);
      scrollToBottom();
    }

    // Refresh chats preview
    loadChats();
  }
}

// --- Chats & Messaging ---
async function loadChats() {
  try {
    const res = await api("/api/v1/chats");
    if (!res.ok) return;
    state.chats = await res.json();
    renderChatsList();
  } catch (err) {
    console.error("Load chats error", err);
  }
}

function getChatDisplayName(chat) {
  if (chat.is_group) {
    return chat.name || "Групповой чат";
  }
  const other = chat.participants.find((p) => p.user_id !== state.currentUser.id);
  return other ? other.user.username : "Диалог";
}

function renderChatsList() {
  chatsList.innerHTML = "";
  if (!state.chats.length) {
    chatsList.innerHTML = `<div class="empty-state">Нет диалогов. Воспользуйтесь поиском выше, чтобы начать общение!</div>`;
    return;
  }

  state.chats.forEach((chat) => {
    const card = document.createElement("div");
    card.className = `chat-card ${state.activeChat && state.activeChat.id === chat.id ? "active" : ""}`;

    const displayName = getChatDisplayName(chat);
    const initial = displayName[0].toUpperCase();

    card.innerHTML = `
      <div class="avatar">${initial}</div>
      <div class="chat-card-info">
        <div class="chat-card-top">
          <span class="chat-card-name">${escapeHtml(displayName)}</span>
        </div>
        <div class="chat-card-preview">${chat.is_group ? "👥 Группа" : "💬 Личное сообщение"}</div>
      </div>
    `;

    card.addEventListener("click", () => selectChat(chat));
    chatsList.appendChild(card);
  });
}

async function selectChat(chat) {
  state.activeChat = chat;
  renderChatsList();

  noChatSelected.classList.add("hidden");
  chatHeader.classList.remove("hidden");
  messagesContainer.classList.remove("hidden");
  messageForm.classList.remove("hidden");

  const displayName = getChatDisplayName(chat);
  activeChatTitle.textContent = displayName;
  activeChatAvatar.textContent = displayName[0].toUpperCase();
  activeChatSubtitle.textContent = chat.is_group
    ? `${chat.participants.length} участников`
    : "Личные сообщения";

  messagesList.innerHTML = `<div class="empty-state">Загрузка сообщений...</div>`;

  try {
    const res = await api(`/api/v1/chats/${chat.id}/messages?limit=50`);
    if (!res.ok) throw new Error("Ошибка загрузки истории");
    const messages = await res.json();
    messagesList.innerHTML = "";
    if (messages.length === 0) {
      messagesList.innerHTML = `<div class="empty-state">Здесь пока нет сообщений. Напишите первым!</div>`;
    } else {
      messages.forEach(appendMessageToView);
    }
    scrollToBottom();
  } catch (err) {
    messagesList.innerHTML = `<div class="empty-state">${err.message}</div>`;
  }
}

function appendMessageToView(msg) {
  // Clear placeholder if present
  const emptyState = messagesList.querySelector(".empty-state");
  if (emptyState) emptyState.remove();

  const isOutgoing = msg.sender_id === state.currentUser.id;
  const row = document.createElement("div");
  row.className = `message-row ${isOutgoing ? "outgoing" : "incoming"}`;

  const timeStr = new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const senderName = msg.sender ? msg.sender.username : (msg.sender_username || "Собеседник");

  row.innerHTML = `
    ${!isOutgoing && state.activeChat && state.activeChat.is_group ? `<span class="message-sender">${escapeHtml(senderName)}</span>` : ""}
    <div class="message-bubble">${escapeHtml(msg.content)}</div>
    <span class="message-time">${timeStr}</span>
  `;

  messagesList.appendChild(row);
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// --- Submit Message (IME Safe Enter-to-Submit) ---
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();

    // IME safe submission check (Japanese, Chinese, Korean, Safari fallback)
    if (event.isComposing || event.keyCode === 229) {
      return;
    }

    messageForm.requestSubmit();
  }
});

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.activeChat) return;

  const content = messageInput.value.trim();
  if (!content) return;

  messageInput.value = "";
  messageInput.style.height = "auto";

  // Try sending via WebSocket first for lowest latency
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(
      JSON.stringify({
        action: "send_message",
        chat_id: state.activeChat.id,
        content: content,
      })
    );
  } else {
    // HTTP fallback
    try {
      await api(`/api/v1/chats/${state.activeChat.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      alert("Не удалось отправить сообщение: " + err.message);
    }
  }
});

// --- Search Users & Start Chat ---
let searchDebounceTimer = null;
userSearchInput.addEventListener("input", (e) => {
  clearTimeout(searchDebounceTimer);
  const q = e.target.value.trim();
  if (!q) {
    searchResultsDropdown.classList.add("hidden");
    return;
  }

  searchDebounceTimer = setTimeout(async () => {
    try {
      const res = await api(`/api/v1/users/search?query=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const users = await res.json();
      renderSearchResults(users);
    } catch (err) {
      console.error(err);
    }
  }, 250);
});

function renderSearchResults(users) {
  searchResultsDropdown.innerHTML = "";
  if (!users.length) {
    searchResultsDropdown.innerHTML = `<div style="padding: 10px; color: var(--text-muted); font-size: 13px;">Никого не найдено</div>`;
    searchResultsDropdown.classList.remove("hidden");
    return;
  }

  users.forEach((u) => {
    const item = document.createElement("div");
    item.className = "search-item";
    item.innerHTML = `
      <div class="avatar" style="width: 28px; height: 28px; font-size: 13px;">${u.username[0].toUpperCase()}</div>
      <span>${escapeHtml(u.username)}</span>
    `;
    item.addEventListener("click", async () => {
      searchResultsDropdown.classList.add("hidden");
      userSearchInput.value = "";
      await openDirectChatWithUser(u.id);
    });
    searchResultsDropdown.appendChild(item);
  });

  searchResultsDropdown.classList.remove("hidden");
}

// Close search dropdown on click outside
document.addEventListener("click", (e) => {
  if (!userSearchInput.contains(e.target) && !searchResultsDropdown.contains(e.target)) {
    searchResultsDropdown.classList.add("hidden");
  }
});

async function openDirectChatWithUser(recipientId) {
  try {
    const res = await api("/api/v1/chats/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: recipientId }),
    });
    if (!res.ok) throw new Error("Не удалось открыть чат");
    const chat = await res.json();
    await loadChats();
    selectChat(chat);
  } catch (err) {
    alert(err.message);
  }
}

// --- Group Chat Modal ---
btnCreateGroupModal.addEventListener("click", () => {
  groupModal.classList.remove("hidden");
  groupError.classList.add("hidden");
});

btnCancelGroup.addEventListener("click", () => {
  groupModal.classList.add("hidden");
});

groupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  groupError.classList.add("hidden");

  const name = document.getElementById("group-name").value.trim();
  const rawMembers = document.getElementById("group-members").value.trim();

  const participantIds = rawMembers
    .split(",")
    .map((s) => parseInt(s.trim()))
    .filter((id) => !isNaN(id));

  if (!participantIds.length) {
    groupError.textContent = "Укажите хотя бы один корректный ID собеседника";
    groupError.classList.remove("hidden");
    return;
  }

  try {
    const res = await api("/api/v1/chats/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, participant_ids: participantIds }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Ошибка создания группы");
    }
    const newGroup = await res.json();
    groupModal.classList.add("hidden");
    document.getElementById("group-name").value = "";
    document.getElementById("group-members").value = "";
    await loadChats();
    selectChat(newGroup);
  } catch (err) {
    groupError.textContent = err.message;
    groupError.classList.remove("hidden");
  }
});

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Start application
initApp();
