// ========================================================
// FastAPI Messenger - Main Application Entry (app.js)
// ========================================================

import { state, getAvatarUrl } from "./js/state.js";
import { api } from "./js/api.js";
import { connectWebSocket, disconnectWebSocket } from "./js/socket.js";
import {
  renderChatList,
  renderMessages,
  renderActiveChatHeader,
  setChatViewVisible,
  updateSocketStatusBadge,
  scrollToBottom,
  escapeHtml,
} from "./js/ui.js";

// DOM Elements
const authModal = document.getElementById("auth-modal");
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const loginError = document.getElementById("login-error");
const registerError = document.getElementById("register-error");

const messengerApp = document.getElementById("messenger-app");
const myAvatar = document.getElementById("my-avatar");
const btnLogout = document.getElementById("btn-logout");
const chatSearchInput = document.getElementById("chat-search-input");

const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");

// Modal New Chat
const btnOpenNewChat = document.getElementById("btn-open-new-chat");
const newChatModal = document.getElementById("new-chat-modal");
const btnCloseNewChat = document.getElementById("btn-close-new-chat");
const tabDirectChat = document.getElementById("tab-direct-chat");
const tabGroupChat = document.getElementById("tab-group-chat");
const directChatPanel = document.getElementById("direct-chat-panel");
const groupChatForm = document.getElementById("group-chat-form");
const userSearchModalInput = document.getElementById("user-search-modal-input");
const userSearchResults = document.getElementById("user-search-results");
const groupNameInput = document.getElementById("group-name-input");
const groupMembersInput = document.getElementById("group-members-input");
const groupError = document.getElementById("group-error");

// ========================================================
// 1. Инициализация приложения
// ========================================================
async function init() {
  if (!state.token) {
    showAuthModal();
    return;
  }

  try {
    // 1. Загрузка профиля текущего пользователя
    state.currentUser = await api.getMe();
    if (myAvatar) {
      myAvatar.src = state.currentUser.avatar_url || getAvatarUrl(state.currentUser.username);
      myAvatar.title = state.currentUser.full_name
        ? `${state.currentUser.full_name} (@${state.currentUser.username})`
        : `@${state.currentUser.username}`;
    }

    // 2. Отображаем мессенджер
    authModal.classList.add("hidden");
    messengerApp.classList.remove("hidden");

    // 3. Загрузка диалогов
    await loadChats();

    // 4. Подключение к WebSocket
    connectWebSocket(handleIncomingSocketMessage, handleSocketStatusChange);
  } catch (err) {
    console.error("Ошибка инициализации:", err);
    logout();
  }
}

// Загрузка и обновление списка чатов
async function loadChats() {
  try {
    state.chats = await api.getChats();
    renderChatList(selectChat);

    // Если есть активный чат, обновляем его заголовок
    if (state.activeChatId) {
      const activeChat = state.chats.find((c) => String(c.id) === String(state.activeChatId));
      if (activeChat) {
        renderActiveChatHeader(activeChat);
      }
    }
  } catch (err) {
    console.error("Ошибка загрузки чатов:", err);
  }
}

// Выбор диалога
async function selectChat(chatId) {
  state.activeChatId = String(chatId);
  const chat = state.chats.find((c) => String(c.id) === String(chatId));

  renderChatList(selectChat);
  setChatViewVisible(true);

  if (chat) {
    renderActiveChatHeader(chat);
  }

  // Загрузка сообщений (если ещё нет в кэше)
  try {
    const messages = await api.getMessages(chatId);
    state.messagesByChat[chatId] = messages;
    renderMessages(chatId);
  } catch (err) {
    console.error("Ошибка загрузки сообщений:", err);
  }

  if (messageInput) {
    messageInput.focus();
  }
}

// ========================================================
// 2. Обработка входящих сообщений (WebSocket)
// ========================================================
function handleIncomingSocketMessage(msg) {
  const chatId = String(msg.chat_id);

  if (!state.messagesByChat[chatId]) {
    state.messagesByChat[chatId] = [];
  }

  // Проверяем на дубликаты
  const exists = state.messagesByChat[chatId].some((m) => String(m.id) === String(msg.id));
  if (!exists) {
    state.messagesByChat[chatId].push(msg);
  }

  // Обновляем последнее сообщение в карточке чата
  const chatIndex = state.chats.findIndex((c) => String(c.id) === chatId);
  if (chatIndex !== -1) {
    state.chats[chatIndex].last_message = msg;
  } else {
    // Новый чат появился — перезагружаем список чатов
    loadChats();
  }

  renderChatList(selectChat);

  // Если это активный открытый чат — обновляем ленту сообщений
  if (String(state.activeChatId) === chatId) {
    renderMessages(chatId);
    scrollToBottom(true);
  }
}

function handleSocketStatusChange(isConnected) {
  updateSocketStatusBadge(isConnected);
}

// ========================================================
// 3. Отправка сообщений
// ========================================================
if (messageForm) {
  messageForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!state.activeChatId) return;
    const content = messageInput.value.trim();
    if (!content) return;

    messageInput.value = "";

    try {
      // Отправляем сообщение на сервер
      const newMsg = await api.sendMessage(state.activeChatId, content);

      // Добавляем в локальный кэш
      const chatId = String(state.activeChatId);
      if (!state.messagesByChat[chatId]) {
        state.messagesByChat[chatId] = [];
      }
      state.messagesByChat[chatId].push(newMsg);

      // Обновляем последнее сообщение в сайдбаре
      const chatIndex = state.chats.findIndex((c) => String(c.id) === chatId);
      if (chatIndex !== -1) {
        state.chats[chatIndex].last_message = newMsg;
      }

      renderChatList(selectChat);
      renderMessages(chatId);
      scrollToBottom(true);
    } catch (err) {
      alert(err.message);
    }
  });
}

// ========================================================
// 4. Поиск диалогов в сайдбаре
// ========================================================
if (chatSearchInput) {
  chatSearchInput.addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    renderChatList(selectChat);
  });
}

// ========================================================
// 5. Авторизация и Выход
// ========================================================
function showAuthModal() {
  authModal.classList.remove("hidden");
  messengerApp.classList.add("hidden");
  loginForm.reset();
  registerForm.reset();
  loginError.classList.add("hidden");
  registerError.classList.add("hidden");
}

function logout() {
  localStorage.removeItem("access_token");
  state.token = null;
  state.currentUser = null;
  state.chats = [];
  state.activeChatId = null;
  state.messagesByChat = {};
  disconnectWebSocket();
  showAuthModal();
}

window.addEventListener("auth:logout", logout);
if (btnLogout) btnLogout.addEventListener("click", logout);

// Переключение табов Вход / Регистрация
tabLogin.addEventListener("click", () => {
  tabLogin.className = "flex-1 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white transition-all";
  tabRegister.className = "flex-1 py-2 text-xs font-semibold rounded-lg text-slate-400 hover:text-slate-200 transition-all";
  loginForm.classList.remove("hidden");
  registerForm.classList.add("hidden");
});

tabRegister.addEventListener("click", () => {
  tabRegister.className = "flex-1 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white transition-all";
  tabLogin.className = "flex-1 py-2 text-xs font-semibold rounded-lg text-slate-400 hover:text-slate-200 transition-all";
  registerForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
});

// Отправка формы входа
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.classList.add("hidden");

  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;

  try {
    const data = await api.login(username, password);
    state.token = data.access_token;
    localStorage.setItem("access_token", state.token);
    init();
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
    await api.register(username, email, password);
    // Авто-логин после успешной регистрации
    const data = await api.login(username, password);
    state.token = data.access_token;
    localStorage.setItem("access_token", state.token);
    init();
  } catch (err) {
    registerError.textContent = err.message;
    registerError.classList.remove("hidden");
  }
});

// ========================================================
// 6. Модальное окно создания нового чата
// ========================================================
function openNewChatModal() {
  newChatModal.classList.remove("hidden");
  userSearchModalInput.value = "";
  userSearchResults.innerHTML = '<div class="text-center text-xs text-slate-500 py-6">Начните вводить имя пользователя</div>';
  groupChatForm.reset();
  groupError.classList.add("hidden");
}

function closeNewChatModal() {
  newChatModal.classList.add("hidden");
}

if (btnOpenNewChat) btnOpenNewChat.addEventListener("click", openNewChatModal);
if (btnCloseNewChat) btnCloseNewChat.addEventListener("click", closeNewChatModal);

// Табы в модалке создания чата
tabDirectChat.addEventListener("click", () => {
  tabDirectChat.className = "flex-1 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white transition-all";
  tabGroupChat.className = "flex-1 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-slate-200 transition-all";
  directChatPanel.classList.remove("hidden");
  groupChatForm.classList.add("hidden");
});

tabGroupChat.addEventListener("click", () => {
  tabGroupChat.className = "flex-1 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white transition-all";
  tabDirectChat.className = "flex-1 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-slate-200 transition-all";
  groupChatForm.classList.remove("hidden");
  directChatPanel.classList.add("hidden");
});

// Поиск собеседников
let searchDebounce = null;
userSearchModalInput.addEventListener("input", (e) => {
  clearTimeout(searchDebounce);
  const query = e.target.value.trim();

  if (!query) {
    userSearchResults.innerHTML = '<div class="text-center text-xs text-slate-500 py-6">Начните вводить имя пользователя</div>';
    return;
  }

  searchDebounce = setTimeout(async () => {
    try {
      const users = await api.searchUsers(query);
      if (users.length === 0) {
        userSearchResults.innerHTML = '<div class="text-center text-xs text-slate-500 py-6">Пользователи не найдены</div>';
        return;
      }

      userSearchResults.innerHTML = users
        .map(
          (u) => `
          <div class="flex items-center justify-between p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl hover:border-slate-700 transition-all">
            <div class="flex items-center gap-2.5">
              <img src="${getAvatarUrl(u.username)}" class="w-8 h-8 rounded-full bg-slate-800 object-cover" />
              <div>
                <span class="text-xs font-semibold text-slate-100 block">${escapeHtml(u.username)}</span>
                <span class="text-[10px] text-slate-400">ID: ${u.id} | ${escapeHtml(u.email)}</span>
              </div>
            </div>
            <button 
              type="button" 
              data-user-id="${u.id}"
              class="btn-start-dialog px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-all shadow"
            >
              Начать диалог
            </button>
          </div>
        `
        )
        .join("");

      // Слушатели кнопки создания диалога
      userSearchResults.querySelectorAll(".btn-start-dialog").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const recipientId = parseInt(btn.getAttribute("data-user-id"), 10);
          try {
            const chat = await api.createDirectChat(recipientId);
            closeNewChatModal();
            await loadChats();
            selectChat(chat.id);
          } catch (err) {
            alert(err.message);
          }
        });
      });
    } catch (err) {
      console.error("Ошибка поиска:", err);
    }
  }, 250);
});

// Создание группы
groupChatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  groupError.classList.add("hidden");

  const name = groupNameInput.value.trim();
  const rawMembers = groupMembersInput.value;
  const participantIds = rawMembers
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((x) => !isNaN(x));

  try {
    const chat = await api.createGroupChat(name, participantIds);
    closeNewChatModal();
    await loadChats();
    selectChat(chat.id);
  } catch (err) {
    groupError.textContent = err.message;
    groupError.classList.remove("hidden");
  }
});

// Запуск приложения
document.addEventListener("DOMContentLoaded", init);
