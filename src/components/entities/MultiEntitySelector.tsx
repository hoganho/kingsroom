// src/components/entities/MultiEntitySelector.tsx
// Multi-select entity dropdown for viewing pages

import React, { Fragment, useState } from 'react';
import { Transition } from '@headlessui/react';
import { ChevronUpDownIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { BuildingOffice2Icon } from '@heroicons/react/24/outline';
import { useEntity } from '../../contexts/EntityContext';

interface MultiEntitySelectorProps {
  className?: string;
  showLabel?: boolean;
  placeholder?: string;
}

export const MultiEntitySelector: React.FC<MultiEntitySelectorProps> = ({ 
  className = '', 
  showLabel = true,
  placeholder = 'Select entities...'
}) => {
  const { 
    entities, 
    selectedEntities, 
    toggleEntitySelection, 
    selectAllEntities,
    clearEntitySelection,
    loading 
  } = useEntity();
  
  const [isOpen, setIsOpen] = useState(false);

  if (loading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        {showLabel && (
          <span className="text-sm font-medium text-gray-700">Entities:</span>
        )}
        <div className="w-64 h-9 bg-gray-100 animate-pulse rounded-md"></div>
      </div>
    );
  }

  if (entities.length === 0) {
    return (
      <div className={`text-sm text-gray-500 ${className}`}>
        No entities available
      </div>
    );
  }

  const isAllSelected = selectedEntities.length === entities.length;
  const selectedText = selectedEntities.length === 0 
    ? placeholder 
    : selectedEntities.length === entities.length
    ? 'All Entities'
    : selectedEntities.length === 1
    ? selectedEntities[0].entityName
    : `${selectedEntities.length} entities selected`;

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      {showLabel && (
        <span className="text-sm font-medium text-gray-700">Entities:</span>
      )}
      <div className="relative w-64">
        <div>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="relative w-full cursor-pointer rounded-md bg-white py-2 pl-3 pr-10 text-left shadow-sm ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 sm:text-sm"
          >
            <span className="flex items-center">
              <BuildingOffice2Icon className="h-4 w-4 text-gray-400 mr-2" />
              <span className="block truncate">{selectedText}</span>
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
            </span>
          </button>

          <Transition
            show={isOpen}
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="absolute z-10 mt-1 w-full overflow-auto rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm max-h-60">
              {/* Select All / Clear All buttons */}
              <div className="border-b border-gray-200 p-2 space-y-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isAllSelected) {
                      clearEntitySelection();
                    } else {
                      selectAllEntities();
                    }
                  }}
                  className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded"
                >
                  {isAllSelected ? 'Deselect All' : 'Select All'}
                </button>
                
                {selectedEntities.length > 0 && selectedEntities.length < entities.length && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearEntitySelection();
                    }}
                    className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded text-red-600"
                  >
                    Clear Selection
                  </button>
                )}
              </div>

              {/* Entity list */}
              <div className="py-1">
                {entities.map((entity) => {
                  const isSelected = selectedEntities.some(e => e.id === entity.id);
                  
                  return (
                    <div
                      key={entity.id}
                      className="relative cursor-pointer select-none py-2 pl-3 pr-9 hover:bg-indigo-50"
                      onClick={() => toggleEntitySelection(entity)}
                    >
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 text-indigo-600 rounded focus:ring-indigo-500"
                          checked={isSelected}
                          onChange={() => {}} // Handled by onClick
                        />
                        <span className="ml-3 block truncate">
                          {entity.entityName}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Transition>
        </div>

        {/* Selected entities tags */}
        {selectedEntities.length > 0 && selectedEntities.length < entities.length && (
          <div className="mt-2 flex flex-wrap gap-1">
            {selectedEntities.map(entity => (
              <span
                key={entity.id}
                className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800"
              >
                {entity.entityName}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleEntitySelection(entity);
                  }}
                  className="ml-1 inline-flex text-indigo-400 hover:text-indigo-600"
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Quick toggle buttons for common selections
export const EntityQuickFilters: React.FC = () => {
  const { entities, selectedEntities, setSelectedEntities, selectAllEntities } = useEntity();
  
  const presets = [
    { label: 'All', action: selectAllEntities },
    ...entities.map(entity => ({
      label: entity.entityName,
      action: () => setSelectedEntities([entity])
    }))
  ];
  
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map(preset => {
        const isActive = preset.label === 'All' 
          ? selectedEntities.length === entities.length
          : selectedEntities.length === 1 && selectedEntities[0].entityName === preset.label;
          
        return (
          <button
            key={preset.label}
            onClick={preset.action}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              isActive
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
};