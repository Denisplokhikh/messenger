import { create } from "zustand";
import { api, setUnauthorizedHandler } from "../api/client";
import { disconnectSocket } from "../api/socket";
import { clearToken, getToken, setToken } from "../lib/token";
import { useChatStore } from "./chats";

export const useAuthStore = create((set, get) => ({
  token: getToken(),
  user: null,

  async login(username, password) {
    const data = await api.login(username, password);
    setToken(data.access_token);
    set({ token: data.access_token, user: null });
  },

  async register(username, email, password) {
    await api.register(username, email, password);
    await get().login(username, password);
  },

  async loadMe() {
    const user = await api.getMe();
    set({ user });
    return user;
  },

  setUser: (user) => set({ user }),

  logout() {
    clearToken();
    disconnectSocket();
    useChatStore.getState().reset();
    set({ token: null, user: null });
  },
}));

setUnauthorizedHandler(() => useAuthStore.getState().logout());
