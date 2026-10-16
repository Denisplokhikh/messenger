import { create } from "zustand";

const TOAST_DURATION = 3500;
let nextId = 1;

export const useToastStore = create((set) => ({
  toasts: [],
  push(message, type) {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), TOAST_DURATION);
  },
}));

export const toast = {
  success: (message) => useToastStore.getState().push(message, "success"),
  error: (message) => useToastStore.getState().push(message, "error"),
};
