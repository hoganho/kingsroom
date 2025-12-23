// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import { Hub } from 'aws-amplify/utils';
import { signOut } from 'aws-amplify/auth';

// UI Styles
import '@aws-amplify/ui-react/styles.css';
import './authenticator-theme.css';
import awsExports from './aws-exports.js';
import React, { useEffect, useRef } from 'react';

// Hooks & Config
import { useActivityLogger } from './hooks/useActivityLogger';
import { useUserPermissions } from './hooks/useUserPermissions';

// Components
import { CustomAuthenticator } from './components/auth/CustomAuthenticator';

// Context Providers
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { GameProvider } from './contexts/GameContext';
import { EntityProvider } from './contexts/EntityContext';

// Layout and Auth Components
import { MainLayout } from './components/layout/MainLayout';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

// Main Pages
import { HomePage } from './pages/HomePage';

// Players Pages
import { PlayersDashboard } from './pages/players/PlayersDashboard';
import { PlayerSearch } from './pages/players/PlayerSearch';
import { PlayerProfile } from './pages/players/PlayerProfile';

// Series Pages
import { SeriesDashboard } from './pages/series/SeriesDashboard';

// Games Pages
import { GamesDashboard } from './pages/games/GamesDashboard';
import { GameSearch } from './pages/games/GameSearch';
import { GameDetails } from './pages/games/GameDetails';

// Venues Pages
import VenuesDashboard from './pages/venues/VenuesDashboard';
import { VenueDetails } from './pages/venues/VenueDetails';
import { VenueGameDetails } from './pages/venues/VenueGameDetails';

// Entity Pages
import { EntityDashboard } from './pages/entities/EntityDashboard';

// Settings Pages (Admin/SuperAdmin)
import EntityManagement from './pages/settings/EntityManagement';
import VenueManagement from './pages/settings/VenueManagement';
import GameManagement from './pages/settings/GameManagement';
import { SeriesManagementPage } from './pages/settings/SeriesManagement';
import { UserManagement } from './pages/settings/UserManagement';
import MetricsManagement from './pages/settings/MetricsManagement';

// Scraper Pages (SuperAdmin)
import { ScraperAdminPage } from './pages/scraper/ScraperAdmin';

// Social Pages
import { SocialPulse } from './pages/social/SocialPulse';
import SocialAccountManagement from './pages/settings/SocialAccountManagement.js';
import { SocialDashboard } from './pages/social/SocialDashboard';

// Legal Pages (Public - No Auth Required)
import { PrivacyPolicy } from './pages/legal/PrivacyPolicy';
import { TermsOfService } from './pages/legal/TermsOfService';

// Debug Pages (SuperAdmin)
import { GamesDebug } from './pages/debug/GamesDebug';
import { PlayersDebug } from './pages/debug/PlayersDebug';
import { DatabaseMonitorPage } from './pages/debug/DatabaseMonitor';
import { getMonitoring } from './utils/enhanced-monitoring';

// Configure Amplify
Amplify.configure(awsExports);

// ============================================
// PUBLIC PATHS - No authentication required
// ============================================
const PUBLIC_PATHS = ['/privacy-policy', '/privacy', '/terms-of-service', '/terms', '/cookie-policy'];

const isPublicPath = (pathname: string): boolean => {
  const normalizedPath = pathname.replace(/\/$/, '') || '/';
  return PUBLIC_PATHS.some((p) => normalizedPath === p || normalizedPath.startsWith(p + '/'));
};

// ============================================
// ROUTE TRACKER - Logs page views
// ============================================
export const RouteTracker = () => {
  const location = useLocation();
  const { logPageView } = useActivityLogger();

  useEffect(() => {
    logPageView(location.pathname);
  }, [location.pathname, logPageView]);

  return null;
};

// ============================================
// AUTH EVENT LOGGER - Logs login/logout
// ============================================
const AuthEventLogger = () => {
  const { logAuth } = useActivityLogger();
  const hasLoggedLogin = useRef(false);

  useEffect(() => {
    if (!hasLoggedLogin.current) {
      logAuth('LOGIN', { source: 'session_start' });
      hasLoggedLogin.current = true;
    }
  }, [logAuth]);

  useEffect(() => {
    const unsubscribe = Hub.listen('auth', async (data) => {
      const { payload } = data;

      switch (payload.event) {
        case 'signedIn':
          const authData = payload.data as { userId?: string; username?: string; sub?: string };
          const userId = authData?.userId || authData?.username || authData?.sub;
          logAuth('LOGIN', { source: 'sign_in_flow', method: 'cognito' }, userId);
          break;

        case 'signedOut':
          logAuth('LOGOUT', { source: 'user_initiated' });
          break;

        case 'tokenRefresh_failure':
          logAuth('SESSION_EXPIRED', { reason: 'token_refresh_failure' });
          break;

        case 'signInWithRedirect_failure':
          logAuth('LOGIN_FAILED', { reason: 'redirect_failure' });
          break;
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [logAuth]);

  return null;
};

// ============================================
// ERROR BOUNDARY
// ============================================
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="text-center p-8 bg-white rounded-lg shadow-lg max-w-md">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h1>
            <p className="text-gray-600 mb-4">
              An error has been logged and our team has been notified.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================
// PROTECTED LAYOUT
// ============================================
const ProtectedLayout = () => {
  return (
    <ProtectedRoute>
      <EntityProvider>
        <GameProvider>
          <MainLayout>
            <Outlet />
          </MainLayout>
        </GameProvider>
      </EntityProvider>
    </ProtectedRoute>
  );
};

// ============================================
// PUBLIC ROUTES COMPONENT
// ============================================
const PublicRoutes = () => {
  return (
    <Routes>
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/privacy" element={<Navigate to="/privacy-policy" replace />} />
      <Route path="/terms-of-service" element={<TermsOfService />} />
      <Route path="/terms" element={<Navigate to="/terms-of-service" replace />} />
      <Route path="*" element={<Navigate to="/privacy-policy" replace />} />
    </Routes>
  );
};

// ============================================
// NO ACCESS SCREEN
// ============================================
// Shown when user is authenticated but has no page permissions
const NoAccessScreen = () => {
  const { user } = useAuth();
  const [signingOut, setSigningOut] = React.useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950 p-4">
      <div className="text-center bg-white dark:bg-gray-900 p-8 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800 max-w-md w-full">
        {/* Lock Icon */}
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-6">
          <svg
            className="h-8 w-8 text-amber-600 dark:text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-3">
          Account Restricted
        </h2>

        <p className="text-gray-600 dark:text-gray-400 mb-2">
          Your account does not have permission to access any pages in this dashboard.
        </p>

        <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
          Please contact your administrator to request access.
        </p>

        {/* User info */}
        {user && (
          <div className="mb-6 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
            <div className="text-gray-500 dark:text-gray-400">Signed in as</div>
            <div className="font-medium text-gray-900 dark:text-gray-100">{user.email}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Role: {user.role?.replace('_', ' ')}
            </div>
          </div>
        )}

        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full px-4 py-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {signingOut ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Signing out...
            </span>
          ) : (
            'Sign Out'
          )}
        </button>
      </div>
    </div>
  );
};

// ============================================
// SMART REDIRECT COMPONENT
// ============================================
// Redirects users to their first accessible page, or shows NoAccessScreen
const DefaultRoute = () => {
  const { user, loading } = useAuth();
  const { hasAnyAccess, firstAccessiblePage, canAccess } = useUserPermissions();

  // 1. Wait for auth to load
  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto" />
          <p className="mt-4 text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  // 2. Check if user has any access at all
  if (!hasAnyAccess) {
    console.log('[DefaultRoute] User has no page access, showing NoAccessScreen');
    return <NoAccessScreen />;
  }

  // 3. Try /home first (common preference)
  if (canAccess('/home')) {
    return <Navigate to="/home" replace />;
  }

  // 4. Redirect to first accessible page
  if (firstAccessiblePage) {
    console.log(`[DefaultRoute] Redirecting to first accessible page: ${firstAccessiblePage.path}`);
    return <Navigate to={firstAccessiblePage.path} replace />;
  }

  // 5. Fallback (shouldn't reach here if hasAnyAccess is true)
  console.warn('[DefaultRoute] Unexpected state: hasAnyAccess=true but no firstAccessiblePage');
  return <NoAccessScreen />;
};

// ============================================
// AUTHENTICATED ROUTES COMPONENT
// ============================================
const AuthenticatedRoutes = () => {
  return (
    <CustomAuthenticator>
      <AuthProvider>
        {/* Activity logging components */}
        <RouteTracker />
        <AuthEventLogger />

        <Routes>
          {/* Smart Redirect for root and login */}
          <Route path="/login" element={<DefaultRoute />} />
          <Route path="/" element={<DefaultRoute />} />

          {/* Protected routes with layout */}
          <Route element={<ProtectedLayout />}>
            {/* Home */}
            <Route path="/home" element={<HomePage />} />

            {/* Players */}
            <Route path="/players/dashboard" element={<PlayersDashboard />} />
            <Route path="/players/search" element={<PlayerSearch />} />
            <Route path="/players/profile/:playerId" element={<PlayerProfile />} />

            {/* Series */}
            <Route path="/series/dashboard" element={<SeriesDashboard />} />

            {/* Games */}
            <Route path="/games/dashboard" element={<GamesDashboard />} />
            <Route path="/games/search" element={<GameSearch />} />
            <Route path="/games/details/:gameId" element={<GameDetails />} />

            {/* Venues */}
            <Route path="/venues" element={<VenuesDashboard />} />
            <Route path="/venues/details" element={<VenueDetails />} />
            <Route path="/venues/game" element={<VenueGameDetails />} />

            {/* Social */}
            <Route path="/social/pulse" element={<SocialPulse />} />
            <Route path="/social/dashboard" element={<SocialDashboard />} />

            {/* Entities */}
            <Route path="/entities" element={<EntityDashboard />} />

            {/* Settings (Admin/SuperAdmin) */}
            <Route path="/settings/entity-management" element={<EntityManagement />} />
            <Route path="/settings/venue-management" element={<VenueManagement />} />
            <Route path="/settings/game-management" element={<GameManagement />} />
            <Route path="/settings/series-management" element={<SeriesManagementPage />} />
            <Route path="/settings/metrics-management" element={<MetricsManagement />} />
            <Route path="/settings/social-accounts" element={<SocialAccountManagement />} />
            <Route path="/settings/user-management" element={<UserManagement />} />

            {/* Scraper Management (SuperAdmin) */}
            <Route path="/scraper/admin" element={<ScraperAdminPage />} />

            {/* Debug Pages (SuperAdmin) */}
            <Route path="/debug/games" element={<GamesDebug />} />
            <Route path="/debug/players" element={<PlayersDebug />} />
            <Route path="/debug/database-monitor" element={<DatabaseMonitorPage />} />
          </Route>

          {/* Catch-all uses Smart Redirect */}
          <Route path="*" element={<DefaultRoute />} />
        </Routes>
      </AuthProvider>
    </CustomAuthenticator>
  );
};

// ============================================
// APP ROUTER - Decides public vs authenticated
// ============================================
const AppRouter = () => {
  const location = useLocation();

  if (isPublicPath(location.pathname)) {
    return <PublicRoutes />;
  }

  return <AuthenticatedRoutes />;
};

// ============================================
// MAIN APP COMPONENT
// ============================================
function App() {
  const monitoring = getMonitoring({
    enabled: import.meta.env.VITE_ENABLE_DB_MONITOR !== 'false',
    sendToCloudWatch: import.meta.env.VITE_CLOUDWATCH_ENABLED !== 'false',
    logToConsole: import.meta.env.DEV,
  });

  useEffect(() => {
    monitoring.trackMetric('AppStarted', 1, 'Count');
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <BrowserRouter>
        <ErrorBoundary>
          <AppRouter />
        </ErrorBoundary>
      </BrowserRouter>
    </div>
  );
}

export default App;