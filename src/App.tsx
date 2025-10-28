// src/App.tsx

import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GameProvider } from './contexts/GameContext.tsx';
import { MainLayout } from './components/layout/MainLayout.tsx';
import ScraperDashboard from './pages/ScraperPage.tsx';
import BulkScraperPage from './pages/BulkScraperPage.tsx';
import VenuesPage from './pages/VenuesPage.tsx';
import { SeriesManagementPage } from './pages/SeriesManagementPage';

// ✅ 1. Import Amplify and your configuration file
import { Amplify } from 'aws-amplify';
import awsExports from './aws-exports.js';

// ✅ 2. Configure Amplify outside of your component
Amplify.configure(awsExports);

function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <BrowserRouter>
          <GameProvider>
            <MainLayout user={user} signOut={signOut}>
              <Routes>
                <Route path="/scraper-dashboard" element={<ScraperDashboard />} />
                <Route path="/bulk-scraper" element={<BulkScraperPage />} />
                <Route path="/venues" element={<VenuesPage />} />
                <Route path="/series-management" element={<SeriesManagementPage />} />
                <Route path="/" element={<Navigate to="/scraper-dashboard" replace />} />
                
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