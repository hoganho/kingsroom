// src/components/users/UserCreateModal.tsx
import { useState } from 'react';
import { generateClient } from 'aws-amplify/api';
import { 
  XMarkIcon, 
  ExclamationTriangleIcon, 
  InformationCircleIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline';
import { 
  adminCreateUserMutation, 
  User, 
  UserRole, 
  CreateUserInput,
  UserManagementResponse,
} from '../../graphql/userManagement';
import { DEFAULT_ROLE_PERMISSIONS } from '../../config/pagePermissions';

interface UserCreateModalProps {
  onClose: () => void;
  onUserCreated: (user: User) => void;
}

const ROLES: { value: UserRole; label: string; description: string }[] = [
  { 
    value: 'SUPER_ADMIN', 
    label: 'Super Admin',
    description: 'Full system access including user management'
  },
  { 
    value: 'ADMIN', 
    label: 'Admin',
    description: 'Manage venues, series, and most settings'
  },
  { 
    value: 'VENUE_MANAGER', 
    label: 'Venue Manager',
    description: 'Manage specific venues and their games'
  },
  { 
    value: 'TOURNAMENT_DIRECTOR', 
    label: 'Tournament Director',
    description: 'Run tournaments and manage game operations'
  },
  { 
    value: 'MARKETING', 
    label: 'Marketing',
    description: 'Access to player data and social features'
  },
];

export const UserCreateModal = ({ onClose, onUserCreated }: UserCreateModalProps) => {
  const client = generateClient();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    role: 'VENUE_MANAGER' as UserRole,
    useDefaultPermissions: true,
    isActive: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Success state - shows temporary password
  const [createdUser, setCreatedUser] = useState<User | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedRole = ROLES.find(r => r.value === formData.role);
  const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[formData.role] || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username.trim() || !formData.email.trim()) {
      setError('Username and email are required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const input: CreateUserInput = {
        username: formData.username.trim(),
        email: formData.email.trim().toLowerCase(),
        firstName: formData.firstName.trim() || undefined,
        lastName: formData.lastName.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        role: formData.role,
        isActive: formData.isActive,
        // If using default permissions, don't set allowedPages (null = use default)
        allowedPages: formData.useDefaultPermissions ? undefined : [],
      };

      const response = await client.graphql({
        query: adminCreateUserMutation,
        variables: { input },
      }) as { data: { adminCreateUser: UserManagementResponse } };

      const result = response.data.adminCreateUser;

      if (!result.success) {
        throw new Error(result.message || 'Failed to create user');
      }

      if (result.user) {
        setCreatedUser(result.user);
        setTemporaryPassword(result.temporaryPassword || null);
        onUserCreated(result.user);
      }
    } catch (err: any) {
      console.error('Error creating user:', err);
      // Extract error message from GraphQL errors
      const message = err.errors?.[0]?.message || err.message || 'Failed to create user';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!temporaryPassword) return;
    
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Success screen - show temporary password
  if (createdUser && temporaryPassword) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={onClose} />
          
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="text-center">
              <CheckCircleIcon className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                User Created Successfully
              </h2>
              <p className="text-gray-600 mb-6">
                {createdUser.firstName} {createdUser.lastName} ({createdUser.email}) has been created.
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <p className="text-sm font-medium text-amber-800 mb-2">
                Temporary Password
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white px-3 py-2 rounded border border-amber-300 font-mono text-sm">
                  {temporaryPassword}
                </code>
                <button
                  onClick={copyToClipboard}
                  className="p-2 text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
                  title="Copy to clipboard"
                >
                  <ClipboardDocumentIcon className="h-5 w-5" />
                </button>
              </div>
              {copied && (
                <p className="text-xs text-green-600 mt-1">Copied!</p>
              )}
              <p className="text-xs text-amber-700 mt-2">
                Share this password securely with the user. They will be prompted to change it on first login.
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        
        {/* Modal */}
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Create New User</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-700">{error}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="John"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Doe"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="johndoe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="john@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="+1 (555) 000-0000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value as UserRole }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {ROLES.map(role => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
              {selectedRole && (
                <p className="mt-1 text-sm text-gray-500">{selectedRole.description}</p>
              )}
            </div>

            {/* Default Permissions Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex gap-2">
                <InformationCircleIcon className="h-5 w-5 text-blue-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-800">
                    Default {selectedRole?.label} Permissions
                  </p>
                  <p className="text-sm text-blue-700 mt-1">
                    This role will have access to {defaultPermissions.length} pages by default.
                    You can customize permissions after creating the user.
                  </p>
                </div>
              </div>
            </div>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Account is active</span>
            </label>

            {/* Footer */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
