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

async function request(path, { method = "GET", body, form, formData, error = "Ошибка запроса" } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (formData) {
    // Content-Type не ставим: браузер сам допишет multipart/form-data вместе с boundary
    payload = formData;
  } else if (form) {
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

// Загрузка с прогрессом: у fetch нет события прогресса отправки, поэтому XMLHttpRequest.
// Возвращает { promise, abort }: abort нужен, чтобы отменить загрузку крестиком в композере
function upload(path, file, { onProgress, error = "Не удалось загрузить файл" } = {}) {
  const xhr = new XMLHttpRequest();
  const promise = new Promise((resolve, reject) => {
    xhr.open("POST", `/api/v1${path}`);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.responseType = "json";

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status === 401 && token) {
        onUnauthorized?.();
        reject(new ApiError("Сессия истекла. Войдите снова.", 401));
      } else if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
      } else {
        reject(new ApiError(extractDetail(xhr.response) || error, xhr.status));
      }
    };
    xhr.onerror = () => reject(new ApiError(error, 0));
    xhr.onabort = () => reject(new ApiError("Загрузка отменена", 0));

    const formData = new FormData();
    formData.append("file", file, file.name);
    xhr.send(formData);
  });
  return { promise, abort: () => xhr.abort() };
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
  uploadAvatar: (blob) => {
    const formData = new FormData();
    formData.append("file", blob, "avatar");
    return request("/users/me/avatar", { method: "POST", formData, error: "Не удалось загрузить фото" });
  },
  deleteAvatar: () => request("/users/me/avatar", { method: "DELETE", error: "Не удалось удалить фото" }),
  changePassword: (currentPassword, newPassword) =>
    request("/users/me/change-password", {
      method: "POST",
      body: { current_password: currentPassword, new_password: newPassword },
      error: "Ошибка при смене пароля",
    }),
  deleteAccount: (currentPassword) =>
    request("/users/me", {
      method: "DELETE",
      body: { current_password: currentPassword },
      error: "Не удалось удалить аккаунт",
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

  // Без beforeId — последние сообщения, с ним — сообщения старше указанного
  getMessages: (chatId, limit, beforeId) => {
    const params = new URLSearchParams({ limit });
    if (beforeId != null) params.set("before_id", beforeId);
    return request(`/chats/${chatId}/messages?${params}`, { error: "Не удалось загрузить сообщения" });
  },
  sendMessage: (chatId, content, attachmentIds = [], replyToId = null) =>
    request(`/chats/${chatId}/messages`, {
      method: "POST",
      body: { content, attachment_ids: attachmentIds, reply_to_id: replyToId },
      error: "Не удалось отправить сообщение",
    }),

  // Правка меняет только текст: вложения у сообщения остаются прежними
  editMessage: (chatId, messageId, content) =>
    request(`/chats/${chatId}/messages/${messageId}`, {
      method: "PATCH",
      body: { content },
      error: "Не удалось изменить сообщение",
    }),

  deleteMessage: (chatId, messageId) =>
    request(`/chats/${chatId}/messages/${messageId}`, {
      method: "DELETE",
      error: "Не удалось удалить сообщение",
    }),

  uploadAttachment: (file, onProgress) => upload("/attachments", file, { onProgress }),
};
