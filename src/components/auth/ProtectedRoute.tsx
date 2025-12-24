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
  /** 
   * If true, redirects to user's first accessible page when they don't have 
   * permission for the current route (instead of showing Access Denied screen).
   * Useful for landing pages like /home where you want graceful fallback.
   */
  redirectIfNoAccess?: boolean;
}

/**
 * ProtectedRoute - Wraps routes that require authentication and authorization
 * 
 * Checks (in order):
 * 1. User is authenticated
 * 2. User has required role (if specified)
 * 3. User has permission to access the current path
 * 
 * If redirectIfNoAccess is true, users without page access are redirected
 * to their first accessible page instead of seeing an Access Denied screen.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRoles,
  fallback = '/login',
  redirectIfNoAccess = false,
}) => {
  const { user, loading } = useAuth();
  const { canAccess, hasRole, firstAccessiblePage, hasAnyAccess } = useUserPermissions();
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
      
      // If redirectIfNoAccess is enabled, try to redirect instead of showing denied screen
      if (redirectIfNoAccess && firstAccessiblePage) {
        console.log(`[ProtectedRoute] Redirecting to first accessible page: ${firstAccessiblePage.path}`);
        return <Navigate to={firstAccessiblePage.path} replace />;
      }
      
      return <AccessDeniedScreen reason="role" />;
    }
  }

  // Page permission check
  if (!canAccess(location.pathname)) {
    console.warn(
      `[ProtectedRoute] Access denied - no permission for path: ${location.pathname}`
    );
    
    // If redirectIfNoAccess is enabled, redirect to first accessible page
    if (redirectIfNoAccess) {
      if (firstAccessiblePage) {
        console.log(`[ProtectedRoute] Redirecting to first accessible page: ${firstAccessiblePage.path}`);
        return <Navigate to={firstAccessiblePage.path} replace />;
      }
      
      // User has no accessible pages at all
      if (!hasAnyAccess) {
        return <NoAccessScreen />;
      }
    }
    
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

// ============================================
// NO ACCESS SCREEN (for users with zero page permissions)
// ============================================

const NoAccessScreen: React.FC = () => {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = React.useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      window.location.href = '/login';
    } catch (error) {
      console.error('Sign out failed:', error);
      setSigningOut(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="text-center max-w-md p-8 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800">
        {/* Lock Icon */}
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-4">
          <svg
            className="h-8 w-8 text-amber-600 dark:text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-3">
          Account Restricted
        </h2>

        <p className="text-gray-600 dark:text-gray-400 mb-2">
          Your account does not have permission to access any pages in this dashboard.
        </p>

        <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
          Please contact your administrator to request access.
        </p>

        {/* User info */}
        {user && (
          <div className="mb-6 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
            <div className="text-gray-500 dark:text-gray-400">Signed in as</div>
            <div className="font-medium text-gray-900 dark:text-gray-100">{user.email}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Role: {user.role?.replace('_', ' ')}
            </div>
          </div>
        )}

        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full px-4 py-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {signingOut ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Signing out...
            </span>
          ) : (
            'Sign Out'
          )}
        </button>
      </div>
    </div>
  );
};

export default ProtectedRoute;