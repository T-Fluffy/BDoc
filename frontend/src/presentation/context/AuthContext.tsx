import { createContext, useContext, useState, type ReactNode } from 'react';

const AUTH_KEY = 'bdoc-auth';
const TOKEN_KEY = 'bdoc-token';
const EMAIL_KEY = 'bdoc-email';

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
  const [isLogged, setIsLogged] = useState(
    () => !!localStorage.getItem(TOKEN_KEY) || localStorage.getItem(AUTH_KEY) === 'true',
  );
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [email, setEmail] = useState<string | null>(() => localStorage.getItem(EMAIL_KEY));

  const setLogged = (value: boolean) => {
    setIsLogged(value);
    localStorage.setItem(AUTH_KEY, String(value));
  };

  const setAuth = (newToken: string, newEmail: string) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(EMAIL_KEY, newEmail);
    localStorage.setItem(AUTH_KEY, 'true');
    setToken(newToken);
    setEmail(newEmail);
    setIsLogged(true);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(AUTH_KEY);
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