// src/components/auth/ProtectedRoute.tsx
import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, useRole } from '../../contexts/AuthContext';
import { UserRole } from '../../API';
import { hasPageAccess } from '../../config/pagePermissions';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
  fallback?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRoles,
  fallback = '/login',
}) => {
  const { user, loading } = useAuth();
  const { hasAnyRole } = useRole();
  const location = useLocation();

  useEffect(() => {
    if (!loading && user) {
      // DEBUG: This will show in your browser console
      console.debug('🛡️ Route Access Check:', {
        path: location.pathname,
        role: user.role,
        hasCustomPermissions: Array.isArray(user.allowedPages),
        allowedPagesCount: user.allowedPages?.length,
        accessGranted: hasPageAccess(location.pathname, user.role, user.allowedPages)
      });
    }
  }, [location.pathname, user, loading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // 1. Auth Check
  if (!user || !user.isAuthenticated) {
    return <Navigate to={fallback} replace />;
  }

  // 2. Role Check (from props)
  if (requiredRoles && requiredRoles.length > 0) {
    if (!hasAnyRole(requiredRoles)) {
      console.warn(`⛔ Access Denied: Missing required role. User: ${user.role}, Required: ${requiredRoles.join(', ')}`);
      return <AccessDeniedScreen />;
    }
  }

  // 3. Page Permission Check (Global Config)
  if (!hasPageAccess(location.pathname, user.role, user.allowedPages)) {
    console.warn(`⛔ Access Denied: No permission for path ${location.pathname}`);
    return <AccessDeniedScreen />;
  }

  return <>{children}</>;
};

const AccessDeniedScreen = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <div className="text-center max-w-md p-8 bg-white rounded-xl shadow-lg border border-gray-100">
      <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
        <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Access Denied
      </h1>
      <p className="text-gray-600 mb-6">
        You do not have permission to view this page.
      </p>
      <div className="space-y-3">
        <button 
          onClick={() => window.location.href = '/home'}
          className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Go to Home
        </button>
        <button 
          onClick={() => window.history.back()}
          className="w-full px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Go Back
        </button>
      </div>
    </div>
  </div>
);