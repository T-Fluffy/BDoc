import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

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

  useEffect(() => {
    if (isLogged) navigate('/', { replace: true });
  }, [isLogged, navigate]);

  const onSubmit = () => {
    setIsLoggedIn(true);
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

          <button
            type="submit"
            className="w-full bg-accent hover:bg-accent-hover text-accent-contrast font-semibold py-2.5 rounded-lg transition-colors"
          >
            Log In
          </button>
        </form>
      </div>
    </div>
  );
}