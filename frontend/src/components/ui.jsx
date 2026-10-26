// Небольшой набор общих UI-элементов, чтобы классы Tailwind не дублировались по страницам

const buttonVariants = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  secondary:
    "border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900",
  ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100",
  danger:
    "border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40",
};

export function Button({ variant = "primary", className = "", type = "button", ...props }) {
  return (
    <button
      type={type}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 md:h-9 ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

export function IconButton({ className = "", label, ...props }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-accent md:size-8 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 ${className}`}
      {...props}
    />
  );
}

export const inputClass =
  "w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:placeholder:text-zinc-600";

export function Input({ className = "", ...props }) {
  return <input className={`${inputClass} ${className}`} {...props} />;
}

export function Field({ label, hint, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      {children}
      {hint && <span className="block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

export function ErrorText({ children }) {
  if (!children) return null;
  return (
    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
      {children}
    </p>
  );
}

export function Spinner({ className = "" }) {
  return (
    <span
      className={`inline-block size-4 animate-spin rounded-full border-2 border-zinc-300 border-t-accent dark:border-zinc-700 dark:border-t-accent ${className}`}
      role="status"
      aria-label="Загрузка"
    />
  );
}

export function FullScreenMessage({ children }) {
  return <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center">{children}</div>;
}
