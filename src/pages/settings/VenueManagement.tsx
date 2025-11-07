// src/pages/settings/VenueManagement.tsx
// This is the existing VenuesPage renamed to VenueManagement for the Settings section

import { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import { GraphQLResult } from '@aws-amplify/api';
import { listVenuesShallow, listEntitiesShallow } from '../../graphql/customQueries';
import { createVenue, updateVenue, deleteVenue } from '../../graphql/mutations';
import { VenueTable } from '../../components/venues/VenueTable';
import { VenueModal } from '../../components/venues/VenueModal';
import { DeleteConfirmationModal } from '../../components/venues/DeleteConfirmationModal';
import * as APITypes from '../../API';
import { VenueFormData } from '../../types/venue';
import { PageWrapper } from '../../components/layout/PageWrapper';

type Venue = APITypes.Venue;
// ✅ NEW: Define Entity type
type Entity = Pick<APITypes.Entity, 'id' | 'entityName'>;

const VenueManagement = () => {
  const client = generateClient();
  const [venues, setVenues] = useState<Venue[]>([]);
  // ✅ NEW: State for entities
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextVenueNumber, setNextVenueNumber] = useState<number>(1);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingVenueId, setDeletingVenueId] = useState<string | null>(null);

  // ✅ NEW: Function to fetch entities
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
      // Non-critical error, venues can still be managed
      setError('Failed to fetch entities, but venue data is available.');
    }
  };

  const fetchVenues = async () => {
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
        const venueItems = (response.data.listVenues.items as Venue[])
          .filter(Boolean)
          .sort((a, b) => {
            if (a.venueNumber !== undefined && b.venueNumber !== undefined) {
              return a.venueNumber - b.venueNumber;
            }
            return a.name.localeCompare(b.name);
          });

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

  // ✅ UPDATED: Fetch both venues and entities on load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      
      // Fetch in parallel
      await Promise.all([
        fetchVenues(),
        fetchEntities()
      ]);
      
      setLoading(false);
    };
    
    loadData();
  }, []);

  const handleAddVenue = () => {
    setEditingVenue(null);
    setIsModalOpen(true);
  };

  const handleEditVenue = (venue: Venue) => {
    setEditingVenue(venue);
    setIsModalOpen(true);
  };
  
  const handleDeleteVenue = (id: string) => {
    setDeletingVenueId(id);
    setIsDeleteModalOpen(true);
  };

  const handleSaveVenue = async (venueData: VenueFormData) => {
    try {
      // ✅ UPDATED: Destructure entityId
      const { name, address, city, country, aliases, entityId } = venueData;
      
      if (editingVenue) {
        await client.graphql({
          query: updateVenue,
          variables: { 
            input: { 
              _version: editingVenue._version,
              id: editingVenue.id, 
              name, 
              address, 
              city, 
              country,
              aliases,
              entityId, // ✅ ADDED
              venueNumber: editingVenue.venueNumber 
            } 
          },
        });
      } else {
        await client.graphql({
          query: createVenue,
          variables: { 
            input: { 
              name, 
              address, 
              city, 
              country,
              aliases,
              entityId, // ✅ ADDED
              venueNumber: nextVenueNumber 
            } 
          },
        });
      }
      
      setIsModalOpen(false);
      fetchVenues(); // Refetch venues to show updated data
    } catch (err) {
      console.error('Error saving venue:', err);
      setError('Failed to save venue. Make sure to run "amplify codegen" after updating your schema.');
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
      fetchVenues();
    } catch (err) {
      console.error('Error deleting venue:', err);
      setError('Failed to delete venue.');
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
            Add, edit, and manage venue information and their entity association.
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
        </div>
      )}

      <div className="mt-8">
        <VenueTable
          venues={venues}
          // ✅ UPDATED: Pass entities list
          entities={entities}
          loading={loading}
          onEdit={handleEditVenue}
          onDelete={handleDeleteVenue}
        />
      </div>

      <VenueModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveVenue}
        venue={editingVenue}
        // ✅ UPDATED: Pass entities list
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