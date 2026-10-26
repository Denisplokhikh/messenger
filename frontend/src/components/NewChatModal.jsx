import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { hasPointer } from "../lib/device";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useAuthStore } from "../store/auth";
import { useChatStore } from "../store/chats";
import { toast } from "../store/toast";
import Avatar from "./Avatar";
import UserSearch from "./UserSearch";
import { XIcon } from "./icons";
import { Button, ErrorText, Field, IconButton, Input } from "./ui";

export default function NewChatModal({ onClose }) {
  const [tab, setTab] = useState("direct");
  useBodyScrollLock();

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-zinc-950/40 backdrop-blur-[2px] md:items-start md:p-4 md:pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-title"
        className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-xl border border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-xl md:max-h-[76dvh] md:rounded-lg md:pb-0 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 id="new-chat-title" className="text-sm font-semibold">
            Новый чат
          </h2>
          <IconButton label="Закрыть" onClick={onClose}>
            <XIcon />
          </IconButton>
        </div>

        <div className="min-h-0 overflow-y-auto p-4">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-md bg-zinc-100 p-1 dark:bg-zinc-900">
            {[
              ["direct", "Личный"],
              ["group", "Группа"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === key
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "direct" ? <DirectChatForm onDone={onClose} /> : <GroupChatForm onDone={onClose} />}
        </div>
      </div>
    </div>
  );
}

function DirectChatForm({ onDone }) {
  const myId = useAuthStore((s) => s.user.id);
  const createDirectChat = useChatStore((s) => s.createDirectChat);
  const navigate = useNavigate();

  async function start(user) {
    try {
      const chat = await createDirectChat(user.id);
      onDone();
      navigate(`/chat/${chat.id}`);
    } catch (e) {
      toast.error(e.message);
    }
  }

  return <UserSearch onSelect={start} excludeIds={[myId]} actionLabel="Написать" autoFocus={hasPointer()} />;
}

function GroupChatForm({ onDone }) {
  const myId = useAuthStore((s) => s.user.id);
  const createGroupChat = useChatStore((s) => s.createGroupChat);
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [members, setMembers] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (members.length === 0) {
      setError("Добавьте хотя бы одного участника");
      return;
    }

    setSubmitting(true);
    try {
      const chat = await createGroupChat(
        name.trim(),
        members.map((m) => m.id),
      );
      onDone();
      navigate(`/chat/${chat.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Название">
        <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Например: Разработка" autoFocus={hasPointer()} />
      </Field>

      <div className="space-y-2">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Участники</span>
        {members.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 py-0.5 pr-1 pl-0.5 text-xs dark:border-zinc-800"
              >
                <Avatar src={m.avatar_url} seed={m.username} size={18} />
                <span className="font-mono">@{m.username}</span>
                <button
                  type="button"
                  aria-label={`Убрать ${m.username}`}
                  onClick={() => setMembers((list) => list.filter((x) => x.id !== m.id))}
                  className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  <XIcon size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <UserSearch
          onSelect={(user) => setMembers((list) => [...list, user])}
          excludeIds={[myId, ...members.map((m) => m.id)]}
          actionLabel="Добавить"
        />
      </div>

      <ErrorText>{error}</ErrorText>

      <Button type="submit" disabled={submitting} className="w-full">
        Создать группу
      </Button>
    </form>
  );
}
