// src/components/entities/EntityModal.tsx
// Modal component for adding/editing entities

import { useState, useEffect, Fragment, useRef } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { ArrowUpTrayIcon, TrashIcon } from '@heroicons/react/24/solid';
import { Entity, EntityFormData } from '../../types/entity';
import { useS3Upload, validateImageFile } from '../../hooks/useS3Upload';

interface EntityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (entity: EntityFormData) => void;
  entity: Entity | null;
}

export const EntityModal = ({ isOpen, onClose, onSave, entity }: EntityModalProps) => {
  const [formData, setFormData] = useState<EntityFormData>({
    entityName: '',
    gameUrlDomain: '',
    gameUrlPath: '',
    entityLogo: '',
    isActive: true,
  });

  const [errors, setErrors] = useState<Partial<EntityFormData>>({});
  const [exampleUrl, setExampleUrl] = useState('');
  
  // Logo upload state
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Use the S3 upload hook
  const { upload, isUploading, error: uploadError, clearError } = useS3Upload();

  useEffect(() => {
    if (entity) {
      setFormData({
        entityName: entity.entityName,
        gameUrlDomain: entity.gameUrlDomain,
        gameUrlPath: entity.gameUrlPath,
        entityLogo: entity.entityLogo || '',
        isActive: entity.isActive,
      });
      // Set logo preview if entity has an existing logo
      setLogoPreview(entity.entityLogo || null);
    } else {
      setFormData({
        entityName: '',
        gameUrlDomain: '',
        gameUrlPath: '',
        entityLogo: '',
        isActive: true,
      });
      setLogoPreview(null);
    }
    setErrors({});
    clearError();
  }, [entity, isOpen, clearError]);

  useEffect(() => {
    // Update example URL whenever domain or path changes
    if (formData.gameUrlDomain && formData.gameUrlPath) {
      setExampleUrl(`${formData.gameUrlDomain}${formData.gameUrlPath}123`);
    } else {
      setExampleUrl('');
    }
  }, [formData.gameUrlDomain, formData.gameUrlPath]);

  const validateForm = (): boolean => {
    const newErrors: Partial<EntityFormData> = {};

    if (!formData.entityName.trim()) {
      newErrors.entityName = 'Entity name is required';
    }

    if (!formData.gameUrlDomain.trim()) {
      newErrors.gameUrlDomain = 'Domain is required';
    } else if (!formData.gameUrlDomain.startsWith('http://') && !formData.gameUrlDomain.startsWith('https://')) {
      newErrors.gameUrlDomain = 'Domain must start with http:// or https://';
    }

    if (!formData.gameUrlPath.trim()) {
      newErrors.gameUrlPath = 'Path pattern is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSave(formData);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    // Clear error for this field when user starts typing
    if (errors[name as keyof EntityFormData]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
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
      const result = await upload(file, { path: 'entityLogo' });
      
      // Update form data with the S3 URL
      setFormData(prev => ({ ...prev, entityLogo: result.url }));
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
    setFormData(prev => ({ ...prev, entityLogo: '' }));
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

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>

                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                    <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-gray-900">
                      {entity ? 'Edit Entity' : 'Add New Entity'}
                    </Dialog.Title>

                    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                      {/* Entity Name */}
                      <div>
                        <label htmlFor="entityName" className="block text-sm font-medium text-gray-700">
                          Entity Name
                        </label>
                        <input
                          type="text"
                          name="entityName"
                          id="entityName"
                          value={formData.entityName}
                          onChange={handleInputChange}
                          className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                            errors.entityName 
                              ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                              : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
                          }`}
                          placeholder="e.g., Kings Room"
                        />
                        {errors.entityName && (
                          <p className="mt-1 text-sm text-red-600">{errors.entityName}</p>
                        )}
                      </div>

                      {/* Entity Logo Upload */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Entity Logo
                        </label>
                        
                        {/* Hidden file input */}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          onChange={handleLogoSelect}
                          className="hidden"
                        />
                        
                        <div className="flex items-start space-x-4">
                          {/* Logo Preview / Placeholder */}
                          <div className="flex-shrink-0">
                            {logoPreview ? (
                              <div className="relative">
                                <img
                                  src={logoPreview}
                                  alt="Entity logo preview"
                                  className="h-20 w-20 rounded-lg object-cover border border-gray-200"
                                />
                                {isUploading && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 rounded-lg">
                                    <svg className="animate-spin h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="h-20 w-20 rounded-lg bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white text-2xl font-medium">
                                {formData.entityName ? formData.entityName.charAt(0).toUpperCase() : 'E'}
                              </div>
                            )}
                          </div>
                          
                          {/* Upload/Remove Buttons */}
                          <div className="flex flex-col space-y-2">
                            <button
                              type="button"
                              onClick={handleUploadClick}
                              disabled={isUploading}
                              className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <ArrowUpTrayIcon className="h-4 w-4 mr-1.5" />
                              {isUploading ? 'Uploading...' : 'Upload Logo'}
                            </button>
                            
                            {logoPreview && (
                              <button
                                type="button"
                                onClick={handleRemoveLogo}
                                disabled={isUploading}
                                className="inline-flex items-center px-3 py-1.5 border border-red-300 shadow-sm text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <TrashIcon className="h-4 w-4 mr-1.5" />
                                Remove
                              </button>
                            )}
                            
                            <p className="text-xs text-gray-500">
                              JPEG, PNG, GIF, WebP. Max 5MB.
                            </p>
                          </div>
                        </div>
                        
                        {/* Upload Error */}
                        {uploadError && (
                          <p className="mt-2 text-sm text-red-600">{uploadError}</p>
                        )}
                      </div>

                      {/* Game URL Domain */}
                      <div>
                        <label htmlFor="gameUrlDomain" className="block text-sm font-medium text-gray-700">
                          Game URL Domain
                        </label>
                        <input
                          type="text"
                          name="gameUrlDomain"
                          id="gameUrlDomain"
                          value={formData.gameUrlDomain}
                          onChange={handleInputChange}
                          className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm font-mono ${
                            errors.gameUrlDomain 
                              ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                              : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
                          }`}
                          placeholder="https://kingslive.com.au"
                        />
                        {errors.gameUrlDomain && (
                          <p className="mt-1 text-sm text-red-600">{errors.gameUrlDomain}</p>
                        )}
                      </div>

                      {/* Game URL Path */}
                      <div>
                        <label htmlFor="gameUrlPath" className="block text-sm font-medium text-gray-700">
                          Game URL Path Pattern
                        </label>
                        <input
                          type="text"
                          name="gameUrlPath"
                          id="gameUrlPath"
                          value={formData.gameUrlPath}
                          onChange={handleInputChange}
                          className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm font-mono ${
                            errors.gameUrlPath 
                              ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                              : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
                          }`}
                          placeholder="/76-2/?id="
                        />
                        {errors.gameUrlPath && (
                          <p className="mt-1 text-sm text-red-600">{errors.gameUrlPath}</p>
                        )}
                        <p className="mt-1 text-xs text-gray-500">
                          The path pattern after the domain. Tournament ID will be appended.
                        </p>
                      </div>

                      {/* Example URL */}
                      {exampleUrl && (
                        <div className="rounded-md bg-blue-50 p-3">
                          <p className="text-xs font-medium text-blue-800">Example URL:</p>
                          <p className="text-xs text-blue-600 font-mono break-all">{exampleUrl}</p>
                        </div>
                      )}

                      {/* Is Active Checkbox */}
                      <div className="relative flex items-start">
                        <div className="flex h-6 items-center">
                          <input
                            id="isActive"
                            name="isActive"
                            type="checkbox"
                            checked={formData.isActive}
                            onChange={handleInputChange}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                          />
                        </div>
                        <div className="ml-3 text-sm leading-6">
                          <label htmlFor="isActive" className="font-medium text-gray-900">
                            Active
                          </label>
                          <p className="text-gray-500">Enable scraping and operations for this entity</p>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                        <button
                          type="submit"
                          disabled={isUploading}
                          className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:col-start-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {entity ? 'Update' : 'Create'}
                        </button>
                        <button
                          type="button"
                          className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0"
                          onClick={onClose}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
};