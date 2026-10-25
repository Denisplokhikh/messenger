import { formatBytes } from "../lib/format";
import { FileIcon, XIcon } from "./icons";

// Прикреплённые к будущему сообщению файлы над полем ввода: превью, прогресс загрузки, крестик
export default function AttachmentTray({ items, onRemove, onRetry }) {
  if (items.length === 0) return null;

  return (
    <ul className="flex gap-2 overflow-x-auto px-1 pt-1 pb-2">
      {items.map((it) => (
        <li
          key={it.key}
          className={`relative flex h-16 shrink-0 items-center overflow-hidden rounded-md border bg-zinc-50 dark:bg-zinc-900 ${
            it.status === "error" ? "border-red-300 dark:border-red-900" : "border-zinc-200 dark:border-zinc-800"
          } ${it.previewUrl ? "w-16" : "w-44 gap-2 px-2"}`}
          title={it.error ?? it.file.name}
        >
          {it.previewUrl ? (
            <img src={it.previewUrl} alt={it.file.name} className="size-full object-cover" />
          ) : (
            <>
              <FileIcon size={18} className="shrink-0 text-zinc-500" />
              <div className="min-w-0 pr-4">
                <div className="truncate text-xs font-medium">{it.file.name}</div>
                <div className="font-mono text-[10px] text-zinc-500">{formatBytes(it.file.size)}</div>
              </div>
            </>
          )}

          {it.status === "uploading" && (
            <span className="absolute inset-x-0 bottom-0 h-1 bg-zinc-200 dark:bg-zinc-800">
              <span className="block h-full bg-accent transition-[width]" style={{ width: `${Math.round(it.progress * 100)}%` }} />
            </span>
          )}
          {it.status === "error" && (
            <button
              type="button"
              onClick={() => onRetry(it.key)}
              className="absolute inset-x-0 bottom-0 bg-red-600/90 py-0.5 text-center font-mono text-[10px] text-white hover:bg-red-700"
            >
              Повторить
            </button>
          )}

          <button
            type="button"
            onClick={() => onRemove(it.key)}
            aria-label={`Убрать ${it.file.name}`}
            title="Убрать"
            className="absolute top-0.5 right-0.5 inline-flex size-5 items-center justify-center rounded-full bg-zinc-900/60 text-white hover:bg-zinc-900/80"
          >
            <XIcon size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}
