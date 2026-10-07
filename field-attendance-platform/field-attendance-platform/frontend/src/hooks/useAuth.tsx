import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import api, { tokens } from '../services/api';
import type { User } from '../types';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
}
const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!tokens.access);

  useEffect(() => {
    if (!tokens.access) return;
    api.get<User>('/auth/me/').then((r) => setUser(r.data)).catch(() => tokens.clear()).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { data } = await api.post('/auth/login/', { username, password });
    tokens.set(data.access, data.refresh);
    const me = await api.get<User>('/auth/me/');
    setUser(me.data);
    return me.data;
  }, []);

  const logout = useCallback(() => { tokens.clear(); setUser(null); }, []);

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}
