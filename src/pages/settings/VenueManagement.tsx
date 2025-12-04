// src/pages/settings/VenueManagement.tsx

import { useState, useEffect, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { GraphQLResult } from '@aws-amplify/api';
import { listVenuesShallow, listEntitiesShallow } from '../../graphql/customQueries';
import { createVenue, updateVenue, deleteVenue } from '../../graphql/mutations';
import { VenueModal } from '../../components/venues/VenueModal';
import { DeleteConfirmationModal } from '../../components/venues/DeleteConfirmationModal';
import * as APITypes from '../../API';
import { VenueFormData } from '../../types/venue';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { ChevronUpIcon, ChevronDownIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/generalHelpers';

type Venue = APITypes.Venue;
type Entity = Pick<APITypes.Entity, 'id' | 'entityName'>;

type SortDirection = 'asc' | 'desc';
type SortField = 'name' | 'venueNumber' | 'city' | 'fee';

// ✅ FIX: Create client outside component to prevent recreation on every render
const client = generateClient();

const VenueManagement = () => {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextVenueNumber, setNextVenueNumber] = useState<number>(1);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingVenueId, setDeletingVenueId] = useState<string | null>(null);

  // Filter state - selected entity IDs
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set());
  const [showEntityFilter, setShowEntityFilter] = useState(false);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // ✅ FIX: Regular functions, not useCallback with unstable dependencies
  const fetchEntities = async () => {
    try {
      const response = await client.graphql<GraphQLResult<APITypes.ListEntitiesShallowQuery>>({
        query: listEntitiesShallow
      });
      if ('data' in response && response.data) {
        const entityItems = (response.data.listEntities.items as Entity[])
          .filter(Boolean)
          .sort((a, b) => a.entityName.localeCompare(b.entityName));
        setEntities(entityItems);
      }
    } catch (err) {
      console.error('Error fetching entities:', err);
    }
  };

  const fetchVenues = async () => {
    console.log('[VenueManagement] Fetching venues...');
    try {
      const response = await client.graphql<GraphQLResult<APITypes.ListVenuesShallowQuery>>({
        query: listVenuesShallow,
        variables: {
          filter: {
            isSpecial: { ne: true }
          }
        }
      });

      if ('data' in response && response.data) {
        const venueItems = (response.data.listVenues.items as Venue[]).filter(Boolean);
        
        console.log('[VenueManagement] Fetched venues:', venueItems.length);
        if (venueItems.length > 0) {
          console.log('[VenueManagement] Sample venue data:', {
            name: venueItems[0].name,
            fee: venueItems[0].fee,
            hasFeeProp: 'fee' in venueItems[0]
          });
        }

        setVenues(venueItems);

        const maxVenueNumber = venueItems.reduce((max, venue) => {
          return venue.venueNumber !== undefined && venue.venueNumber > max
            ? venue.venueNumber
            : max;
        }, 0);

        setNextVenueNumber(maxVenueNumber + 1);
      } else {
        console.error('No data returned from listVenuesShallow');
        setError('Failed to fetch venues: No data received.');
      }
    } catch (err) {
      console.error('Error fetching venues:', err);
      setError('Failed to fetch venues. Please try again.');
    }
  };

  // ✅ FIX: Empty dependency array - only run on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      await Promise.all([fetchVenues(), fetchEntities()]);
      setLoading(false);
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtered and sorted venues
  const filteredAndSortedVenues = useMemo(() => {
    let result = [...venues];

    // Apply entity filter
    if (selectedEntityIds.size > 0) {
      result = result.filter(venue => 
        venue.entityId && selectedEntityIds.has(venue.entityId)
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'venueNumber':
          comparison = (a.venueNumber ?? 0) - (b.venueNumber ?? 0);
          break;
        case 'city':
          comparison = (a.city || '').localeCompare(b.city || '');
          break;
        case 'fee':
          comparison = (a.fee ?? 0) - (b.fee ?? 0);
          break;
        default:
          comparison = 0;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [venues, selectedEntityIds, sortField, sortDirection]);

  // Handle sort click
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Render sort icon
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ChevronUpIcon className="h-4 w-4 text-gray-300" />;
    }
    return sortDirection === 'asc' 
      ? <ChevronUpIcon className="h-4 w-4 text-indigo-600" />
      : <ChevronDownIcon className="h-4 w-4 text-indigo-600" />;
  };

  // Toggle entity filter
  const toggleEntityFilter = (entityId: string) => {
    setSelectedEntityIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entityId)) {
        newSet.delete(entityId);
      } else {
        newSet.add(entityId);
      }
      return newSet;
    });
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedEntityIds(new Set());
  };

  // Get entity name by ID
  const getEntityName = (entityId: string | null | undefined): string => {
    if (!entityId) return '—';
    const entity = entities.find(e => e.id === entityId);
    return entity?.entityName || '—';
  };

  const handleAddVenue = () => {
    setEditingVenue(null);
    setIsModalOpen(true);
  };

  const handleEditVenue = (venue: Venue) => {
    console.log('[VenueManagement] Editing venue:', venue);
    console.log('[VenueManagement] Venue fee:', venue.fee);
    setEditingVenue(venue);
    setIsModalOpen(true);
  };

  const handleDeleteVenue = (id: string) => {
    setDeletingVenueId(id);
    setIsDeleteModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingVenue(null);
  };

  const handleSaveVenue = async (venueData: VenueFormData) => {
    console.log('[VenueManagement] Saving venue data:', venueData);
    console.log('[VenueManagement] Fee value:', venueData.fee, 'Type:', typeof venueData.fee);
    
    try {
      const { name, address, city, country, aliases, entityId, fee } = venueData;

      if (editingVenue) {
        const updateInput = {
          _version: editingVenue._version,
          id: editingVenue.id,
          name,
          address: address || null,
          city: city || null,
          country: country || null,
          aliases: aliases.length > 0 ? aliases : null,
          entityId: entityId || null,
          fee: fee !== null && fee !== undefined ? fee : null,
          venueNumber: editingVenue.venueNumber
        };
        
        console.log('[VenueManagement] Update mutation input:', updateInput);
        
        const result = await client.graphql({
          query: updateVenue,
          variables: { input: updateInput },
        });
        
        console.log('[VenueManagement] Update result:', result);
      } else {
        const createInput = {
          name,
          address: address || null,
          city: city || null,
          country: country || null,
          aliases: aliases.length > 0 ? aliases : null,
          entityId: entityId || null,
          fee: fee !== null && fee !== undefined ? fee : null,
          venueNumber: nextVenueNumber
        };
        
        console.log('[VenueManagement] Create mutation input:', createInput);
        
        const result = await client.graphql({
          query: createVenue,
          variables: { input: createInput },
        });
        
        console.log('[VenueManagement] Create result:', result);
      }

      handleModalClose();
      await fetchVenues();
      
    } catch (err: any) {
      console.error('[VenueManagement] Error saving venue:', err);
      console.error('[VenueManagement] Error details:', JSON.stringify(err, null, 2));

      const isConflict = err?.errors?.some(
        (e: any) => e.errorType === 'ConflictUnhandled'
      );

      if (isConflict) {
        setError('This venue was modified by someone else. The data has been refreshed, please try again.');
      } else {
        const errorMessage = err?.errors?.[0]?.message || err?.message || 'Unknown error';
        setError(`Failed to save venue: ${errorMessage}`);
      }

      handleModalClose();
      await fetchVenues();
    }
  };

  const confirmDelete = async () => {
    if (!deletingVenueId) return;

    const venueToDelete = venues.find(v => v.id === deletingVenueId);
    if (!venueToDelete) {
      setError("Could not find venue to delete.");
      return;
    }

    try {
      await client.graphql({
        query: deleteVenue,
        variables: {
          input: {
            id: deletingVenueId,
            _version: venueToDelete._version
          }
        }
      });
      
      setIsDeleteModalOpen(false);
      setDeletingVenueId(null);
      await fetchVenues();
      
    } catch (err: any) {
      console.error('Error deleting venue:', err);

      const isConflict = err?.errors?.some(
        (e: any) => e.errorType === 'ConflictUnhandled'
      );

      if (isConflict) {
        setError('This venue was modified by someone else. The data has been refreshed, please try again.');
      } else {
        setError('Failed to delete venue.');
      }

      setIsDeleteModalOpen(false);
      setDeletingVenueId(null);
      await fetchVenues();
    }
  };

  return (
    <PageWrapper
      title="Venue Management"
      maxWidth="7xl"
      actions={
        <button
          type="button"
          onClick={handleAddVenue}
          className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
        >
          Add Venue
        </button>
      }
    >
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-xl font-semibold text-gray-900">Manage Venues</h1>
          <p className="mt-2 text-sm text-gray-700">
            Add, edit, and manage venue information, entity association, and per-game fees.
          </p>
          {nextVenueNumber && (
            <p className="mt-1 text-xs text-gray-500">
              Next venue will be assigned ID: {nextVenueNumber}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600 text-sm">{error}</p>
          <button 
            onClick={() => setError(null)} 
            className="mt-2 text-sm text-red-800 underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Entity Filter Section */}
      <div className="mt-6 mb-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowEntityFilter(!showEntityFilter)}
            className="inline-flex items-center text-sm font-medium text-gray-700 hover:text-indigo-600"
          >
            <span>Filter by Entity</span>
            <ChevronDownIcon 
              className={`ml-1 h-4 w-4 transition-transform ${showEntityFilter ? 'rotate-180' : ''}`} 
            />
            {selectedEntityIds.size > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                {selectedEntityIds.size} selected
              </span>
            )}
          </button>

          {selectedEntityIds.size > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear filters
            </button>
          )}
        </div>

        {showEntityFilter && (
          <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex flex-wrap gap-4">
              {entities.map(entity => (
                <label key={entity.id} className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedEntityIds.has(entity.id)}
                    onChange={() => toggleEntityFilter(entity.id)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">{entity.entityName}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results count */}
      <div className="mb-2 text-sm text-gray-500">
        Showing {filteredAndSortedVenues.length} of {venues.length} venues
      </div>

      {/* Table with sticky actions column */}
      <div className="mt-2 overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                {/* Venue # */}
                <th
                  scope="col"
                  className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100 sm:pl-6"
                  onClick={() => handleSort('venueNumber')}
                >
                  <div className="flex items-center gap-1">
                    #
                    {renderSortIcon('venueNumber')}
                  </div>
                </th>

                {/* Name - Sortable */}
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    Name
                    {renderSortIcon('name')}
                  </div>
                </th>

                {/* Entity */}
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                >
                  Entity
                </th>

                {/* City - Sortable */}
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('city')}
                >
                  <div className="flex items-center gap-1">
                    City
                    {renderSortIcon('city')}
                  </div>
                </th>

                {/* Fee - Sortable */}
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('fee')}
                >
                  <div className="flex items-center gap-1">
                    Fee
                    {renderSortIcon('fee')}
                  </div>
                </th>

                {/* Aliases */}
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                >
                  Aliases
                </th>

                {/* Actions - Sticky right */}
                <th
                  scope="col"
                  className="sticky right-0 bg-gray-50 py-3.5 pl-3 pr-4 text-right text-sm font-semibold text-gray-900 sm:pr-6 shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.1)]"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-gray-500">
                    Loading venues...
                  </td>
                </tr>
              ) : filteredAndSortedVenues.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-gray-500">
                    {venues.length === 0 
                      ? 'No venues found. Add your first venue to get started.'
                      : 'No venues match the selected filters.'}
                  </td>
                </tr>
              ) : (
                filteredAndSortedVenues.map((venue) => (
                  <tr key={venue.id} className="hover:bg-gray-50">
                    {/* Venue # */}
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                      {venue.venueNumber ?? '—'}
                    </td>

                    {/* Name */}
                    <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">
                      {venue.name}
                    </td>

                    {/* Entity */}
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {getEntityName(venue.entityId)}
                    </td>

                    {/* City */}
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {venue.city || '—'}
                    </td>

                    {/* Fee */}
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {venue.fee != null ? (
                        <span className="font-medium text-gray-900">{formatCurrency(venue.fee)}</span>
                      ) : (
                        <span className="text-gray-400">Not set</span>
                      )}
                    </td>

                    {/* Aliases */}
                    <td className="px-3 py-4 text-sm text-gray-500">
                      {venue.aliases && venue.aliases.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {venue.aliases.filter(Boolean).slice(0, 3).map((alias, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
                            >
                              {alias}
                            </span>
                          ))}
                          {venue.aliases.filter(Boolean).length > 3 && (
                            <span className="text-xs text-gray-400">
                              +{venue.aliases.filter(Boolean).length - 3} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Actions - Sticky right */}
                    <td className="sticky right-0 bg-white whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6 shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.1)]">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEditVenue(venue)}
                          className="inline-flex items-center rounded-md bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                        >
                          <PencilIcon className="h-4 w-4 mr-1" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteVenue(venue.id)}
                          className="inline-flex items-center rounded-md bg-white px-2.5 py-1.5 text-sm font-medium text-red-600 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-red-50"
                        >
                          <TrashIcon className="h-4 w-4 mr-1" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <VenueModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSave={handleSaveVenue}
        venue={editingVenue}
        entities={entities}
      />

      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
      />
    </PageWrapper>
  );
};

export default VenueManagement;