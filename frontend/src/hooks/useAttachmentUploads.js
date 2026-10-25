import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { toast } from "../store/toast";

// Те же лимиты, что на сервере (MAX_ATTACHMENTS_PER_MESSAGE, MAX_ATTACHMENT_BYTES):
// проверяем заранее, чтобы не гонять по сети файл, который всё равно отклонят
export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
// Картинки, которые сервер пережмёт и покажет в ленте; для них в композере сразу есть превью
const PREVIEW_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

let keySeq = 0;

// Вложения в композере. Каждый файл начинает загружаться сразу при добавлении,
// к сообщению уходят только уже загруженные (ready)
export function useAttachmentUploads() {
  // { key, file, previewUrl, status: "uploading" | "done" | "error", progress, attachment, error }
  const [items, setItems] = useState([]);
  // abort и object URL не нужны для отрисовки, поэтому живут вне state
  const abortsRef = useRef({});
  const urlsRef = useRef({});

  const patch = useCallback((key, changes) => {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...changes } : it)));
  }, []);

  const release = useCallback((key) => {
    abortsRef.current[key]?.();
    delete abortsRef.current[key];
    if (urlsRef.current[key]) URL.revokeObjectURL(urlsRef.current[key]);
    delete urlsRef.current[key];
  }, []);

  const start = useCallback(
    (key, file) => {
      const { promise, abort } = api.uploadAttachment(file, (progress) => patch(key, { progress }));
      abortsRef.current[key] = abort;
      promise
        .then((attachment) => patch(key, { status: "done", progress: 1, attachment }))
        .catch((e) => {
          // Отменённую крестиком загрузку уже убрали из списка — ошибку не показываем
          if (!abortsRef.current[key]) return;
          patch(key, { status: "error", error: e.message });
        })
        .finally(() => delete abortsRef.current[key]);
    },
    [patch],
  );

  const addFiles = useCallback(
    (fileList) => {
      const files = Array.from(fileList ?? []);
      if (files.length === 0) return;

      const tooBig = files.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
      if (tooBig.length > 0) {
        toast.error(`Файл больше ${MAX_ATTACHMENT_BYTES / 1024 / 1024} МБ: ${tooBig[0].name}`);
      }
      const empty = files.filter((f) => f.size === 0);
      if (empty.length > 0) toast.error(`Пустой файл: ${empty[0].name}`);
      let accepted = files.filter((f) => f.size > 0 && f.size <= MAX_ATTACHMENT_BYTES);

      const free = MAX_ATTACHMENTS - items.length;
      if (accepted.length > free) {
        toast.error(`Можно прикрепить не больше ${MAX_ATTACHMENTS} файлов`);
        accepted = accepted.slice(0, Math.max(free, 0));
      }
      if (accepted.length === 0) return;

      const added = accepted.map((file) => {
        const key = `att-${++keySeq}`;
        const previewUrl = PREVIEW_TYPES.has(file.type) ? URL.createObjectURL(file) : null;
        if (previewUrl) urlsRef.current[key] = previewUrl;
        return { key, file, previewUrl, status: "uploading", progress: 0, attachment: null, error: null };
      });
      setItems((list) => [...list, ...added]);
      added.forEach((it) => start(it.key, it.file));
    },
    [items.length, start],
  );

  const remove = useCallback(
    (key) => {
      release(key);
      setItems((list) => list.filter((it) => it.key !== key));
    },
    [release],
  );

  const retry = useCallback(
    (key) => {
      const item = items.find((it) => it.key === key);
      if (!item) return;
      patch(key, { status: "uploading", progress: 0, error: null });
      start(key, item.file);
    },
    [items, patch, start],
  );

  // После отправки: загрузки уже завершены, отменять нечего, только освобождаем превью
  const clear = useCallback(() => {
    Object.keys(urlsRef.current).forEach(release);
    setItems([]);
  }, [release]);

  // Ушли из чата посреди загрузки — отменяем загрузки и освобождаем превью
  useEffect(() => {
    const aborts = abortsRef.current;
    const urls = urlsRef.current;
    return () => {
      Object.values(aborts).forEach((abort) => abort());
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  return {
    items,
    ready: items.filter((it) => it.status === "done").map((it) => it.attachment),
    uploading: items.some((it) => it.status === "uploading"),
    hasErrors: items.some((it) => it.status === "error"),
    addFiles,
    remove,
    retry,
    clear,
  };
}
