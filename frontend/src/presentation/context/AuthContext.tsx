import { createContext, useContext, useState, type ReactNode } from 'react';

const TOKEN_KEY = 'bdoc-token';
const EMAIL_KEY = 'bdoc-email';

function isTokenValid(t: string | null): boolean {
  if (!t) return false;
  try {
    const payload = JSON.parse(atob(t.split('.')[1]));
    if (payload.exp && Date.now() >= payload.exp * 1000) return false;
    return true;
  } catch {
    return !!t;
  }
}

interface AuthValue {
  isLogged: boolean;
  token: string | null;
  email: string | null;
  setLogged: (value: boolean) => void;
  setAuth: (token: string, email: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLogged, setIsLogged] = useState(() => isTokenValid(localStorage.getItem(TOKEN_KEY)));
  const [token, setToken] = useState<string | null>(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    return isTokenValid(t) ? t : null;
  });
  const [email, setEmail] = useState<string | null>(() => localStorage.getItem(EMAIL_KEY));

  // Strict token-only auth (legacy bdoc-auth flag ignored).
  const setLogged = (value: boolean) => {
    if (!value) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EMAIL_KEY);
      setToken(null);
      setEmail(null);
      setIsLogged(false);
    } else {
      setIsLogged(true);
    }
  };

  const setAuth = (newToken: string, newEmail: string) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(EMAIL_KEY, newEmail);
    setToken(newToken);
    setEmail(newEmail);
    setIsLogged(true);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    setToken(null);
    setEmail(null);
    setIsLogged(false);
  };

  return (
    <AuthContext.Provider value={{ isLogged, token, email, setLogged, setAuth, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}