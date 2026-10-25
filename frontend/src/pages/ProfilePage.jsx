import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import Avatar from "../components/Avatar";
import AvatarCropModal from "../components/AvatarCropModal";
import ThemeToggle from "../components/ThemeToggle";
import { ArrowLeftIcon, CameraIcon, CopyIcon, LogOutIcon, MessageIcon, TrashIcon, XIcon } from "../components/icons";
import { Button, Field, FullScreenMessage, IconButton, Input, Spinner, inputClass } from "../components/ui";
import { useNow } from "../hooks/useNow";
import { usePresence } from "../hooks/usePresence";
import { cropToBlob } from "../lib/cropImage";
import { formatLastSeen } from "../lib/format";
import { useAuthStore } from "../store/auth";
import { useChatStore } from "../store/chats";
import { toast } from "../store/toast";
import NotFoundPage from "./NotFoundPage";

export default function ProfilePage() {
  const { userId } = useParams();
  const me = useAuthStore((s) => s.user);
  const isMe = !userId || userId === me.id;

  // Чужой профиль грузим с сервера, свой берём из стора
  const [other, setOther] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | notfound | error

  useEffect(() => {
    if (isMe) return;
    let cancelled = false;
    setStatus("loading");
    api
      .getUser(userId)
      .then((user) => {
        if (cancelled) return;
        setOther(user);
        setStatus("idle");
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus(e.status === 404 || e.status === 422 ? "notfound" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [userId, isMe]);

  if (!isMe && status === "notfound") return <NotFoundPage message="Пользователь не найден." />;
  if (!isMe && status === "error") {
    return (
      <FullScreenMessage>
        <p className="text-sm text-zinc-500">Не удалось загрузить профиль.</p>
      </FullScreenMessage>
    );
  }

  const user = isMe ? me : other;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-zinc-200 bg-white/80 px-3 backdrop-blur md:px-6 dark:border-zinc-800 dark:bg-zinc-950/80">
        <Link
          to="/"
          aria-label="Назад к чатам"
          className="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          <ArrowLeftIcon />
        </Link>
        <span className="text-sm font-semibold">{isMe ? "Мой профиль" : "Профиль"}</span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        {!user || (!isMe && status === "loading") ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : isMe ? (
          <MyProfile user={user} />
        ) : (
          <ProfileCard user={user} action={<WriteButton userId={user.id} />} showPresence />
        )}
      </main>
    </div>
  );
}

function ProfileCard({ user, avatarAction, action, showPresence = false }) {
  const { online, lastSeen } = usePresence(user);
  const now = useNow();

  function copyUsername() {
    navigator.clipboard
      .writeText(`@${user.username}`)
      .then(() => toast.success("Имя пользователя скопировано"))
      .catch(() => toast.error("Не удалось скопировать"));
  }

  const registered = user.created_at
    ? new Date(user.created_at).toLocaleDateString("ru-RU", { month: "long", year: "numeric" })
    : null;

  return (
    <section className="flex flex-col gap-5 sm:flex-row sm:items-start">
      <div className="relative self-start">
        <Avatar src={user.avatar_url} seed={user.username} size={88} online={showPresence && online} />
        {avatarAction}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <h1 className="truncate text-xl font-semibold tracking-tight">{user.full_name || user.username}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-zinc-500">
          <button type="button" onClick={copyUsername} className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100">
            @{user.username}
            <CopyIcon size={12} />
          </button>
          {registered && <span>с {registered}</span>}
        </div>
        {showPresence && (
          <p
            className={`font-mono text-xs ${
              online ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500"
            }`}
          >
            {online ? "в сети" : formatLastSeen(lastSeen, now)}
          </p>
        )}
        {user.bio && <p className="text-sm whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{user.bio}</p>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </section>
  );
}

function WriteButton({ userId }) {
  const createDirectChat = useChatStore((s) => s.createDirectChat);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const chat = await createDirectChat(userId);
      navigate(`/chat/${chat.id}`);
    } catch (e) {
      toast.error(e.message);
      setBusy(false);
    }
  }

  return (
    <Button onClick={start} disabled={busy}>
      <MessageIcon size={15} />
      Написать
    </Button>
  );
}

function Section({ title, description, tone, children }) {
  const border = tone === "danger" ? "border-red-200 dark:border-red-900/60" : "border-zinc-200 dark:border-zinc-800";
  return (
    <section className={`rounded-lg border ${border}`}>
      <div className={`border-b px-5 py-3.5 ${border}`}>
        <h2 className={`text-sm font-semibold ${tone === "danger" ? "text-red-600 dark:text-red-400" : ""}`}>{title}</h2>
        {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function MyProfile({ user }) {
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  const [form, setForm] = useState({
    username: user.username ?? "",
    full_name: user.full_name ?? "",
    email: user.email ?? "",
    bio: user.bio ?? "",
  });
  const [saving, setSaving] = useState(false);

  const fileInput = useRef(null);
  const [cropSrc, setCropSrc] = useState(null); // object URL выбранного файла, пока открыт кроп
  const [avatarBusy, setAvatarBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.updateProfile({
        username: form.username.trim(),
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        bio: form.bio.trim(),
      });
      setUser(updated);
      toast.success("Профиль сохранён");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  function pickFile(e) {
    const file = e.target.files?.[0];
    // Сбрасываем, чтобы повторный выбор того же файла снова вызвал onChange
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Выберите изображение");
      return;
    }
    setCropSrc(URL.createObjectURL(file));
  }

  function closeCrop() {
    URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  // Аватар сохраняется сразу, без кнопки «Сохранить» формы: файл всё равно уже на сервере
  async function uploadCropped(area) {
    try {
      const blob = await cropToBlob(cropSrc, area);
      setUser(await api.uploadAvatar(blob));
      toast.success("Фото обновлено");
      closeCrop();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    try {
      setUser(await api.deleteAvatar());
      toast.success("Фото удалено");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAvatarBusy(false);
    }
  }

  const avatarButtonClass = "absolute border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950";

  return (
    <>
      <ProfileCard
        user={user}
        avatarAction={
          <>
            <IconButton
              label="Загрузить фото"
              onClick={() => fileInput.current?.click()}
              disabled={avatarBusy}
              className={`${avatarButtonClass} right-0 bottom-0 rounded-full`}
            >
              <CameraIcon size={14} />
            </IconButton>
            {user.avatar_url && (
              <IconButton
                label="Удалить фото"
                onClick={removeAvatar}
                disabled={avatarBusy}
                className={`${avatarButtonClass} top-0 right-0 rounded-full hover:text-red-600 dark:hover:text-red-400`}
              >
                <TrashIcon size={14} />
              </IconButton>
            )}
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={pickFile} />
          </>
        }
      />
      {cropSrc && <AvatarCropModal src={cropSrc} onCancel={closeCrop} onSave={uploadCropped} />}

      <Section title="Профиль" description="Имя, email и информация о себе">
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Имя пользователя">
              <Input value={form.username} onChange={set("username")} required minLength={3} maxLength={20} />
            </Field>
            <Field label="Отображаемое имя">
              <Input value={form.full_name} onChange={set("full_name")} placeholder="Необязательно" />
            </Field>
          </div>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={set("email")} required />
          </Field>
          <Field label="О себе">
            <textarea value={form.bio} onChange={set("bio")} rows={3} className={`${inputClass} resize-y`} />
          </Field>
          <div className="flex items-center justify-end gap-3">
            <Button type="submit" disabled={saving}>
              Сохранить
            </Button>
          </div>
        </form>
      </Section>

      <PasswordSection />

      <Section title="Сессия">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">Выйти из аккаунта на этом устройстве.</p>
          <Button variant="danger" onClick={logout}>
            <LogOutIcon size={15} />
            Выйти
          </Button>
        </div>
      </Section>

      <DangerZoneSection />
    </>
  );
}

function DangerZoneSection() {
  const [open, setOpen] = useState(false);

  return (
    <Section tone="danger" title="Опасная зона">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">Аккаунт удалится без возможности восстановления.</p>
        <Button variant="danger" onClick={() => setOpen(true)}>
          <TrashIcon size={15} />
          Удалить аккаунт
        </Button>
      </div>
      {open && <DeleteAccountModal onClose={() => setOpen(false)} />}
    </Section>
  );
}

function DeleteAccountModal({ onClose }) {
  const logout = useAuthStore((s) => s.logout);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.deleteAccount(password);
      toast.success("Аккаунт удалён");
      // logout чистит токен, сокет и чаты; без токена роутер сам уведёт на страницу входа
      logout();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-zinc-950/40 p-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        className="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 id="delete-account-title" className="text-sm font-semibold text-red-600 dark:text-red-400">
            Удалить аккаунт?
          </h2>
          <IconButton label="Закрыть" onClick={onClose}>
            <XIcon />
          </IconButton>
        </div>

        <form onSubmit={submit} className="space-y-4 p-4">
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
            <li>Имя, email, описание и фото будут удалены.</li>
            <li>Ваши сообщения останутся в чатах от имени «Удалённый аккаунт».</li>
            <li>Восстановить аккаунт будет нельзя.</li>
          </ul>
          <Field label="Введите пароль для подтверждения">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              maxLength={72}
              autoComplete="current-password"
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Отмена
            </Button>
            <Button type="submit" variant="danger" disabled={busy || !password}>
              Удалить навсегда
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PasswordSection() {
  const empty = { current: "", next: "", confirm: "" };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (form.next !== form.confirm) {
      toast.error("Новый пароль и подтверждение не совпадают");
      return;
    }
    setSaving(true);
    try {
      await api.changePassword(form.current, form.next);
      toast.success("Пароль изменён");
      setForm(empty);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Пароль">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Текущий пароль">
          <Input type="password" value={form.current} onChange={set("current")} required autoComplete="current-password" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Новый пароль">
            <Input
              type="password"
              value={form.next}
              onChange={set("next")}
              required
              minLength={6}
              maxLength={72}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Повторите пароль">
            <Input type="password" value={form.confirm} onChange={set("confirm")} required autoComplete="new-password" />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" disabled={saving}>
            Сменить пароль
          </Button>
        </div>
      </form>
    </Section>
  );
}
