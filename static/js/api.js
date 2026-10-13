// ========================================================
// FastAPI Messenger - REST API Client (api.js)
// ========================================================

import { state } from "./state.js";

async function request(endpoint, options = {}) {
  const headers = { ...options.headers };

  if (state.token) {
    headers["Authorization"] = `Bearer ${state.token}`;
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    // Сессия истекла
    localStorage.removeItem("access_token");
    state.token = null;
    state.currentUser = null;
    window.dispatchEvent(new CustomEvent("auth:logout"));
    throw new Error("Сессия истекла. Пожалуйста, войдите снова.");
  }

  return res;
}

export const api = {
  // Авторизация и регистрация
  async login(username, password) {
    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);

    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Неверный логин или пароль");
    }

    return res.json();
  },
  async register(username, email, password) {
    const res = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Ошибка при регистрации");
    }

    return res.json();
  },

  async getMe() {
    const res = await request("/api/v1/users/me");
    if (!res.ok) throw new Error("Не удалось загрузить профиль");
    return res.json();
  },

  // Поиск пользователей
  async searchUsers(query) {
    const res = await request(`/api/v1/users/search?query=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    return res.json();
  },

  // Список чатов
  async getChats() {
    const res = await request("/api/v1/chats");
    if (!res.ok) throw new Error("Ошибка при получении списка чатов");
    return res.json();
  },

  // Создание диалога
  async createDirectChat(recipientId) {
    const res = await request("/api/v1/chats/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: recipientId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Не удалось создать личный чат");
    }
    return res.json();
  },

  // Создание группы
  async createGroupChat(name, participantIds) {
    const res = await request("/api/v1/chats/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, participant_ids: participantIds }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Не удалось создать группу");
    }
    return res.json();
  },

  // История сообщений чата
  async getMessages(chatId, limit = 30, offset = 0) {
    const res = await request(`/api/v1/chats/${chatId}/messages?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error("Не удалось загрузить историю сообщений");
    return res.json();
  },

  // Отправка сообщения
  async sendMessage(chatId, content) {
    const res = await request(`/api/v1/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Не удалось отправить сообщение");
    }
    return res.json();
  },

  // Обновление профиля
  async updateProfile(data) {
    const res = await request("/api/v1/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Не удалось сохранить профиль");
    }
    return res.json();
  },

  // Смена пароля
  async changePassword(currentPassword, newPassword) {
    const res = await request("/api/v1/users/me/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Ошибка при смене пароля");
    }
    return res.json();
  },
  
  async getUser(userId) {
    const res = await request(`/api/v1/users/${userId}`);
    if (!res.ok) throw new Error("Не удалось загрузить пользователя");
    return res.json();
  },

};

