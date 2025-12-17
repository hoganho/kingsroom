// src/pages/settings/VenueManagement.tsx

import { useState, useEffect, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { GraphQLResult } from '@aws-amplify/api';
import { listVenuesShallow, listEntitiesShallow } from '../../graphql/customQueries';
import { updateVenueShallow, createVenueShallow } from '../../graphql/customMutations';
import { deleteVenue } from '../../graphql/mutations';
import { VenueModal } from '../../components/venues/VenueModal';
import { DeleteConfirmationModal } from '../../components/venues/DeleteConfirmationModal';
import * as APITypes from '../../API';
import { VenueFormData } from '../../types/venue';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { 
  ChevronUpIcon, 
  ChevronDownIcon, 
  PencilIcon, 
  TrashIcon
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/generalHelpers';

type Venue = APITypes.Venue;
type Entity = Pick<APITypes.Entity, 'id' | 'entityName'>;

type SortDirection = 'asc' | 'desc';
type SortField = 'name' | 'venueNumber' | 'city' | 'fee';

// ✅ FIX: Lazy client initialization to avoid "Amplify not configured" warning
let _client: any = null;
const getClient = () => {
  if (!_client) {
    _client = generateClient();
  }
  return _client;
};

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
      const response = (await getClient().graphql({
        query: listEntitiesShallow
      })) as GraphQLResult<APITypes.ListEntitiesShallowQuery>;

        if ('data' in response && response.data?.listEntities) {
        const entityItems = (response.data.listEntities?.items as Entity[]) || [];
        
        const sortedEntities = entityItems
            .filter(Boolean)
            .sort((a, b) => a.entityName.localeCompare(b.entityName));
        setEntities(sortedEntities);
        }
    } catch (err) {
      console.error('Error fetching entities:', err);
    }
  };

  const fetchVenues = async () => {
    console.log('[VenueManagement] Fetching venues...');
    try {
      const response = (await getClient().graphql({
        query: listVenuesShallow,
        variables: {
          filter: {
            isSpecial: { ne: true }
          }
        }
      })) as GraphQLResult<APITypes.ListVenuesShallowQuery>;

      if ('data' in response && response.data) {
        const venueItems = (response.data.listVenues?.items as Venue[]) || [];
        const validVenues = venueItems.filter(Boolean);

        console.log('[VenueManagement] Fetched venues:', validVenues.length);
        if (venueItems.length > 0) {
          console.log('[VenueManagement] Sample venue data:', {
            name: venueItems[0].name,
            fee: venueItems[0].fee,
            logo: venueItems[0].logo,
            hasFeeProp: 'fee' in venueItems[0],
            hasLogoProp: 'logo' in venueItems[0]
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
    console.log('[VenueManagement] Venue logo:', venue.logo);
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
    console.log('[VenueManagement] Logo value:', venueData.logo);
    
    try {
      const { name, address, city, country, aliases, entityId, fee, logo } = venueData;

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
          logo: logo || null,
          venueNumber: editingVenue.venueNumber
        };
        
        console.log('[VenueManagement] Update mutation input:', updateInput);
        
        const result = await getClient().graphql({
          query: updateVenueShallow,
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
          logo: logo || null,
          venueNumber: nextVenueNumber
        };
        
        console.log('[VenueManagement] Create mutation input:', createInput);
        
        const result = await getClient().graphql({
          query: createVenueShallow,
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
      await getClient().graphql({
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

  // Stats
  const venuesWithLogos = venues.filter(v => v.logo).length;
  const venuesWithFees = venues.filter(v => v.fee != null && v.fee > 0).length;

  return (
    <PageWrapper
      title="Venue Management"
      actions={
        <button
          onClick={handleAddVenue}
          className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          Add Venue
        </button>
      }
    >
      {/* Stats Cards - similar to SocialAccountManagement */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-500">Total Venues</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{venues.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-500">With Logos</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">{venuesWithLogos}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-500">With Fees</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{venuesWithFees}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-500">Entities</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{entities.length}</p>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">{error}</h3>
            </div>
            <div className="ml-auto pl-3">
              <button
                onClick={() => setError(null)}
                className="inline-flex rounded-md bg-red-50 p-1.5 text-red-500 hover:bg-red-100"
              >
                <span className="sr-only">Dismiss</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={() => setShowEntityFilter(!showEntityFilter)}
            className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-medium shadow-sm ring-1 ring-inset ${
              selectedEntityIds.size > 0
                ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
                : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'
            }`}
          >
            Entity Filter
            {selectedEntityIds.size > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                {selectedEntityIds.size}
              </span>
            )}
          </button>

          {selectedEntityIds.size > 0 && (
            <button
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

                {/* Venue Name with Logo - Combined like SocialAccountTable */}
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    Venue
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

                    {/* Venue Name with Logo - SocialAccountTable style */}
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 relative">
                          {venue.logo ? (
                            <img
                              src={venue.logo}
                              alt={venue.name}
                              className="h-10 w-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white font-medium">
                              {venue.name.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {venue.name}
                          </div>
                          {venue.address && (
                            <div className="text-sm text-gray-500 truncate max-w-[200px]">
                              {venue.address}
                            </div>
                          )}
                        </div>
                      </div>
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
                          {venue.aliases.filter(Boolean).slice(0, 2).map((alias, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
                            >
                              {alias}
                            </span>
                          ))}
                          {venue.aliases.filter(Boolean).length > 2 && (
                            <span className="text-xs text-gray-400">
                              +{venue.aliases.filter(Boolean).length - 2}
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