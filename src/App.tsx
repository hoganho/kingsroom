// src/App.tsx - WITH USER MANAGEMENT ROUTE AND ACTIVITY LOGGING
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import { Hub } from 'aws-amplify/utils';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import './authenticator-theme.css';
import awsExports from './aws-exports.js';
import { useEffect, useRef } from 'react';
import { useActivityLogger } from './hooks/useActivityLogger';

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

// Error Boundary
import React from 'react';
import { Heading, Text, View } from '@aws-amplify/ui-react';

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
    // Log initial login (user just authenticated)
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
          // User completed sign-in flow
          logAuth('LOGIN', { 
            source: 'sign_in_flow',
            method: 'cognito'
          });
          break;

        case 'signedOut':
          // User signed out
          logAuth('LOGOUT', { 
            source: 'user_initiated' 
          });
          break;

        case 'tokenRefresh':
          // Token was refreshed - don't log as it's noisy
          console.log('Token refreshed');
          break;

        case 'tokenRefresh_failure':
          // Token refresh failed - session expired
          console.error('Token refresh failed');
          logAuth('SESSION_EXPIRED', {
            reason: 'token_refresh_failure'
          });
          break;

        case 'signInWithRedirect':
          console.log('Sign in with redirect initiated');
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
// AUTHENTICATOR CUSTOMIZATION
// ============================================
const authenticatorComponents = {
    Header() {
        return (
            <View textAlign="center" padding="2rem 2rem 1rem 2rem">
                <div className="text-4xl mb-2"></div>
                <Heading level={3} style={{ color: '#4f46e5', marginBottom: '0.5rem' }}>
                    PokerPro Live
                </Heading>
                <Text color="neutral.60" fontSize="0.875rem">
                    Tournament Management System
                </Text>
            </View>
        );
    },
    Footer() {
        return (
            <View textAlign="center" padding="1.5rem 2rem">
                <Text color="neutral.60" fontSize="0.75rem">
                    &copy; {new Date().getFullYear()} KingsRoom. All rights reserved.
                </Text>
            </View>
        );
    },
    SignIn: {
        Header() {
            return (
                <Heading 
                    level={4} 
                    padding="1.5rem 0 0.5rem 0" 
                    textAlign="center"
                    style={{ color: '#1f2937', fontSize: '1.25rem', fontWeight: '600' }}
                >
                    Sign in to your account
                </Heading>
            );
        },
    },
    SignUp: {
        Header() {
            return (
                <Heading 
                    level={4} 
                    padding="1.5rem 0 0.5rem 0" 
                    textAlign="center"
                    style={{ color: '#1f2937', fontSize: '1.25rem', fontWeight: '600' }}
                >
                    Create a new account
                </Heading>
            );
        },
    },
    ResetPassword: {
        Header() {
            return (
                <Heading 
                    level={4} 
                    padding="1.5rem 0 0.5rem 0" 
                    textAlign="center"
                    style={{ color: '#1f2937', fontSize: '1.25rem', fontWeight: '600' }}
                >
                    Reset your password
                </Heading>
            );
        },
    },
};

const authenticatorFormFields = {
    signIn: {
        username: {
            placeholder: 'Enter your email',
            label: 'Email Address',
            isRequired: true,
        },
        password: {
            placeholder: 'Enter your password',
            label: 'Password',
            isRequired: true,
        },
    },
    signUp: {
        username: {
            placeholder: 'Enter your email',
            label: 'Email Address',
            isRequired: true,
            order: 1,
        },
        email: {
            placeholder: 'Enter your email',
            label: 'Email Address',
            isRequired: true,
            order: 2,
        },
        password: {
            placeholder: 'Enter your password',
            label: 'Password',
            isRequired: true,
            order: 3,
        },
        confirm_password: {
            placeholder: 'Confirm your password',
            label: 'Confirm Password',
            isRequired: true,
            order: 4,
        },
    },
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
        <Authenticator
            components={authenticatorComponents}
            formFields={authenticatorFormFields}
            hideSignUp={false}
        >
            {({ user }) => {
                if (user) {
                    console.log('Authenticated user:', user.username);
                }
                
                return (
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
                );
            }}
        </Authenticator>
    );
};

// ============================================
// APP ROUTER - Decides public vs authenticated
// ============================================
const AppRouter = () => {
    const location = useLocation();
    
    useEffect(() => {
        console.log('🔍 Current path:', location.pathname);
        console.log('🔓 Is public path:', isPublicPath(location.pathname));
    }, [location.pathname]);

    if (isPublicPath(location.pathname)) {
        console.log('📄 Rendering public route');
        return <PublicRoutes />;
    }

    console.log('🔐 Rendering authenticated route');
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