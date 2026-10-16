import { useState } from "react";
import { Link } from "react-router-dom";
import { getChatInfo } from "../lib/chat";
import { useAuthStore } from "../store/auth";
import { useChatStore } from "../store/chats";
import Avatar from "./Avatar";
import ChatListItem from "./ChatListItem";
import NewChatModal from "./NewChatModal";
import ThemeToggle from "./ThemeToggle";
import { LogOutIcon, PlusIcon, SearchIcon } from "./icons";
import { IconButton, Spinner } from "./ui";

export default function Sidebar({ activeChatId, className = "" }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const chats = useChatStore((s) => s.chats);
  const chatsLoaded = useChatStore((s) => s.chatsLoaded);
  const wsConnected = useChatStore((s) => s.wsConnected);

  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = q ? chats.filter((c) => getChatInfo(c, user.id).title.toLowerCase().includes(q)) : chats;

  return (
    <aside
      className={`w-full flex-col border-zinc-200 bg-zinc-50/60 md:w-80 md:border-r lg:w-96 dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
    >
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-4 dark:border-zinc-800">
        <div className="flex items-baseline gap-2.5">
          <span className="font-semibold tracking-tight">messenger</span>
          <span
            className={`flex items-center gap-1.5 font-mono text-[11px] ${wsConnected ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400"}`}
          >
            <span className={`size-1.5 rounded-full ${wsConnected ? "bg-emerald-500" : "bg-zinc-400"}`} />
            {wsConnected ? "online" : "offline"}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <ThemeToggle />
          <IconButton label="Новый чат" onClick={() => setModalOpen(true)}>
            <PlusIcon />
          </IconButton>
        </div>
      </header>

      <div className="shrink-0 p-3">
        <div className="relative">
          <SearchIcon size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск чатов"
            className="w-full rounded-md border border-zinc-200 bg-white py-1.5 pr-3 pl-8 text-sm placeholder:text-zinc-400 focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:placeholder:text-zinc-600"
          />
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!chatsLoaded ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">
            {q ? "Ничего не найдено" : "Чатов пока нет. Нажмите «+», чтобы начать диалог."}
          </p>
        ) : (
          filtered.map((chat) => (
            <ChatListItem key={chat.id} chat={chat} myId={user.id} active={chat.id === activeChatId} />
          ))
        )}
      </nav>

      <footer className="flex h-14 shrink-0 items-center justify-between gap-2 border-t border-zinc-200 px-3 dark:border-zinc-800">
        <Link
          to="/profile"
          className="flex min-w-0 items-center gap-2.5 rounded-md p-1 pr-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          <Avatar src={user.avatar_url} seed={user.username} size={28} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium leading-tight">{user.full_name || user.username}</span>
            <span className="block truncate font-mono text-[11px] leading-tight text-zinc-500">@{user.username}</span>
          </span>
        </Link>
        <IconButton label="Выйти" onClick={logout} className="hover:text-red-600 dark:hover:text-red-400">
          <LogOutIcon />
        </IconButton>
      </footer>

      {modalOpen && <NewChatModal onClose={() => setModalOpen(false)} />}
    </aside>
  );
}
