import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";
import { Button, ErrorText, Field, Input } from "../components/ui";
import { hasPointer } from "../lib/device";
import { useAuthStore } from "../store/auth";

export default function LoginPage() {
  const token = useAuthStore((s) => s.token);
  const [mode, setMode] = useState("login");
  const location = useLocation();

  if (token) return <Navigate to={location.state?.from?.pathname ?? "/"} replace />;

  return (
    <div className="relative flex min-h-dvh items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold tracking-tight">messenger</h1>
          <p className="mt-1 font-mono text-xs text-zinc-500">fastapi · websockets · postgres</p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-md bg-zinc-100 p-1 dark:bg-zinc-900">
            {[
              ["login", "Вход"],
              ["register", "Регистрация"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === key
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "login" ? <LoginForm /> : <RegisterForm />}
        </div>
      </div>
    </div>
  );
}

function useAuthSubmit(action) {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(...args) {
    setError("");
    setSubmitting(true);
    try {
      await action(...args);
      navigate(location.state?.from?.pathname ?? "/", { replace: true });
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  return { submit, error, submitting };
}

function LoginForm() {
  const login = useAuthStore((s) => s.login);
  const { submit, error, submitting } = useAuthSubmit(login);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(username.trim(), password);
      }}
    >
      <Field label="Имя пользователя или email">
        <Input value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" autoFocus={hasPointer()} />
      </Field>
      <Field label="Пароль">
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={submitting} className="w-full">
        Войти
      </Button>
    </form>
  );
}

function RegisterForm() {
  const register = useAuthStore((s) => s.register);
  const { submit, error, submitting } = useAuthSubmit(register);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(username.trim(), email.trim(), password);
      }}
    >
      <Field label="Имя пользователя" hint="От 3 до 20 символов">
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          minLength={3}
          maxLength={20}
          autoComplete="username"
          autoFocus={hasPointer()}
        />
      </Field>
      <Field label="Email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </Field>
      <Field label="Пароль" hint="Минимум 6 символов">
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          maxLength={72}
          autoComplete="new-password"
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={submitting} className="w-full">
        Зарегистрироваться
      </Button>
    </form>
  );
}
