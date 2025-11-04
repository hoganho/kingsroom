// src/App.tsx - CORRECTED VERSION WITHOUT CLOUDWATCH
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import { Hub } from 'aws-amplify/utils';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import awsExports from './aws-exports.js';
import { useEffect } from 'react';

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

// Error Boundary for error tracking
import React from 'react';

// Configure Amplify
Amplify.configure(awsExports);

// Simple Error Boundary (without CloudWatch)
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
        // Just log to console - no CloudWatch tracking
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

// Protected Layout Component
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
    useEffect(() => {
        // Listen for auth events (without CloudWatch)
        const unsubscribe = Hub.listen('auth', (data) => {
            const { payload } = data;
            console.log('Auth event:', payload.event);
            
            switch (payload.event) {
                case 'signedIn':
                    console.log('User signed in');
                    break;
                case 'signedOut':
                    console.log('User signed out');
                    break;
                case 'tokenRefresh':
                    console.log('Token refreshed');
                    break;
                case 'tokenRefresh_failure':
                    console.error('Token refresh failed');
                    break;
                case 'signInWithRedirect':
                    console.log('Sign in with redirect initiated');
                    break;
                case 'signInWithRedirect_failure':
                    console.error('Sign in with redirect failed');
                    break;
                case 'customOAuthState':
                    console.log('Custom OAuth state received');
                    break;
            }
        });

        // Cleanup function
        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
    }, []);

    return (
        <Authenticator>
            {({ user }) => {
                // Log user info for debugging (no CloudWatch)
                if (user) {
                    console.log('Authenticated user:', user.username);
                }
                
                return (
                    <ErrorBoundary>
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
                                        <Route path="/scraper-admin" element={<ScraperAdminPage />} />
                                        
                                        {/* Debug Pages (SuperAdmin) */}
                                        <Route path="/debug/games" element={<GamesDebug />} />
                                        <Route path="/debug/players" element={<PlayersDebug />} />
                                    </Route>

                                    {/* Catch all */}
                                    <Route path="*" element={<Navigate to="/" replace />} />
                                </Routes>
                            </AuthProvider>
                        </BrowserRouter>
                    </ErrorBoundary>
                );
            }}
        </Authenticator>
    );
}

export default App;