import { useEffect } from "react";
import { useParams } from "react-router-dom";
import ChatView from "../components/ChatView";
import Sidebar from "../components/Sidebar";
import { MessageIcon } from "../components/icons";
import { useSocket } from "../hooks/useSocket";
import { useVisualViewport } from "../hooks/useVisualViewport";
import { useChatStore } from "../store/chats";
import { toast } from "../store/toast";

export default function MessengerPage() {
  const { chatId } = useParams();
  // id чата — uuid-строка, используем как есть
  const activeChatId = chatId ?? null;
  const loadChats = useChatStore((s) => s.loadChats);

  useSocket();
  // Высота оболочки следует за visualViewport, чтобы клавиатура не накрывала композер
  useVisualViewport();

  useEffect(() => {
    // На холодном старте загрузку уже запустил App, параллельно с /users/me.
    // Здесь догружаем только если списка ещё нет
    if (useChatStore.getState().chatsLoaded) return;
    loadChats().catch((e) => toast.error(e.message));
  }, [loadChats]);

  // На мобильном видна одна колонка: список или открытый чат. На md+ — обе.
  return (
    <div
      className="fixed inset-x-0 flex overflow-hidden"
      style={{ top: "var(--app-offset, 0px)", height: "var(--app-height, 100dvh)" }}
    >
      <Sidebar activeChatId={activeChatId} className={activeChatId ? "hidden md:flex" : "flex"} />
      <main className={`min-w-0 flex-1 flex-col ${activeChatId ? "flex" : "hidden md:flex"}`}>
        {activeChatId ? (
          <ChatView key={activeChatId} chatId={activeChatId} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <MessageIcon size={20} className="text-zinc-400" />
            <p className="text-sm font-medium">Выберите чат</p>
            <p className="text-xs text-zinc-500">или создайте новый кнопкой «+» в списке слева</p>
          </div>
        )}
      </main>
    </div>
  );
}
