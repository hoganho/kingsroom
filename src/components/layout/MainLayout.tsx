// src/components/layout/MainLayout.tsx
// Tremor-style main layout for Kingsroom

import { Sidebar } from "./Sidebar"

interface MainLayoutProps {
  children: React.ReactNode
}

/**
 * MainLayout - Root layout with responsive sidebar
 *
 * Desktop (≥1024px / lg):
 * - Fixed sidebar on left (w-72)
 * - Content offset by lg:pl-72
 *
 * Mobile (<1024px):
 * - Sticky header with hamburger menu
 * - Drawer navigation
 * - Full-width content
 */
export function MainLayout({ children }: MainLayoutProps) {
  return (
    <>
      {/* Sidebar handles both desktop sidebar and mobile header */}
      <Sidebar />

      {/* Main content area */}
      <main className="lg:pl-72">
        {/* Content wrapper with responsive padding */}
        <div className="p-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </>
  )
}

export default MainLayout
