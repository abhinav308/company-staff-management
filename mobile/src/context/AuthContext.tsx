import React, { createContext, useContext, useEffect, useState } from 'react';
import api, { setLogoutHandler } from '../services/api';
import {
  clearTokens,
  getAccessToken,
  getStoredUser,
  setStoredUser,
  setTokens,
} from '../services/storage';
import trackingManager from '../services/trackingManager';
import { User, LoginResponse } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = async () => {
    // 1. Stop all tracking immediately
    trackingManager.stopTracking();
    // 2. Clear tokens and storage
    await clearTokens();
    // 3. Reset local state
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const res = await api.get<User>('/auth/me/');
      setUser(res.data);
      await setStoredUser(res.data);
    } catch (e) {
      console.warn('Failed to refresh user profile:', e);
    }
  };

  const login = async (username: string, password: string) => {
    const res = await api.post<LoginResponse>('/auth/login/', {
      username: username.trim(),
      password,
    });

    await setTokens(res.data.access, res.data.refresh);
    setUser(res.data.user);
    await setStoredUser(res.data.user);
  };

  useEffect(() => {
    setLogoutHandler(() => {
      logout();
    });

    const initAuth = async () => {
      try {
        const token = await getAccessToken();
        const stored = await getStoredUser();
        if (stored) {
          setUser(stored);
        }
        if (token) {
          await refreshUser();
        }
      } catch {
        await clearTokens();
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
export default AuthContext;
