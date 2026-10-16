import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import Avatar from "../components/Avatar";
import ThemeToggle from "../components/ThemeToggle";
import { ArrowLeftIcon, CopyIcon, LogOutIcon, MessageIcon, ShuffleIcon } from "../components/icons";
import { Button, Field, FullScreenMessage, IconButton, Input, Spinner, inputClass } from "../components/ui";
import { randomAvatarUrl } from "../lib/format";
import { useAuthStore } from "../store/auth";
import { useChatStore } from "../store/chats";
import { toast } from "../store/toast";
import NotFoundPage from "./NotFoundPage";

export default function ProfilePage() {
  const { userId } = useParams();
  const me = useAuthStore((s) => s.user);
  const isMe = !userId || Number(userId) === me.id;

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
          <ProfileCard user={user} action={<WriteButton userId={user.id} />} />
        )}
      </main>
    </div>
  );
}

function ProfileCard({ user, avatarUrl, avatarAction, action }) {
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
        <Avatar src={avatarUrl ?? user.avatar_url} seed={user.username} size={88} className="rounded-lg" />
        {avatarAction}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <h1 className="truncate text-xl font-semibold tracking-tight">{user.full_name || user.username}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-zinc-500">
          <button type="button" onClick={copyUsername} className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100">
            @{user.username}
            <CopyIcon size={12} />
          </button>
          <span>id:{user.id}</span>
          {registered && <span>с {registered}</span>}
        </div>
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

function Section({ title, description, children }) {
  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="border-b border-zinc-200 px-5 py-3.5 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">{title}</h2>
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
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url);
  const [saving, setSaving] = useState(false);

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
        avatar_url: avatarUrl,
      });
      setUser(updated);
      toast.success("Профиль сохранён");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const avatarChanged = avatarUrl !== user.avatar_url;

  return (
    <>
      <ProfileCard
        user={user}
        avatarUrl={avatarUrl}
        avatarAction={
          <IconButton
            label="Случайный аватар"
            onClick={() => setAvatarUrl(randomAvatarUrl())}
            className="absolute -right-2 -bottom-2 border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          >
            <ShuffleIcon size={14} />
          </IconButton>
        }
      />

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
            {avatarChanged && <span className="text-xs text-zinc-500">Новый аватар применится после сохранения</span>}
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
    </>
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
