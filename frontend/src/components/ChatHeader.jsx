import { Link } from "react-router-dom";
import { getChatInfo } from "../lib/chat";
import Avatar from "./Avatar";
import { ArrowLeftIcon } from "./icons";

export default function ChatHeader({ chat, myId }) {
  const info = getChatInfo(chat, myId);
  const profileLink = info.otherUserId ? `/profile/${info.otherUserId}` : null;

  const identity = (
    <>
      <Avatar src={info.avatarUrl} seed={info.avatarSeed} size={32} />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold leading-tight">{info.title}</div>
        <div className="truncate font-mono text-[11px] leading-tight text-zinc-500">{info.subtitle}</div>
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
      ) : (
        <div className="flex min-w-0 items-center gap-3">{identity}</div>
      )}

      <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-400">#{chat.id}</span>
    </header>
  );
}
