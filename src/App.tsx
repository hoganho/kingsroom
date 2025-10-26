import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css'; // Import default Amplify UI styles
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GameProvider } from './contexts/GameContext.tsx';
import { MainLayout } from './components/layout/MainLayout.tsx';
import ScraperDashboard from './pages/ScraperPage.tsx';
import BulkScraperPage from './pages/BulkScraperPage.tsx';

function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <BrowserRouter>
          <GameProvider>
            {/* The MainLayout now wraps all your authenticated routes */}
            <MainLayout user={user} signOut={signOut}>
              <Routes>
                {/* Renamed /scraper to /scraper-dashboard for clarity */}
                <Route path="/scraper-dashboard" element={<ScraperDashboard />} />
                <Route path="/bulk-scraper" element={<BulkScraperPage />} />
                
                {/* Redirect the root path to the main dashboard */}
                <Route path="/" element={<Navigate to="/scraper-dashboard" replace />} />
                
                {/* A fallback for any routes not matched */}
                <Route path="*" element={<div>404 - Page Not Found</div>} />
              </Routes>
            </MainLayout>
          </GameProvider>
        </BrowserRouter>
      )}
    </Authenticator>
  );
}

export default App;