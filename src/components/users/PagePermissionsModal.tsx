// src/components/users/PagePermissionsModal.tsx
import { useState, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { 
  XMarkIcon, 
  ExclamationTriangleIcon, 
  CheckIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { updateUserMutation, User } from '../../graphql/userManagement';
import { 
  ALL_PAGES, 
  PageConfig, 
  PageCategory, 
  CATEGORY_LABELS,
  DEFAULT_ROLE_PERMISSIONS,
  getGroupedPages
} from '../../config/pagePermissions';

const client = generateClient();

interface PagePermissionsModalProps {
  user: User;
  onClose: () => void;
  onPermissionsUpdated: (user: User) => void;
}

const CATEGORY_ORDER: PageCategory[] = [
  'core',
  'players',
  'games', 
  'series',
  'venues',
  'social',
  'settings',
  'scraper',
  'debug'
];

export const PagePermissionsModal = ({ user, onClose, onPermissionsUpdated }: PagePermissionsModalProps) => {
  // Initialize with user's current permissions, or default role permissions if none set
  const initialPages = useMemo(() => {
    if (user.allowedPages && user.allowedPages.length > 0) {
      return new Set(user.allowedPages);
    }
    return new Set(DEFAULT_ROLE_PERMISSIONS[user.role] || []);
  }, [user]);

  const [selectedPages, setSelectedPages] = useState<Set<string>>(initialPages);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupedPages = useMemo(() => getGroupedPages(), []);
  const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[user.role] || [];

  // Filter pages based on search
  const filteredGroupedPages = useMemo(() => {
    if (!searchTerm) return groupedPages;
    
    const filtered: Record<PageCategory, PageConfig[]> = {} as any;
    
    CATEGORY_ORDER.forEach(category => {
      const pages = groupedPages[category]?.filter(page =>
        page.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        page.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
        page.description.toLowerCase().includes(searchTerm.toLowerCase())
      ) || [];
      
      if (pages.length > 0) {
        filtered[category] = pages;
      }
    });
    
    return filtered;
  }, [groupedPages, searchTerm]);

  const togglePage = (path: string) => {
    setSelectedPages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const toggleCategory = (category: PageCategory) => {
    const categoryPages = groupedPages[category] || [];
    const allSelected = categoryPages.every(p => selectedPages.has(p.path));
    
    setSelectedPages(prev => {
      const newSet = new Set(prev);
      categoryPages.forEach(page => {
        if (allSelected) {
          newSet.delete(page.path);
        } else {
          newSet.add(page.path);
        }
      });
      return newSet;
    });
  };

  const selectAll = () => {
    setSelectedPages(new Set(ALL_PAGES.map(p => p.path)));
  };

  const clearAll = () => {
    // Keep only always-allowed pages
    setSelectedPages(new Set(ALL_PAGES.filter(p => p.alwaysAllowed).map(p => p.path)));
  };

  const resetToDefault = () => {
    setSelectedPages(new Set(defaultPermissions));
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      // Compare with default - if same as default, save as null (use default)
      const selectedArray = Array.from(selectedPages).sort();
      const defaultArray = [...defaultPermissions].sort();
      const isDefault = 
        selectedArray.length === defaultArray.length &&
        selectedArray.every((p, i) => p === defaultArray[i]);

      const response = await client.graphql({
        query: updateUserMutation,
        variables: {
          input: {
            id: user.id,
            // Save null if using defaults, otherwise save the custom permissions
            allowedPages: isDefault ? null : Array.from(selectedPages),
          },
        },
      }) as { data: { updateUser: User } };

      onPermissionsUpdated(response.data.updateUser);
      onClose();
    } catch (err: any) {
      console.error('Error updating permissions:', err);
      setError(err.message || 'Failed to update permissions');
    } finally {
      setLoading(false);
    }
  };

  const isDefault = useMemo(() => {
    const selectedArray = Array.from(selectedPages).sort();
    const defaultArray = [...defaultPermissions].sort();
    return (
      selectedArray.length === defaultArray.length &&
      selectedArray.every((p, i) => p === defaultArray[i])
    );
  }, [selectedPages, defaultPermissions]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        
        {/* Modal */}
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Edit Page Permissions</h2>
              <p className="text-sm text-gray-500">
                {user.firstName && user.lastName 
                  ? `${user.firstName} ${user.lastName}` 
                  : user.username}
                {' · '}
                <span className="text-indigo-600">{user.role.replace('_', ' ')}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Toolbar */}
          <div className="p-4 border-b bg-gray-50 flex-shrink-0">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="flex-1 relative">
                <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search pages..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              
              {/* Quick Actions */}
              <div className="flex gap-2">
                <button
                  onClick={resetToDefault}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <ArrowPathIcon className="h-4 w-4 mr-1" />
                  Reset to Default
                </button>
                <button
                  onClick={selectAll}
                  className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Select All
                </button>
                <button
                  onClick={clearAll}
                  className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-3 flex items-center gap-4 text-sm">
              <span className="text-gray-600">
                <strong>{selectedPages.size}</strong> of {ALL_PAGES.length} pages selected
              </span>
              {isDefault && (
                <span className="inline-flex items-center px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs">
                  <CheckIcon className="h-3 w-3 mr-1" />
                  Using default permissions
                </span>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-50 border-b border-red-200 flex-shrink-0">
              <div className="flex items-start gap-2">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-700">{error}</span>
              </div>
            </div>
          )}

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-6">
              {CATEGORY_ORDER.map(category => {
                const pages = filteredGroupedPages[category];
                if (!pages || pages.length === 0) return null;

                const allSelected = pages.every(p => selectedPages.has(p.path));
                const someSelected = pages.some(p => selectedPages.has(p.path));

                return (
                  <div key={category} className="border rounded-lg overflow-hidden">
                    {/* Category Header */}
                    <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someSelected && !allSelected;
                          }}
                          onChange={() => toggleCategory(category)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-medium text-gray-900">
                          {CATEGORY_LABELS[category]}
                        </span>
                      </label>
                      <span className="text-sm text-gray-500">
                        {pages.filter(p => selectedPages.has(p.path)).length} / {pages.length}
                      </span>
                    </div>

                    {/* Pages */}
                    <div className="divide-y">
                      {pages.map(page => {
                        const isSelected = selectedPages.has(page.path);
                        const isDefaultSelected = defaultPermissions.includes(page.path);

                        return (
                          <label
                            key={page.path}
                            className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                              isSelected ? 'bg-indigo-50/50' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => togglePage(page.path)}
                              disabled={page.alwaysAllowed}
                              className="h-4 w-4 mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium ${isSelected ? 'text-gray-900' : 'text-gray-600'}`}>
                                  {page.label}
                                </span>
                                {page.alwaysAllowed && (
                                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                                    Always On
                                  </span>
                                )}
                                {isDefaultSelected && !page.alwaysAllowed && (
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                                    Default
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-500 truncate">{page.description}</p>
                              <code className="text-xs text-gray-400">{page.path}</code>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t bg-gray-50 flex-shrink-0">
            <p className="text-sm text-gray-500">
              {isDefault 
                ? 'User will use default role permissions'
                : 'User will use custom permissions'}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};