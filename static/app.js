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
const messengerApp = document.getElementById("messenger-app");
const myAvatar = document.getElementById("my-avatar");
const btnLogout = document.getElementById("btn-logout");
const chatSearchInput = document.getElementById("chat-search-input");

const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const messagesContainer = document.getElementById("messages-container");

// Состояние пагинации истории сообщений
let isLoadingOlderMessages = false;
let hasMoreMessages = true;

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
    window.location.replace("/login");
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
    if (messengerApp) {
      messengerApp.classList.remove("hidden");
    }

    // 3. Загрузка диалогов
    await loadChats();

    const urlParams = new URLSearchParams(window.location.search);
    const chatParam = urlParams.get("chat");
    if (chatParam) {
      await selectChat(chatParam);
    }

    // 4. Подключение к WebSocket
    connectWebSocket(handleIncomingSocketMessage, handleSocketStatusChange);
  } catch (err) {
    console.error("Ошибка инициализации:", err);
    if (err.message && (err.message.includes("Сессия истекла") || err.message.includes("401"))) {
      logout();
    }
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

  // Сбрасываем пагинацию при выборе нового чата
  hasMoreMessages = true;
  isLoadingOlderMessages = false;

  // Мгновенно отрисовываем сообщения из кэша (если уже открывали этот чат ранее)
  const cached = state.messagesByChat[chatId];
  if (cached && cached.length > 0) {
    renderMessages(chatId, true);
  } else {
    renderMessages(chatId, true);
  }

  if (messageInput) {
    messageInput.focus();
  }

  // Фоновая загрузка свежих последних 30 сообщений с сервера
  try {
    const messages = await api.getMessages(chatId, 30, 0);
    state.messagesByChat[chatId] = messages;
    if (String(state.activeChatId) === String(chatId)) {
      renderMessages(chatId, true);
    }
  } catch (err) {
    console.error("Ошибка загрузки сообщений:", err);
  }
}
function addMessageToCache(chatId, msg) {
  if (!state.messagesByChat[chatId]) {
    state.messagesByChat[chatId] = [];
  }
  const exists = state.messagesByChat[chatId].some((m) => String(m.id) === String(msg.id));
  if (!exists) {
    state.messagesByChat[chatId].push(msg);
  }
}
// ========================================================
// 2. Обработка входящих сообщений (WebSocket)
// ========================================================
function handleIncomingSocketMessage(msg) {
  const chatId = String(msg.chat_id);

  addMessageToCache(chatId, msg);
  

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
// 3. Отправка сообщений (с умным разбиением > 1000 символов)
// ========================================================
function splitTextIntoChunks(text, maxLength = 1000) {
  const chunks = [];
  let remaining = text.trim();

  while (remaining.length > maxLength) {
    // 1. Ищем перенос строки ближе к лимиту
    let splitIndex = remaining.lastIndexOf("\n", maxLength);

    // 2. Если нет переноса, ищем последний пробел
    if (splitIndex === -1 || splitIndex < maxLength * 0.7) {
      splitIndex = remaining.lastIndexOf(" ", maxLength);
    }

    // 3. Если пробелов нет (длинная строка), режем жестко по maxLength
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

if (messageForm) {
  messageForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!state.activeChatId) return;
    const content = messageInput.value.trim();
    if (!content) return;

    messageInput.value = "";

    // Разбиваем текст, если он длиннее 1000 символов
    const chunks = splitTextIntoChunks(content, 1000);
    const chatId = String(state.activeChatId);

    try {
      // Отправляем кусочки последовательно, сохраняя порядок
      for (const chunk of chunks) {
        const newMsg = await api.sendMessage(state.activeChatId, chunk);

        addMessageToCache(chatId, newMsg);

        // Обновляем последнее сообщение в сайдбаре
        const chatIndex = state.chats.findIndex((c) => String(c.id) === chatId);
        if (chatIndex !== -1) {
          state.chats[chatIndex].last_message = newMsg;
        }

        renderChatList(selectChat);
        renderMessages(chatId, true);
        scrollToBottom(true);
      }
    } catch (err) {
      alert(err.message);
    }
  });
}

// Кнопка прикрепления файлов (скрепка)
const btnAttachFile = document.getElementById("btn-attach-file");
const fileInput = document.getElementById("file-input");
if (btnAttachFile && fileInput) {
  btnAttachFile.addEventListener("click", () => {
    fileInput.click();
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files.length > 0) {
      alert(`Выбран файл: ${fileInput.files[0].name}\n(Загрузка и отправка файлов на сервер запланирована в следующем обновлении)`);
    }
  });
}

// Подгрузка старых сообщений при прокрутке ленты вверх (Reverse Infinite Scroll)
if (messagesContainer) {
  messagesContainer.addEventListener("scroll", async () => {
    // Если пользователь долистал до самого верха (scrollTop < 40px)
    if (messagesContainer.scrollTop < 40 && !isLoadingOlderMessages && hasMoreMessages && state.activeChatId) {
      const activeId = String(state.activeChatId);
      const currentList = state.messagesByChat[activeId] || [];
      const offset = currentList.length;

      // Если в чате ещё нет сообщений, подгружать нечего
      if (offset === 0) return;

      isLoadingOlderMessages = true;
      const prevScrollHeight = messagesContainer.scrollHeight;

      try {
        const olderMessages = await api.getMessages(activeId, 30, offset);

        // Если пришло меньше лимита — мы долистали до начала истории
        if (olderMessages.length < 30) {
          hasMoreMessages = false;
        }

        if (olderMessages.length > 0 && String(state.activeChatId) === activeId) {
          // Исключаем дубликаты
          const existingIds = new Set(currentList.map((m) => String(m.id)));
          const uniqueOlder = olderMessages.filter((m) => !existingIds.has(String(m.id)));

          if (uniqueOlder.length > 0) {
            // Добавляем старые сообщения В НАЧАЛО массива
            state.messagesByChat[activeId] = [...uniqueOlder, ...currentList];

            // Отрисовываем БЕЗ скролла вниз
            renderMessages(activeId, false);

            // Компенсируем сдвиг высоты, чтобы взгляд пользователя остался ровно на том же сообщении
            const heightDiff = messagesContainer.scrollHeight - prevScrollHeight;
            messagesContainer.scrollTop = heightDiff;
          }
        }
      } catch (err) {
        console.error("Ошибка при подгрузке старых сообщений:", err);
      } finally {
        isLoadingOlderMessages = false;
      }
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
function logout() {
  localStorage.removeItem("access_token");
  state.token = null;
  state.currentUser = null;
  state.chats = [];
  state.activeChatId = null;
  state.messagesByChat = {};
  disconnectWebSocket();
  window.location.replace("/login");
}

window.addEventListener("auth:logout", logout);
if (btnLogout) btnLogout.addEventListener("click", logout);

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
