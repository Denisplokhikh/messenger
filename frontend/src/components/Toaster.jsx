import { useToastStore } from "../store/toast";

export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-md border border-zinc-200 bg-white px-3.5 py-2.5 text-sm shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
        >
          <span
            className={`mt-1.5 size-2 shrink-0 rounded-full ${t.type === "error" ? "bg-red-500" : "bg-emerald-500"}`}
          />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
