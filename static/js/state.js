// ========================================================
// FastAPI Messenger - Global State Store (state.js)
// ========================================================

export const state = {
  token: localStorage.getItem("access_token") || null,
  currentUser: null,
  chats: [],
  activeChatId: null,
  messagesByChat: {}, // { [chatId]: [messageObjects] }
  wsConnected: false,
  searchQuery: "",
};

// Хелпер получения аватара по имени
export function getAvatarUrl(name) {
  return `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name || "user")}`;
}

// Форматирование времени для сообщений
export function formatTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

// Форматирование даты для разделителей
export function formatDate(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return "Сегодня";
  }
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}
