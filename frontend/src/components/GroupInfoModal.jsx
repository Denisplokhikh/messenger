import { useEffect } from "react";
import { Link } from "react-router-dom";
import { getChatInfo } from "../lib/chat";
import Avatar from "./Avatar";
import { XIcon } from "./icons";
import { IconButton } from "./ui";

export default function GroupInfoModal({ chat, myId, onClose }) {
  const info = getChatInfo(chat, myId);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Себя показываем первым, остальных — по имени
  const participants = [...(chat.participants ?? [])].sort((a, b) => {
    if (a.user_id === myId) return -1;
    if (b.user_id === myId) return 1;
    return displayName(a.user).localeCompare(displayName(b.user));
  });

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-zinc-950/40 p-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-info-title"
        className="flex max-h-[76vh] w-full max-w-md flex-col rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">Информация о группе</h2>
          <IconButton label="Закрыть" onClick={onClose}>
            <XIcon />
          </IconButton>
        </div>

        <div className="flex flex-col items-center gap-3 border-b border-zinc-200 px-4 py-6 text-center dark:border-zinc-800">
          <Avatar src={info.avatarUrl} seed={info.avatarSeed} size={80} />
          <div className="min-w-0 max-w-full">
            <div id="group-info-title" className="truncate text-base font-semibold">
              {info.title}
            </div>
            <div className="font-mono text-xs text-zinc-500">{info.subtitle}</div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="px-2 pt-1 pb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">Участники</div>
          <ul>
            {participants.map((p) => {
              const isMe = p.user_id === myId;
              return (
                <li key={p.user_id}>
                  <Link
                    to={`/profile/${p.user_id}`}
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  >
                    <Avatar src={p.user?.avatar_url} seed={p.user?.username} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{displayName(p.user)}</div>
                      <div className="truncate font-mono text-[11px] text-zinc-500">@{p.user?.username}</div>
                    </div>
                    {isMe && <span className="shrink-0 font-mono text-[11px] text-zinc-500">вы</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function displayName(user) {
  return user?.full_name || user?.username || "";
}
