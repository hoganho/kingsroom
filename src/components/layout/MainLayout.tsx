// src/components/layout/MainLayout.tsx - With Database Monitor

import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { Sidebar } from './Sidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { useAuth } from '../../contexts/AuthContext';
import { DatabaseChangeMonitor } from '../monitoring/DatabaseChangeMonitor';
import logo from '../../assets/Kings-Room-Logo_web.png';

export const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showMonitor, setShowMonitor] = useState(false); // Start hidden by default
  const { user, signOut, userRole } = useAuth();

  // Only show monitor toggle for SuperAdmin users
  const canShowMonitor = userRole === 'SuperAdmin';

  // Keyboard shortcut to toggle monitor (Ctrl/Cmd + Shift + D)
    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
            e.preventDefault();
            if (canShowMonitor) {
            setShowMonitor(prev => !prev);
            }
        }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [canShowMonitor]);

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100">
      {/* Desktop Sidebar - Always visible on md+ screens */}
      <div className="hidden md:flex md:flex-shrink-0">
        <div className="w-64 flex flex-col">
          <Sidebar />
        </div>
      </div>

      {/* Mobile Sidebar - Sliding Panel (Dialog) */}
      <Transition.Root show={sidebarOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-40 md:hidden"
          onClose={setSidebarOpen}
        >
          {/* Background overlay */}
          <Transition.Child
            as={Fragment}
            enter="transition-opacity ease-linear duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-600 bg-opacity-75" />
          </Transition.Child>

          {/* Sidebar panel */}
          <div className="fixed inset-0 z-40 flex">
            <Transition.Child
              as={Fragment}
              enter="transition ease-in-out duration-300 transform"
              enterFrom="-translate-x-full"
              enterTo="translate-x-0"
              leave="transition ease-in-out duration-300 transform"
              leaveFrom="translate-x-0"
              leaveTo="-translate-x-full"
            >
              <Dialog.Panel className="relative w-full max-w-xs h-full">
                {/* Close button */}
                <Transition.Child
                  as={Fragment}
                  enter="ease-in-out duration-300"
                  enterFrom="opacity-0"
                  enterTo="opacity-100"
                  leave="ease-in-out duration-300"
                  leaveFrom="opacity-100"
                  leaveTo="opacity-0"
                >
                  <div className="absolute top-0 right-0 -mr-12 pt-2">
                    <button
                      type="button"
                      className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <span className="sr-only">Close sidebar</span>
                      <XMarkIcon
                        className="h-6 w-6 text-white"
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </Transition.Child>
                
                {/* Render the Sidebar component with props */}
                <div className="h-full">
                  <Sidebar onClose={() => setSidebarOpen(false)} />
                </div>
              </Dialog.Panel>
            </Transition.Child>
            
            {/* Empty space to the right */}
            <div className="w-14 flex-shrink-0" aria-hidden="true" />
          </div>
        </Dialog>
      </Transition.Root>

      {/* Main Content Area - This is the key change */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Top Bar - Visible only on mobile */}
        <div className="md:hidden flex-shrink-0 flex h-16 items-center justify-between border-b border-gray-800 bg-black px-4">
          {/* Hamburger Button to open sidebar */}
          <button
            type="button"
            className="rounded-md p-2 text-gray-300 hover:bg-gray-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
            onClick={() => setSidebarOpen(true)}
          >
            <span className="sr-only">Open sidebar</span>
            <Bars3Icon className="h-6 w-6" aria-hidden="true" />
          </button>

          {/* Logo */}
          <img 
            src={logo} 
            alt="Kings Room Logo" 
            className="h-12 object-contain" 
          />

          {/* Sign Out Button */}
          <button
            onClick={signOut}
            className="text-sm font-medium text-red-500 hover:text-red-400"
          >
            Sign Out
          </button>
        </div>

        {/* Desktop Top Bar - Now truly fixed within the flex container */}
        <header className="flex-shrink-0 hidden h-16 items-center justify-between border-b border-gray-800 bg-black px-4 sm:px-6 lg:px-8 md:flex">
          <div className="flex-1"></div>
          <div className="flex flex-1 items-center justify-center">
            <img src={logo} alt="Kings Room Logo" className="h-12 object-contain" />
          </div>
          <div className="flex flex-1 items-center justify-end space-x-4">
            {/* Add monitor toggle button for SuperAdmin */}
            {canShowMonitor && (
              <button
                onClick={() => setShowMonitor(prev => !prev)}
                className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 border border-gray-600 rounded"
                title="Toggle Database Monitor (Ctrl+Shift+D)"
              >
                DB Monitor
              </button>
            )}
            <span className="text-sm text-gray-300 hidden sm:inline">
              Logged in as: <strong>{user?.email}</strong>
            </span>
            <button
              onClick={signOut}
              className="py-1 px-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Scrollable content area - This is the key fix */}
        <main className="flex-1 overflow-y-auto">
          {/* Page content with padding for mobile bottom nav */}
          <div className="pb-20 md:pb-6">{children}</div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
      
      {/* Floating Database Monitor - Only for SuperAdmin */}
      {canShowMonitor && showMonitor && <DatabaseChangeMonitor />}
    </div>
  );
};