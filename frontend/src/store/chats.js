import { create } from "zustand";
import { api } from "../api/client";
import { splitTextIntoChunks } from "../lib/format";
import { toast } from "./toast";

export const PAGE_SIZE = 30;
// Сколько держим «печатает…» после последнего события typing. Клиент шлёт typing раз в
// TYPING_THROTTLE (Composer), поэтому TTL с запасом больше, чтобы индикатор не мигал
export const TYPING_THROTTLE = 500;
const TYPING_TTL = 3000;
const typingTimers = {}; // { "chatId:userId": timeoutId }

let draftSeq = 0;
// Цепочка промисов на каждый чат: POST-запросы уходят строго по очереди, порядок сообщений сохраняется
const sendQueues = {};

function enqueue(chatId, task) {
  sendQueues[chatId] = (sendQueues[chatId] ?? Promise.resolve()).then(task);
}

function attachmentIds(msg) {
  return (msg.attachments ?? []).map((a) => a.id).join(",");
}

function findDraft(state, draft) {
  return state.messagesByChat[draft.chat_id]?.find((m) => m.client_id === draft.client_id);
}

function updateDraft(set, draft, patch) {
  set((s) => ({
    messagesByChat: {
      ...s.messagesByChat,
      [draft.chat_id]: (s.messagesByChat[draft.chat_id] ?? []).map((m) =>
        m.client_id === draft.client_id ? { ...m, ...patch } : m,
      ),
    },
  }));
}

function appendToChat(set, draft) {
  set((s) => {
    const chat = s.chats.find((c) => c.id === draft.chat_id);
    return {
      messagesByChat: { ...s.messagesByChat, [draft.chat_id]: [...(s.messagesByChat[draft.chat_id] ?? []), draft] },
      chats: chat ? [{ ...chat, last_message: draft }, ...s.chats.filter((c) => c.id !== draft.chat_id)] : s.chats,
    };
  });
}

const initialState = {
  chats: [],
  chatsLoaded: false,
  messagesByChat: {}, // { [chatId]: Message[] } — от старых к новым
  hasMoreByChat: {}, // { [chatId]: boolean } — есть ли ещё история выше
  typingByChat: {}, // { [chatId]: { [userId]: username } } — кто сейчас печатает
  presenceByUser: {}, // { [userId]: { is_online, last_seen_at } } — живые статусы из WebSocket
};

export const useChatStore = create((set, get) => ({
  ...initialState,

  reset: () => set(initialState),

  async loadChats() {
    const chats = await api.getChats();
    set({ chats, chatsLoaded: true });
  },

  // Последние PAGE_SIZE сообщений чата. Кеш заменяется свежими данными с сервера.
  async loadMessages(chatId) {
    const messages = await api.getMessages(chatId, PAGE_SIZE);
    set((s) => {
      // Черновики, которые сервер ещё не подтвердил, остаются в конце ленты
      const drafts = (s.messagesByChat[chatId] ?? []).filter((m) => m.status);
      return {
        messagesByChat: { ...s.messagesByChat, [chatId]: [...messages, ...drafts] },
        hasMoreByChat: { ...s.hasMoreByChat, [chatId]: messages.length === PAGE_SIZE },
      };
    });
  },

  async loadOlder(chatId) {
    // Курсор — самое старое подтверждённое сообщение; у черновиков id временный (tmp-N)
    const oldest = (get().messagesByChat[chatId] ?? []).find((m) => !m.status);
    if (!oldest || get().hasMoreByChat[chatId] === false) return;

    const older = await api.getMessages(chatId, PAGE_SIZE, oldest.id);
    set((s) => {
      const list = s.messagesByChat[chatId] ?? [];
      const ids = new Set(list.map((m) => m.id));
      const unique = older.filter((m) => !ids.has(m.id));
      return {
        messagesByChat: { ...s.messagesByChat, [chatId]: [...unique, ...list] },
        hasMoreByChat: { ...s.hasMoreByChat, [chatId]: older.length === PAGE_SIZE },
      };
    });
  },

  // Статус пришёл по WebSocket: он свежее того, что был в ответе API
  setPresence({ user_id: userId, is_online, last_seen_at }) {
    set((s) => ({
      presenceByUser: { ...s.presenceByUser, [userId]: { is_online, last_seen_at } },
    }));
  },

  setTyping({ chat_id: chatId, user_id: userId, username }) {
    const key = `${chatId}:${userId}`;
    clearTimeout(typingTimers[key]);
    typingTimers[key] = setTimeout(() => get().clearTyping(chatId, userId), TYPING_TTL);
    set((s) => ({
      typingByChat: { ...s.typingByChat, [chatId]: { ...s.typingByChat[chatId], [userId]: username } },
    }));
  },

  clearTyping(chatId, userId) {
    const key = `${chatId}:${userId}`;
    clearTimeout(typingTimers[key]);
    delete typingTimers[key];
    if (!get().typingByChat[chatId]?.[userId]) return;
    set((s) => {
      const { [userId]: _removed, ...rest } = s.typingByChat[chatId];
      return { typingByChat: { ...s.typingByChat, [chatId]: rest } };
    });
  },

  // Общая точка для сообщений из WebSocket и из ответа на отправку (дедуп по id)
  addMessage(msg) {
    const { chats, messagesByChat } = get();
    const chatId = msg.chat_id;

    // Пришло сообщение — значит, автор уже допечатал
    get().clearTyping(chatId, msg.sender_id);

    const list = messagesByChat[chatId];
    if (list?.some((m) => m.id === msg.id)) return;

    // Наше же сообщение может прийти по WebSocket раньше ответа на POST —
    // подменяем им самый старый совпадающий черновик, чтобы не было дубля.
    // Сравниваем и вложения: у сообщений из одних файлов content у всех null
    const pending = list?.find(
      (m) =>
        m.status === "pending" &&
        m.sender_id === msg.sender_id &&
        m.content === msg.content &&
        attachmentIds(m) === attachmentIds(msg),
    );
    if (pending) {
      get().confirmMessage(chatId, pending.client_id, msg);
      return;
    }

    const chat = chats.find((c) => c.id === chatId);
    if (!chat) {
      // Нас добавили в новый чат — подтягиваем список заново
      get().loadChats().catch(() => {});
    }

    set((s) => ({
      // Кеш создаём только для уже открытых чатов, остальные загрузятся при открытии
      messagesByChat: list ? { ...s.messagesByChat, [chatId]: [...list, msg] } : s.messagesByChat,
      // Чат с новым сообщением поднимается наверх списка
      chats: chat ? [{ ...chat, last_message: msg }, ...s.chats.filter((c) => c.id !== chatId)] : s.chats,
    }));
  },

  // Оптимистичная отправка: сообщение сразу появляется в ленте со статусом pending,
  // а после ответа сервера заменяется настоящим. Возвращается сразу, не дожидаясь сети.
  // attachments — уже загруженные вложения (ответы POST /attachments), их ссылки работают сразу
  sendMessage(chatId, text, myId, attachments = []) {
    const chunks = splitTextIntoChunks(text);
    // Без текста — одно сообщение из одних вложений
    if (chunks.length === 0) chunks.push(null);

    chunks.forEach((chunk, i) => {
      const draft = {
        id: `tmp-${++draftSeq}`,
        client_id: `tmp-${draftSeq}`,
        chat_id: chatId,
        sender_id: myId,
        content: chunk,
        // Вложения уходят с первым куском текста, как подпись к ним
        attachments: i === 0 ? attachments : [],
        created_at: new Date().toISOString(),
        status: "pending",
      };
      appendToChat(set, draft);
      enqueue(chatId, () => get().deliver(draft));
    });
  },

  async deliver(draft) {
    try {
      const msg = await api.sendMessage(draft.chat_id, draft.content, draft.attachments.map((a) => a.id));
      get().confirmMessage(draft.chat_id, draft.client_id, msg);
    } catch (e) {
      // Ответ мог не дойти, хотя сообщение уже подтвердилось через WebSocket
      if (!findDraft(get(), draft)?.status) return;
      updateDraft(set, draft, { status: "failed" });
      toast.error(e.message);
    }
  },

  retryMessage(draft) {
    updateDraft(set, draft, { status: "pending", created_at: new Date().toISOString() });
    enqueue(draft.chat_id, () => get().deliver(draft));
  },

  discardMessage(draft) {
    set((s) => ({
      messagesByChat: {
        ...s.messagesByChat,
        [draft.chat_id]: (s.messagesByChat[draft.chat_id] ?? []).filter((m) => m.client_id !== draft.client_id),
      },
    }));
  },

  // Черновик заменяется сообщением с сервера; client_id сохраняем, чтобы React не пересоздавал строку
  confirmMessage(chatId, clientId, msg) {
    set((s) => {
      const list = s.messagesByChat[chatId] ?? [];
      const alreadyThere = list.some((m) => m.id === msg.id);
      const next = alreadyThere
        ? list.filter((m) => !(m.client_id === clientId && m.status))
        : list.map((m) => (m.client_id === clientId ? { ...msg, client_id: clientId } : m));
      return {
        messagesByChat: { ...s.messagesByChat, [chatId]: next },
        chats: s.chats.map((c) => (c.id === chatId && c.last_message?.client_id === clientId ? { ...c, last_message: msg } : c)),
      };
    });
  },

  async createDirectChat(userId) {
    const chat = await api.createDirectChat(userId);
    await get().loadChats();
    return chat;
  },

  async createGroupChat(name, participantIds) {
    const chat = await api.createGroupChat(name, participantIds);
    await get().loadChats();
    return chat;
  },
}));
