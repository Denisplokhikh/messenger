import { useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { XIcon } from "./icons";
import { Button, IconButton } from "./ui";

// onSave получает выбранную область в пикселях исходной картинки; модалку закрывает родитель
export default function AvatarCropModal({ src, onCancel, onSave }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState(null);
  const [saving, setSaving] = useState(false);
  useBodyScrollLock();

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !saving && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  async function save() {
    setSaving(true);
    try {
      await onSave(area);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-zinc-950/40 backdrop-blur-[2px] md:items-start md:p-4 md:pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && !saving && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-crop-title"
        className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-xl border border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-xl md:rounded-lg md:pb-0 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 id="avatar-crop-title" className="text-sm font-semibold">
            Фото профиля
          </h2>
          <IconButton label="Закрыть" onClick={onCancel} disabled={saving}>
            <XIcon />
          </IconButton>
        </div>

        {/* Cropper позиционируется абсолютно и занимает весь родитель — нужна явная высота */}
        <div className="relative h-64 shrink-0 bg-zinc-900 md:h-72">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            maxZoom={4}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setArea(pixels)}
          />
        </div>

        <div className="min-h-0 space-y-4 overflow-y-auto p-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Масштаб</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={saving}>
              Отмена
            </Button>
            <Button onClick={save} disabled={!area || saving}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
