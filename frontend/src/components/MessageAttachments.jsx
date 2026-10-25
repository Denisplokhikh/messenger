import { useCallback, useState } from "react";
import { formatBytes } from "../lib/format";
import { DownloadIcon, FileIcon } from "./icons";
import ImageViewer from "./ImageViewer";

// Одиночная картинка вписывается в этот прямоугольник с сохранением пропорций
const SINGLE_MAX_WIDTH = 320;
const SINGLE_MAX_HEIGHT = 360;

export default function MessageAttachments({ attachments }) {
  const [viewed, setViewed] = useState(null);
  const closeViewer = useCallback(() => setViewed(null), []);
  if (!attachments?.length) return null;

  const images = attachments.filter((a) => a.kind === "image");
  const files = attachments.filter((a) => a.kind !== "image");

  return (
    <div className="mt-1 flex flex-col gap-1.5">
      {images.length === 1 && <SingleImage attachment={images[0]} onOpen={setViewed} />}
      {images.length > 1 && (
        <div className="grid w-full max-w-80 grid-cols-2 gap-1">
          {images.map((a) => (
            <ImageTile key={a.id} attachment={a} onOpen={setViewed} className="aspect-square" />
          ))}
        </div>
      )}
      {files.map((a) => (
        <FileCard key={a.id} attachment={a} />
      ))}
      {viewed && <ImageViewer attachment={viewed} onClose={closeViewer} />}
    </div>
  );
}

function SingleImage({ attachment, onOpen }) {
  const { width, height } = attachment;
  // Размер известен заранее: место под картинку резервируется сразу, и лента не прыгает, когда она догрузится
  const scale = width && height ? Math.min(1, SINGLE_MAX_WIDTH / width, SINGLE_MAX_HEIGHT / height) : null;
  const style = scale
    ? { width: Math.round(width * scale), aspectRatio: `${width} / ${height}` }
    : { width: SINGLE_MAX_WIDTH, aspectRatio: "4 / 3" };

  return <ImageTile attachment={attachment} onOpen={onOpen} style={style} className="max-w-full" />;
}

function ImageTile({ attachment, onOpen, className = "", style }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    // Подписанная ссылка живёт 12–24 часа; при следующем открытии чата история перезагрузится со свежими
    return (
      <div
        style={style}
        className={`flex items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 p-2 text-center font-mono text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
      >
        Не удалось загрузить
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(attachment)}
      style={style}
      aria-label={`Открыть ${attachment.file_name}`}
      className={`block overflow-hidden rounded-md bg-zinc-100 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-accent dark:bg-zinc-900 ${className}`}
    >
      <img
        src={attachment.thumb_url ?? attachment.url}
        alt={attachment.file_name}
        loading="lazy"
        onError={() => setFailed(true)}
        className="size-full object-cover"
      />
    </button>
  );
}

function FileCard({ attachment }) {
  return (
    <a
      href={attachment.url}
      download={attachment.file_name}
      className="flex w-full max-w-80 items-center gap-3 rounded-md border border-zinc-200 px-3 py-2 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
    >
      <FileIcon size={20} className="shrink-0 text-zinc-500" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{attachment.file_name}</div>
        <div className="font-mono text-[11px] text-zinc-500">{formatBytes(attachment.size)}</div>
      </div>
      <DownloadIcon size={16} className="shrink-0 text-zinc-400" />
    </a>
  );
}
