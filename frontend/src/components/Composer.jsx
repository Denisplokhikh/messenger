import { useEffect, useRef, useState } from "react";
import { sendSocket } from "../api/socket";
import { useAttachmentUploads } from "../hooks/useAttachmentUploads";
import { TYPING_THROTTLE, useChatStore } from "../store/chats";
import AttachmentTray from "./AttachmentTray";
import { PaperclipIcon, SendIcon } from "./icons";

const MAX_HEIGHT = 160;

export default function Composer({ chatId, myId }) {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastTypingSentRef = useRef(0);
  const uploads = useAttachmentUploads();

  useEffect(() => {
    textareaRef.current?.focus();
    lastTypingSentRef.current = 0;
  }, [chatId]);

  // Пока печатаем, раз в TYPING_THROTTLE сообщаем собеседнику. Чаще не нужно: у него индикатор живёт дольше
  function notifyTyping() {
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_THROTTLE) return;
    if (sendSocket({ action: "typing", chat_id: chatId })) lastTypingSentRef.current = now;
  }

  function handleChange(e) {
    setText(e.target.value);
    if (e.target.value.trim()) notifyTyping();
  }

  // Высота поля растёт вместе с текстом до MAX_HEIGHT
  useEffect(() => {
    const el = textareaRef.current;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [text]);

  // Пока файлы грузятся или какой-то не загрузился, отправлять рано: иначе часть вложений молча потеряется
  const canSend =
    (text.trim() || uploads.ready.length > 0) && !uploads.uploading && !uploads.hasErrors;

  function submit() {
    if (!canSend) return;

    // Сообщение сразу попадает в ленту, ответ сервера не ждём.
    // Если отправка не удастся, у сообщения появятся кнопки «Повторить» и «Удалить».
    sendMessage(chatId, text.trim(), myId, uploads.ready);
    setText("");
    uploads.clear();
    // Следующее же нажатие после отправки снова покажет «печатает…»
    lastTypingSentRef.current = 0;
    textareaRef.current?.focus();
  }

  function handleKeyDown(e) {
    // Enter — отправить, Shift+Enter — перенос строки. isComposing: не мешаем IME-вводу.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  // Скриншот из буфера обмена (Ctrl+V) прикрепляется как файл. Обычный текст вставляется как обычно
  function handlePaste(e) {
    if (e.clipboardData.files.length === 0) return;
    e.preventDefault();
    uploads.addFiles(e.clipboardData.files);
  }

  function handleDragOver(e) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e) {
    // dragleave приходит и при переходе на дочерний элемент — гасим подсветку, только когда ушли с формы
    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
  }

  function handleDrop(e) {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    setDragging(false);
    uploads.addFiles(e.dataTransfer.files);
  }

  let sendHint = "Отправить (Enter)";
  if (uploads.uploading) sendHint = "Дождитесь загрузки файлов";
  else if (uploads.hasErrors) sendHint = "Повторите загрузку или уберите файлы с ошибкой";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="shrink-0 border-t border-zinc-200 p-3 md:px-6 dark:border-zinc-800"
    >
      <div
        className={`rounded-md border bg-white p-1.5 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent dark:bg-zinc-900 ${
          dragging ? "border-accent ring-1 ring-accent" : "border-zinc-200 dark:border-zinc-800"
        }`}
      >
        <AttachmentTray items={uploads.items} onRemove={uploads.remove} onRetry={uploads.retry} />
        <div className="flex items-end gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Прикрепить файлы"
            aria-label="Прикрепить файлы"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <PaperclipIcon size={16} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              uploads.addFiles(e.target.files);
              // Сбрасываем, чтобы повторный выбор того же файла снова вызвал onChange
              e.target.value = "";
            }}
          />
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={uploads.items.length ? "Подпись" : "Сообщение"}
            aria-label="Сообщение"
            className="max-h-40 min-h-7 flex-1 resize-none bg-transparent px-1 py-1 text-sm leading-5 placeholder:text-zinc-400 focus:outline-none dark:placeholder:text-zinc-600"
          />
          <button
            type="submit"
            disabled={!canSend}
            title={sendHint}
            aria-label="Отправить"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            <SendIcon size={15} />
          </button>
        </div>
      </div>
      <p className="mt-1.5 hidden font-mono text-[10px] text-zinc-400 md:block">
        Enter — отправить · Shift+Enter — новая строка · файлы можно перетащить или вставить
      </p>
    </form>
  );
}
