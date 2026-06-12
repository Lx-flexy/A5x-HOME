import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Home } from 'lucide-react';
import { loginWithEmail, loginWithGoogle, loginWithFacebook, forgotPassword } from '../../services/authService';
import Button from '../../components/ui/Button';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  async function handleForgotPassword() {
    if (!email) {
      setError('Enter your email above first, then click Forgot Password.');
      return;
    }
    try {
      await forgotPassword(email);
      setResetSent(true);
      setError('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reset email';
      setError(msg.replace('Firebase: ', '').replace(/\(.*\)/, '').trim());
    }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginWithEmail(email, password);
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg.replace('Firebase: ', '').replace(/\(.*\)/, '').trim());
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google login failed';
      setError(msg.replace('Firebase: ', '').replace(/\(.*\)/, '').trim());
    } finally {
      setLoading(false);
    }
  }

  async function handleFacebookLogin() {
    setError('');
    setLoading(true);
    try {
      await loginWithFacebook();
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Facebook login failed';
      setError(msg.replace('Firebase: ', '').replace(/\(.*\)/, '').trim());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-neutral-50">
      <div className="hidden lg:flex lg:w-1/2 bg-white border-r border-neutral-200 items-center justify-center p-12">
        <div className="max-w-sm text-center">
          <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Home size={28} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 mb-2">A5X Home</h2>
          <p className="text-neutral-500 mb-8">Smart Home. Simplified.</p>

          <div className="relative">
            <div className="bg-neutral-100 rounded-2xl p-6 aspect-square flex items-center justify-center">
              <div className="w-full max-w-xs">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-neutral-200 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center text-lg">💡</div>
                    <div>
                      <p className="text-xs font-medium text-neutral-900">Living Room Light</p>
                      <p className="text-xs text-neutral-400">TV Area</p>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-success-500 rounded-full" />
                      <span className="text-xs text-success-600">On</span>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-neutral-200 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-lg">🌀</div>
                    <div>
                      <p className="text-xs font-medium text-neutral-900">Bedroom Fan</p>
                      <p className="text-xs text-neutral-400">Main</p>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-success-500 rounded-full" />
                      <span className="text-xs text-success-600">On</span>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-neutral-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center text-lg">🗑️</div>
                    <div>
                      <p className="text-xs font-medium text-neutral-900">Kitchen Dustbin</p>
                      <p className="text-xs text-neutral-400">Corner</p>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-neutral-300 rounded-full" />
                      <span className="text-xs text-neutral-400">Closed</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-6 text-sm text-neutral-400">Control everything from anywhere.</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <Home size={16} className="text-white" />
            </div>
            <span className="font-bold text-neutral-900 text-lg">A5X</span>
          </div>

          <h2 className="text-2xl font-bold text-neutral-900 mb-1">Welcome Back</h2>
          <p className="text-sm text-neutral-500 mb-8">Login to your account</p>

          {error && (
            <div className="mb-4 p-3 bg-error-50 border border-red-200 rounded-lg text-sm text-error-600">
              {error}
            </div>
          )}

          {resetSent && (
            <div className="mb-4 p-3 bg-success-50 border border-green-200 rounded-lg text-sm text-success-600">
              Password reset email sent. Check your inbox.
            </div>
          )}

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                placeholder="Enter your email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="form-label">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input pr-10"
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-primary-600"
                />
                Remember me
              </label>
              <button type="button" className="text-sm text-primary-600 hover:text-primary-700 font-medium" onClick={handleForgotPassword}>
                Forgot password?
              </button>
            </div>

            <Button type="submit" className="w-full" loading={loading}>
              Login
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-200" />
            </div>
            <div className="relative flex justify-center text-xs text-neutral-400 bg-neutral-50 px-3">
              or continue with
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Google
            </button>

            <button
              onClick={handleFacebookLogin}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#1877F2">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Facebook
            </button>
          </div>

          <p className="text-center text-sm text-neutral-500 mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-primary-600 font-medium hover:text-primary-700">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
