import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { login, signup } from '../services/api';
import {
  getStoredProfileDetails,
  isProfileComplete,
  markProfileCompletionRequired,
  normalizeProfileDetails,
  PROFILE_DETAILS_KEY,
} from '../utils/profile';

import './AuthPage.css';

function AuthPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'login';
  const [mode, setMode] = useState(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const title = useMemo(() => (
    mode === 'login' ? 'Welcome Back' : 'Create Your Account'
  ), [mode]);

  const subtitle = useMemo(() => (
    mode === 'login'
      ? 'Log in to launch autonomous outreach workflows.'
      : 'Start running AI-driven B2B outreach in minutes.'
  ), [mode]);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    if (!form.email.trim() || !form.password.trim()) {
      return 'Email and password are required.';
    }

    if (mode === 'signup') {
      if (!form.name.trim()) {
        return 'Full name is required for signup.';
      }
      if (form.password.length < 8) {
        return 'Password must be at least 8 characters long.';
      }
      if (form.password !== form.confirmPassword) {
        return 'Password and confirm password must match.';
      }
    }

    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setLoading(true);

    try {
      const payload = mode === 'signup'
        ? {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
        }
        : {
          email: form.email.trim(),
          password: form.password,
        };

      const response = mode === 'signup'
        ? await signup(payload)
        : await login(payload);

      const sessionPayload = {
        token: response.token,
        user: response.user,
      };

      window.localStorage.setItem('firereach_session', JSON.stringify(sessionPayload));
      window.localStorage.setItem('firereach_user', JSON.stringify(response.user));

      if (mode === 'signup') {
        const existing = getStoredProfileDetails();
        const normalized = normalizeProfileDetails(existing, response.user || {});
        window.localStorage.setItem(PROFILE_DETAILS_KEY, JSON.stringify(normalized));
        const completed = isProfileComplete(normalized, response.user || {});
        markProfileCompletionRequired(!completed);
      }

      window.dispatchEvent(new Event('firereach-session-updated'));
      if (mode === 'signup') {
        navigate('/profile?onboarding=1');
      } else {
        navigate('/app');
      }
    } catch (requestError) {
      const message = requestError?.response?.data?.message || requestError?.message || 'Authentication request failed.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setSearchParams(nextMode === 'signup' ? { mode: 'signup' } : {});
  };

  return (
    <div className="auth-page">
      <div className="auth-noise" />

      <div className="auth-shell">
        <div className="auth-brand-panel">
          <div className="auth-brand-kicker">FIREREACH AUTH</div>
          <h1>Secure Access To Your AI Outreach Command Center</h1>
          <p>
            Manage campaigns, review ranked accounts, and deploy personalized outreach workflows with confidence.
          </p>
          <div className="auth-benefits">
            <div>Autonomous Account Discovery</div>
            <div>Live Signal Intelligence</div>
            <div>One-Click Outreach Execution</div>
          </div>
          <Link to="/" className="auth-back-link">← Back to Home</Link>
        </div>

        <div className="auth-card">
          <div className="auth-tabs" role="tablist" aria-label="Authentication Mode">
            <button
              type="button"
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => switchMode('login')}
            >
              Login
            </button>
            <button
              type="button"
              className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => switchMode('signup')}
            >
              Signup
            </button>
          </div>

          <h2>{title}</h2>
          <p className="auth-subtitle">{subtitle}</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <label>
                Full Name
                <input
                  name="name"
                  type="text"
                  value={form.name}
                  onChange={onChange}
                  placeholder="e.g. Alex Carter"
                  autoComplete="name"
                />
              </label>
            )}

            <label>
              Work Email
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={onChange}
                placeholder="you@company.com"
                autoComplete="email"
              />
            </label>

            <label>
              Password
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={onChange}
                placeholder="Enter password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>

            {mode === 'signup' && (
              <label>
                Confirm Password
                <input
                  name="confirmPassword"
                  type="password"
                  value={form.confirmPassword}
                  onChange={onChange}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                />
              </label>
            )}

            {error && <div className="auth-error">{error}</div>}

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading
                ? 'Please wait...'
                : mode === 'login'
                  ? 'Login & Continue'
                  : 'Create Account & Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AuthPage;
