import { plural } from "./format";

// Название, аватар и подпись чата с точки зрения текущего пользователя
export function getChatInfo(chat, myId) {
  if (chat.is_group) {
    const count = chat.participants?.length ?? 0;
    const title = chat.name || "Группа";
    return {
      title,
      avatarSeed: title,
      avatarUrl: null,
      subtitle: `${count} ${plural(count, ["участник", "участника", "участников"])}`,
      isGroup: true,
    };
  }

  const other = chat.participants?.find((p) => p.user_id !== myId);
  const user = other?.user;
  const username = user?.username ?? `user${other?.user_id ?? ""}`;
  return {
    title: user?.full_name || username,
    avatarSeed: username,
    avatarUrl: user?.avatar_url ?? null,
    subtitle: `@${username}`,
    isGroup: false,
    otherUserId: other?.user_id,
  };
}

// Сообщения из WebSocket приходят без объекта sender — ищем автора среди участников чата
export function getSender(msg, chat) {
  const participant = chat?.participants?.find((p) => p.user_id === msg.sender_id);
  const user = participant?.user ?? msg.sender;
  const username = user?.username ?? msg.sender_username ?? "unknown";
  return {
    id: msg.sender_id,
    name: user?.full_name || username,
    username,
    avatarUrl: user?.avatar_url ?? null,
  };
}
