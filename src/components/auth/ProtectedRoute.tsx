// src/components/auth/ProtectedRoute.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useUserPermissions } from '../../hooks/useUserPermissions';
import type { UserRole } from '../../config/pagePermissions';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Optional: Require specific roles (in addition to page permission check) */
  requiredRoles?: UserRole[];
  /** Redirect path when not authenticated (default: /login) */
  fallback?: string;
}

/**
 * ProtectedRoute - Wraps routes that require authentication and authorization
 * 
 * Checks (in order):
 * 1. User is authenticated
 * 2. User has required role (if specified)
 * 3. User has permission to access the current path
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRoles,
  fallback = '/login',
}) => {
  const { user, loading } = useAuth();
  const { canAccess, hasRole } = useUserPermissions();
  const location = useLocation();

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  // Not authenticated - redirect to login
  if (!user?.isAuthenticated) {
    return <Navigate to={fallback} replace />;
  }

  // Role check (if specified)
  if (requiredRoles && requiredRoles.length > 0) {
    if (!hasRole(requiredRoles)) {
      console.warn(
        `[ProtectedRoute] Access denied - missing required role. User: ${user.role}, Required: ${requiredRoles.join(', ')}`
      );
      return <AccessDeniedScreen reason="role" />;
    }
  }

  // Page permission check
  if (!canAccess(location.pathname)) {
    console.warn(
      `[ProtectedRoute] Access denied - no permission for path: ${location.pathname}`
    );
    return <AccessDeniedScreen reason="page" />;
  }

  // All checks passed
  return <>{children}</>;
};

// ============================================
// ACCESS DENIED SCREEN
// ============================================

interface AccessDeniedScreenProps {
  reason?: 'role' | 'page';
}

const AccessDeniedScreen: React.FC<AccessDeniedScreenProps> = ({ reason = 'page' }) => {
  const message =
    reason === 'role'
      ? 'Your role does not have permission to view this page.'
      : 'You do not have permission to view this page.';

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="text-center max-w-md p-8 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800">
        {/* Warning Icon */}
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
          <svg
            className="h-6 w-6 text-red-600 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-2">
          Access Denied
        </h1>
        
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {message}
        </p>

        <div className="space-y-3">
          <button
            onClick={() => (window.location.href = '/home')}
            className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Go to Home
          </button>
          <button
            onClick={() => window.history.back()}
            className="w-full px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProtectedRoute;