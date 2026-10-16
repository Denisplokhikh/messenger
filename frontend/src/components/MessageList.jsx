import { useLayoutEffect, useRef } from "react";
import { getSender } from "../lib/chat";
import { formatDay, isSameDay } from "../lib/format";
import { useChatStore } from "../store/chats";
import { toast } from "../store/toast";
import MessageRow from "./MessageRow";
import { MessageIcon } from "./icons";
import { Spinner } from "./ui";

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const LOAD_OLDER_THRESHOLD = 40; // px от верха, когда начинаем подгрузку истории
const STICK_THRESHOLD = 80; // px от низа, в пределах которых держим ленту прижатой книзу

export default function MessageList({ chat, myId }) {
  const messages = useChatStore((s) => s.messagesByChat[chat.id]);
  const hasMore = useChatStore((s) => s.hasMoreByChat[chat.id] ?? false);
  const loadOlder = useChatStore((s) => s.loadOlder);

  const containerRef = useRef(null);
  const loadingOlderRef = useRef(false);
  const stickToBottomRef = useRef(true);
  const prevRef = useRef({ firstId: null, lastId: null, scrollHeight: 0 });

  // Управление прокруткой после каждого изменения списка
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !messages) return;

    const prev = prevRef.current;
    const firstId = messages[0]?.id ?? null;
    const lastId = messages.at(-1)?.id ?? null;

    if (prev.lastId === lastId && prev.firstId !== firstId && prev.firstId !== null) {
      // Подгрузили историю сверху — сохраняем позицию, чтобы взгляд остался на том же сообщении
      el.scrollTop += el.scrollHeight - prev.scrollHeight;
    } else if (prev.lastId !== lastId) {
      // Новое сообщение или первая загрузка: прокручиваем вниз, если пользователь был внизу
      // или сообщение его собственное
      const mine = messages.at(-1)?.sender_id === myId;
      if (prev.lastId === null || stickToBottomRef.current || mine) {
        el.scrollTop = el.scrollHeight;
        stickToBottomRef.current = true;
      }
    }

    prevRef.current = { firstId, lastId, scrollHeight: el.scrollHeight };
  }, [messages, myId]);

  async function handleScroll() {
    const el = containerRef.current;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;

    if (el.scrollTop < LOAD_OLDER_THRESHOLD && hasMore && !loadingOlderRef.current) {
      loadingOlderRef.current = true;
      try {
        await loadOlder(chat.id);
      } catch (e) {
        toast.error(e.message);
      } finally {
        loadingOlderRef.current = false;
      }
    }
  }

  if (!messages) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <MessageIcon size={20} className="text-zinc-400" />
        <p className="text-sm font-medium">Сообщений пока нет</p>
        <p className="text-xs text-zinc-500">Напишите первым.</p>
      </div>
    );
  }

  const rows = [];
  messages.forEach((msg, i) => {
    const prev = messages[i - 1];
    const newDay = !prev || !isSameDay(prev.created_at, msg.created_at);

    if (newDay) {
      rows.push(<DateDivider key={`d-${msg.client_id ?? msg.id}`} label={formatDay(msg.created_at)} />);
    }

    const grouped =
      !newDay &&
      prev.sender_id === msg.sender_id &&
      new Date(msg.created_at) - new Date(prev.created_at) < GROUP_WINDOW_MS;

    const sender = getSender(msg, chat);
    rows.push(
      <MessageRow
        key={msg.client_id ?? msg.id}
        msg={msg}
        name={sender.name}
        username={sender.username}
        avatarUrl={sender.avatarUrl}
        isMe={msg.sender_id === myId}
        grouped={grouped}
      />,
    );
  });

  return (
    <div ref={containerRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto py-4">
      {hasMore && (
        <div className="flex justify-center py-2">
          <Spinner />
        </div>
      )}
      {rows}
    </div>
  );
}

function DateDivider({ label }) {
  return (
    <div className="my-3 flex items-center gap-3 px-4 md:px-6">
      <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      <span className="font-mono text-[11px] text-zinc-500">{label}</span>
      <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}
