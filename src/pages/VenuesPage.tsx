// src/pages/VenuesPage.tsx

import { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import { listVenues } from '../graphql/queries';
import { createVenue, updateVenue, deleteVenue } from '../graphql/mutations';
import { VenueTable } from '../components/venues/VenueTable';
import { VenueModal } from '../components/venues/VenueModal';
import { DeleteConfirmationModal } from '../components/venues/DeleteConfirmationModal';
import * as APITypes from '../API';

type Venue = APITypes.Venue;

// ⛔️ This was the problem: The client was created before Amplify was configured.
// const client = generateClient(); 

const VenuesPage = () => {
  // ✅ FIXED: Create the client inside the component function.
  const client = generateClient();

  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        .sort((a, b) => a.name.localeCompare(b.name));
      setVenues(venueItems);
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

  const handleSaveVenue = async (venueData: Omit<Venue, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    try {
      const { name, address, city, country } = venueData;
      if (editingVenue) {
        await client.graphql({
          query: updateVenue,
          variables: { input: { id: editingVenue.id, name, address, city, country } },
        });
      } else {
        await client.graphql({
          query: createVenue,
          variables: { input: { name, address, city, country } },
        });
      }
      setIsModalOpen(false);
      fetchVenues();
    } catch (err) {
      console.error('Error saving venue:', err);
      setError('Failed to save venue.');
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
            A list of all the venues in your account including their name, address, and city.
          </p>
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
      
      {error && <div className="mt-4 text-red-600">{error}</div>}
      
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