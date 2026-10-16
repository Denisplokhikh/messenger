import { getToken } from "../lib/token";

const PING_INTERVAL = 25000;
const RECONNECT_DELAY = 3000;
const WS_POLICY_VIOLATION = 1008; // сервер так закрывает соединение при неверном токене

let socket = null;
let handlers = null;
let pingTimer = null;
let reconnectTimer = null;

export function connectSocket(newHandlers) {
  disconnectSocket();
  handlers = newHandlers;

  const token = getToken();
  if (!token) return;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${window.location.host}/api/v1/ws`);
  socket = ws;

  // Токен отправляем первым сообщением, а не в URL, чтобы он не попадал в логи
  ws.onopen = () => ws.send(JSON.stringify({ type: "authenticate", token }));

  ws.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    if (data.event === "connected") {
      handlers?.onStatus?.(true);
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: "ping" }));
      }, PING_INTERVAL);
      return;
    }

    if (data.event === "new_message" && data.message) {
      handlers?.onMessage?.(data.message);
    }
  };

  ws.onclose = (event) => {
    if (socket !== ws) return;
    socket = null;
    clearInterval(pingTimer);
    handlers?.onStatus?.(false);

    if (event.code === WS_POLICY_VIOLATION) {
      console.warn("WebSocket: авторизация не прошла, переподключение отменено");
      return;
    }
    const current = handlers;
    reconnectTimer = setTimeout(() => connectSocket(current), RECONNECT_DELAY);
  };
}

export function disconnectSocket() {
  clearTimeout(reconnectTimer);
  clearInterval(pingTimer);
  if (socket) {
    const ws = socket;
    socket = null;
    ws.onclose = null;
    ws.close();
    handlers?.onStatus?.(false);
  }
}
