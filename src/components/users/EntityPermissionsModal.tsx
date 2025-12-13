// src/components/users/EntityPermissionsModal.tsx
// Modal for SUPER_ADMINs to manage which entities a user can access

import { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import {
  XMarkIcon,
  BuildingOffice2Icon,
  CheckIcon,
  ExclamationTriangleIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { adminUpdateUserMutation, User } from '../../graphql/userManagement';
import { useEntity } from '../../contexts/EntityContext';

interface EntityPermissionsModalProps {
  user: User;
  onClose: () => void;
  onPermissionsUpdated: (updatedUser: User) => void;
}

export const EntityPermissionsModal: React.FC<EntityPermissionsModalProps> = ({
  user,
  onClose,
  onPermissionsUpdated,
}) => {
  const client = generateClient();
  const { allEntities, loading: entitiesLoading } = useEntity();
  
  // Parse user's current entity permissions
  const parseEntityIds = (ids: string[] | null | undefined): string[] => {
    if (!ids) return [];
    if (Array.isArray(ids)) return ids.filter((id): id is string => id != null);
    return [];
  };

  const [allowedEntityIds, setAllowedEntityIds] = useState<Set<string>>(
    new Set(parseEntityIds(user.allowedEntityIds as string[] | null))
  );
  const [defaultEntityId, setDefaultEntityId] = useState<string | null>(
    user.defaultEntityId || null
  );
  const [grantAllAccess, setGrantAllAccess] = useState<boolean>(
    !user.allowedEntityIds || (user.allowedEntityIds as string[]).length === 0
  );
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When "grant all access" changes, update the selection
  useEffect(() => {
    if (grantAllAccess) {
      setAllowedEntityIds(new Set());
    }
  }, [grantAllAccess]);

  // Ensure default entity is in the allowed list
  useEffect(() => {
    if (defaultEntityId && !grantAllAccess && !allowedEntityIds.has(defaultEntityId)) {
      setDefaultEntityId(null);
    }
  }, [allowedEntityIds, grantAllAccess, defaultEntityId]);

  const toggleEntity = (entityId: string) => {
    if (grantAllAccess) return;
    
    setAllowedEntityIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entityId)) {
        newSet.delete(entityId);
        // If removing the default entity, clear it
        if (defaultEntityId === entityId) {
          setDefaultEntityId(null);
        }
      } else {
        newSet.add(entityId);
      }
      return newSet;
    });
  };

  const setAsDefault = (entityId: string) => {
    // Can only set as default if entity is allowed (or grant all is on)
    if (grantAllAccess || allowedEntityIds.has(entityId)) {
      setDefaultEntityId(entityId === defaultEntityId ? null : entityId);
    }
  };

  const selectAll = () => {
    setAllowedEntityIds(new Set(allEntities.map(e => e.id)));
  };

  const clearAll = () => {
    setAllowedEntityIds(new Set());
    setDefaultEntityId(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // If grant all access, send empty array (null means no restrictions)
      const entityIdsToSave = grantAllAccess 
        ? [] 
        : Array.from(allowedEntityIds);

      const response = await client.graphql({
        query: adminUpdateUserMutation,
        variables: {
          input: {
            id: user.id,
            allowedEntityIds: entityIdsToSave,
            defaultEntityId: defaultEntityId,
          },
        },
      }) as { data: { adminUpdateUser: { success: boolean; message?: string; user?: User } } };

      const result = response.data.adminUpdateUser;
      
      if (result.success && result.user) {
        onPermissionsUpdated(result.user);
        onClose();
      } else {
        setError(result.message || 'Failed to update permissions');
      }
    } catch (err: any) {
      console.error('Error updating entity permissions:', err);
      setError(err.message || 'Failed to update entity permissions');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black bg-opacity-30 transition-opacity" 
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                <BuildingOffice2Icon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                  Entity Permissions
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {user.firstName} {user.lastName} ({user.username})
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Grant All Access Toggle */}
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border dark:border-gray-700">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={grantAllAccess}
                  onChange={(e) => setGrantAllAccess(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <div>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    Grant access to all entities
                  </span>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    User will automatically have access to any new entities created in the future.
                  </p>
                </div>
              </label>
            </div>

            {/* Entity Selection */}
            {!grantAllAccess && (
              <>
                {/* Quick Actions */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Select Entities ({allowedEntityIds.size} selected)
                  </h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
                    >
                      Select All
                    </button>
                    <span className="text-gray-300 dark:text-gray-600">|</span>
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                {/* Entity List */}
                {entitiesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full" />
                  </div>
                ) : allEntities.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No entities available
                  </div>
                ) : (
                  <div className="space-y-2">
                    {allEntities.map((entity) => {
                      const isAllowed = allowedEntityIds.has(entity.id);
                      const isDefault = defaultEntityId === entity.id;

                      return (
                        <div
                          key={entity.id}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                            isAllowed
                              ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800'
                              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                        >
                          <label className="flex items-center gap-3 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={isAllowed}
                              onChange={() => toggleEntity(entity.id)}
                              className="h-4 w-4 text-indigo-600 rounded focus:ring-indigo-500"
                            />
                            <div className="flex items-center gap-2">
                              {entity.entityLogo ? (
                                <img
                                  src={entity.entityLogo}
                                  alt=""
                                  className="h-8 w-8 rounded object-cover"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                                  <BuildingOffice2Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                </div>
                              )}
                              <div>
                                <span className="font-medium text-gray-900 dark:text-gray-100">
                                  {entity.entityName}
                                </span>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {entity.gameUrlDomain}
                                </p>
                              </div>
                            </div>
                          </label>

                          {/* Set as Default Button */}
                          <button
                            type="button"
                            onClick={() => setAsDefault(entity.id)}
                            disabled={!isAllowed}
                            className={`p-2 rounded-lg transition-colors ${
                              isDefault
                                ? 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
                                : isAllowed
                                ? 'text-gray-400 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                                : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                            }`}
                            title={isDefault ? 'Default entity' : 'Set as default'}
                          >
                            {isDefault ? (
                              <StarIconSolid className="h-5 w-5" />
                            ) : (
                              <StarIcon className="h-5 w-5" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* Default Entity for Grant All Access */}
            {grantAllAccess && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Default Entity (optional)
                </label>
                <select
                  value={defaultEntityId || ''}
                  onChange={(e) => setDefaultEntityId(e.target.value || null)}
                  className="w-full rounded-lg border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="">No default (use first entity)</option>
                  {allEntities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.entityName}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  The default entity will be pre-selected when the user logs in.
                </p>
              </div>
            )}

            {/* Info Box */}
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <h4 className="text-sm font-medium text-blue-800 dark:text-blue-400 mb-1">
                How Entity Permissions Work
              </h4>
              <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                <li>• Users can only view and manage data for their allowed entities</li>
                <li>• The default entity (★) is pre-selected when they log in</li>
                <li>• SUPER_ADMIN and ADMIN roles always have access to all entities</li>
                <li>• If no entities are selected, the user won't be able to access entity-specific pages</li>
              </ul>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {grantAllAccess ? (
                <span className="text-green-600 dark:text-green-400 font-medium">
                  ✓ Full access to all entities
                </span>
              ) : (
                <>
                  {allowedEntityIds.size} of {allEntities.length} entities selected
                  {defaultEntityId && (
                    <span className="ml-2 text-yellow-600 dark:text-yellow-400">
                      • Default: {allEntities.find(e => e.id === defaultEntityId)?.entityName}
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || (!grantAllAccess && allowedEntityIds.size === 0)}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckIcon className="h-4 w-4" />
                    Save Permissions
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EntityPermissionsModal;