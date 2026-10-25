import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { getChatInfo, getTypingLabel } from "../lib/chat";
import { useChatStore } from "../store/chats";
import Avatar from "./Avatar";
import GroupInfoModal from "./GroupInfoModal";
import { ArrowLeftIcon } from "./icons";

export default function ChatHeader({ chat, myId }) {
  const info = getChatInfo(chat, myId);
  const [infoOpen, setInfoOpen] = useState(false);
  const closeInfo = useCallback(() => setInfoOpen(false), []);
  const typing = useChatStore((s) => s.typingByChat[chat.id]);
  const typingLabel = getTypingLabel(typing, info.isGroup);
  const profileLink = info.otherUserId ? `/profile/${info.otherUserId}` : null;

  const identity = (
    <>
      <Avatar src={info.avatarUrl} seed={info.avatarSeed} size={32} />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold leading-tight">{info.title}</div>
        {typingLabel ? (
          <div className="truncate font-mono text-[11px] leading-tight text-accent">{typingLabel}</div>
        ) : (
          <div className="truncate font-mono text-[11px] leading-tight text-zinc-500">{info.subtitle}</div>
        )}
      </div>
    </>
  );

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200 px-3 md:px-6 dark:border-zinc-800">
      <Link
        to="/"
        aria-label="Назад к чатам"
        className="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 md:hidden dark:hover:bg-zinc-900"
      >
        <ArrowLeftIcon />
      </Link>

      {profileLink ? (
        <Link to={profileLink} className="flex min-w-0 items-center gap-3 rounded-md hover:opacity-80">
          {identity}
        </Link>
      ) : info.isGroup ? (
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className="flex min-w-0 items-center gap-3 rounded-md text-left hover:opacity-80"
        >
          {identity}
        </button>
      ) : (
        <div className="flex min-w-0 items-center gap-3">{identity}</div>
      )}

      {infoOpen && <GroupInfoModal chat={chat} myId={myId} onClose={closeInfo} />}
    </header>
  );
}
