import { createContext, useContext, useState, type ReactNode } from 'react';

const AUTH_KEY = 'bdoc-auth';

interface AuthValue {
  isLogged: boolean;
  setLogged: (value: boolean) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLogged, setIsLogged] = useState(() => localStorage.getItem(AUTH_KEY) === 'true');

  const setLogged = (value: boolean) => {
    setIsLogged(value);
    localStorage.setItem(AUTH_KEY, String(value));
  };

  const logout = () => setLogged(false);

  return (
    <AuthContext.Provider value={{ isLogged, setLogged, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}