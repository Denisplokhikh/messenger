import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../store/chats";
import { SendIcon } from "./icons";

const MAX_HEIGHT = 160;

export default function Composer({ chatId, myId }) {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const [text, setText] = useState("");
  const textareaRef = useRef(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [chatId]);

  // Высота поля растёт вместе с текстом до MAX_HEIGHT
  useEffect(() => {
    const el = textareaRef.current;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [text]);

  function submit() {
    const content = text.trim();
    if (!content) return;

    // Сообщение сразу попадает в ленту, ответ сервера не ждём.
    // Если отправка не удастся, у сообщения появятся кнопки «Повторить» и «Удалить».
    sendMessage(chatId, content, myId);
    setText("");
    textareaRef.current?.focus();
  }

  function handleKeyDown(e) {
    // Enter — отправить, Shift+Enter — перенос строки. isComposing: не мешаем IME-вводу.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="shrink-0 border-t border-zinc-200 p-3 md:px-6 dark:border-zinc-800"
    >
      <div className="flex items-end gap-2 rounded-md border border-zinc-200 bg-white p-1.5 pl-3 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent dark:border-zinc-800 dark:bg-zinc-900">
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Сообщение"
          className="max-h-40 min-h-7 flex-1 resize-none bg-transparent py-1 text-sm leading-5 placeholder:text-zinc-400 focus:outline-none dark:placeholder:text-zinc-600"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          title="Отправить (Enter)"
          aria-label="Отправить"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
        >
          <SendIcon size={15} />
        </button>
      </div>
      <p className="mt-1.5 hidden font-mono text-[10px] text-zinc-400 md:block">Enter — отправить · Shift+Enter — новая строка</p>
    </form>
  );
}
