// ========================================================
// FastAPI Messenger - WebSocket Client (socket.js)
// ========================================================

import { state } from "./state.js";

let socket = null;
let pingTimer = null;
let reconnectTimer = null;

export function connectWebSocket(onMessageCallback, onStatusChange) {
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }

  if (!state.token) return;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/api/v1/ws`;

  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    // Отправляем токен первым сообщением внутри защищенного соединения
    socket.send(
      JSON.stringify({
        type: "authenticate",
        token: state.token,
      })
    );
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      // 1. Подтверждение авторизации
      if (data.event === "connected" || data.type === "connection_ack") {
        state.wsConnected = true;
        if (onStatusChange) onStatusChange(true);

        if (pingTimer) clearInterval(pingTimer);
        pingTimer = setInterval(() => {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ action: "ping" }));
          }
        }, 25000);
        return;
      }

      // 2. Входящее сообщение
      if (data.event === "new_message" && data.message) {
        if (onMessageCallback) {
          onMessageCallback(data.message);
        }
      }
    } catch (err) {
      console.error("Ошибка обработки WebSocket сообщения:", err);
    }
  };

  socket.onclose = (event) => {
    state.wsConnected = false;
    if (onStatusChange) onStatusChange(false);
    if (pingTimer) clearInterval(pingTimer);

    // Код 1008 = ошибка авторизации (неверный токен). Переподключаться нельзя.
    if (event.code === 1008) {
      console.warn("WebSocket: не удалось авторизоваться (код 1008). Переподключение отменено.");
      return;
    }

    if (state.token) {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        connectWebSocket(onMessageCallback, onStatusChange);
      }, 3000);
    }
  };

  socket.onerror = (err) => {
    console.error("WebSocket ошибка:", err);
  };
}

export function disconnectWebSocket() {
  clearTimeout(reconnectTimer);
  if (pingTimer) clearInterval(pingTimer);
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
  state.wsConnected = false;
}
