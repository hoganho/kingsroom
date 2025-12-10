// src/contexts/EntityContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { useAuth } from './AuthContext';
import { Entity } from '../types/entity';

// Custom shallow query to avoid nested relationship issues when fetching lists
const listEntitiesShallow = /* GraphQL */ `
  query ListEntitiesShallow(
    $filter: ModelEntityFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listEntities(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        entityName
        gameUrlDomain
        gameUrlPath
        entityLogo
        isActive
        defaultVenueId
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
      }
      nextToken
    }
  }
`;

interface EntityContextType {
  // All entities available to the system (filtered by user permissions)
  entities: Entity[];
  
  // All entities unfiltered (for admin use cases)
  allEntities: Entity[];
  
  // Single entity selection (The "Write" Context - used for scraping, inputs, defaults)
  currentEntity: Entity | null;
  setCurrentEntity: (entity: Entity) => void;
  
  // Multi-entity selection (The "Read" Context - used for dashboards, viewing lists)
  selectedEntities: Entity[];
  setSelectedEntities: (entities: Entity[]) => void;
  toggleEntitySelection: (entity: Entity) => void;
  selectAllEntities: () => void;
  clearEntitySelection: () => void;
  
  // Helper to check if a specific entity is currently selected in the multi-select view
  isEntitySelected: (entityId: string) => boolean;
  
  // User's entity permissions
  userAllowedEntityIds: string[] | null;
  userDefaultEntityId: string | null;
  hasEntityRestrictions: boolean;
  
  // State flags
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
  
  // Get user from AuthContext
  const { user, userRole } = useAuth();
  
  const [allEntities, setAllEntities] = useState<Entity[]>([]);
  const [currentEntity, setCurrentEntityState] = useState<Entity | null>(null);
  const [selectedEntities, setSelectedEntitiesState] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Extract user's entity permissions from the AuthUser object
  // @ts-ignore - allowedEntityIds exists on the custom AppUser type
  const userAllowedEntityIds: string[] | null = user?.allowedEntityIds || null;
  // @ts-ignore - defaultEntityId exists on the custom AppUser type
  const userDefaultEntityId: string | null = user?.defaultEntityId || null;
  
  // SUPER_ADMIN and ADMIN have no restrictions
  const isSuperUser = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';
  const hasEntityRestrictions = !isSuperUser && userAllowedEntityIds !== null && userAllowedEntityIds.length > 0;

  // Filter the master list of entities based on user permissions
  const entities = useMemo(() => {
    if (!hasEntityRestrictions) {
      // No restrictions - return all active entities
      return allEntities;
    }
    
    // Filter to only entities present in the user's allowed list
    return allEntities.filter(entity => 
      userAllowedEntityIds!.includes(entity.id)
    );
  }, [allEntities, hasEntityRestrictions, userAllowedEntityIds]);

  const refreshEntities = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await client.graphql({
        query: listEntitiesShallow,
        variables: {
          filter: { isActive: { eq: true } }
        }
      }) as any;

      if (response.data?.listEntities?.items) {
        const activeEntities = response.data.listEntities.items
          .filter((e: Entity) => e && !e._deleted)
          .sort((a: Entity, b: Entity) => a.entityName.localeCompare(b.entityName));
        
        setAllEntities(activeEntities);
      }
    } catch (err) {
      console.error('Error fetching entities:', err);
      setError('Failed to load entities');
    } finally {
      setLoading(false);
    }
  };

  // Logic: Initialize Selections (Single and Multi)
  useEffect(() => {
    if (loading || entities.length === 0) return;

    const savedEntityId = localStorage.getItem('selectedEntityId');
    const savedSelectedIds = JSON.parse(localStorage.getItem('selectedEntityIds') || '[]');
    
    // === 1. Single Selection Logic (Global Context/Sidebar) ===
    // Priority: LocalStorage -> User Default -> First Available
    let entityToSet: Entity | null = null;

    if (savedEntityId) {
      entityToSet = entities.find((e: Entity) => e.id === savedEntityId) || null;
    }

    if (!entityToSet && userDefaultEntityId) {
      entityToSet = entities.find((e: Entity) => e.id === userDefaultEntityId) || null;
    }
    
    if (!entityToSet && entities.length > 0) {
      entityToSet = entities[0];
    }

    // Set the state
    if (entityToSet) {
      setCurrentEntityState(entityToSet);
      // Only write to localStorage if it wasn't there (to avoid overwriting user preference)
      if (!savedEntityId) {
        localStorage.setItem('selectedEntityId', entityToSet.id);
      }
    } else {
      setCurrentEntityState(null);
      localStorage.removeItem('selectedEntityId');
    }
    
    // === 2. Multi Selection Logic (Dashboard/Viewing) ===
    // Priority: LocalStorage -> Fallback to Current Single Entity
    const validSavedIds = savedSelectedIds.filter((id: string) => 
      entities.some(e => e.id === id)
    );

    if (validSavedIds.length > 0) {
      // Case A: Restore valid saved selections from previous session
      const savedSelected = entities.filter((e: Entity) => 
        validSavedIds.includes(e.id)
      );
      setSelectedEntitiesState(savedSelected);
    } else {
      // Case B: No valid saved selection found, default to the Single Entity calculated above
      if (entityToSet) {
        setSelectedEntitiesState([entityToSet]);
        localStorage.setItem('selectedEntityIds', JSON.stringify([entityToSet.id]));
      } else {
        // Fallback: Select all if no single entity is determined
        setSelectedEntitiesState(entities);
        localStorage.setItem('selectedEntityIds', JSON.stringify(entities.map((e: Entity) => e.id)));
      }
    }
  }, [loading, entities, userDefaultEntityId]);

  // Fetch entities on mount
  useEffect(() => {
    refreshEntities();
  }, []);

  // Re-validate selections when user permissions change (e.g. login/logout)
  useEffect(() => {
    if (user && allEntities.length > 0) {
      // 1. Validate Single Entity
      const stillValidCurrent = currentEntity && entities.some(e => e.id === currentEntity.id);
      if (!stillValidCurrent && entities.length > 0) {
        const defaultEntity = userDefaultEntityId 
          ? entities.find(e => e.id === userDefaultEntityId) 
          : entities[0];
        if (defaultEntity) {
          setCurrentEntityState(defaultEntity);
          localStorage.setItem('selectedEntityId', defaultEntity.id);
        }
      }

      // 2. Validate Multi Selection
      const validSelected = selectedEntities.filter(se => 
        entities.some(e => e.id === se.id)
      );
      
      // If the validated list differs from state, update it
      if (validSelected.length !== selectedEntities.length) {
        // If selection becomes empty due to permissions, default to the Single Entity or All
        let newSelection = validSelected;
        if (newSelection.length === 0) {
            newSelection = currentEntity ? [currentEntity] : entities;
        }
        
        setSelectedEntitiesState(newSelection);
        localStorage.setItem('selectedEntityIds', JSON.stringify(newSelection.map(e => e.id)));
      }
    }
  }, [user, entities.length]);

  // === Actions ===

  // Set single entity (Global Context - Sidebar)
  // NOTE: This usually implies the user wants to switch context completely, 
  // so we also reset the multi-selection to match this single entity.
  const setCurrentEntity = (entity: Entity) => {
    // Verify user has access to this entity
    if (hasEntityRestrictions && !userAllowedEntityIds!.includes(entity.id)) {
      console.warn('User does not have access to entity:', entity.id);
      return;
    }
    
    setCurrentEntityState(entity);
    localStorage.setItem('selectedEntityId', entity.id);
    
    // Sync Multi-Selection to this new context (Reset View)
    setSelectedEntities([entity]);
    
    // Dispatch event for components that need to react immediately outside of React tree
    window.dispatchEvent(new CustomEvent('entityChanged', { 
      detail: entity 
    }));
  };

  // Set multiple entities (Viewing Context - Dashboards)
  // This does NOT change the Single Entity state.
  const setSelectedEntities = (entitiesToSelect: Entity[]) => {
    // Filter to only entities user has access to
    const validEntities = hasEntityRestrictions
      ? entitiesToSelect.filter(e => userAllowedEntityIds!.includes(e.id))
      : entitiesToSelect;
    
    setSelectedEntitiesState(validEntities);
    localStorage.setItem('selectedEntityIds', JSON.stringify(validEntities.map(e => e.id)));
    
    window.dispatchEvent(new CustomEvent('selectedEntitiesChanged', { 
      detail: validEntities 
    }));
  };

  // Toggle a single entity in the multi-selection list
  const toggleEntitySelection = (entity: Entity) => {
    if (hasEntityRestrictions && !userAllowedEntityIds!.includes(entity.id)) {
      return;
    }
    
    setSelectedEntitiesState(prev => {
      const isSelected = prev.some(e => e.id === entity.id);
      const newSelection = isSelected
        ? prev.filter(e => e.id !== entity.id)
        : [...prev, entity];
      
      localStorage.setItem('selectedEntityIds', JSON.stringify(newSelection.map(e => e.id)));
      
      window.dispatchEvent(new CustomEvent('selectedEntitiesChanged', { 
        detail: newSelection 
      }));
      
      return newSelection;
    });
  };

  const selectAllEntities = () => {
    setSelectedEntities(entities);
  };

  const clearEntitySelection = () => {
    setSelectedEntities([]);
  };

  // Helper to check if an entity is selected in the current view
  const isEntitySelected = (entityId: string) => {
    return selectedEntities.some(e => e.id === entityId);
  };

  const contextValue: EntityContextType = {
    entities,
    allEntities,
    currentEntity,
    setCurrentEntity,
    selectedEntities,
    setSelectedEntities,
    toggleEntitySelection,
    selectAllEntities,
    clearEntitySelection,
    isEntitySelected, // Exposed helper
    userAllowedEntityIds,
    userDefaultEntityId,
    hasEntityRestrictions,
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

// Hook to get entity from URL (Helper)
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