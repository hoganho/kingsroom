// src/components/venues/VenueModal.tsx

import { useState, useEffect } from 'react';
import * as APITypes from '../../API';
import { VenueFormData } from '../../types/venue';
import { XCircleIcon } from '@heroicons/react/24/solid';

type Venue = APITypes.Venue;
type Entity = Pick<APITypes.Entity, 'id' | 'entityName'>;

interface VenueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (venueData: VenueFormData) => void;
  venue: Venue | null;
  entities: Entity[];
}

const initialFormState: VenueFormData = {
  name: '',
  address: '',
  city: '',
  country: 'Australia',
  aliases: [],
  entityId: null,
  fee: null,
};

export const VenueModal: React.FC<VenueModalProps> = ({ isOpen, onClose, onSave, venue, entities }) => {
  const [formData, setFormData] = useState<VenueFormData>(initialFormState);
  const [currentAlias, setCurrentAlias] = useState('');

  useEffect(() => {
    if (isOpen && venue) {
      console.log('[VenueModal] Loading venue data:', venue);
      console.log('[VenueModal] Venue fee value:', venue.fee);
      setFormData({
        name: venue.name,
        address: venue.address || '',
        city: venue.city || '',
        country: venue.country || 'Australia',
        aliases: venue.aliases?.filter(Boolean) as string[] || [],
        entityId: venue.entityId || null,
        fee: venue.fee ?? null,
      });
    } else if (isOpen && !venue) {
      // Reset to initial state when opening for new venue
      setFormData(initialFormState);
    }
  }, [venue, isOpen]);

  // Handle text/select input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle fee input changes (convert to number or null)
  const handleFeeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    console.log('[VenueModal] Fee input value:', value);
    
    if (value === '' || value === null || value === undefined) {
      setFormData(prev => ({ ...prev, fee: null }));
    } else {
      const numValue = parseFloat(value);
      setFormData(prev => ({ 
        ...prev, 
        fee: isNaN(numValue) ? null : numValue 
      }));
    }
  };

  const handleAddAlias = () => {
    if (currentAlias && !formData.aliases.includes(currentAlias)) {
      setFormData(prev => ({ ...prev, aliases: [...prev.aliases, currentAlias] }));
      setCurrentAlias('');
    }
  };
  
  const handleRemoveAlias = (aliasToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      aliases: prev.aliases.filter(alias => alias !== aliasToRemove),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name) {
      console.log('[VenueModal] Submitting form data:', formData);
      console.log('[VenueModal] Fee being saved:', formData.fee);
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

          {/* Entity Selection Dropdown */}
          <div>
            <label htmlFor="entityId" className="block text-sm font-medium text-gray-700">Entity</label>
            <select
              name="entityId"
              id="entityId"
              value={formData.entityId || ''}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="" disabled={formData.entityId !== null}>Select an entity...</option>
              {entities.map(entity => (
                <option key={entity.id} value={entity.id}>
                  {entity.entityName}
                </option>
              ))}
            </select>
          </div>

          {/* Fee Input Field */}
          <div>
            <label htmlFor="fee" className="block text-sm font-medium text-gray-700">
              Venue Fee (per game)
            </label>
            <div className="relative mt-1 rounded-md shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <span className="text-gray-500 sm:text-sm">$</span>
              </div>
              <input
                type="number"
                name="fee"
                id="fee"
                step="0.01"
                min="0"
                value={formData.fee !== null && formData.fee !== undefined ? formData.fee : ''}
                onChange={handleFeeChange}
                placeholder="0.00"
                className="block w-full rounded-md border-gray-300 pl-7 pr-12 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <span className="text-gray-500 sm:text-sm">AUD</span>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              This fee will be automatically applied to games at this venue.
            </p>
          </div>
          
          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-700">Address</label>
            <input type="text" name="address" id="address" value={formData.address || ''} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
          </div>
          <div>
            <label htmlFor="city" className="block text-sm font-medium text-gray-700">City</label>
            <input type="text" name="city" id="city" value={formData.city || ''} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
          </div>
          <div>
            <label htmlFor="aliases" className="block text-sm font-medium text-gray-700">Aliases</label>
            <div className="mt-1 flex rounded-md shadow-sm">
              <input
                type="text"
                name="aliases"
                id="aliases"
                value={currentAlias}
                onChange={(e) => setCurrentAlias(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddAlias(); }}}
                className="block w-full flex-1 rounded-none rounded-l-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                placeholder="e.g., The Kings Room"
              />
              <button
                type="button"
                onClick={handleAddAlias}
                className="inline-flex items-center rounded-r-md border border-l-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500 hover:bg-gray-100"
              >
                Add
              </button>
            </div>
            {formData.aliases.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {formData.aliases.map(alias => (
                  <span key={alias} className="inline-flex items-center gap-x-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                    {alias}
                    <button type="button" onClick={() => handleRemoveAlias(alias)} className="group relative -mr-1 h-3.5 w-3.5 rounded-sm hover:bg-gray-500/20">
                      <XCircleIcon className="h-3.5 w-3.5 text-gray-400 group-hover:text-gray-600" />
                    </button>
                  </span>
                ))}
              </div>
            )}
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