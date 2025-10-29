// src/components/layout/MainLayout.tsx
// No major changes needed here, the problem is primarily in the Sidebar component's styling.
// The existing `md:pl-64` on `<main>` is correct and will work once the sidebar is fixed.

import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { Sidebar } from './Sidebar'; // Corrected import path assuming it's in the same folder
import { MobileBottomNav } from './MobileBottomNav';
import { useAuth } from '../../contexts/AuthContext';

export const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-gray-100">
      {/* --- Desktop Sidebar --- */}
      {/* This will now be fixed on desktop and hidden on mobile */}
      <div className="hidden md:flex md:flex-shrink-0">
          <Sidebar />
      </div>

      {/* --- Mobile Top Bar --- */}
      <div className="md:hidden sticky top-0 z-10 flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
        {/* ... (rest of mobile top bar is fine) ... */}
        {/* Hamburger Button */}
        <button
          type="button"
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
          onClick={() => setSidebarOpen(true)}
        >
          <span className="sr-only">Open sidebar</span>
          <Bars3Icon className="h-6 w-6" aria-hidden="true" />
        </button>

        {/* Centered Title */}
        <h1 className="text-lg font-bold text-gray-800 font-display">
          Kings Room
        </h1>

        {/* Sign Out Button */}
        <button
          onClick={signOut}
          className="text-sm font-medium text-red-600 hover:text-red-800"
        >
          Sign Out
        </button>
      </div>

      {/* --- Mobile Sidebar (Sliding Panel) --- */}
      <Transition.Root show={sidebarOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-40 md:hidden"
          onClose={setSidebarOpen}
        >
          {/* ... (rest of mobile sidebar is fine) ... */}
          {/* Overlay */}
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

          {/* Panel */}
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
              <Dialog.Panel className="relative flex w-full max-w-xs flex-1 flex-col bg-white">
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
                {/* We render the Sidebar component inside the panel for mobile */}
                <Sidebar /> 
              </Dialog.Panel>
            </Transition.Child>
            <div className="w-14 flex-shrink-0" aria-hidden="true" />
          </div>
        </Dialog>
      </Transition.Root>

      {/* --- Main Content Area --- */}
      {/* This `md:pl-64` correctly makes space for the now-fixed desktop sidebar */}
      <main className="flex-1 md:pl-64">
        {/* Desktop Top Bar */}
        <header className="sticky top-0 z-10 hidden h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6 lg:px-8 md:flex">
          {/* ... (rest of desktop top bar is fine) ... */}
           {/* Left spacer */}
          <div className="flex-1"></div>

          {/* Centered title */}
          <div className="flex-1 text-center">
            <h1 className="text-2xl font-bold text-gray-800 font-display">
              Kings Room Concepts
            </h1>
          </div>

          {/* Right side - user info and sign out */}
          <div className="flex flex-1 items-center justify-end space-x-4">
            <span className="text-sm text-gray-600 hidden sm:inline">
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

        {/* Page content with bottom padding for mobile nav */}
        <div className="pb-20 md:pb-6">{children}</div>
      </main>

      {/* --- Mobile Bottom Nav --- */}
      <MobileBottomNav />
    </div>
  );
};