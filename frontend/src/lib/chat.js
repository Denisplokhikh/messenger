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
    // Полный публичный профиль собеседника: оттуда берём last_seen_at и is_online
    otherUser: user,
  };
}

// Подпись «печатает…» для шапки и списка чатов. typing — { [userId]: username } из стора
export function getTypingLabel(typing, isGroup) {
  const names = Object.values(typing ?? {});
  if (names.length === 0) return null;
  if (!isGroup) return "печатает…";
  if (names.length === 1) return `${names[0]} печатает…`;
  return `${names.length} ${plural(names.length, ["человек", "человека", "человек"])} печатают…`;
}

// Имя автора цитируемого сообщения: «Вы» для себя, иначе ищем среди участников чата
export function getReplyAuthorName(replyTo, chat, myId) {
  if (replyTo.sender_id === myId) return "Вы";
  const participant = chat?.participants?.find((p) => p.user_id === replyTo.sender_id);
  const user = participant?.user;
  return user?.full_name || user?.username || replyTo.sender_username || "unknown";
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

// Текст для превью в списке чатов: подпись, а если её нет — что приложено
export function getMessagePreview(msg) {
  // Удалённое сообщение остаётся в ленте плашкой, и в списке чатов тоже должно быть понятно
  if (msg.deleted_at) return "Сообщение удалено";
  if (msg.content) return msg.content;
  const attachments = msg.attachments ?? [];
  const images = attachments.filter((a) => a.kind === "image").length;
  if (attachments.length === 0) return "";
  if (images === attachments.length) return images === 1 ? "Фото" : `${images} фото`;
  if (attachments.length === 1) return `Файл: ${attachments[0].file_name}`;
  return `${attachments.length} ${plural(attachments.length, ["вложение", "вложения", "вложений"])}`;
}
