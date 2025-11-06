// components/entities/EntitySelector.tsx
// Entity Management Component with full TypeScript type safety

import React, { useState, useEffect } from 'react';
import { generateClient, GraphQLResult } from 'aws-amplify/api';
import { setCurrentEntityId, fetchEntities } from '../../services/gameService';
import type { EntityConfig } from '../../types/game';

// GraphQL Response Types
interface CreateEntityResponse {
  createEntity: {
    id: string;
    entityName: string;
    gameUrlDomain: string;
    gameUrlPath: string;
    entityLogo?: string;
    isActive: boolean;
  };
}

interface UpdateEntityResponse {
  updateEntity: {
    id: string;
    isActive: boolean;
  };
}

// ✅ Component Props
export interface EntitySelectorProps {
  entityId?: string; // optional for flexible usage
  onEntityChange?: (entityId: string) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}

// New Entity Form Data
interface NewEntityData {
  entityName: string;
  gameUrlDomain: string;
  gameUrlPath: string;
  entityLogo?: string;
  isActive: boolean;
}

// Helper function to safely extract GraphQL data
function getGraphQLData<T>(response: GraphQLResult<T> | any): T | null {
  if ('data' in response && response.data) {
    return response.data;
  }
  return null;
}

export const EntitySelector: React.FC<EntitySelectorProps> = ({
  entityId,
  onEntityChange,
  disabled,
  className
}) => {
  const [entities, setEntities] = useState<EntityConfig[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string>(entityId || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEntities();
  }, []);

  useEffect(() => {
    if (entityId && entityId !== selectedEntityId) {
      setSelectedEntityId(entityId);
    }
  }, [entityId]);

  const loadEntities = async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchedEntities = await fetchEntities();
      setEntities(fetchedEntities);

      // Auto-select first if none selected
      if (fetchedEntities.length > 0 && !entityId) {
        const firstId = fetchedEntities[0].id;
        setSelectedEntityId(firstId);
        setCurrentEntityId(firstId);
        onEntityChange?.(firstId);
      }
    } catch (err) {
      console.error('Failed to load entities:', err);
      setError('Failed to load entities');
    } finally {
      setLoading(false);
    }
  };

  const handleEntityChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newEntityId = event.target.value;
    setSelectedEntityId(newEntityId);
    setCurrentEntityId(newEntityId);
    onEntityChange?.(newEntityId);
  };

  if (loading) {
    return (
      <div className={className}>
        <div className="animate-pulse bg-gray-200 h-10 rounded w-48"></div>
      </div>
    );
  }

  if (error) {
    return <div className={`text-red-500 ${className || ''}`}>{error}</div>;
  }

  return (
    <select
      value={selectedEntityId}
      onChange={handleEntityChange}
      disabled={disabled || loading}
      className={`px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${className || ''}`}
    >
      {entities.map((entity) => (
        <option key={entity.id} value={entity.id}>
          {entity.entityName || entity.id}
        </option>
      ))}
    </select>
  );
};

// ===== ENTITY MANAGER COMPONENT =====
interface EntityManagerProps {
  className?: string;
}

export const EntityManager: React.FC<EntityManagerProps> = ({ className }) => {
  const [entities, setEntities] = useState<EntityConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newEntity, setNewEntity] = useState<NewEntityData>({
    entityName: '',
    gameUrlDomain: '',
    gameUrlPath: '/',
    entityLogo: '',
    isActive: true
  });

  useEffect(() => {
    loadEntities();
  }, []);

  const loadEntities = async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchedEntities = await fetchEntities();
      setEntities(fetchedEntities);
    } catch (err) {
      console.error('Failed to load entities:', err);
      setError('Failed to load entities');
    } finally {
      setLoading(false);
    }
  };

  const createEntity = async () => {
    if (!newEntity.entityName || !newEntity.gameUrlDomain) {
      setError('Entity name and domain are required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const client = generateClient();

      const response = await client.graphql({
        query: /* GraphQL */ `
          mutation CreateEntity($input: CreateEntityInput!) {
            createEntity(input: $input) {
              id
              entityName
              gameUrlDomain
              gameUrlPath
              entityLogo
              isActive
            }
          }
        `,
        variables: { input: newEntity }
      });

      const data = getGraphQLData<CreateEntityResponse>(response);
      if (data?.createEntity) {
        await loadEntities();
        setIsCreating(false);
        setNewEntity({
          entityName: '',
          gameUrlDomain: '',
          gameUrlPath: '/',
          entityLogo: '',
          isActive: true
        });
      }
    } catch (err) {
      console.error('Failed to create entity:', err);
      setError('Failed to create entity');
    } finally {
      setLoading(false);
    }
  };

  const toggleEntityStatus = async (entityId: string, currentStatus: boolean) => {
    setLoading(true);
    setError(null);

    try {
      const client = generateClient();

      const targetEntity = entities.find(e => e.id === entityId);

      const response = await client.graphql({
        query: /* GraphQL */ `
          mutation UpdateEntity($input: UpdateEntityInput!) {
            updateEntity(input: $input) {
              id
              isActive
            }
          }
        `,
        variables: {
          input: {
            id: entityId,
            isActive: !currentStatus,
            ...(targetEntity && '_version' in targetEntity
              ? { _version: (targetEntity as any)._version }
              : {})
          }
        }
      });

      const data = getGraphQLData<UpdateEntityResponse>(response);
      if (data?.updateEntity) {
        await loadEntities();
      }
    } catch (err) {
      console.error('Failed to update entity:', err);
      setError('Failed to update entity status');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !isCreating) {
    return (
      <div className={`p-4 ${className || ''}`}>
        <div className="animate-pulse space-y-4">
          <div className="bg-gray-200 h-8 rounded w-48"></div>
          <div className="bg-gray-200 h-12 rounded"></div>
          <div className="bg-gray-200 h-12 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 ${className || ''}`}>
      <h3 className="text-lg font-semibold mb-4">Entity Management</h3>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      <div className="space-y-4">
        {!isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            + Create New Entity
          </button>
        )}

        {isCreating && (
          <div className="border rounded p-4 space-y-3 bg-gray-50">
            <h4 className="font-medium">Create New Entity</h4>
            <input
              type="text"
              placeholder="Entity Name"
              value={newEntity.entityName}
              onChange={(e) => setNewEntity({ ...newEntity, entityName: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Domain (e.g., example.com)"
              value={newEntity.gameUrlDomain}
              onChange={(e) => setNewEntity({ ...newEntity, gameUrlDomain: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Path (default: /)"
              value={newEntity.gameUrlPath}
              onChange={(e) => setNewEntity({ ...newEntity, gameUrlPath: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Logo URL (optional)"
              value={newEntity.entityLogo}
              onChange={(e) => setNewEntity({ ...newEntity, entityLogo: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center">
              <input
                type="checkbox"
                id="isActive"
                checked={newEntity.isActive}
                onChange={(e) => setNewEntity({ ...newEntity, isActive: e.target.checked })}
                className="mr-2"
              />
              <label htmlFor="isActive">Active</label>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={createEntity}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewEntity({
                    entityName: '',
                    gameUrlDomain: '',
                    gameUrlPath: '/',
                    entityLogo: '',
                    isActive: true
                  });
                }}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {entities.map((entity) => (
            <div
              key={entity.id}
              className="flex items-center justify-between p-3 border rounded bg-white"
            >
              <div className="flex items-center space-x-3">
                {entity.entityLogo && (
                  <img src={entity.entityLogo} alt={entity.entityName} className="h-8 w-8 rounded" />
                )}
                <div>
                  <p className="font-medium">{entity.entityName}</p>
                  <p className="text-sm text-gray-500">{entity.gameUrlDomain}</p>
                </div>
              </div>
              <button
                onClick={() => toggleEntityStatus(entity.id, entity.isActive || false)}
                disabled={loading}
                className={`px-3 py-1 text-sm rounded ${
                  entity.isActive
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                } disabled:opacity-50`}
              >
                {entity.isActive ? 'Active' : 'Inactive'}
              </button>
            </div>
          ))}

          {entities.length === 0 && !loading && (
            <p className="text-gray-500 text-center py-4">
              No entities found. Create one to get started.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default EntitySelector;