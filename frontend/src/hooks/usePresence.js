import { useChatStore } from "../store/chats";

// Статус пользователя: живое событие из WebSocket важнее того, что пришло в ответе API.
// user — объект UserPublicResponse (участник чата, результат поиска, профиль).
export function usePresence(user) {
  const live = useChatStore((s) => (user?.id ? s.presenceByUser[user.id] : undefined));

  return {
    online: live?.is_online ?? user?.is_online ?? false,
    lastSeen: live?.last_seen_at ?? user?.last_seen_at ?? null,
  };
}
