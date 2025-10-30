// src/App.tsx - Updated version with Auto Scraper route
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import awsExports from './aws-exports.js';

// Context Providers
import { AuthProvider } from './contexts/AuthContext';
import { GameProvider } from './contexts/GameContext.tsx';

// Layout and Auth Components
import { MainLayout } from './components/layout/MainLayout.tsx';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

// Pages
import ScraperDashboard from './pages/ScraperPage.tsx';
import BulkScraperPage from './pages/BulkScraperPage.tsx';
import VenuesPage from './pages/VenuesPage.tsx';
import { SeriesManagementPage } from './pages/SeriesManagementPage';
import { PlayersPage } from './pages/Players.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { AutoScraperPage } from './pages/AutoScraperPage.tsx'; // New import

// Configure Amplify
Amplify.configure(awsExports);

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

function App() {
  return (
    <Authenticator>
      {() => (
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              {/* ✅ FIX: Add a specific route to handle post-login redirection */}
              {/* If the app renders while on /login, it will immediately navigate to /home */}
              <Route path="/login" element={<Navigate to="/home" replace />} />

              {/* This route handles a direct visit to the root URL */}
              <Route path="/" element={<Navigate to="/home" replace />} />

              {/* This is the layout route that wraps all protected pages */}
              <Route element={<ProtectedLayout />}>
                <Route path="/home" element={<HomePage />} />
                <Route path="/scraper-dashboard" element={<ScraperDashboard />} />
                <Route path="/bulk-scraper" element={<BulkScraperPage />} />
                <Route path="/auto-scraper" element={<AutoScraperPage />} /> {/* New route */}
                <Route path="/venues" element={<VenuesPage />} />
                <Route path="/series-management" element={<SeriesManagementPage />} />
                <Route path="/players" element={<PlayersPage />} />
              </Route>
              
              {/* This catch-all 404 route is now at the top level */}
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
      )}
    </Authenticator>
  );
}

export default App;