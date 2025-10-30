// src/components/layout/MainLayout.tsx

import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { Sidebar } from './Sidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { useAuth } from '../../contexts/AuthContext';
import logo from '../../assets/Kings-Room-Logo_web.png';

export const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="hidden md:flex md:flex-shrink-0">
          <Sidebar />
      </div>

      {/* --- Mobile Top Bar --- */}
      <div className="md:hidden sticky top-0 z-10 flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-800 bg-black px-4">
        {/* Hamburger Button */}
        <button
          type="button"
          className="rounded-md p-2 text-gray-300 hover:bg-gray-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
          onClick={() => setSidebarOpen(true)}
        >
          <span className="sr-only">Open sidebar</span>
          <Bars3Icon className="h-6 w-6" aria-hidden="true" />
        </button>

        {/* ✅ CHANGE: Replaced the h1 text with the logo image */}
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

      {/* --- Mobile Sidebar (Sliding Panel) --- */}
      <Transition.Root show={sidebarOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-40 md:hidden"
          onClose={setSidebarOpen}
        >
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
                <Sidebar /> 
              </Dialog.Panel>
            </Transition.Child>
            <div className="w-14 flex-shrink-0" aria-hidden="true" />
          </div>
        </Dialog>
      </Transition.Root>

      {/* --- Main Content Area --- */}
      <main className="flex-1 md:pl-64">
        {/* Desktop Top Bar */}
        <header className="sticky top-0 z-10 hidden h-16 flex-shrink-0 items-center justify-between border-b border-gray-800 bg-black px-4 sm:px-6 lg:px-8 md:flex">
           <div className="flex-1"></div>
          <div className="flex flex-1 items-center justify-center">
            <img src={logo} alt="Kings Room Logo" className="h-12 object-contain" />
          </div>
          <div className="flex flex-1 items-center justify-end space-x-4">
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

        <div className="pb-20 md:pb-6">{children}</div>
      </main>

      <MobileBottomNav />
    </div>
  );
};