// src/pages/VenuesPage.tsx

import { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import { listVenues } from '../graphql/queries';
import { createVenue, updateVenue, deleteVenue } from '../graphql/mutations';
import { VenueTable } from '../components/venues/VenueTable';
import { VenueModal } from '../components/venues/VenueModal';
import { DeleteConfirmationModal } from '../components/venues/DeleteConfirmationModal';
import * as APITypes from '../API';
import { VenueFormData } from '../types/venue';

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
      const response = await client.graphql({ query: listVenues });
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
      
      // Calculate the next venue number
      const maxVenueNumber = venueItems.reduce((max, venue) => {
        return venue.venueNumber !== undefined && venue.venueNumber > max ? venue.venueNumber : max;
      }, 0);
      setNextVenueNumber(maxVenueNumber + 1);
      
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
          query: updateVenue,
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
          query: createVenue,
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
      try {
          await client.graphql({
              query: deleteVenue,
              variables: { input: { id: deletingVenueId } }
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
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-xl font-semibold text-gray-900">Venues</h1>
          <p className="mt-2 text-sm text-gray-700">
            A list of all the venues in your account. Each venue has a unique ID number for easy reference.
          </p>
          {nextVenueNumber && (
            <p className="mt-1 text-xs text-gray-500">
              Next venue will be assigned ID: {nextVenueNumber}
            </p>
          )}
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <button
            type="button"
            onClick={handleAddVenue}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
          >
            Add Venue
          </button>
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
    </div>
  );
};

export default VenuesPage;