import { useEffect } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "./icons";

// Картинка из сообщения во весь экран. Закрывается по Esc, клику на фон и крестику.
// Через портал в body: иначе вьювер унаследовал бы прозрачность строки сообщения в статусе pending
export default function ImageViewer({ attachment, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={attachment.file_name}
      className="fixed inset-0 z-50 flex flex-col bg-zinc-950/90"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-zinc-300">
        <span className="truncate text-sm">{attachment.file_name}</span>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={attachment.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md px-2 py-1 font-mono text-xs hover:bg-white/10 hover:text-white"
          >
            Открыть оригинал
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            title="Закрыть (Esc)"
            className="inline-flex size-8 items-center justify-center rounded-md hover:bg-white/10 hover:text-white"
          >
            <XIcon />
          </button>
        </div>
      </div>
      <div
        className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0"
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      >
        <img
          src={attachment.url}
          alt={attachment.file_name}
          width={attachment.width ?? undefined}
          height={attachment.height ?? undefined}
          className="h-auto max-h-full w-auto max-w-full object-contain"
        />
      </div>
    </div>,
    document.body,
  );
}
