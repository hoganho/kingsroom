// src/contexts/EntityContext.tsx
// Enhanced Entity Context with multi-select support

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
// FIX: Attempting to resolve import error by changing to the v5 package name
import { generateClient } from '@aws-amplify/api'; 
import { listEntities } from '../graphql/queries';
import { Entity } from '../types/entity';

interface EntityContextType {
  // All available entities
  entities: Entity[];
  
  // Single entity selection (for scraping/input)
  currentEntity: Entity | null;
  setCurrentEntity: (entity: Entity) => void;
  
  // Multi-entity selection (for viewing)
  selectedEntities: Entity[];
  setSelectedEntities: (entities: Entity[]) => void;
  toggleEntitySelection: (entity: Entity) => void;
  selectAllEntities: () => void;
  clearEntitySelection: () => void;
  
  // State
  loading: boolean;
  error: string | null;
  refreshEntities: () => Promise<void>;
}

const EntityContext = createContext<EntityContextType | undefined>(undefined);

export const useEntity = () => {
  const context = useContext(EntityContext);
  if (!context) {
    throw new Error('useEntity must be used within an EntityProvider');
  }
  return context;
};

interface EntityProviderProps {
  children: ReactNode;
}

export const EntityProvider: React.FC<EntityProviderProps> = ({ children }) => {
  const client = generateClient();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [currentEntity, setCurrentEntityState] = useState<Entity | null>(null);
  const [selectedEntities, setSelectedEntitiesState] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshEntities = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await client.graphql({
        query: listEntities,
        variables: {
          filter: { isActive: { eq: true } }
        }
      }) as any;

      if (response.data?.listEntities?.items) {
        const activeEntities = response.data.listEntities.items
          .filter((e: Entity) => e && !e._deleted)
          .sort((a: Entity, b: Entity) => a.entityName.localeCompare(b.entityName));
        
        setEntities(activeEntities);

        // === MODIFICATION FOR DEFAULT ENTITY ID START ===
        const DEFAULT_ENTITY_ID = "42101695-1332-48e3-963b-3c6ad4e909a0";
        const savedEntityId = localStorage.getItem('selectedEntityId');
        const savedSelectedIds = JSON.parse(localStorage.getItem('selectedEntityIds') || '[]');
        
        let entityToSet: Entity | null = null;

        // 1. Try to load from localStorage
        if (savedEntityId) {
          entityToSet = activeEntities.find((e: Entity) => e.id === savedEntityId) || null;
        }

        // 2. If not in localStorage, try to set default entity
        if (!entityToSet) {
          entityToSet = activeEntities.find((e: Entity) => e.id === DEFAULT_ENTITY_ID) || null;
        }
        
        // 3. If default not found (or list is empty), fall back to first entity
        if (!entityToSet && activeEntities.length > 0) {
          entityToSet = activeEntities[0];
        }

        // 4. Set the state and localStorage
        if (entityToSet) {
          setCurrentEntityState(entityToSet);
          localStorage.setItem('selectedEntityId', entityToSet.id);
        } else {
          // No active entities found
          setCurrentEntityState(null);
          localStorage.removeItem('selectedEntityId');
        }
        // === MODIFICATION FOR DEFAULT ENTITY ID END ===
        
        // Restore multi-entity selection
        if (savedSelectedIds.length > 0) {
          const savedSelected = activeEntities.filter((e: Entity) => 
            savedSelectedIds.includes(e.id)
          );
          setSelectedEntitiesState(savedSelected);
        } else {
          // Default to all entities selected
          setSelectedEntitiesState(activeEntities);
          localStorage.setItem('selectedEntityIds', JSON.stringify(activeEntities.map((e: Entity) => e.id)));
        }
      }
    } catch (err) {
      console.error('Error fetching entities:', err);
      setError('Failed to load entities');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshEntities();
  }, []);

  // Set single entity (for scraping)
  const setCurrentEntity = (entity: Entity) => {
    setCurrentEntityState(entity);
    localStorage.setItem('selectedEntityId', entity.id);
    
    // Dispatch event for components that need to react
    window.dispatchEvent(new CustomEvent('entityChanged', { 
      detail: entity 
    }));
  };

  // Set multiple entities (for viewing)
  const setSelectedEntities = (entities: Entity[]) => {
    setSelectedEntitiesState(entities);
    localStorage.setItem('selectedEntityIds', JSON.stringify(entities.map(e => e.id)));
    
    // Dispatch event for components that need to react
    window.dispatchEvent(new CustomEvent('selectedEntitiesChanged', { 
      detail: entities 
    }));
  };

  // Toggle entity in selection
  const toggleEntitySelection = (entity: Entity) => {
    setSelectedEntitiesState(prev => {
      const isSelected = prev.some(e => e.id === entity.id);
      const newSelection = isSelected
        ? prev.filter(e => e.id !== entity.id)
        : [...prev, entity];
      
      localStorage.setItem('selectedEntityIds', JSON.stringify(newSelection.map(e => e.id)));
      
      // Dispatch event
      window.dispatchEvent(new CustomEvent('selectedEntitiesChanged', { 
        detail: newSelection 
      }));
      
      return newSelection;
    });
  };

  // Select all entities
  const selectAllEntities = () => {
    setSelectedEntities(entities);
  };

  // Clear entity selection
  const clearEntitySelection = () => {
    setSelectedEntities([]);
  };

  const contextValue: EntityContextType = {
    entities,
    currentEntity,
    setCurrentEntity,
    selectedEntities,
    setSelectedEntities,
    toggleEntitySelection,
    selectAllEntities,
    clearEntitySelection,
    loading,
    error,
    refreshEntities,
  };

  return (
    <EntityContext.Provider value={contextValue}>
      {children}
    </EntityContext.Provider>
  );
};

// Hook to get entity from URL
export const useEntityFromUrl = (url: string): Entity | null => {
  const { entities } = useEntity();
  
  if (!url || entities.length === 0) {
    return null;
  }

  try {
    const urlObj = new URL(url);
    const domain = `${urlObj.protocol}//${urlObj.hostname}`;
    
    // Find entity that matches the domain
    return entities.find(entity => 
      entity.gameUrlDomain.toLowerCase() === domain.toLowerCase()
    ) || null;
  } catch (error) {
    console.error('Error parsing URL:', error);
    return null;
  }
};

// Utility function to build game URL for an entity
export const buildGameUrl = (entity: Entity, tournamentId: number | string): string => {
  return `${entity.gameUrlDomain}${entity.gameUrlPath}${tournamentId}`;
};

// Utility function to extract tournament ID from URL
export const extractTournamentId = (url: string): number | null => {
  try {
    const match = url.match(/[?&]id=(\d+)/);
    return match ? parseInt(match[1]) : null;
  } catch (error) {
    console.error('Error extracting tournament ID:', error);
    return null;
  }
};

// Helper to check if we should filter by entity
export const shouldFilterByEntity = (pageType: 'player' | 'viewing' | 'input'): boolean => {
  switch (pageType) {
    case 'player':
      return false; // Never filter player pages
    case 'viewing':
      return true; // Filter by selected entities
    case 'input':
      return true; // Filter by single entity
    default:
      return true;
  }
};