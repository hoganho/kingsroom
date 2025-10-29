// src/components/auth/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom';
// ✅ Import UserRole from API, not AuthContext
import { UserRole } from '../../API';
import { useAuth, useRole } from '../../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
  fallback?: string; // Where to redirect if access denied
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRoles,
  fallback = '/login', // You might want to change this default
}) => {
  const { user, loading } = useAuth();
  const { hasAnyRole } = useRole();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  // The Authenticator component handles this, but this is a good safeguard
  if (!user || !user.isAuthenticated) {
    return <Navigate to={fallback} replace />;
  }

  // Check role-based access if required
  if (requiredRoles && requiredRoles.length > 0) {
    if (!hasAnyRole(requiredRoles)) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Access Denied
            </h1>
            <p className="text-gray-600">
              You don't have permission to access this page.
            </p>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
};

