import { memo } from "react";
import { Link } from "react-router-dom";
import { formatTime } from "../lib/format";
import { useChatStore } from "../store/chats";
import { toast } from "../store/toast";
import Avatar from "./Avatar";
import MessageAttachments from "./MessageAttachments";
import { EditIcon, ReplyIcon, TrashIcon } from "./icons";

// memo: при новом сообщении перерисовывается только новая строка, а не вся лента.
// Поэтому props — только примитивы: объект chat менял бы идентичность на каждое сообщение
// и ломал бы мемоизацию всей ленты
function MessageRow({ msg, quoteName, name, username, avatarUrl, isMe, grouped }) {
  const time = formatTime(msg.created_at);
  const profileLink = isMe ? "/profile" : `/profile/${msg.sender_id}`;
  const deleted = Boolean(msg.deleted_at);
  // Правка и удаление — только свои, отправленные и не удалённые.
  // status есть лишь у оптимистичных черновиков: сервер про них ещё не знает
  const canModify = isMe && !deleted && !msg.status;

  return (
    <div
      id={`msg-${msg.id}`}
      className={`group relative flex gap-3 px-4 transition-colors hover:bg-zinc-50 md:px-6 dark:hover:bg-zinc-900/50 ${grouped ? "py-0.5" : "mt-2 pt-1.5 pb-0.5"}`}
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
            <span className="shrink-0 font-mono text-xs text-zinc-500">{time}</span>
            {msg.edited_at && !deleted && <EditedMark />}
          </div>
        )}

        {!deleted && msg.reply_to && (
          <Quote replyTo={msg.reply_to} authorName={quoteName} />
        )}

        <div className={`transition-opacity ${msg.status === "pending" ? "opacity-60" : ""}`}>
          {deleted ? (
            <p className="flex items-center gap-1.5 py-0.5 text-sm text-zinc-500 italic">
              <TrashIcon size={12} />
              Сообщение удалено
            </p>
          ) : (
            <>
              {msg.content && (
                <p
                  className={`text-sm leading-6 break-words whitespace-pre-wrap ${
                    msg.status === "failed" ? "text-red-600 dark:text-red-400" : "text-zinc-800 dark:text-zinc-200"
                  }`}
                >
                  {msg.content}
                  {grouped && msg.edited_at && (
                    <>
                      {" "}
                      <EditedMark />
                    </>
                  )}
                </p>
              )}
              <MessageAttachments attachments={msg.attachments} />
            </>
          )}
        </div>
        {msg.status === "failed" && <FailedActions msg={msg} />}
      </div>

      {!deleted && !msg.status && (
        <RowActions msg={msg} canModify={canModify} />
      )}
    </div>
  );
}

function EditedMark() {
  return (
    <span className="shrink-0 font-mono text-[10px] text-zinc-400" title="Сообщение изменено">
      изм.
    </span>
  );
}

// Цитата внутри ответа. Клик прокручивает ленту к оригиналу, если он уже загружен
function Quote({ replyTo, authorName }) {
  const text = replyTo.deleted_at
    ? "Сообщение удалено"
    : replyTo.content || "Вложение";

  function jump() {
    document.getElementById(`msg-${replyTo.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <button
      type="button"
      onClick={jump}
      title="Перейти к сообщению"
      className="mb-1 flex max-w-lg items-baseline gap-2 overflow-hidden rounded border-l-2 border-accent/70 bg-zinc-100/70 px-2 py-1 text-left transition-colors hover:bg-zinc-100 dark:bg-zinc-800/50 dark:hover:bg-zinc-800"
    >
      <span className="shrink-0 text-xs font-semibold text-accent-text">{authorName}</span>
      <span className="truncate text-xs text-zinc-500">{text}</span>
    </button>
  );
}

// Кнопки появляются при наведении на строку, чтобы не засорять ленту
function RowActions({ msg, canModify }) {
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const startEdit = useChatStore((s) => s.startEdit);
  const deleteMessage = useChatStore((s) => s.deleteMessage);

  async function remove() {
    if (!window.confirm("Удалить сообщение? Это увидят все участники чата.")) return;
    try {
      await deleteMessage(msg.chat_id, msg.id);
    } catch (e) {
      toast.error(e.message);
    }
  }

  return (
    <div className="absolute top-1 right-2 flex items-center gap-0.5 rounded-md border border-zinc-200 bg-white p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-within:opacity-100 dark:border-zinc-700 dark:bg-zinc-900">
      <ActionButton title="Ответить" onClick={() => setReplyTo(msg.chat_id, msg)}>
        <ReplyIcon size={13} />
      </ActionButton>
      {canModify && (
        <>
          <ActionButton title="Изменить" onClick={() => startEdit(msg.chat_id, msg)}>
            <EditIcon size={13} />
          </ActionButton>
          <ActionButton title="Удалить" onClick={remove} danger>
            <TrashIcon size={13} />
          </ActionButton>
        </>
      )}
    </div>
  );
}

function ActionButton({ title, onClick, danger, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex size-6 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 ${
        danger ? "hover:text-red-600 dark:hover:text-red-400" : ""
      }`}
    >
      {children}
    </button>
  );
}

function FailedActions({ msg }) {
  const retryMessage = useChatStore((s) => s.retryMessage);
  const discardMessage = useChatStore((s) => s.discardMessage);

  return (
    <div className="flex gap-3 font-mono text-xs text-zinc-500">
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
