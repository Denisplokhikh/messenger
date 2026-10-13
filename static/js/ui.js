// ========================================================
// FastAPI Messenger - UI Renderer (ui.js)
// ========================================================

import { state, getAvatarUrl, formatTime, formatDate } from "./state.js";

// Безопасное экранирование HTML от XSS
export function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Получить имя и аватар диалога с учетом текущего пользователя
export function getChatDisplayInfo(chat, currentUserId) {
  if (chat.is_group) {
    const name = chat.name || "Групповой чат";
    return {
      title: name,
      avatar: getAvatarUrl(name),
      subtitle: `${chat.participants ? chat.participants.length : 2} участников`,
      isGroup: true,
    };
  }

  // Личный диалог: берем второго участника
  const otherParticipant = chat.participants?.find((p) => p.user_id !== currentUserId);
  const username = otherParticipant?.user ? otherParticipant.user.username : `User ${otherParticipant?.user_id || ""}`;
  return {
    title: username,
    avatar: getAvatarUrl(username),
    subtitle: "Личный диалог",
    isGroup: false,
  };
}

// 1. Отрисовка списка диалогов в левом сайдбаре
export function renderChatList(onSelectChat) {
  const container = document.getElementById("chat-list-container");
  if (!container) return;

  const query = state.searchQuery.trim().toLowerCase();
  const currentUserId = state.currentUser ? state.currentUser.id : null;

  const filteredChats = state.chats.filter((chat) => {
    if (!query) return true;
    const info = getChatDisplayInfo(chat, currentUserId);
    return info.title.toLowerCase().includes(query);
  });

  if (filteredChats.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-400 text-sm">
        ${query ? "Чаты не найдены" : "У вас пока нет активных диалогов.<br>Нажмите «+ Новый чат», чтобы начать общение."}
      </div>
    `;
    return;
  }

  container.innerHTML = filteredChats
    .map((chat) => {
      const info = getChatDisplayInfo(chat, currentUserId);
      const isActive = String(chat.id) === String(state.activeChatId);
      const lastMsg = chat.last_message;
      const lastMsgText = lastMsg ? escapeHtml(lastMsg.content) : "Сообщений пока нет";
      const lastMsgTime = lastMsg ? formatTime(lastMsg.created_at) : "";

      return `
        <div 
          data-chat-id="${chat.id}"
          class="chat-list-item flex items-center gap-3.5 px-4 py-3.5 rounded-xl cursor-pointer transition-all border ${
            isActive
              ? "bg-slate-800/90 border-blue-500/50 shadow-md"
              : "border-transparent hover:bg-slate-800/40 hover:border-slate-700/50"
          }"
        >
          <div class="relative flex-shrink-0">
            <img src="${info.avatar}" alt="${escapeHtml(info.title)}" class="w-11 h-11 rounded-full bg-slate-700 object-cover border border-slate-700/60" />
            <span class="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full"></span>
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-1 mb-1">
              <span class="font-semibold text-sm text-slate-100 truncate">${escapeHtml(info.title)}</span>
              <span class="text-[11px] text-slate-400 whitespace-nowrap flex-shrink-0">${lastMsgTime}</span>
            </div>
            <p class="text-xs text-slate-400 truncate">${lastMsgText}</p>
          </div>
        </div>
      `;
    })
    .join("");

  // Навешиваем слушатели кликов
  container.querySelectorAll(".chat-list-item").forEach((el) => {
    el.addEventListener("click", () => {
      const chatId = el.getAttribute("data-chat-id");
      if (onSelectChat) onSelectChat(chatId);
    });
  });
}

// 2. Отрисовка шапки активного диалога
export function renderActiveChatHeader(chat) {
  const headerContainer = document.getElementById("active-chat-header");
  if (!headerContainer || !chat) return;

  const currentUserId = state.currentUser ? state.currentUser.id : null;
  const info = getChatDisplayInfo(chat, currentUserId);

  headerContainer.innerHTML = `
    <div class="flex items-center gap-3.5">
      <div class="relative flex-shrink-0">
        <img src="${info.avatar}" alt="${escapeHtml(info.title)}" class="w-10 h-10 rounded-full bg-slate-700 object-cover border border-slate-700/60" />
        <span class="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full"></span>
      </div>
      <div>
        <h2 class="font-bold text-base text-slate-100 leading-tight">${escapeHtml(info.title)}</h2>
        <span class="text-xs text-slate-400">${escapeHtml(info.subtitle)}</span>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <span class="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
        ID: ${chat.id}
      </span>
    </div>
  `;
}

// 3. Отрисовка ленты сообщений (ВСЕ сообщения слева!)
export function renderMessages(chatId, shouldScrollToBottom = true) {
  const container = document.getElementById("messages-container");
  if (!container) return;

  const messages = state.messagesByChat[chatId] || [];
  const currentUserId = state.currentUser ? state.currentUser.id : null;

  if (messages.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-center p-8">
        <div class="w-14 h-14 rounded-full bg-slate-800/80 flex items-center justify-center text-2xl mb-3 border border-slate-700/50">
          💬
        </div>
        <h3 class="font-semibold text-slate-200 text-base mb-1">Здесь пока нет сообщений</h3>
        <p class="text-xs text-slate-400 max-w-xs">Отправьте первое сообщение, чтобы начать общение прямо сейчас.</p>
      </div>
    `;
    return;
  }

  let lastDateStr = "";
  const htmlParts = [];

  for (const msg of messages) {
    const isMe = String(msg.sender_id) === String(currentUserId);
    const dateStr = formatDate(msg.created_at);

    // Вставляем разделитель дат при смене дня
    if (dateStr && dateStr !== lastDateStr) {
      lastDateStr = dateStr;
      htmlParts.push(`
        <div class="flex items-center justify-center my-4">
          <span class="text-[11px] font-medium text-slate-400 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700/50 backdrop-blur-sm">
            ${escapeHtml(dateStr)}
          </span>
        </div>
      `);
    }

    const senderName = isMe ? "Вы" : (msg.sender?.username || msg.sender_username || "Собеседник");
    const avatarUrl = isMe
      ? (state.currentUser?.avatar_url || getAvatarUrl(state.currentUser?.username || "Вы"))
      : (msg.sender?.avatar_url || getAvatarUrl(senderName));
    const timeFormatted = formatTime(msg.created_at);
    const textEscaped = escapeHtml(msg.content);

    // ОБА типа сообщений выровнены СЛЕВА:
    // Собеседник = Серый (Slate-800)
    // Свои сообщения = Синий (Blue-600)
    if (isMe) {
      htmlParts.push(`
        <div class="flex items-start gap-2.5 mb-3 group" data-message-id="${msg.id}">
          <img src="${avatarUrl}" alt="${escapeHtml(senderName)}" class="w-8 h-8 rounded-full flex-shrink-0 bg-slate-700 object-cover mt-0.5 border border-blue-400/30" />
          
          <div class="max-w-[85%] md:max-w-[70%] bg-blue-600 text-white rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-md transition-all">
            <div class="text-[11px] font-semibold text-blue-200 mb-0.5 flex items-center gap-1.5">
              <span>Вы</span>
            </div>
            <div class="text-sm leading-relaxed whitespace-pre-wrap break-words">${textEscaped}</div>
            <div class="text-[10px] text-blue-200/80 mt-1 text-right font-medium">${timeFormatted}</div>
          </div>
        </div>
      `);
    } else {
      htmlParts.push(`
        <div class="flex items-start gap-2.5 mb-3 group" data-message-id="${msg.id}">
          <img src="${avatarUrl}" alt="${escapeHtml(senderName)}" class="w-8 h-8 rounded-full flex-shrink-0 bg-slate-700 object-cover mt-0.5 border border-slate-700/60" />
          
          <div class="max-w-[85%] md:max-w-[70%] bg-slate-800 text-slate-100 border border-slate-700/60 rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm transition-all">
            <div class="text-[11px] font-semibold text-blue-400 mb-0.5 flex items-center gap-1.5">
              <span>${escapeHtml(senderName)}</span>
            </div>
            <div class="text-sm leading-relaxed whitespace-pre-wrap break-words">${textEscaped}</div>
            <div class="text-[10px] text-slate-400 mt-1 text-right font-medium">${timeFormatted}</div>
          </div>
        </div>
      `);
    }
  }
  container.innerHTML = htmlParts.join("");
  if (shouldScrollToBottom) {
    scrollToBottom(false);
  }
  }

// 4. Прокрутка ленты вниз
export function scrollToBottom(smooth = true) {
  const container = document.getElementById("messages-container");
  if (!container) return;
  container.scrollTo({
    top: container.scrollHeight,
    behavior: smooth ? "smooth" : "auto",
  });
}

// 5. Переключение между Empty State и Активным чатом
export function setChatViewVisible(hasActiveChat) {
  const emptyView = document.getElementById("empty-chat-view");
  const activeView = document.getElementById("active-chat-view");

  if (hasActiveChat) {
    if (emptyView) emptyView.classList.add("hidden");
    if (activeView) activeView.classList.remove("hidden");
  } else {
    if (emptyView) emptyView.classList.remove("hidden");
    if (activeView) activeView.classList.add("hidden");
  }
}

// 6. Обновление статуса сокета
export function updateSocketStatusBadge(isConnected) {
  const badge = document.getElementById("ws-status");
  if (!badge) return;

  if (isConnected) {
    badge.textContent = "● В сети";
    badge.className = "text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30";
  } else {
    badge.textContent = "● Офлайн";
    badge.className = "text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30";
  }
}
