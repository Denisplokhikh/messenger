import { create } from "zustand";
import { api } from "../api/client";
import { splitTextIntoChunks } from "../lib/format";
import { toast } from "./toast";

export const PAGE_SIZE = 30;

let draftSeq = 0;
// Цепочка промисов на каждый чат: POST-запросы уходят строго по очереди, порядок сообщений сохраняется
const sendQueues = {};

function enqueue(chatId, task) {
  sendQueues[chatId] = (sendQueues[chatId] ?? Promise.resolve()).then(task);
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
  wsConnected: false,
};

export const useChatStore = create((set, get) => ({
  ...initialState,

  reset: () => set(initialState),
  setWsConnected: (wsConnected) => set({ wsConnected }),

  async loadChats() {
    const chats = await api.getChats();
    set({ chats, chatsLoaded: true });
  },

  // Последние PAGE_SIZE сообщений чата. Кеш заменяется свежими данными с сервера.
  async loadMessages(chatId) {
    const messages = await api.getMessages(chatId, PAGE_SIZE, 0);
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
    // Неподтверждённые сообщения на сервере ещё не лежат — в offset их не считаем
    const current = (get().messagesByChat[chatId] ?? []).filter((m) => !m.status);
    if (current.length === 0 || get().hasMoreByChat[chatId] === false) return;

    const older = await api.getMessages(chatId, PAGE_SIZE, current.length);
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

  // Общая точка для сообщений из WebSocket и из ответа на отправку (дедуп по id)
  addMessage(msg) {
    const { chats, messagesByChat } = get();
    const chatId = msg.chat_id;

    const list = messagesByChat[chatId];
    if (list?.some((m) => m.id === msg.id)) return;

    // Наше же сообщение может прийти по WebSocket раньше ответа на POST —
    // подменяем им самый старый совпадающий черновик, чтобы не было дубля
    const pending = list?.find(
      (m) => m.status === "pending" && m.sender_id === msg.sender_id && m.content === msg.content,
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
  sendMessage(chatId, text, myId) {
    for (const chunk of splitTextIntoChunks(text)) {
      const draft = {
        id: `tmp-${++draftSeq}`,
        client_id: `tmp-${draftSeq}`,
        chat_id: chatId,
        sender_id: myId,
        content: chunk,
        created_at: new Date().toISOString(),
        status: "pending",
      };
      appendToChat(set, draft);
      enqueue(chatId, () => get().deliver(draft));
    }
  },

  async deliver(draft) {
    try {
      const msg = await api.sendMessage(draft.chat_id, draft.content);
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
