// src/contexts/EntityContext.tsx
// Enhanced Entity Context with user-based entity filtering
// UPDATED: Filters entities based on User.allowedEntityIds and User.defaultEntityId

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { useAuth } from './AuthContext';
import { Entity } from '../types/entity';

// Custom shallow query to avoid nested relationship issues
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
  // All entities (filtered by user permissions)
  entities: Entity[];
  
  // All entities before filtering (for admin purposes)
  allEntities: Entity[];
  
  // Single entity selection (for scraping/input)
  currentEntity: Entity | null;
  setCurrentEntity: (entity: Entity) => void;
  
  // Multi-entity selection (for viewing)
  selectedEntities: Entity[];
  setSelectedEntities: (entities: Entity[]) => void;
  toggleEntitySelection: (entity: Entity) => void;
  selectAllEntities: () => void;
  clearEntitySelection: () => void;
  
  // User's entity permissions
  userAllowedEntityIds: string[] | null;
  userDefaultEntityId: string | null;
  hasEntityRestrictions: boolean;
  
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
  
  // Get user from AuthContext
  const { user, userRole } = useAuth();
  
  const [allEntities, setAllEntities] = useState<Entity[]>([]);
  const [currentEntity, setCurrentEntityState] = useState<Entity | null>(null);
  const [selectedEntities, setSelectedEntitiesState] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Extract user's entity permissions
  // @ts-ignore - these fields exist on the user object from the backend
  const userAllowedEntityIds: string[] | null = user?.allowedEntityIds || null;
  // @ts-ignore
  const userDefaultEntityId: string | null = user?.defaultEntityId || null;
  
  // SUPER_ADMIN and ADMIN have no restrictions
  const isSuperUser = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';
  const hasEntityRestrictions = !isSuperUser && userAllowedEntityIds !== null && userAllowedEntityIds.length > 0;

  // Filter entities based on user permissions
  const entities = useMemo(() => {
    if (!hasEntityRestrictions) {
      // No restrictions - return all entities
      return allEntities;
    }
    
    // Filter to only allowed entities
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

  // Initialize entity selection when entities or user permissions change
  useEffect(() => {
    if (loading || entities.length === 0) return;

    const savedEntityId = localStorage.getItem('selectedEntityId');
    const savedSelectedIds = JSON.parse(localStorage.getItem('selectedEntityIds') || '[]');
    
    // === SINGLE ENTITY (currentEntity) ===
    let entityToSet: Entity | null = null;

    // 1. Priority: User's defaultEntityId (if set and user has access)
    if (userDefaultEntityId) {
      entityToSet = entities.find((e: Entity) => e.id === userDefaultEntityId) || null;
    }

    // 2. Fall back to localStorage (if user has access to it)
    if (!entityToSet && savedEntityId) {
      entityToSet = entities.find((e: Entity) => e.id === savedEntityId) || null;
    }
    
    // 3. Fall back to first available entity
    if (!entityToSet && entities.length > 0) {
      entityToSet = entities[0];
    }

    // 4. Set the state and localStorage
    if (entityToSet) {
      setCurrentEntityState(entityToSet);
      localStorage.setItem('selectedEntityId', entityToSet.id);
    } else {
      setCurrentEntityState(null);
      localStorage.removeItem('selectedEntityId');
    }
    
    // === MULTI-ENTITY (selectedEntities) ===
    // Filter saved selections to only include entities user has access to
    const validSavedIds = savedSelectedIds.filter((id: string) => 
      entities.some(e => e.id === id)
    );

    if (validSavedIds.length > 0) {
      // Restore valid saved selections
      const savedSelected = entities.filter((e: Entity) => 
        validSavedIds.includes(e.id)
      );
      setSelectedEntitiesState(savedSelected);
    } else {
      // Default to all available entities
      setSelectedEntitiesState(entities);
      localStorage.setItem('selectedEntityIds', JSON.stringify(entities.map((e: Entity) => e.id)));
    }
  }, [loading, entities, userDefaultEntityId]);

  // Fetch entities on mount
  useEffect(() => {
    refreshEntities();
  }, []);

  // Re-filter when user changes (e.g., login/logout)
  useEffect(() => {
    if (user && allEntities.length > 0) {
      // Entities list changed due to user permissions - reset selections if needed
      const stillValidCurrent = currentEntity && entities.some(e => e.id === currentEntity.id);
      if (!stillValidCurrent && entities.length > 0) {
        // Current entity no longer valid - reset to default
        const defaultEntity = userDefaultEntityId 
          ? entities.find(e => e.id === userDefaultEntityId) 
          : entities[0];
        if (defaultEntity) {
          setCurrentEntityState(defaultEntity);
          localStorage.setItem('selectedEntityId', defaultEntity.id);
        }
      }

      // Filter selected entities to only valid ones
      const validSelected = selectedEntities.filter(se => 
        entities.some(e => e.id === se.id)
      );
      if (validSelected.length !== selectedEntities.length) {
        const newSelection = validSelected.length > 0 ? validSelected : entities;
        setSelectedEntitiesState(newSelection);
        localStorage.setItem('selectedEntityIds', JSON.stringify(newSelection.map(e => e.id)));
      }
    }
  }, [user, entities.length]);

  // Set single entity (for scraping/input pages)
  const setCurrentEntity = (entity: Entity) => {
    // Verify user has access to this entity
    if (hasEntityRestrictions && !userAllowedEntityIds!.includes(entity.id)) {
      console.warn('User does not have access to entity:', entity.id);
      return;
    }
    
    setCurrentEntityState(entity);
    localStorage.setItem('selectedEntityId', entity.id);
    
    // Dispatch event for components that need to react
    window.dispatchEvent(new CustomEvent('entityChanged', { 
      detail: entity 
    }));
  };

  // Set multiple entities (for viewing pages)
  const setSelectedEntities = (entitiesToSelect: Entity[]) => {
    // Filter to only entities user has access to
    const validEntities = hasEntityRestrictions
      ? entitiesToSelect.filter(e => userAllowedEntityIds!.includes(e.id))
      : entitiesToSelect;
    
    setSelectedEntitiesState(validEntities);
    localStorage.setItem('selectedEntityIds', JSON.stringify(validEntities.map(e => e.id)));
    
    // Dispatch event for components that need to react
    window.dispatchEvent(new CustomEvent('selectedEntitiesChanged', { 
      detail: validEntities 
    }));
  };

  // Toggle entity in selection
  const toggleEntitySelection = (entity: Entity) => {
    // Verify user has access
    if (hasEntityRestrictions && !userAllowedEntityIds!.includes(entity.id)) {
      return;
    }
    
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

  // Select all entities (that user has access to)
  const selectAllEntities = () => {
    setSelectedEntities(entities);
  };

  // Clear entity selection
  const clearEntitySelection = () => {
    setSelectedEntities([]);
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