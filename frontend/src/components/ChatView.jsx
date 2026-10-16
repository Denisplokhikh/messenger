import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { useChatStore } from "../store/chats";
import { toast } from "../store/toast";
import ChatHeader from "./ChatHeader";
import Composer from "./Composer";
import MessageList from "./MessageList";
import { Spinner } from "./ui";

export default function ChatView({ chatId }) {
  const myId = useAuthStore((s) => s.user.id);
  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const chatsLoaded = useChatStore((s) => s.chatsLoaded);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const chatExists = Boolean(chat);

  // Историю грузим один раз при открытии чата, а не на каждое обновление объекта chat
  useEffect(() => {
    if (!chatExists) return;
    loadMessages(chatId).catch((e) => toast.error(e.message));
  }, [chatId, chatExists, loadMessages]);

  if (!chat) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        {chatsLoaded ? (
          <>
            <p className="text-sm text-zinc-500">Чат не найден или у вас нет к нему доступа.</p>
            <Link to="/" className="text-sm font-medium text-accent-text hover:underline">
              К списку чатов
            </Link>
          </>
        ) : (
          <Spinner />
        )}
      </div>
    );
  }

  return (
    <>
      <ChatHeader chat={chat} myId={myId} />
      <MessageList chat={chat} myId={myId} />
      <Composer chatId={chatId} myId={myId} />
    </>
  );
}
