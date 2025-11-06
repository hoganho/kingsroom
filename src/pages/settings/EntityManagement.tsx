// src/pages/settings/EntityManagement.tsx
// MERGED: Now includes the EntityDashboard for monitoring
// and the EntityTable for management.

import { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import { GraphQLResult } from '@aws-amplify/api';
import { createEntity, updateEntity, deleteEntity } from '../../graphql/mutations';
import { listEntities } from '../../graphql/queries';
import { EntityTable } from '../../components/entities/EntityTable';
import { EntityModal } from '../../components/entities/EntityModal';
import { DeleteConfirmationModal } from '../../components/entities/DeleteConfirmationModal';
import { Entity, EntityFormData } from '../../types/entity';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { EntityDashboard } from '../../components/entities/EntityDashboard';

const EntityManagement = () => {
  const client = generateClient();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingEntity, setDeletingEntity] = useState<Entity | null>(null);

  const fetchEntities = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await client.graphql({
        query: listEntities,
      }) as GraphQLResult<any>;

      if ('data' in response && response.data) {
        const entityItems = (response.data.listEntities.items as Entity[])
          .filter(Boolean)
          .sort((a, b) => a.entityName.localeCompare(b.entityName));

        setEntities(entityItems);
      } else {
        console.error('No data returned from listEntities');
        setError('Failed to fetch entities: No data received.');
      }
    } catch (err) {
      console.error('Error fetching entities:', err);
      setError('Failed to fetch entities. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntities();
  }, []);

  // Clear messages after a delay
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 7000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleAddEntity = () => {
    setEditingEntity(null);
    setIsModalOpen(true);
  };

  const handleEditEntity = (entity: Entity) => {
    setEditingEntity(entity);
    setIsModalOpen(true);
  };
  
  const handleDeleteEntity = (id: string) => {
    const entity = entities.find(e => e.id === id);
    if (entity) {
      setDeletingEntity(entity);
      setIsDeleteModalOpen(true);
    }
  };

  const handleToggleStatus = async (entity: Entity) => {
    try {
      await client.graphql({
        query: updateEntity,
        variables: { 
          input: { 
            id: entity.id,
            _version: entity._version,
            isActive: !entity.isActive
          } 
        },
      });
      
      setSuccessMessage(`${entity.entityName} has been ${!entity.isActive ? 'activated' : 'deactivated'}`);
      fetchEntities();
    } catch (err) {
      console.error('Error toggling entity status:', err);
      setError('Failed to update entity status. Please try again.');
    }
  };

  const handleSaveEntity = async (entityData: EntityFormData) => {
    
    const cleanedData: any = { ...entityData };
    if (cleanedData.entityLogo === "") {
      cleanedData.entityLogo = null;
    }
    
    try {
      if (editingEntity) {
        await client.graphql({
          query: updateEntity,
          variables: { 
            input: { 
              id: editingEntity.id,
              _version: editingEntity._version,
              ...cleanedData
            } 
          },
        });
        setSuccessMessage(`${entityData.entityName} has been updated successfully`);
      } else {
       
        await client.graphql({
          query: createEntity,
          variables: { 
            input: { 
              ...cleanedData
            } 
          },
        });
        setSuccessMessage(`${entityData.entityName} has been created successfully`);
      }
      
      setIsModalOpen(false);
      fetchEntities();
    } catch (err) {
      console.error('Error saving entity:', err);
      setError('Failed to save entity. Please ensure all required fields are filled correctly.');
    }
  };
  
  const confirmDelete = async () => {
    if (!deletingEntity) return;

    try {
      await client.graphql({
        query: deleteEntity,
        variables: { 
          input: { 
            id: deletingEntity.id,
            _version: deletingEntity._version 
          } 
        }
      });
      
      setSuccessMessage(`${deletingEntity.entityName} has been deleted`);
      setIsDeleteModalOpen(false);
      setDeletingEntity(null);
      fetchEntities();
    } catch (err) {
      console.error('Error deleting entity:', err);
      setError('Failed to delete entity. It may have associated data that needs to be removed first.');
    }
  };

  return (
    <PageWrapper
      title="Entity Management"
      maxWidth="7xl"
      actions={
        <button
          type="button"
          onClick={handleAddEntity}
          className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
        >
          Add Entity
        </button>
      }
    >
      {/* --- MERGED ---: Added Entity Dashboard section at the top */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900">Entity Dashboard</h2>
        <p className="mt-1 text-sm text-gray-700">
          Select an entity to view its live statistics and recent activity.
        </p>
        <EntityDashboard className="mt-4" />
      </div>
      
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          {/* --- MERGED ---: Changed title to differentiate from the dashboard */}
          <h1 className="text-xl font-semibold text-gray-900">All Entities</h1>
          <p className="mt-2 text-sm text-gray-700">
            Configure, edit, or remove all business entities in the system.
          </p>
        </div>
      </div>

      {/* Info box about entities */}
      <div className="mt-4 rounded-md bg-blue-50 p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <InformationCircleIcon className="h-5 w-5 text-blue-400" aria-hidden="true" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">About Entities</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>
                Entities represent different organizations or brands. 
                Games, venues, and assets belong to specific entities, while players can 
                participate across all entities.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
          <p className="text-green-700 text-sm">{successMessage}</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Entities Table */}
      <div className="mt-8">
        <EntityTable
          entities={entities}
          loading={loading}
          onEdit={handleEditEntity}
          onDelete={handleDeleteEntity}
          onToggleStatus={handleToggleStatus}
        />
      </div>

      {/* Entity Modal (remains unchanged) */}
      <EntityModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveEntity}
        entity={editingEntity}
      />

      {/* Delete Confirmation Modal (remains unchanged) */}
      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        entityName={deletingEntity?.entityName}
      />
    </PageWrapper>
  );
};

export default EntityManagement;