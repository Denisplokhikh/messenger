import { memo } from "react";
import { Link } from "react-router-dom";
import { formatTime } from "../lib/format";
import { useChatStore } from "../store/chats";
import Avatar from "./Avatar";

// memo: при новом сообщении перерисовывается только новая строка, а не вся лента
function MessageRow({ msg, name, username, avatarUrl, isMe, grouped }) {
  const time = formatTime(msg.created_at);
  const profileLink = isMe ? "/profile" : `/profile/${msg.sender_id}`;

  return (
    <div
      className={`group flex gap-3 px-4 transition-colors hover:bg-zinc-50 md:px-6 dark:hover:bg-zinc-900/50 ${grouped ? "py-0.5" : "mt-2 pt-1.5 pb-0.5"}`}
    >
      <div className="w-8 shrink-0">
        {grouped ? (
          <span className="invisible block pt-0.5 text-right font-mono text-[10px] leading-5 text-zinc-400 group-hover:visible">
            {time}
          </span>
        ) : (
          <Link to={profileLink} className="block hover:opacity-80">
            <Avatar src={avatarUrl} seed={username} size={32} />
          </Link>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <Link
              to={profileLink}
              className={`truncate text-sm font-semibold hover:underline ${isMe ? "text-accent-text" : ""}`}
            >
              {name}
            </Link>
            <span className="shrink-0 font-mono text-[11px] text-zinc-500">{time}</span>
          </div>
        )}
        <p
          className={`text-sm leading-6 break-words whitespace-pre-wrap transition-opacity ${
            msg.status === "failed" ? "text-red-600 dark:text-red-400" : "text-zinc-800 dark:text-zinc-200"
          } ${msg.status === "pending" ? "opacity-60" : ""}`}
        >
          {msg.content}
        </p>
        {msg.status === "failed" && <FailedActions msg={msg} />}
      </div>
    </div>
  );
}

function FailedActions({ msg }) {
  const retryMessage = useChatStore((s) => s.retryMessage);
  const discardMessage = useChatStore((s) => s.discardMessage);

  return (
    <div className="flex gap-3 font-mono text-[11px] text-zinc-500">
      <span className="text-red-600 dark:text-red-400">Не отправлено</span>
      <button type="button" onClick={() => retryMessage(msg)} className="hover:text-accent-text hover:underline">
        Повторить
      </button>
      <button type="button" onClick={() => discardMessage(msg)} className="hover:text-accent-text hover:underline">
        Удалить
      </button>
    </div>
  );
}

export default memo(MessageRow);
