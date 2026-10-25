import { Link } from "react-router-dom";
import { getChatInfo, getMessagePreview, getTypingLabel } from "../lib/chat";
import { formatChatTime } from "../lib/format";
import { usePresence } from "../hooks/usePresence";
import { useChatStore } from "../store/chats";
import Avatar from "./Avatar";

export default function ChatListItem({ chat, myId, active }) {
  const info = getChatInfo(chat, myId);
  const last = chat.last_message;
  const preview = last ? `${last.sender_id === myId ? "Вы: " : ""}${getMessagePreview(last)}` : "Нет сообщений";
  const typing = useChatStore((s) => s.typingByChat[chat.id]);
  const typingLabel = getTypingLabel(typing, info.isGroup);
  const { online } = usePresence(info.otherUser);

  return (
    <Link
      to={`/chat/${chat.id}`}
      className={`relative flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors ${
        active ? "bg-zinc-200/60 dark:bg-zinc-900" : "hover:bg-zinc-100 dark:hover:bg-zinc-900/60"
      }`}
    >
      {active && <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-accent" />}
      <Avatar src={info.avatarUrl} seed={info.avatarSeed} size={36} online={!info.isGroup && online} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">{info.title}</span>
          {last && (
            <span className="shrink-0 font-mono text-[11px] text-zinc-500">{formatChatTime(last.created_at)}</span>
          )}
        </div>
        {typingLabel ? (
          <p className="truncate text-xs text-accent">{typingLabel}</p>
        ) : (
          <p className="truncate text-xs text-zinc-500">{preview}</p>
        )}
      </div>
    </Link>
  );
}
