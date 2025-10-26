// src/components/venues/VenueModal.tsx

import { useState, useEffect } from 'react';
import * as APITypes from '../../API';
import { VenueFormData } from '../../types/venue';

type Venue = APITypes.Venue;

interface VenueModalProps {
  isOpen: boolean;
  onClose: () => void;
  // ✅ CHANGED: Use the simpler VenueFormData type for the onSave prop
  onSave: (venueData: VenueFormData) => void;
  venue: Venue | null;
}

const initialFormState = { name: '', address: '', city: '', country: 'Australia' };

export const VenueModal: React.FC<VenueModalProps> = ({ isOpen, onClose, onSave, venue }) => {
  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    if (isOpen && venue) {
      setFormData({
        name: venue.name,
        address: venue.address || '',
        city: venue.city || '',
        country: venue.country || 'Australia',
      });
    } else {
      setFormData(initialFormState);
    }
  }, [venue, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name) {
        onSave(formData);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 transition-opacity">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 m-4">
        <h2 className="text-lg font-medium leading-6 text-gray-900">{venue ? 'Edit Venue' : 'Add New Venue'}</h2>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Venue Name</label>
            <input type="text" name="name" id="name" required value={formData.name} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
          </div>
          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-700">Address</label>
            <input type="text" name="address" id="address" value={formData.address || ''} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
          </div>
          <div>
            <label htmlFor="city" className="block text-sm font-medium text-gray-700">City</label>
            <input type="text" name="city" id="city" value={formData.city || ''} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
          </div>
          <div className="flex justify-end space-x-4 pt-4">
            <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">Cancel</button>
            <button type="submit" className="rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
};