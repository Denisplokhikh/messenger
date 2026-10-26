import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useChatStore } from "../store/chats";
import { toast } from "../store/toast";
import { CopyIcon, EditIcon, ReplyIcon, TrashIcon, XIcon } from "./icons";

// Нижняя панель действий с сообщением. На тач-экранах :hover не существует,
// поэтому ответ, правка и удаление открываются тапом по сообщению
export default function MessageActionsSheet({ msg, name, canModify, onClose }) {
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const startEdit = useChatStore((s) => s.startEdit);
  const deleteMessage = useChatStore((s) => s.deleteMessage);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function reply() {
    setReplyTo(msg.chat_id, msg);
    onClose();
  }

  function edit() {
    startEdit(msg.chat_id, msg);
    onClose();
  }

  async function copy() {
    onClose();
    try {
      await navigator.clipboard.writeText(msg.content);
      toast.success("Текст скопирован");
    } catch {
      toast.error("Не удалось скопировать");
    }
  }

  async function remove() {
    onClose();
    if (!window.confirm("Удалить сообщение? Это увидят все участники чата.")) return;
    try {
      await deleteMessage(msg.chat_id, msg.id);
    } catch (e) {
      toast.error(e.message);
    }
  }

  const preview = msg.content || "Вложение";

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex flex-col justify-end bg-zinc-950/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Действия с сообщением"
        className="rounded-t-xl border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-accent-text">{name}</p>
            <p className="truncate text-xs text-zinc-500">{preview}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="-my-1 inline-flex size-10 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            <XIcon />
          </button>
        </div>

        <div className="p-2">
          <SheetAction icon={<ReplyIcon size={18} />} label="Ответить" onClick={reply} />
          {canModify && <SheetAction icon={<EditIcon size={18} />} label="Изменить" onClick={edit} />}
          {msg.content && <SheetAction icon={<CopyIcon size={18} />} label="Копировать текст" onClick={copy} />}
          {canModify && <SheetAction icon={<TrashIcon size={18} />} label="Удалить" onClick={remove} danger />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SheetAction({ icon, label, onClick, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
        danger ? "text-red-600 dark:text-red-400" : ""
      }`}
    >
      <span className="text-zinc-500 dark:text-zinc-400">{icon}</span>
      {label}
    </button>
  );
}
