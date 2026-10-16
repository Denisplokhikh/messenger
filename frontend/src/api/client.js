import { getToken } from "../lib/token";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized = null;

// auth-стор регистрирует здесь logout, чтобы не было циклического импорта
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

// FastAPI отдаёт detail строкой, а ошибки валидации (422) — массивом объектов
function extractDetail(data) {
  if (!data?.detail) return null;
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail)) return data.detail.map((e) => e.msg).join("; ");
  return null;
}

async function request(path, { method = "GET", body, form, error = "Ошибка запроса" } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(form);
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(`/api/v1${path}`, { method, headers, body: payload });

  // 401 при наличии токена = сессия истекла. Без токена это просто неверный логин.
  if (res.status === 401 && token) {
    onUnauthorized?.();
    throw new ApiError("Сессия истекла. Войдите снова.", 401);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(extractDetail(data) || error, res.status);
  return data;
}

export const api = {
  login: (username, password) =>
    request("/auth/login", { method: "POST", form: { username, password }, error: "Неверный логин или пароль" }),
  register: (username, email, password) =>
    request("/auth/register", { method: "POST", body: { username, email, password }, error: "Ошибка при регистрации" }),

  getMe: () => request("/users/me", { error: "Не удалось загрузить профиль" }),
  getUser: (userId) => request(`/users/${userId}`, { error: "Не удалось загрузить пользователя" }),
  searchUsers: (query) => request(`/users/search?query=${encodeURIComponent(query)}`, { error: "Ошибка поиска" }),
  updateProfile: (data) => request("/users/me", { method: "PATCH", body: data, error: "Не удалось сохранить профиль" }),
  changePassword: (currentPassword, newPassword) =>
    request("/users/me/change-password", {
      method: "POST",
      body: { current_password: currentPassword, new_password: newPassword },
      error: "Ошибка при смене пароля",
    }),

  getChats: () => request("/chats", { error: "Не удалось загрузить чаты" }),
  createDirectChat: (recipientId) =>
    request("/chats/direct", { method: "POST", body: { recipient_id: recipientId }, error: "Не удалось создать чат" }),
  createGroupChat: (name, participantIds) =>
    request("/chats/group", {
      method: "POST",
      body: { name, participant_ids: participantIds },
      error: "Не удалось создать группу",
    }),

  getMessages: (chatId, limit, offset) =>
    request(`/chats/${chatId}/messages?limit=${limit}&offset=${offset}`, { error: "Не удалось загрузить сообщения" }),
  sendMessage: (chatId, content) =>
    request(`/chats/${chatId}/messages`, { method: "POST", body: { content }, error: "Не удалось отправить сообщение" }),
};
