// ========================================================
// FastAPI Messenger - Vue Advanced Chat Integration
// ========================================================

// 1. Регистрация Web Component vue-advanced-chat
if (window["vue-advanced-chat"] && typeof window["vue-advanced-chat"].register === "function") {
  window["vue-advanced-chat"].register();
}

// 2. Локализация интерфейса на русский язык
const RUSSIAN_TEXT_MESSAGES = {
  ROOMS_EMPTY: "Нет активных чатов",
  ROOM_EMPTY: "В этом чате пока нет сообщений",
  NEW_MESSAGES: "Новые сообщения",
  MESSAGE_DELETED: "Сообщение удалено",
  MESSAGES_EMPTY: "Сообщений нет",
  CONVERSATION_START: "Начало диалога",
  TYPE_MESSAGE: "Напишите сообщение...",
  SEARCH: "Поиск чатов...",
  IS_TYPING: "печатает...",
  CANCEL_SELECT_MESSAGE: "Отмена"
};

// 3. Состояние приложения
const state = {
  token: localStorage.getItem("access_token") || null,
  currentUser: null,
  rooms: [],
  activeRoomId: null,
  messages: [],
  ws: null,
  reconnectTimer: null,
  pingTimer: null,
};

// 4. DOM элементы
const authModal = document.getElementById("auth-modal");
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const loginError = document.getElementById("login-error");
const registerError = document.getElementById("register-error");

const messengerView = document.getElementById("messenger-view");
const currentUsernameEl = document.getElementById("current-username");
const userAvatarImg = document.getElementById("user-avatar-img");
const wsStatus = document.getElementById("ws-status");
const btnLogout = document.getElementById("btn-logout");
const btnNewChat = document.getElementById("btn-new-chat");
const chatComponent = document.getElementById("chat-component");

// Модалка нового чата
const newChatModal = document.getElementById("new-chat-modal");
const btnCloseNewChat = document.getElementById("btn-close-new-chat");
const tabDirect = document.getElementById("tab-direct");
const tabGroup = document.getElementById("tab-group");
const directTabContent = document.getElementById("direct-chat-tab-content");
const userSearchInput = document.getElementById("user-search-input");
const userSearchResults = document.getElementById("user-search-results");
const groupForm = document.getElementById("group-form");
const groupError = document.getElementById("group-error");

// Генерация аватара по имени
function getAvatarUrl(name) {
  return `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name || "user")}`;
}

// Вспомогательный API клиент
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

// Форматирование комнаты для vue-advanced-chat
function formatRoom(chat, currentUserId) {
  let roomName = chat.name || "Чат";
  let avatar = "";

  if (chat.is_group) {
    avatar = getAvatarUrl(roomName);
  } else {
    // Личный диалог: находим второго участника
    const otherParticipant = chat.participants.find(p => p.user_id !== currentUserId);
    if (otherParticipant && otherParticipant.user) {
      roomName = otherParticipant.user.username;
      avatar = getAvatarUrl(roomName);
    } else {
      avatar = getAvatarUrl("chat");
    }
  }

  // Список пользователей комнаты
  const users = chat.participants.map(p => ({
    _id: String(p.user_id),
    username: p.user ? p.user.username : `User ${p.user_id}`,
    avatar: getAvatarUrl(p.user ? p.user.username : `User ${p.user_id}`),
    status: { state: "online" }
  }));

  let lastMessage = null;
  if (chat.last_message) {
    const lm = chat.last_message;
    lastMessage = {
      _id: String(lm.id),
      content: lm.content,
      senderId: String(lm.sender_id),
      username: lm.sender ? lm.sender.username : "Пользователь",
      timestamp: new Date(lm.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      date: new Date(lm.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }),
      saved: true,
      distributed: true,
      seen: true,
      new: false
    };
  }

  return {
    roomId: String(chat.id),
    roomName: roomName,
    avatar: avatar,
    unreadCount: 0,
    users: users,
    lastMessage: lastMessage
  };
}

// Форматирование одного сообщения для vue-advanced-chat
function formatMessage(msg) {
  const username = msg.sender?.username || msg.sender_username || "Пользователь";
  const createdAt = msg.created_at ? new Date(msg.created_at) : new Date();

  return {
    _id: String(msg.id),
    indexId: msg.id,
    content: msg.content,
    senderId: String(msg.sender_id),
    username: username,
    avatar: getAvatarUrl(username),
    date: createdAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }),
    timestamp: createdAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
    system: false,
    saved: true,
    distributed: true,
    seen: true,
    files: []
  };
}

// Загрузка комнат с бэкенда
async function loadRooms() {
  try {
    const res = await api("/api/v1/chats");
    const chatsData = await res.json();

    state.rooms = chatsData.map(chat => formatRoom(chat, state.currentUser.id));
    chatComponent.rooms = [...state.rooms];
    chatComponent.loadingRooms = false;
    chatComponent.roomsLoaded = true;
    chatComponent.setAttribute("loading-rooms", "false");
    chatComponent.setAttribute("rooms-loaded", "true");
  } catch (err) {
    console.error("Ошибка загрузки комнат:", err);
    chatComponent.loadingRooms = false;
    chatComponent.roomsLoaded = true;
  }
}

let isChatSetup = false;
let isSendingMessage = false;

// Настройка компонента vue-advanced-chat
function setupChatComponent() {
  chatComponent.currentUserId = String(state.currentUser.id);
  chatComponent.textMessages = RUSSIAN_TEXT_MESSAGES;
  chatComponent.theme = "dark";
  chatComponent.loadingRooms = false;
  chatComponent.roomsLoaded = true;

  if (isChatSetup) return;
  isChatSetup = true;

  // Обработка запроса сообщений для выбранной комнаты
  chatComponent.addEventListener("fetch-messages", async (event) => {
    const detail = event.detail ? event.detail[0] || event.detail : {};
    const room = detail.room;
    if (!room) return;

    state.activeRoomId = room.roomId;
    chatComponent.messagesLoaded = false;

    try {
      const res = await api(`/api/v1/chats/${room.roomId}/messages?limit=100`);
      const rawMsgs = await res.json();

      state.messages = rawMsgs.map(formatMessage);
      chatComponent.messages = [...state.messages];
      chatComponent.messagesLoaded = true;
    } catch (err) {
      console.error("Ошибка загрузки сообщений комнаты:", err);
      chatComponent.messages = [];
      chatComponent.messagesLoaded = true;
    }
  });

  // Отправка сообщения
  chatComponent.addEventListener("send-message", async (event) => {
    if (isSendingMessage) return;

    const detail = event.detail ? event.detail[0] || event.detail : {};
    const { roomId, content } = detail;
    if (!roomId || !content || !content.trim()) return;

    isSendingMessage = true;
    try {
      const res = await api(`/api/v1/chats/${roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() })
      });

      if (res.status === 201) {
        const newMsgData = await res.json();
        const formatted = formatMessage(newMsgData);

        // Добавляем сообщение, если его ещё нет
        if (!state.messages.some(m => String(m._id) === String(formatted._id))) {
          state.messages = [...state.messages, formatted];
          chatComponent.messages = [...state.messages];
        }

        // Обновляем последнее сообщение в списке комнат
        const roomIdx = state.rooms.findIndex(r => String(r.roomId) === String(roomId));
        if (roomIdx !== -1) {
          state.rooms[roomIdx].lastMessage = formatted;
          chatComponent.rooms = [...state.rooms];
        }
      }
    } catch (err) {
      console.error("Ошибка при отправке сообщения:", err);
    } finally {
      isSendingMessage = false;
    }
  });

  // Клик по кнопке "+" в списке комнат
  chatComponent.addEventListener("add-room", () => {
    openNewChatModal();
  });

  // Обработка запроса подгрузки дополнительных комнат (устраняет бесконечное колесо загрузки)
  chatComponent.addEventListener("fetch-more-rooms", () => {
    chatComponent.loadingRooms = false;
    chatComponent.roomsLoaded = true;
  });
}

// Подключение к WebSocket для мгновенных сообщений
function connectWebSocket() {
  if (state.ws) {
    state.ws.onclose = null;
    state.ws.close();
    state.ws = null;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/api/v1/ws?token=${encodeURIComponent(state.token)}`;

  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    wsStatus.textContent = "● Онлайн";
    wsStatus.className = "status-badge status-online";

    if (state.pingTimer) clearInterval(state.pingTimer);
    state.pingTimer = setInterval(() => {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ action: "ping" }));
      }
    }, 25000);
  };

  state.ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.event === "new_message" && data.message) {
        const msg = data.message;
        const msgRoomId = String(msg.chat_id);

        // Если открыта эта комната — добавляем сообщение в чат
        if (state.activeRoomId === msgRoomId) {
          const formatted = formatMessage(msg);
          if (!state.messages.some(m => m._id === formatted._id)) {
            state.messages = [...state.messages, formatted];
            chatComponent.messages = [...state.messages];
          }
        }

        // Обновляем последнее сообщение в комнате
        const roomIdx = state.rooms.findIndex(r => r.roomId === msgRoomId);
        if (roomIdx !== -1) {
          state.rooms[roomIdx].lastMessage = formatMessage(msg);
          chatComponent.rooms = [...state.rooms];
        } else {
          // Если комната новая, перезагружаем список комнат
          loadRooms();
        }
      }
    } catch (err) {
      console.error("Ошибка разбора WS сообщения:", err);
    }
  };

  state.ws.onclose = () => {
    wsStatus.textContent = "● Офлайн";
    wsStatus.className = "status-badge status-offline";
    if (state.pingTimer) clearInterval(state.pingTimer);

    if (state.token) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = setTimeout(connectWebSocket, 3000);
    }
  };
}

// Инициализация пользователя
async function initApp() {
  if (!state.token) {
    showAuthModal();
    return;
  }

  try {
    const res = await api("/api/v1/users/me");
    if (!res.ok) throw new Error("Не удалось загрузить пользователя");

    state.currentUser = await res.json();
    currentUsernameEl.textContent = state.currentUser.username;
    userAvatarImg.src = getAvatarUrl(state.currentUser.username);

    authModal.classList.add("hidden");
    messengerView.classList.remove("hidden");

    setupChatComponent();
    await loadRooms();
    connectWebSocket();
  } catch (err) {
    console.error("Ошибка инициализации:", err);
    logout();
  }
}

// Выход из системы
function logout() {
  localStorage.removeItem("access_token");
  state.token = null;
  state.currentUser = null;
  state.rooms = [];
  state.messages = [];
  state.activeRoomId = null;

  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }

  messengerView.classList.add("hidden");
  showAuthModal();
}

function showAuthModal() {
  authModal.classList.remove("hidden");
  loginForm.reset();
  registerForm.reset();
  loginError.classList.add("hidden");
  registerError.classList.add("hidden");
}

// Вкладки авторизации
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

// Отправка формы входа
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

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Неверный логин или пароль");
    }

    const data = await res.json();
    state.token = data.access_token;
    localStorage.setItem("access_token", state.token);
    initApp();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.classList.remove("hidden");
  }
});

// Отправка формы регистрации
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

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Ошибка при регистрации");
    }

    // Автоматический логин после успешной регистрации
    const loginFormData = new URLSearchParams();
    loginFormData.append("username", username);
    loginFormData.append("password", password);

    const loginRes = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: loginFormData,
    });

    const loginData = await loginRes.json();
    state.token = loginData.access_token;
    localStorage.setItem("access_token", state.token);
    initApp();
  } catch (err) {
    registerError.textContent = err.message;
    registerError.classList.remove("hidden");
  }
});

btnLogout.addEventListener("click", logout);

// ==================== Модалка Нового Чата ====================
function openNewChatModal() {
  newChatModal.classList.remove("hidden");
  userSearchInput.value = "";
  userSearchResults.innerHTML = '<div class="empty-search-text">Введите имя для поиска собеседника</div>';
  groupForm.reset();
  groupError.classList.add("hidden");
}

function closeNewChatModal() {
  newChatModal.classList.add("hidden");
}

btnNewChat.addEventListener("click", openNewChatModal);
btnCloseNewChat.addEventListener("click", closeNewChatModal);

tabDirect.addEventListener("click", () => {
  tabDirect.classList.add("active");
  tabGroup.classList.remove("active");
  directTabContent.classList.remove("hidden");
  groupForm.classList.add("hidden");
});

tabGroup.addEventListener("click", () => {
  tabGroup.classList.add("active");
  tabDirect.classList.remove("active");
  groupForm.classList.remove("hidden");
  directTabContent.classList.add("hidden");
});

// Живой поиск пользователей
let searchDebounceTimer = null;
userSearchInput.addEventListener("input", (e) => {
  clearTimeout(searchDebounceTimer);
  const query = e.target.value.trim();

  if (!query) {
    userSearchResults.innerHTML = '<div class="empty-search-text">Введите имя для поиска собеседника</div>';
    return;
  }

  searchDebounceTimer = setTimeout(async () => {
    try {
      const res = await api(`/api/v1/users/search?query=${encodeURIComponent(query)}`);
      const users = await res.json();

      if (!users || users.length === 0) {
        userSearchResults.innerHTML = '<div class="empty-search-text">Пользователи не найдены</div>';
        return;
      }

      userSearchResults.innerHTML = users.map(u => `
        <div class="search-user-item">
          <div class="search-user-info">
            <img class="search-user-avatar" src="${getAvatarUrl(u.username)}" alt="${u.username}">
            <div>
              <strong>${u.username}</strong>
              <div style="font-size: 11px; color: var(--text-muted)">ID: ${u.id} | ${u.email}</div>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="startDirectChat(${u.id})">Начать диалог</button>
        </div>
      `).join("");
    } catch (err) {
      console.error("Ошибка поиска пользователей:", err);
    }
  }, 300);
});

// Создание или переход в прямой чат
window.startDirectChat = async function(recipientId) {
  try {
    const res = await api("/api/v1/chats/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: recipientId })
    });
    if (!res.ok) throw new Error("Не удалось создать чат");

    const chat = await res.json();
    closeNewChatModal();
    await loadRooms();

    // Переключаемся на созданный чат
    chatComponent.roomId = String(chat.id);
  } catch (err) {
    alert(err.message);
  }
};

// Создание группы
groupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  groupError.classList.add("hidden");

  const name = document.getElementById("group-name").value.trim();
  const rawMembers = document.getElementById("group-members").value;

  const participantIds = rawMembers
    .split(",")
    .map(x => parseInt(x.trim(), 10))
    .filter(x => !isNaN(x));

  try {
    const res = await api("/api/v1/chats/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, participant_ids: participantIds })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Ошибка создания группы");
    }

    const chat = await res.json();
    closeNewChatModal();
    await loadRooms();
    chatComponent.roomId = String(chat.id);
  } catch (err) {
    groupError.textContent = err.message;
    groupError.classList.remove("hidden");
  }
});

// Запуск при старте страницы
document.addEventListener("DOMContentLoaded", initApp);
