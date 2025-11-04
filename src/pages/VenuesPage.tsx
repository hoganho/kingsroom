// src/pages/VenuesPage.tsx

import { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import { GraphQLResult } from '@aws-amplify/api';
import { listVenuesShallow } from '../graphql/customQueries';
import { createVenue, updateVenue, deleteVenue } from '../graphql/mutations';
import { VenueTable } from '../components/venues/VenueTable';
import { VenueModal } from '../components/venues/VenueModal';
import { DeleteConfirmationModal } from '../components/venues/DeleteConfirmationModal';
import * as APITypes from '../API';
import { VenueFormData } from '../types/venue';
import { PageWrapper } from '../components/layout/PageWrapper';

type Venue = APITypes.Venue;

const VenuesPage = () => {
  const client = generateClient();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextVenueNumber, setNextVenueNumber] = useState<number>(1);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingVenueId, setDeletingVenueId] = useState<string | null>(null);


    const fetchVenues = async () => {
    setLoading(true);
    setError(null);

    try {
        const response = await client.graphql<GraphQLResult<APITypes.ListVenuesShallowQuery>>({
        query: listVenuesShallow,
            variables: {
                filter: {
                    isSpecial: { ne: true }
                }
            }
        });

        // ✅ Safe type narrowing for response.data
        if ('data' in response && response.data) {
        const venueItems = (response.data.listVenues.items as Venue[])
            .filter(Boolean)
            .sort((a, b) => {
            // Sort by venueNumber first, then by name
            if (a.venueNumber !== undefined && b.venueNumber !== undefined) {
                return a.venueNumber - b.venueNumber;
            }
            return a.name.localeCompare(b.name);
            });

        setVenues(venueItems);

        // ✅ Calculate next available venue number
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
    } finally {
        setLoading(false);
    }
    };

  useEffect(() => {
    fetchVenues();
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
      // ✅ UPDATED: Destructure aliases from the form data
      const { name, address, city, country, aliases } = venueData;
      
      if (editingVenue) {
        // When editing, keep the existing venueNumber
        await client.graphql({
          query: updateVenue, // <-- Uses imported variable
          variables: { 
            input: { 
              _version: editingVenue._version,
              id: editingVenue.id, 
              name, 
              address, 
              city, 
              country,
              aliases, // ✅ Pass aliases on update
              venueNumber: editingVenue.venueNumber 
            } 
          },
        });
      } else {
        // When creating new venue, use the next available number
        await client.graphql({
          query: createVenue, // <-- Uses imported variable
          variables: { 
            input: { 
              name, 
              address, 
              city, 
              country,
              aliases, // ✅ Pass aliases on create
              venueNumber: nextVenueNumber 
            } 
          },
        });
      }
      
      setIsModalOpen(false);
      fetchVenues();
    } catch (err) {
      console.error('Error saving venue:', err);
      setError('Failed to save venue. Make sure to run "amplify codegen" after updating your schema.');
    }
  };
  
  const confirmDelete = async () => {
      if (!deletingVenueId) return;

      // --- FIX: Need to get the _version for deletion ---
      const venueToDelete = venues.find(v => v.id === deletingVenueId);
      if (!venueToDelete) {
        setError("Could not find venue to delete.");
        return;
      }
      // -------------------------------------------------

      try {
          await client.graphql({
              query: deleteVenue, // <-- Uses imported variable
              // --- FIX: Pass the _version with the ID ---
              variables: { 
                input: { 
                  id: deletingVenueId,
                  _version: venueToDelete._version 
                } 
              }
              // ------------------------------------------
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
      title="Venues"
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
      {/* ✅ FIX: No extra padding div needed. PageWrapper handles it. */}
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-xl font-semibold text-gray-900">Venues</h1>
          <p className="mt-2 text-sm text-gray-700">
            A list of all the venues in your account. Each venue has a unique ID
            number for easy reference.
          </p>
          {nextVenueNumber && (
            <p className="mt-1 text-xs text-gray-500">
              Next venue will be assigned ID: {nextVenueNumber}
            </p>
          )}
        </div>
        {/* The actions button is now handled by the PageWrapper prop */}
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      <div className="mt-8">
        <VenueTable
          venues={venues}
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
      />

      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
      />
    </PageWrapper>
  );
};

export default VenuesPage;