// src/components/scraper/SaveConfirmation/SaveConfirmationContext.tsx
// Shared state management for SaveConfirmationModal
// Eliminates prop drilling by providing context to all child components

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { GameData, EntityConfig } from '../../../types/game';
import type { TournamentSeries, TournamentSeriesTitle } from '../../../types/series';
import type { EnrichedGameData } from '../../../types/enrichment';
import type { UseGameDataEditorReturn } from '../../../hooks/useGameDataEditor';
import { useConsolidationPreview } from '../../../hooks/useConsolidationPreview';

// ===================================================================
// TYPES
// ===================================================================

export interface VenueOption {
  id: string;
  name: string;
  venueNumber?: number;
  entityId?: string | null;
  fee?: number | null;
}

export interface RecurringGame {
  id: string;
  name: string;
  venueId: string;
  entityId?: string | null;
  dayOfWeek?: string | null;
  frequency?: string | null;
  gameType?: string | null;
  gameVariant?: string | null;
  typicalBuyIn?: number | null;
  typicalGuarantee?: number | null;
  startTime?: string | null;
  isActive?: boolean | null;
}

interface DropdownData {
  entities: EntityConfig[];
  venues: VenueOption[];
  series: TournamentSeries[];
  seriesTitles: TournamentSeriesTitle[];
  recurringGames: RecurringGame[];
}

interface LoadingStates {
  initial: boolean;
  venues: boolean;
  recurringGames: boolean;
  saving: boolean;
}

interface ConsolidationState {
  willConsolidate: boolean;
  parentName: string | null;
  preview: any | null;
  isLoading: boolean;
}

interface CreateState {
  isCreating: boolean;
  error: string | null;
  activeCard: 'entity' | 'venue' | null;
}

export interface SaveConfirmationContextValue {
  // Core
  editor: UseGameDataEditorReturn;
  originalGameData: EnrichedGameData | GameData;
  sourceUrl: string;
  autoMode: boolean;
  
  // Dropdown Data
  dropdownData: DropdownData;
  loadingStates: LoadingStates;
  
  // Filtered Data (computed)
  filteredVenues: VenueOption[];
  filteredSeries: TournamentSeries[];
  filteredRecurringGames: RecurringGame[];
  
  // Selected venue info (for display)
  venueName: string;
  venueFee: number | null;
  
  // Consolidation
  consolidation: ConsolidationState;
  
  // Create Entity/Venue state
  createState: CreateState;
  
  // Actions
  actions: {
    // Entity/Venue
    setVenueFee: (fee: number | null) => void;
    createEntity: (name: string, domain: string) => Promise<EntityConfig | null>;
    createVenue: (name: string, fee: number | null) => Promise<VenueOption | null>;
    setCreateActiveCard: (card: 'entity' | 'venue' | null) => void;
    
    // Refresh data
    refreshRecurringGames: () => Promise<void>;
    
    // Consolidation
    applyDetectedPattern: () => void;
  };
}

// ===================================================================
// GRAPHQL QUERIES
// ===================================================================

const listEntitiesQuery = /* GraphQL */ `
  query ListEntities($limit: Int, $nextToken: String) {
    listEntities(limit: $limit, nextToken: $nextToken) {
      items {
        id
        entityName
        gameUrlDomain
        isActive
      }
      nextToken
    }
  }
`;

const listVenuesQuery = /* GraphQL */ `
  query ListVenues($filter: ModelVenueFilterInput, $limit: Int) {
    listVenues(filter: $filter, limit: $limit) {
      items {
        id
        name
        venueNumber
        entityId
        fee
      }
      nextToken
    }
  }
`;

const listSeriesQuery = /* GraphQL */ `
  query ListSeries($limit: Int) {
    listTournamentSeries(limit: $limit) {
      items {
        id
        name
        year
        status
        venueId
        tournamentSeriesTitleId
        seriesCategory
        holidayType
        quarter
        month
        title {
          id
          title
          seriesCategory
        }
        venue {
          id
          name
        }
      }
      nextToken
    }
  }
`;

const listSeriesTitlesQuery = /* GraphQL */ `
  query ListSeriesTitles($limit: Int) {
    listTournamentSeriesTitles(limit: $limit) {
      items {
        id
        title
        aliases
        seriesCategory
      }
      nextToken
    }
  }
`;

const listRecurringGamesQuery = /* GraphQL */ `
  query ListRecurringGames($filter: ModelRecurringGameFilterInput, $limit: Int) {
    listRecurringGames(filter: $filter, limit: $limit) {
      items {
        id
        name
        venueId
        entityId
        dayOfWeek
        frequency
        gameType
        gameVariant
        typicalBuyIn
        typicalGuarantee
        startTime
        isActive
      }
      nextToken
    }
  }
`;

const getVenueQuery = /* GraphQL */ `
  query GetVenue($id: ID!) {
    getVenue(id: $id) {
      id
      name
      fee
    }
  }
`;

const createEntityMutation = /* GraphQL */ `
  mutation CreateEntity($input: CreateEntityInput!) {
    createEntity(input: $input) {
      id
      entityName
      gameUrlDomain
      isActive
    }
  }
`;

const createVenueMutation = /* GraphQL */ `
  mutation CreateVenue($input: CreateVenueInput!) {
    createVenue(input: $input) {
      id
      name
      venueNumber
      entityId
      fee
    }
  }
`;

// ===================================================================
// HELPER: Extract valid data from GraphQL response with errors
// ===================================================================

interface GraphQLResponseWithErrors<T> {
  data?: T;
  errors?: Array<{
    message: string;
    path?: (string | number)[];
  }>;
}

/**
 * Extracts valid items from a GraphQL list response that may contain errors.
 * GraphQL returns partial data when some items fail validation (e.g., null non-nullable fields).
 * This function filters out the invalid items that caused errors.
 */
function extractValidItems<T extends { id?: string }>(
  response: GraphQLResponseWithErrors<any>,
  dataPath: string,
  itemsKey: string = 'items'
): T[] {
  // Get the items array from the response data
  const items: (T | null)[] = response.data?.[dataPath]?.[itemsKey] || [];
  
  // If there are no errors, return all items
  if (!response.errors || response.errors.length === 0) {
    return items.filter((item): item is T => item !== null);
  }
  
  // Build a set of invalid item indices from error paths
  // Error paths look like: ['listTournamentSeries', 'items', 1, 'tournamentSeriesTitleId']
  const invalidIndices = new Set<number>();
  
  for (const error of response.errors) {
    if (error.path && error.path.length >= 3) {
      // Check if the error is for this data path
      if (error.path[0] === dataPath && error.path[1] === itemsKey) {
        const index = error.path[2];
        if (typeof index === 'number') {
          invalidIndices.add(index);
          console.warn(`[Context] Skipping invalid ${dataPath} item at index ${index}: ${error.message}`);
        }
      }
    }
  }
  
  // Filter out invalid items
  return items.filter((item, index): item is T => {
    if (item === null) return false;
    if (invalidIndices.has(index)) return false;
    return true;
  });
}

// ===================================================================
// CONTEXT
// ===================================================================

const SaveConfirmationContext = createContext<SaveConfirmationContextValue | null>(null);

export const useSaveConfirmationContext = (): SaveConfirmationContextValue => {
  const context = useContext(SaveConfirmationContext);
  if (!context) {
    throw new Error('useSaveConfirmationContext must be used within SaveConfirmationProvider');
  }
  return context;
};

// ===================================================================
// PROVIDER PROPS
// ===================================================================

interface SaveConfirmationProviderProps {
  children: React.ReactNode;
  editor: UseGameDataEditorReturn;
  originalGameData: EnrichedGameData | GameData;
  initialVenueId: string;
  initialEntityId?: string;
  sourceUrl: string;
  autoMode?: boolean;
}

// ===================================================================
// PROVIDER COMPONENT
// ===================================================================

export const SaveConfirmationProvider: React.FC<SaveConfirmationProviderProps> = ({
  children,
  editor,
  originalGameData,
  initialVenueId,
  initialEntityId,
  sourceUrl,
  autoMode = false,
}) => {
  // Lazy client
  const client = useMemo(() => generateClient(), []);
  
  // ===================================================================
  // STATE
  // ===================================================================
  
  // Dropdown data
  const [entities, setEntities] = useState<EntityConfig[]>([]);
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [series, setSeries] = useState<TournamentSeries[]>([]);
  const [seriesTitles, setSeriesTitles] = useState<TournamentSeriesTitle[]>([]);
  const [recurringGames, setRecurringGames] = useState<RecurringGame[]>([]);
  
  // Loading states
  const [initialLoading, setInitialLoading] = useState(true);
  const [venuesLoading] = useState(false); // Reserved for future use
  const [recurringGamesLoading, setRecurringGamesLoading] = useState(false);
  const [savingLoading] = useState(false); // Reserved for future use
  
  // Venue display info
  const [venueName, setVenueName] = useState('');
  const [venueFee, setVenueFee] = useState<number | null>(null);
  
  // Create state
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<'entity' | 'venue' | null>(null);
  
  // Consolidation state
  const [consolidationInfo, setConsolidationInfo] = useState<{
    willConsolidate: boolean;
    parentName: string | null;
  }>({ willConsolidate: false, parentName: null });
  
  // Get edited data from editor
  const { editedData, updateField, updateMultipleFields } = editor;
  
  // ===================================================================
  // CONSOLIDATION HOOK
  // ===================================================================
  
  const {
    preview: consolidationPreview,
    isLoading: consolidationLoading,
    willConsolidate,
  } = useConsolidationPreview(editedData, {
    debounceMs: 500,
    includeSiblingDetails: true,
    onPreviewComplete: (result) => {
      setConsolidationInfo({
        willConsolidate: result.willConsolidate,
        parentName: result.consolidation?.parentName || null,
      });
    },
  });
  
  // ===================================================================
  // DATA LOADING
  // ===================================================================
  
  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      setInitialLoading(true);
      
      try {
        // Load all dropdown data in parallel
        const [entitiesRes, venuesRes, seriesRes, titlesRes] = await Promise.all([
          client.graphql({ query: listEntitiesQuery, variables: { limit: 500 } }) as any,
          client.graphql({ query: listVenuesQuery, variables: { limit: 500 } }) as any,
          client.graphql({ query: listSeriesQuery, variables: { limit: 500 } }) as any,
          client.graphql({ query: listSeriesTitlesQuery, variables: { limit: 500 } }) as any,
        ]);
        
        // Handle entities (simple case - usually no errors)
        setEntities(entitiesRes.data?.listEntities?.items || []);
        
        // Handle venues (simple case - usually no errors)
        setVenues(venuesRes.data?.listVenues?.items || []);
        
        // Handle series - this may have partial errors due to null tournamentSeriesTitleId
        // Use the helper to extract only valid items
        if (seriesRes.errors && seriesRes.errors.length > 0) {
          console.warn('[Context] TournamentSeries query returned with errors (some items have invalid data):', 
            seriesRes.errors.length, 'errors');
          const validSeries = extractValidItems<TournamentSeries>(
            seriesRes, 
            'listTournamentSeries'
          );
          console.log('[Context] Loaded', validSeries.length, 'valid TournamentSeries records');
          setSeries(validSeries);
        } else {
          setSeries(seriesRes.data?.listTournamentSeries?.items || []);
        }
        
        // Handle series titles (simple case - usually no errors)
        setSeriesTitles(titlesRes.data?.listTournamentSeriesTitles?.items || []);
        
        // Load venue name if we have a venueId
        const venueId = editedData.venueId || initialVenueId;
        if (venueId) {
          try {
            const venueRes = await client.graphql({
              query: getVenueQuery,
              variables: { id: venueId },
            }) as any;
            
            if (venueRes.data?.getVenue) {
              setVenueName(venueRes.data.getVenue.name);
              setVenueFee(venueRes.data.getVenue.fee || null);
            }
          } catch (venueError) {
            console.warn('[Context] Error loading venue details:', venueError);
            // Non-critical, continue without venue details
          }
        }
        
        // Load recurring games for entity
        const entityId = editedData.entityId || initialEntityId;
        if (entityId) {
          await loadRecurringGames(entityId);
        }
        
      } catch (error) {
        // This catch block now only handles complete failures, not partial errors
        console.error('[Context] Critical error loading initial data:', error);
      } finally {
        setInitialLoading(false);
      }
    };
    
    loadInitialData();
  }, []); // Only run once on mount
  
  // Load recurring games when entity changes
  const loadRecurringGames = useCallback(async (entityId: string) => {
    if (!entityId) {
      setRecurringGames([]);
      return;
    }
    
    setRecurringGamesLoading(true);
    try {
      const response = await client.graphql({
        query: listRecurringGamesQuery,
        variables: {
          filter: { entityId: { eq: entityId } },
          limit: 1000,
        },
      }) as any;
      
      setRecurringGames(response.data?.listRecurringGames?.items || []);
    } catch (error) {
      console.error('[Context] Error loading recurring games:', error);
      setRecurringGames([]);
    } finally {
      setRecurringGamesLoading(false);
    }
  }, [client]);
  
  // Reload recurring games when entity changes
  useEffect(() => {
    const entityId = editedData.entityId || initialEntityId;
    if (entityId && !initialLoading) {
      loadRecurringGames(entityId);
    }
  }, [editedData.entityId, initialEntityId, initialLoading, loadRecurringGames]);
  
  // ===================================================================
  // FILTERED DATA (COMPUTED)
  // ===================================================================
  
  const filteredVenues = useMemo(() => {
    const entityId = editedData.entityId || initialEntityId;
    if (!entityId) return venues;
    return venues.filter(v => v.entityId === entityId || !v.entityId);
  }, [venues, editedData.entityId, initialEntityId]);
  
  const filteredSeries = useMemo(() => {
    const venueId = editedData.venueId || initialVenueId;
    if (!venueId) return series;
    return series.filter(s => s.venueId === venueId || !s.venueId);
  }, [series, editedData.venueId, initialVenueId]);
  
  const filteredRecurringGames = useMemo(() => {
    const venueId = editedData.venueId || initialVenueId;
    if (!venueId) return recurringGames;
    return recurringGames.filter(rg => rg.venueId === venueId);
  }, [recurringGames, editedData.venueId, initialVenueId]);
  
  // ===================================================================
  // ACTIONS
  // ===================================================================
  
  const createEntity = useCallback(async (name: string, domain: string): Promise<EntityConfig | null> => {
    setIsCreating(true);
    setCreateError(null);
    
    try {
      const response = await client.graphql({
        query: createEntityMutation,
        variables: {
          input: {
            entityName: name,
            gameUrlDomain: domain,
            isActive: true,
          },
        },
      }) as any;
      
      const newEntity = response.data.createEntity;
      setEntities(prev => [...prev, newEntity]);
      
      // Update editor
      updateField('entityId', newEntity.id);
      
      setActiveCard(null);
      return newEntity;
    } catch (error: any) {
      console.error('[Context] Error creating entity:', error);
      setCreateError(error.message || 'Failed to create entity');
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [client, updateField]);
  
  const createVenue = useCallback(async (name: string, fee: number | null): Promise<VenueOption | null> => {
    const entityId = editedData.entityId || initialEntityId;
    if (!entityId) {
      setCreateError('Please select an entity first');
      return null;
    }
    
    setIsCreating(true);
    setCreateError(null);
    
    try {
      const response = await client.graphql({
        query: createVenueMutation,
        variables: {
          input: {
            name,
            entityId,
            fee: fee || 0,
          },
        },
      }) as any;
      
      const newVenue = response.data.createVenue;
      setVenues(prev => [...prev, newVenue]);
      
      // Update editor and local state
      updateField('venueId', newVenue.id);
      setVenueName(newVenue.name);
      setVenueFee(newVenue.fee || null);
      
      setActiveCard(null);
      return newVenue;
    } catch (error: any) {
      console.error('[Context] Error creating venue:', error);
      setCreateError(error.message || 'Failed to create venue');
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [client, editedData.entityId, initialEntityId, updateField]);
  
  const applyDetectedPattern = useCallback(() => {
    if (!consolidationPreview?.detectedPattern) return;
    
    const { parsedDayNumber, parsedFlightLetter, isFinalDay } = consolidationPreview.detectedPattern;
    
    const updates: Partial<GameData> = {};
    if (parsedDayNumber) updates.dayNumber = parsedDayNumber;
    if (parsedFlightLetter) updates.flightLetter = parsedFlightLetter;
    if (isFinalDay) updates.finalDay = true;
    
    if (Object.keys(updates).length > 0) {
      updateMultipleFields(updates);
    }
  }, [consolidationPreview, updateMultipleFields]);
  
  const refreshRecurringGames = useCallback(async () => {
    const entityId = editedData.entityId || initialEntityId;
    if (entityId) {
      await loadRecurringGames(entityId);
    }
  }, [editedData.entityId, initialEntityId, loadRecurringGames]);
  
  // ===================================================================
  // CONTEXT VALUE
  // ===================================================================
  
  const value: SaveConfirmationContextValue = useMemo(() => ({
    // Core
    editor,
    originalGameData,
    sourceUrl,
    autoMode,
    
    // Dropdown data
    dropdownData: {
      entities,
      venues,
      series,
      seriesTitles,
      recurringGames,
    },
    loadingStates: {
      initial: initialLoading,
      venues: venuesLoading,
      recurringGames: recurringGamesLoading,
      saving: savingLoading,
    },
    
    // Filtered data
    filteredVenues,
    filteredSeries,
    filteredRecurringGames,
    
    // Venue info
    venueName,
    venueFee,
    
    // Consolidation
    consolidation: {
      willConsolidate,
      parentName: consolidationInfo.parentName,
      preview: consolidationPreview,
      isLoading: consolidationLoading,
    },
    
    // Create state
    createState: {
      isCreating,
      error: createError,
      activeCard,
    },
    
    // Actions
    actions: {
      setVenueFee,
      createEntity,
      createVenue,
      setCreateActiveCard: setActiveCard,
      refreshRecurringGames,
      applyDetectedPattern,
    },
  }), [
    editor,
    originalGameData,
    sourceUrl,
    autoMode,
    entities,
    venues,
    series,
    seriesTitles,
    recurringGames,
    initialLoading,
    venuesLoading,
    recurringGamesLoading,
    savingLoading,
    filteredVenues,
    filteredSeries,
    filteredRecurringGames,
    venueName,
    venueFee,
    willConsolidate,
    consolidationInfo.parentName,
    consolidationPreview,
    consolidationLoading,
    isCreating,
    createError,
    activeCard,
    createEntity,
    createVenue,
    refreshRecurringGames,
    applyDetectedPattern,
  ]);
  
  return (
    <SaveConfirmationContext.Provider value={value}>
      {children}
    </SaveConfirmationContext.Provider>
  );
};

export default SaveConfirmationContext;