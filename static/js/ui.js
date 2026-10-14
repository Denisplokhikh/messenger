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
    isGroup: false,
    otherUserId: otherParticipant?.user_id,
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
          class="chat-list-item flex items-center gap-3.5 px-3.5 py-3 rounded-lg cursor-pointer transition-all border ${
            isActive
              ? "bg-[#37373d] border-[#007acc]/70 text-white shadow-sm"
              : "border-transparent hover:bg-[#2a2d2e] text-[#cccccc]"
          }"
        >
          <div class="relative flex-shrink-0">
            <img src="${info.avatar}" alt="${escapeHtml(info.title)}" class="w-10 h-10 rounded-full bg-[#2d2d2d] object-cover border border-[#3c3c3c]" />
            <span class="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#252526] rounded-full"></span>
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-1 mb-1">
              <span class="font-semibold text-sm text-[#e6e6e6] truncate">${escapeHtml(info.title)}</span>
              <span class="text-[11px] text-[#858585] whitespace-nowrap flex-shrink-0">${lastMsgTime}</span>
            </div>
            <p class="text-xs text-[#858585] truncate">${lastMsgText}</p>
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

  const avatarHtml = info.isGroup || !info.otherUserId
    ? `<img src="${info.avatar}" alt="${escapeHtml(info.title)}" class="w-10 h-10 rounded-full bg-[#2d2d2d] object-cover border border-[#3c3c3c]" />`
    : `<a href="/profile/${info.otherUserId}" class="block flex-shrink-0 transition-transform hover:scale-105" title="Открыть профиль ${escapeHtml(info.title)}">
         <img src="${info.avatar}" alt="${escapeHtml(info.title)}" class="w-10 h-10 rounded-full bg-[#2d2d2d] object-cover border border-[#3c3c3c] cursor-pointer" />
       </a>`;

  const titleHtml = info.isGroup || !info.otherUserId
    ? `<h2 class="font-bold text-base text-[#e6e6e6] leading-tight">${escapeHtml(info.title)}</h2>`
    : `<a href="/profile/${info.otherUserId}" class="font-bold text-base text-[#e6e6e6] leading-tight hover:text-[#007acc] transition-colors" title="Открыть профиль ${escapeHtml(info.title)}">
         ${escapeHtml(info.title)}
       </a>`;

  headerContainer.innerHTML = `
    <div class="flex items-center gap-3.5">
      <div class="relative flex-shrink-0">
        ${avatarHtml}
        <span class="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#252526] rounded-full pointer-events-none"></span>
      </div>
      <div>
        ${titleHtml}
        <span class="text-xs text-[#858585]">${escapeHtml(info.subtitle)}</span>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <span class="text-xs px-2.5 py-1 rounded-full bg-[#1e1e1e] text-[#858585] border border-[#3c3c3c]">
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
        <div class="w-14 h-14 rounded-xl bg-[#252526] flex items-center justify-center text-2xl mb-3 border border-[#333333]">
          💬
        </div>
        <h3 class="font-semibold text-[#e6e6e6] text-base mb-1">Здесь пока нет сообщений</h3>
        <p class="text-xs text-[#858585] max-w-xs">Отправьте первое сообщение, чтобы начать общение прямо сейчас.</p>
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
          <span class="text-[13px] font-medium text-[#858585] bg-[#252526] px-3 py-1 rounded-full border border-[#333333] shadow-sm">
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
    // Свои сообщения = Тёмный графит с синим акцентом (#2d3139)
    // Собеседник = Классический тёмно-серый (#252526)
    if (isMe) {
      htmlParts.push(`
        <div class="flex items-start gap-2.5 mb-2.5 group" data-message-id="${msg.id}">
          <a href="/profile" class="flex-shrink-0 transition-transform hover:scale-105" title="Мой профиль">
            <img src="${avatarUrl}" alt="${escapeHtml(senderName)}" class="w-8 h-8 rounded-full bg-[#2d2d2d] object-cover mt-0.5 border border-[#007acc]/40 cursor-pointer" />
          </a>
          
          <div class="max-w-[85%] md:max-w-[70%] bg-[#2d3139] text-[#e6e6e6] border border-[#3e4451] rounded-lg px-3.5 py-1.5 shadow-sm transition-all">
            <div class="flex items-baseline gap-2">
              <span class="text-sm leading-snug whitespace-pre-wrap break-words">${textEscaped}</span>
              <span class="text-[12px] text-[#9da5b4] whitespace-nowrap self-end select-none">${timeFormatted}</span>
            </div>
          </div>
        </div>
      `);
    } else {
      const senderId = msg.sender?.id || msg.sender_id;
      const profileHref = senderId ? `/profile/${senderId}` : "#";

      htmlParts.push(`
        <div class="flex items-start gap-2.5 mb-2.5 group" data-message-id="${msg.id}">
          <a href="${profileHref}" class="flex-shrink-0 transition-transform hover:scale-105" title="Открыть профиль ${escapeHtml(senderName)}">
            <img src="${avatarUrl}" alt="${escapeHtml(senderName)}" class="w-8 h-8 rounded-full bg-[#2d2d2d] object-cover mt-0.5 border border-[#3c3c3c] cursor-pointer" />
          </a>
          
          <div class="max-w-[85%] md:max-w-[70%] bg-[#252526] text-[#cccccc] border border-[#383838] rounded-lg px-3.5 py-1.5 shadow-sm transition-all">
            <div class="flex items-baseline gap-2">
              <span class="text-sm leading-snug whitespace-pre-wrap break-words">${textEscaped}</span>
              <span class="text-[12px] text-[#858585] whitespace-nowrap self-end select-none">${timeFormatted}</span>
            </div>
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
