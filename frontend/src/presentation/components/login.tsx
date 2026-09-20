import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { loginRequest, registerRequest } from '../../application/services/authService';
import { useAuth } from '../context/AuthContext';

interface LoginProps {
  isLogged: boolean;
  setIsLoggedIn: (isLoggedIn: boolean) => void;
}
interface LoginFormInputs {
  email: string;
  password: string;
}

export default function Login({ isLogged, setIsLoggedIn }: LoginProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormInputs>();
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isLogged) navigate('/', { replace: true });
  }, [isLogged, navigate]);

  const onSubmit = async (data: LoginFormInputs) => {
    setServerError(null);
    setSubmitting(true);
    try {
      const res =
        mode === 'register'
          ? await registerRequest(data.email, data.password)
          : await loginRequest(data.email, data.password);
      setAuth(res.token, res.email);
      setIsLoggedIn(true);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: string | { message?: string } } })?.response?.data?.toString() ||
        (err as Error)?.message ||
        'Authentication failed';
      // Fallback to mock for local dev if backend auth not yet migrated: keep old behavior
      if (msg.includes('Failed to fetch') || msg.includes('Network Error')) {
        setIsLoggedIn(true);
        navigate('/', { replace: true });
        return;
      }
      setServerError(typeof msg === 'string' ? msg : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-canvas">
      <div className="w-full max-w-md bg-surface p-8 rounded-2xl shadow-[var(--shadow-lg)] border border-[var(--border)] mx-4">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <span className="w-8 h-8 bg-gradient-to-br from-accent to-violet-500 rounded-lg flex items-center justify-center">
            <span className="text-accent-contrast font-bold text-sm">B</span>
          </span>
          <h2 className="text-2xl font-bold text-ink">BDoc</h2>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink-muted mb-1">
              Email
            </label>
            <input
              type="email"
              id="email"
              placeholder="you@example.com"
              {...register('email', { required: 'Email is required' })}
              className="w-full px-4 py-2.5 bg-canvas border border-[var(--border)] rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            {errors.email && <p className="text-danger text-sm mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-ink-muted mb-1">
              Password
            </label>
            <input
              type="password"
              id="password"
              placeholder="••••••••"
              {...register('password', { required: 'Password is required' })}
              className="w-full px-4 py-2.5 bg-canvas border border-[var(--border)] rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            {errors.password && <p className="text-danger text-sm mt-1">{errors.password.message}</p>}
          </div>

          {serverError && <p className="text-danger text-sm text-center">{serverError}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-accent hover:bg-accent-hover text-accent-contrast font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60"
          >
            {submitting ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Log In'}
          </button>
          <p className="text-center text-sm text-ink-muted">
            {mode === 'register' ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => setMode(mode === 'register' ? 'login' : 'register')}
              className="text-accent hover:underline font-medium"
            >
              {mode === 'register' ? 'Log in' : 'Register'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}