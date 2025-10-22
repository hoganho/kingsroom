import { Authenticator } from '@aws-amplify/ui-react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ScraperDashboard } from './components/Scraper';
import { GameProvider } from './contexts/GameContext';

function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <BrowserRouter>
          <GameProvider> 
            <div className="min-h-screen bg-gray-100">
                <header className="bg-white shadow-sm">
                  <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
                      <h1 className="text-xl font-bold text-gray-900">Scraper App</h1>
                      <div className="flex items-center space-x-4">
                          <span className="text-sm text-gray-600">Logged in as: {user?.attributes?.email}</span>
                          <button
                              onClick={signOut}
                              className="py-1 px-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700"
                          >
                              Sign out
                          </button>
                      </div>
                  </div>
                </header>
                <main>
                  <Routes>
                    <Route path="/dashboard" element={<ScraperDashboard />} />
                    <Route path="/" element={<Navigate to="/dashboard" />} /> 
                  </Routes>
                </main>
            </div>
          </GameProvider>
        </BrowserRouter>
      )}
    </Authenticator>
  );
}

export default App;