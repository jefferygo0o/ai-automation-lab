import { create } from "zustand";
import { Auth } from "../api";
import { getToken, setToken } from "../api/client";

interface AuthState {
  token: string | null;
  userId: string | null;
  email: string | null;
  bootstrap: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const USER_KEY = "lab.user";
function readUser(): { userId: string; email: string } | null {
  try { const raw = localStorage.getItem(USER_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeUser(u: { userId: string; email: string } | null) {
  try { if (u) localStorage.setItem(USER_KEY, JSON.stringify(u)); else localStorage.removeItem(USER_KEY); } catch {}
}

export const useAuth = create<AuthState>((set) => ({
  token: null,
  userId: null,
  email: null,
  bootstrap: () => {
    const token = getToken();
    const user = readUser();
    if (token && user) set({ token, userId: user.userId, email: user.email });
  },
  login: async (email, password) => {
    const auth = await Auth.login(email, password);
    setToken(auth.token);
    writeUser({ userId: auth.userId, email });
    set({ token: auth.token, userId: auth.userId, email });
  },
  register: async (email, password) => {
    await Auth.register(email, password);
    const auth = await Auth.login(email, password);
    setToken(auth.token);
    writeUser({ userId: auth.userId, email });
    set({ token: auth.token, userId: auth.userId, email });
  },
  logout: () => { setToken(null); writeUser(null); set({ token: null, userId: null, email: null }); },
}));