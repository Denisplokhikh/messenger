import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { XIcon } from "./icons";

const SWIPE_CLOSE_PX = 80;

// Картинка из сообщения во весь экран. Закрывается по Esc, клику на фон, крестику
// и свайпу вниз (на телефоне это привычнее, чем искать кнопку).
// Через портал в body: иначе вьювер унаследовал бы прозрачность строки сообщения в статусе pending
export default function ImageViewer({ attachment, onClose }) {
  const startYRef = useRef(null);
  useBodyScrollLock();

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handlePointerDown(e) {
    // Кнопки и ссылки шапки живут своей жизнью
    if (e.target.closest("a, button")) return;
    startYRef.current = e.clientY;
  }

  function handlePointerUp(e) {
    if (startYRef.current == null) return;
    const delta = e.clientY - startYRef.current;
    startYRef.current = null;
    if (delta > SWIPE_CLOSE_PX) onClose();
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={attachment.file_name}
      className="fixed inset-0 z-50 flex flex-col bg-zinc-950/90"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)] pb-3 text-zinc-300">
        <span className="truncate text-sm">{attachment.file_name}</span>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={attachment.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md px-2 py-2 font-mono text-xs hover:bg-white/10 hover:text-white"
          >
            Оригинал
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            title="Закрыть (Esc)"
            className="inline-flex size-10 items-center justify-center rounded-md hover:bg-white/10 hover:text-white md:size-8"
          >
            <XIcon />
          </button>
        </div>
      </div>
      <div
        className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onClick={(e) => e.target === e.currentTarget && onClose()}
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
