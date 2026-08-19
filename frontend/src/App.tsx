import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Home from './presentation/pages/Home';
import EditorPage from './presentation/pages/EditorPage';
import Login from './presentation/components/login';
import { ThemeProvider } from './presentation/theme/ThemeContext';
import { createDocument } from './application/services/documentService';

const AUTH_KEY = 'bdoc-auth';

function useAuth() {
  const [isLogged, setIsLogged] = useState(() => localStorage.getItem(AUTH_KEY) === 'true');

  const setLogged = (value: boolean) => {
    setIsLogged(value);
    localStorage.setItem(AUTH_KEY, String(value));
  };

  return { isLogged, setLogged };
}

/** Creates a fresh document then redirects to its editor. */
function NewDocument() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createDocument('Untitled document')
      .then((doc) => navigate(`/editor/${doc.id}`, { replace: true }))
      .catch(() => setError('Failed to create document'));
  }, [navigate]);

  if (error) return <div className="p-10 text-center text-danger">{error}</div>;
  return <div className="p-10 text-center text-ink-muted">Creating document…</div>;
}

export default function App() {
  const { isLogged, setLogged } = useAuth();

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login isLogged={isLogged} setIsLoggedIn={setLogged} />} />

          <Route
            path="/"
            element={isLogged ? <Home /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/editor/new"
            element={isLogged ? <NewDocument /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/editor/:id"
            element={isLogged ? <EditorPage /> : <Navigate to="/login" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}