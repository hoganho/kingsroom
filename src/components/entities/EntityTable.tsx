// src/components/entities/EntityTable.tsx
// Table component for displaying entities

import { Entity } from '../../types/entity';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

interface EntityTableProps {
  entities: Entity[];
  loading: boolean;
  onEdit: (entity: Entity) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (entity: Entity) => void;
}

export const EntityTable = ({ 
  entities, 
  loading, 
  onEdit, 
  onDelete,
  onToggleStatus 
}: EntityTableProps) => {
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (entities.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No entities found. Add your first entity to get started.</p>
      </div>
    );
  }

  const formatUrl = (domain: string, path: string) => {
    return `${domain}${path}[ID]`;
  };

  return (
    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
      <table className="min-w-full divide-y divide-gray-300">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Entity Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              URL Pattern
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Created
            </th>
            <th className="relative px-6 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {entities.map((entity) => (
            <tr key={entity.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                  {entity.entityName}
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="text-sm text-gray-900 font-mono break-all">
                  {formatUrl(entity.gameUrlDomain, entity.gameUrlPath)}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <button
                  onClick={() => onToggleStatus(entity)}
                  className="flex items-center space-x-1 text-sm"
                >
                  {entity.isActive ? (
                    <>
                      <CheckCircleIcon className="h-5 w-5 text-green-500" />
                      <span className="text-green-700">Active</span>
                    </>
                  ) : (
                    <>
                      <XCircleIcon className="h-5 w-5 text-red-500" />
                      <span className="text-red-700">Inactive</span>
                    </>
                  )}
                </button>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {entity.createdAt ? new Date(entity.createdAt).toLocaleDateString() : 'N/A'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button
                  onClick={() => onEdit(entity)}
                  className="text-indigo-600 hover:text-indigo-900 mr-4"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(entity.id)}
                  className="text-red-600 hover:text-red-900"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
