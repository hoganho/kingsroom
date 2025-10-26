import React from 'react';
import { Sidebar } from './Sidebar';

// Define the types for the props we'll receive from the Authenticator
interface MainLayoutProps {
  children: React.ReactNode;
  user: any; // You can use a more specific type from Amplify if available
  signOut?: () => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children, user, signOut }) => {
  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex flex-1 flex-col md:pl-64">
        {/* Top bar for user info and sign out */}
        <header className="sticky top-0 z-10 flex h-16 flex-shrink-0 border-b border-gray-200 bg-white">
          <div className="flex flex-1 items-center justify-end px-4 sm:px-6 lg:px-8">
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Logged in as: <strong>{user?.signInDetails?.loginId || user?.username}</strong>
              </span>
              <button
                onClick={signOut}
                className="py-1 px-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto">
          <div className="py-6">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};