import { useEffect } from "react";
import { connectSocket, disconnectSocket } from "../api/socket";
import { useChatStore } from "../store/chats";

// Одно WebSocket-соединение на время жизни мессенджера.
// Хендлеры берут стор через getState(), поэтому не зависят от замыканий рендера.
export function useSocket() {
  useEffect(() => {
    connectSocket({
      onMessage: (msg) => useChatStore.getState().addMessage(msg),
      onTyping: (event) => useChatStore.getState().setTyping(event),
      onPresence: (event) => useChatStore.getState().setPresence(event),
      onEdit: (event) => useChatStore.getState().applyEdit(event),
      onDelete: (event) => useChatStore.getState().applyDelete(event),
    });
    return () => disconnectSocket();
  }, []);
}
