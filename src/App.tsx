// src/App.tsx - Enhanced with CloudWatch monitoring (Fixed)
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import { Hub } from 'aws-amplify/utils';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import awsExports from './aws-exports.js';
import { useEffect } from 'react';

// CloudWatch monitoring
import { cloudWatchClient } from './infrastructure/client-cloudwatch';

// Context Providers
import { AuthProvider } from './contexts/AuthContext';
import { GameProvider } from './contexts/GameContext';

// Layout and Auth Components
import { MainLayout } from './components/layout/MainLayout';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

// Pages
import VenuesPage from './pages/VenuesPage';
import { SeriesManagementPage } from './pages/SeriesManagementPage';
import { PlayersPage } from './pages/Players';
import { HomePage } from './pages/HomePage';
import { ScraperAdminPage } from './pages/ScraperAdminPage';

// Error Boundary for CloudWatch error tracking
import React from 'react';

// Configure Amplify
Amplify.configure(awsExports);

// ===================================================================
// CloudWatch Error Boundary
// ===================================================================
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
        // Track error to CloudWatch
        cloudWatchClient.trackError(error, 'CLIENT', {
            componentStack: errorInfo.componentStack,
            errorBoundary: true,
            timestamp: new Date().toISOString()
        });
        
        // Immediately flush critical errors
        cloudWatchClient.flush();
        
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

// ===================================================================
// Protected Layout with CloudWatch tracking
// ===================================================================
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

// ===================================================================
// Main App Component with CloudWatch Integration
// ===================================================================
function App() {
    // Initialize CloudWatch monitoring
    useEffect(() => {
        // Listen for auth events
        const authListener = (data: any) => {
            switch (data.payload.event) {
                case 'signIn':
                    console.log('User signed in, updating CloudWatch context');
                    cloudWatchClient.updateUserContext();
                    cloudWatchClient.recordMetric({
                        metricName: 'UserLogin',
                        value: 1,
                        dimensions: { 
                            LoginMethod: data.payload.data?.signInUserSession?.idToken?.payload?.identities?.[0]?.providerName || 'Cognito'
                        }
                    });
                    break;
                    
                case 'signOut':
                    console.log('User signed out, clearing CloudWatch context');
                    cloudWatchClient.clearUserContext();
                    cloudWatchClient.recordMetric({
                        metricName: 'UserLogout',
                        value: 1
                    });
                    break;
                    
                case 'tokenRefresh':
                    console.log('Token refreshed, updating CloudWatch context');
                    cloudWatchClient.updateUserContext();
                    break;
                    
                case 'signIn_failure':
                    cloudWatchClient.trackError(
                        new Error('Sign in failed'),
                        'AUTH',
                        { reason: data.payload.data?.message }
                    );
                    break;
            }
        };
        
        // Hub.listen returns an unsubscribe function in modern versions
        const hubListenerUnsubscribe = Hub.listen('auth', authListener);
        
        // Initialize user context if already authenticated
        cloudWatchClient.updateUserContext();
        
        // Track app initialization
        cloudWatchClient.trackPageView('App', {
            version: import.meta.env.VITE_BUILD_VERSION || 'dev',
            environment: import.meta.env.MODE,
            timestamp: new Date().toISOString()
        });
        
        // Setup global error handlers
        const errorHandler = (event: ErrorEvent) => {
            cloudWatchClient.trackError(event.error || new Error(event.message), 'CLIENT', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                timestamp: new Date().toISOString()
            });
        };
        
        const unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
            cloudWatchClient.trackError(
                new Error(event.reason?.message || String(event.reason)),
                'CLIENT',
                { 
                    type: 'unhandledRejection',
                    reason: event.reason,
                    timestamp: new Date().toISOString()
                }
            );
        };
        
        window.addEventListener('error', errorHandler);
        window.addEventListener('unhandledrejection', unhandledRejectionHandler);
        
        // Track performance metrics
        if (window.performance && window.performance.timing) {
            const perfData = window.performance.timing;
            const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
            
            if (pageLoadTime > 0) {
                cloudWatchClient.recordMetric({
                    metricName: 'PageLoadTime',
                    value: pageLoadTime,
                    unit: 'Milliseconds',
                    dimensions: {
                        Page: 'InitialLoad'
                    }
                });
            }
        }
        
        // Cleanup
        return () => {
            // Modern Hub cleanup - call the unsubscribe function
            if (typeof hubListenerUnsubscribe === 'function') {
                hubListenerUnsubscribe();
            }
            window.removeEventListener('error', errorHandler);
            window.removeEventListener('unhandledrejection', unhandledRejectionHandler);
            
            // Flush any remaining metrics before unmount
            cloudWatchClient.flush();
        };
    }, []);
    
    // Track route changes
    useEffect(() => {
        const handleRouteChange = () => {
            const path = window.location.pathname;
            cloudWatchClient.trackPageView(path, {
                referrer: document.referrer,
                timestamp: new Date().toISOString()
            });
        };
        
        // Listen for browser navigation
        window.addEventListener('popstate', handleRouteChange);
        
        return () => {
            window.removeEventListener('popstate', handleRouteChange);
        };
    }, []);

    return (
        <Authenticator>
            {({ user }) => {
                // Track authenticated user
                if (user) {
                    cloudWatchClient.setUserId(user.username);
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
                                        <Route path="/home" element={<HomePage />} />
                                        
                                        {/* Enhanced Scraper Management with Analytics */}
                                        <Route path="/scraper-admin" element={<ScraperAdminPage />} />
                                        
                                        {/* Other Management Pages */}
                                        <Route path="/venues" element={<VenuesPage />} />
                                        <Route path="/series-management" element={<SeriesManagementPage />} />
                                        <Route path="/players" element={<PlayersPage />} />
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