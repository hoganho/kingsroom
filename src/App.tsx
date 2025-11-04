// src/App.tsx - UPDATED WITH NEW PAGE STRUCTURE
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import { Hub } from 'aws-amplify/utils';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import awsExports from './aws-exports.js';
import { useEffect, useState } from 'react';

// CloudWatch monitoring
import { cloudWatchClient } from './infrastructure/client-cloudwatch';

// Context Providers
import { AuthProvider } from './contexts/AuthContext';
import { GameProvider } from './contexts/GameContext';

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
import VenueManagement from './pages/settings/VenueManagement';
import { SeriesManagementPage } from './pages/settings/SeriesManagement';

// Scraper Pages (SuperAdmin)
import { ScraperAdminPage } from './pages/scraper/ScraperAdmin';

// Debug Pages (SuperAdmin)
import { GamesDebug } from './pages/debug/GamesDebug';
import { PlayersDebug } from './pages/debug/PlayersDebug';

// Error Boundary for CloudWatch error tracking
import React from 'react';

// Configure Amplify
Amplify.configure(awsExports);

// Initialize CloudWatch
const initializeCloudWatch = async () => {
    try {
        await cloudWatchClient.initialize();
        console.log('CloudWatch initialized successfully');
    } catch (error) {
        console.error('Failed to initialize CloudWatch:', error);
    }
};

initializeCloudWatch();

// CloudWatch Error Boundary
class CloudWatchErrorBoundary extends React.Component<
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
        try {
            cloudWatchClient.trackError(error, 'CLIENT', {
                componentStack: errorInfo.componentStack,
                errorBoundary: true,
                timestamp: new Date().toISOString()
            });
            cloudWatchClient.flush();
        } catch (e) {
            console.error('Failed to track error to CloudWatch:', e);
        }
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

// Protected Layout
const ProtectedLayout = () => {
    return (
        <ProtectedRoute>
            <GameProvider>
                <MainLayout>
                    <Outlet />
                </MainLayout>
            </GameProvider>
        </ProtectedRoute>
    );
};

// Main App Component
function App() {
    const [cloudWatchReady, setCloudWatchReady] = useState(false);
    
    useEffect(() => {
        const setupCloudWatch = async () => {
            try {
                await cloudWatchClient.initialize();
                setCloudWatchReady(true);
                await cloudWatchClient.updateUserContext();
                
                cloudWatchClient.trackPageView('App', {
                    version: import.meta.env.VITE_BUILD_VERSION || 'dev',
                    environment: import.meta.env.MODE,
                    timestamp: new Date().toISOString()
                });
                
                if (window.performance?.timing) {
                    const perfData = window.performance.timing;
                    const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
                    
                    if (pageLoadTime > 0) {
                        cloudWatchClient.recordMetric({
                            metricName: 'PageLoadTime',
                            value: pageLoadTime,
                            unit: 'Milliseconds',
                            dimensions: { Page: 'InitialLoad' }
                        });
                    }
                }
            } catch (error) {
                console.error('CloudWatch setup error:', error);
                setCloudWatchReady(true);
            }
        };
        
        setupCloudWatch();
    }, []);
    
    useEffect(() => {
        if (!cloudWatchReady) return;
        
        const authListener = (data: any) => {
            if (!cloudWatchReady) return;
            
            switch (data.payload.event) {
                case 'signIn':
                    console.log('User signed in, updating CloudWatch context');
                    setTimeout(async () => {
                        try {
                            await cloudWatchClient.updateUserContext();
                            cloudWatchClient.recordMetric({
                                metricName: 'UserLogin',
                                value: 1,
                                dimensions: { 
                                    LoginMethod: data.payload.data?.signInUserSession?.idToken?.payload?.identities?.[0]?.providerName || 'Cognito'
                                }
                            });
                        } catch (error) {
                            console.error('Failed to update context after sign in:', error);
                        }
                    }, 1000);
                    break;
                    
                case 'signOut':
                    console.log('User signed out, clearing CloudWatch context');
                    try {
                        cloudWatchClient.clearUserContext();
                        cloudWatchClient.recordMetric({
                            metricName: 'UserLogout',
                            value: 1
                        });
                    } catch (error) {
                        console.error('Failed to clear context after sign out:', error);
                    }
                    break;
                    
                case 'tokenRefresh':
                    console.log('Token refreshed, updating CloudWatch context');
                    cloudWatchClient.updateUserContext().catch(console.error);
                    break;
                    
                case 'signIn_failure':
                    try {
                        cloudWatchClient.trackError(
                            new Error('Sign in failed'),
                            'AUTH',
                            { reason: data.payload.data?.message }
                        );
                    } catch (error) {
                        console.error('Failed to track auth error:', error);
                    }
                    break;
            }
        };
        
        const hubListenerUnsubscribe = Hub.listen('auth', authListener);
        
        const errorHandler = (event: ErrorEvent) => {
            if (!cloudWatchReady) return;
            try {
                cloudWatchClient.trackError(event.error || new Error(event.message), 'CLIENT', {
                    message: event.message,
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                console.error('Failed to track error:', error);
            }
        };
        
        const unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
            if (!cloudWatchReady) return;
            try {
                cloudWatchClient.trackError(
                    new Error(event.reason?.message || String(event.reason)),
                    'CLIENT',
                    { 
                        type: 'unhandledRejection',
                        reason: event.reason,
                        timestamp: new Date().toISOString()
                    }
                );
            } catch (error) {
                console.error('Failed to track unhandled rejection:', error);
            }
        };
        
        window.addEventListener('error', errorHandler);
        window.addEventListener('unhandledrejection', unhandledRejectionHandler);
        
        return () => {
            if (typeof hubListenerUnsubscribe === 'function') {
                hubListenerUnsubscribe();
            }
            window.removeEventListener('error', errorHandler);
            window.removeEventListener('unhandledrejection', unhandledRejectionHandler);
            
            if (cloudWatchReady) {
                cloudWatchClient.flush().catch(console.error);
            }
        };
    }, [cloudWatchReady]);
    
    useEffect(() => {
        if (!cloudWatchReady) return;
        
        const handleRouteChange = () => {
            try {
                const path = window.location.pathname;
                cloudWatchClient.trackPageView(path, {
                    referrer: document.referrer,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                console.error('Failed to track route change:', error);
            }
        };
        
        window.addEventListener('popstate', handleRouteChange);
        
        return () => {
            window.removeEventListener('popstate', handleRouteChange);
        };
    }, [cloudWatchReady]);

    return (
        <Authenticator>
            {({ user }) => {
                if (user && cloudWatchReady) {
                    try {
                        cloudWatchClient.setUserId(user.username);
                    } catch (error) {
                        console.error('Failed to set user ID:', error);
                    }
                }
                
                return (
                    <CloudWatchErrorBoundary>
                        <BrowserRouter>
                            <AuthProvider>
                                <Routes>
                                    {/* Post-login redirection */}
                                    <Route path="/login" element={<Navigate to="/home" replace />} />
                                    <Route path="/" element={<Navigate to="/home" replace />} />

                                    {/* Protected routes */}
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
                                        
                                        {/* Settings (Admin/SuperAdmin) */}
                                        <Route path="/settings/venue-management" element={<VenueManagement />} />
                                        <Route path="/settings/series-management" element={<SeriesManagementPage />} />
                                        
                                        {/* Scraper Management (SuperAdmin) */}
                                        <Route path="/scraper/admin" element={<ScraperAdminPage />} />
                                        
                                        {/* Debug (SuperAdmin) */}
                                        <Route path="/debug/games" element={<GamesDebug />} />
                                        <Route path="/debug/players" element={<PlayersDebug />} />
                                    </Route>
                                    
                                    {/* 404 handler */}
                                    <Route path="*" element={
                                        <MainLayout>
                                            <div className="flex items-center justify-center min-h-[50vh]">
                                                <div className="text-center">
                                                    <h1 className="text-3xl font-bold text-gray-900 mb-2">404</h1>
                                                    <p className="text-gray-600">Page not found</p>
                                                </div>
                                            </div>
                                        </MainLayout>
                                    } />
                                </Routes>
                            </AuthProvider>
                        </BrowserRouter>
                    </CloudWatchErrorBoundary>
                );
            }}
        </Authenticator>
    );
}

export default App;
