// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import { Hub } from 'aws-amplify/utils';
// Remove Authenticator import, keep UI components for ErrorBoundary
import '@aws-amplify/ui-react/styles.css';
import './authenticator-theme.css';
import awsExports from './aws-exports.js';
import React, { useEffect, useRef } from 'react';
import { useActivityLogger } from './hooks/useActivityLogger';

// Import your Custom Authenticator
import { CustomAuthenticator } from './components/auth/CustomAuthenticator';

// Context Providers
import { AuthProvider } from './contexts/AuthContext';
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
import { VenuesDashboard } from './pages/venues/VenuesDashboard';
import { VenueDetails } from './pages/venues/VenueDetails';

// Settings Pages (Admin/SuperAdmin)
import EntityManagement from './pages/settings/EntityManagement';
import VenueManagement from './pages/settings/VenueManagement';
import { SeriesManagementPage } from './pages/settings/SeriesManagement';
import { UserManagement } from './pages/settings/UserManagement';

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
    return PUBLIC_PATHS.some(p => normalizedPath === p || normalizedPath.startsWith(p + '/'));
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
      console.log('Auth event:', payload.event);

      switch (payload.event) {
        case 'signedIn':
          const authData = payload.data as any; 
          const userId = authData?.userId || authData?.username || authData?.sub;
          
          logAuth('LOGIN', { 
            source: 'sign_in_flow',
            method: 'cognito'
          }, userId);
          break;

        case 'signedOut':
          logAuth('LOGOUT', { 
            source: 'user_initiated' 
          });
          break;
          
        case 'tokenRefresh_failure':
          logAuth('SESSION_EXPIRED', {
            reason: 'token_refresh_failure'
          });
          break;

        case 'signInWithRedirect_failure':
          logAuth('LOGIN_FAILED', {
            reason: 'redirect_failure'
          });
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
                        <h1 className="text-2xl font-bold text-red-600 mb-4">
                            Something went wrong
                        </h1>
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
                    {/* Redirects */}
                    <Route path="/login" element={<Navigate to="/home" replace />} />
                    <Route path="/" element={<Navigate to="/home" replace />} />

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
                        <Route path="/venues/dashboard" element={<VenuesDashboard />} />
                        <Route path="/venues/details" element={<VenueDetails />} />
                        
                        {/* Social Pulse */}
                        <Route path="/social/pulse" element={<SocialPulse />} />
                        <Route path="/social/dashboard" element={<SocialDashboard />} />
                        
                        {/* Settings (Admin/SuperAdmin) */}
                        <Route path="/settings/entity-management" element={<EntityManagement />} />
                        <Route path="/settings/venue-management" element={<VenueManagement />} />
                        <Route path="/settings/series-management" element={<SeriesManagementPage />} />
                        <Route path="/settings/social-accounts" element={<SocialAccountManagement />} />
                        <Route path="/settings/user-management" element={<UserManagement />} />
                        
                        {/* Scraper Management (SuperAdmin) */}
                        <Route path="/scraper/admin" element={<ScraperAdminPage />} />
                        
                        {/* Debug Pages (SuperAdmin) */}
                        <Route path="/debug/games" element={<GamesDebug />} />
                        <Route path="/debug/players" element={<PlayersDebug />} />
                        <Route path="/debug/database-monitor" element={<DatabaseMonitorPage />} />
                    </Route>

                    {/* Catch all */}
                    <Route path="*" element={<Navigate to="/home" replace />} />
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
    
    useEffect(() => {
        console.log('剥 Current path:', location.pathname);
        console.log('箔 Is public path:', isPublicPath(location.pathname));
    }, [location.pathname]);

    if (isPublicPath(location.pathname)) {
        console.log('塘 Rendering public route');
        return <PublicRoutes />;
    }

    console.log('柏 Rendering authenticated route');
    return <AuthenticatedRoutes />;
};

// ============================================
// MAIN APP COMPONENT
// ============================================
function App() {
    const monitoring = getMonitoring({
        enabled: import.meta.env.VITE_ENABLE_DB_MONITOR !== 'false',
        sendToCloudWatch: import.meta.env.VITE_CLOUDWATCH_ENABLED !== 'false',
        logToConsole: import.meta.env.DEV
    });

    useEffect(() => {
        monitoring.trackMetric('AppStarted', 1, 'Count');
    }, []);

    return (
        <div className="min-h-screen bg-gray-50">
            <BrowserRouter>
                <ErrorBoundary>
                    <AppRouter />
                </ErrorBoundary>
            </BrowserRouter>
        </div>
    );
}

export default App;