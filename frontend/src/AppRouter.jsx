import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { getStoredProfileDetails, isProfileComplete, isProfileCompletionRequired } from './utils/profile';

const AppPage = lazy(() => import('./pages/AppPage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const Landing = lazy(() => import('./pages/Landing'));
const PaymentDemoPage = lazy(() => import('./pages/PaymentDemoPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

const getSession = () => {
  try {
    return JSON.parse(window.localStorage.getItem('firereach_session') || 'null');
  } catch {
    return null;
  }
};

function ProtectedRoute({ children }) {
  const location = useLocation();
  const session = typeof window !== 'undefined' ? getSession() : null;
  if (!session?.token) {
    return <Navigate to="/auth" replace />;
  }

  const requiresProfile = typeof window !== 'undefined'
    && location.pathname.startsWith('/app')
    && (isProfileCompletionRequired() || !isProfileComplete(getStoredProfileDetails(), session?.user || {}));

  if (requiresProfile) {
    return <Navigate to="/profile?onboarding=1" replace />;
  }

  return children;
}

function PublicAuthRoute({ children }) {
  const session = typeof window !== 'undefined' ? getSession() : null;
  if (session?.token) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function ScrollToTopOnRouteChange() {
  const { pathname } = useLocation();

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
}

function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTopOnRouteChange />
      <Suspense fallback={<div className="route-fallback">Loading FireReach...</div>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<PublicAuthRoute><AuthPage /></PublicAuthRoute>} />
          <Route path="/app" element={<ProtectedRoute><AppPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/payment-demo/:sessionId" element={<PaymentDemoPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default AppRouter;
