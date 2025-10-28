// src/components/layout/MainLayout.tsx

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
        
        {/* === UPDATED HEADER SECTION START === */}
        <header className="sticky top-0 z-10 flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6 lg:px-8">
          
          {/* This empty div acts as a flexible spacer on the left */}
          <div className="flex-1"></div>

          {/* This is the new, centered title */}
          <div className="flex-1 text-center">
            <h1 className="text-2xl font-bold text-gray-800 font-display">
              Kings Room App
            </h1>
          </div>

          {/* This container holds the user info and sign-out button on the right */}
          <div className="flex flex-1 items-center justify-end space-x-4">
            <span className="text-sm text-gray-600 hidden sm:inline">
              Logged in as: <strong>{user?.signInDetails?.loginId || user?.username}</strong>
            </span>
            <button
              onClick={signOut}
              className="py-1 px-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700"
            >
              Sign out
            </button>
          </div>
        </header>
        {/* === UPDATED HEADER SECTION END === */}

        {/* Main content area (no changes here) */}
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