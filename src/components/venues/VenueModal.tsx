// src/components/venues/VenueModal.tsx

import { useState, useEffect, useRef } from 'react';
import * as APITypes from '../../API';
import { VenueFormData } from '../../types/venue';
import { useS3Upload, validateImageFile } from '../../hooks/useS3Upload';
import { XCircleIcon, ArrowUpTrayIcon, TrashIcon } from '@heroicons/react/24/solid';
import { BuildingOffice2Icon } from '@heroicons/react/24/outline';

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
  logo: null,
};

export const VenueModal: React.FC<VenueModalProps> = ({ isOpen, onClose, onSave, venue, entities }) => {
  const [formData, setFormData] = useState<VenueFormData>(initialFormState);
  const [currentAlias, setCurrentAlias] = useState('');
  
  // Logo upload state
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Use the S3 upload hook
  const { upload, isUploading, error: uploadError, clearError } = useS3Upload();

  useEffect(() => {
    if (isOpen && venue) {
      console.log('[VenueModal] Loading venue data:', venue);
      console.log('[VenueModal] Venue fee value:', venue.fee);
      console.log('[VenueModal] Venue logo value:', venue.logo);
      
      setFormData({
        name: venue.name,
        address: venue.address || '',
        city: venue.city || '',
        country: venue.country || 'Australia',
        aliases: venue.aliases?.filter(Boolean) as string[] || [],
        entityId: venue.entityId || null,
        fee: venue.fee ?? null,
        logo: venue.logo || null,
      });
      
      // Set logo preview if venue has an existing logo
      setLogoPreview(venue.logo || null);
    } else if (isOpen && !venue) {
      // Reset to initial state when opening for new venue
      setFormData(initialFormState);
      setLogoPreview(null);
    }
    
    // Clear any upload errors when modal opens
    clearError();
  }, [venue, isOpen, clearError]);

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

  // Handle logo file selection and upload
  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file before upload
    const validationError = validateImageFile(file);
    if (validationError) {
      return; // Hook will set the error
    }

    // Create a local preview immediately
    const localPreview = URL.createObjectURL(file);
    setLogoPreview(localPreview);

    try {
      const result = await upload(file, { path: 'venueLogo' });
      
      // Update form data with the S3 URL
      setFormData(prev => ({ ...prev, logo: result.url }));
      setLogoPreview(result.url);
      
      // Clean up local preview
      URL.revokeObjectURL(localPreview);
      
    } catch (err) {
      // Error is already set by the hook
      setLogoPreview(null);
    }
  };

  // Handle logo removal
  const handleRemoveLogo = () => {
    setFormData(prev => ({ ...prev, logo: null }));
    setLogoPreview(null);
    clearError();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Trigger file input click
  const handleUploadClick = () => {
    fileInputRef.current?.click();
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
      console.log('[VenueModal] Logo being saved:', formData.logo);
      onSave(formData);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 transition-opacity">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 m-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-medium leading-6 text-gray-900">{venue ? 'Edit Venue' : 'Add New Venue'}</h2>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          
          {/* Logo Upload Section */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Venue Logo</label>
            <div className="flex items-start gap-4">
              {/* Logo Preview */}
              <div className="relative flex-shrink-0">
                {logoPreview ? (
                  <div className="relative">
                    <img
                      src={logoPreview}
                      alt="Venue logo preview"
                      className="w-20 h-20 rounded-xl object-cover border-2 border-gray-200 shadow-sm"
                    />
                    {isUploading && (
                      <div className="absolute inset-0 bg-white bg-opacity-75 rounded-xl flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center border-2 border-dashed border-gray-300">
                    <BuildingOffice2Icon className="w-8 h-8 text-gray-400" />
                  </div>
                )}
              </div>

              {/* Upload Controls */}
              <div className="flex-1 space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleLogoSelect}
                  className="hidden"
                />
                
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleUploadClick}
                    disabled={isUploading}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUploading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-2" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <ArrowUpTrayIcon className="w-4 h-4 mr-1.5" />
                        {logoPreview ? 'Change' : 'Upload'}
                      </>
                    )}
                  </button>
                  
                  {logoPreview && !isUploading && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-red-600 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                      <TrashIcon className="w-4 h-4 mr-1.5" />
                      Remove
                    </button>
                  )}
                </div>

                <p className="text-xs text-gray-500">
                  JPG, PNG, GIF or WebP. Max 5MB.
                </p>

                {uploadError && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <XCircleIcon className="w-4 h-4" />
                    {uploadError}
                  </p>
                )}
              </div>
            </div>
          </div>

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
            <button 
              type="submit" 
              disabled={isUploading}
              className="rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};