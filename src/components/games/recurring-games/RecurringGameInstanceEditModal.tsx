// src/components/games/recurring-games/RecurringGameInstanceEditModal.tsx
// Modal for editing RecurringGameInstance status, notes, and cancellation reason
// VERSION: 1.0.0

import React, { useState, useEffect, Fragment } from 'react';
import { Dialog, Transition, Listbox } from '@headlessui/react';
import { 
    XMarkIcon, 
    CheckIcon, 
    ChevronUpDownIcon,
    ExclamationTriangleIcon 
} from '@heroicons/react/24/outline';
import { format, parseISO } from 'date-fns';
import { updateInstanceStatus } from '../../../services/recurringGameService';

// Instance status options (matches RecurringGameInstanceStatus enum)
const INSTANCE_STATUS_OPTIONS = [
    { value: 'CONFIRMED', label: 'Confirmed', description: 'Game ran as expected' },
    { value: 'CANCELLED', label: 'Cancelled', description: 'Game was cancelled' },
    { value: 'SKIPPED', label: 'Skipped', description: 'Game was intentionally skipped' },
    { value: 'NO_SHOW', label: 'No Show', description: 'Game did not run (no data)' },
    { value: 'UNKNOWN', label: 'Unknown', description: 'Status not yet determined' },
] as const;

type InstanceStatus = typeof INSTANCE_STATUS_OPTIONS[number]['value'];

// Cancellation reason options
const CANCELLATION_REASONS = [
    'VENUE_CLOSED',
    'LOW_INTEREST',
    'STAFF_UNAVAILABLE',
    'HOLIDAY',
    'SPECIAL_EVENT',
    'WEATHER',
    'OTHER',
] as const;

interface RecurringGameInstance {
    id: string;
    recurringGameId: string;
    recurringGameName?: string;
    expectedDate: string;
    dayOfWeek?: string;
    status: InstanceStatus;
    notes?: string;
    cancellationReason?: string;
    adminNotes?: string;
    needsReview?: boolean;
    reviewReason?: string;
}

interface RecurringGameInstanceEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    instance: RecurringGameInstance | null;
    onSaveSuccess?: (updatedInstance: RecurringGameInstance) => void;
}

export const RecurringGameInstanceEditModal: React.FC<RecurringGameInstanceEditModalProps> = ({
    isOpen,
    onClose,
    instance,
    onSaveSuccess,
}) => {
    // Form state
    const [status, setStatus] = useState<InstanceStatus>('UNKNOWN');
    const [notes, setNotes] = useState('');
    const [cancellationReason, setCancellationReason] = useState('');
    const [adminNotes, setAdminNotes] = useState('');
    
    // UI state
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset form when instance changes
    useEffect(() => {
        if (instance) {
            setStatus(instance.status || 'UNKNOWN');
            setNotes(instance.notes || '');
            setCancellationReason(instance.cancellationReason || '');
            setAdminNotes(instance.adminNotes || '');
            setError(null);
        }
    }, [instance]);

    // Format display date
    const displayDate = instance?.expectedDate 
        ? format(parseISO(instance.expectedDate), 'EEEE, dd MMM yyyy')
        : '';

    // Check if cancellation reason should be shown
    const showCancellationReason = status === 'CANCELLED' || status === 'SKIPPED';

    // Handle save
    const handleSave = async () => {
        if (!instance) return;

        setSaving(true);
        setError(null);

        try {
            console.log('[RecurringGameInstanceEditModal] Saving instance:', {
                instanceId: instance.id,
                status,
                cancellationReason: showCancellationReason ? cancellationReason : undefined,
                notes,
                adminNotes
            });

            // updateInstanceStatus takes positional params: (instanceId, status, cancellationReason, notes, adminNotes)
            const result = await updateInstanceStatus(
                instance.id,
                status,
                showCancellationReason ? (cancellationReason || undefined) : undefined,
                notes || undefined,
                adminNotes || undefined
            );

            if (!result.success) {
                throw new Error(result.message || 'Failed to update instance');
            }

            // Call success callback with updated data
            if (onSaveSuccess && result.instance) {
                onSaveSuccess({
                    ...instance,
                    status: result.instance.status as InstanceStatus,
                    notes: result.instance.notes || undefined,
                    cancellationReason: result.instance.cancellationReason || undefined,
                    adminNotes: result.instance.adminNotes || undefined,
                });
            }

            onClose();
        } catch (err) {
            console.error('[RecurringGameInstanceEditModal] Save error:', err);
            setError(err instanceof Error ? err.message : 'Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Transition appear show={isOpen} as={Fragment}>
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
                    <div className="fixed inset-0 bg-black/30" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-xl bg-white text-left align-middle shadow-xl transition-all">
                                {/* Header */}
                                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                                    <div>
                                        <Dialog.Title className="text-lg font-semibold text-gray-900">
                                            Edit Instance
                                        </Dialog.Title>
                                        {instance && (
                                            <p className="text-sm text-gray-500 mt-0.5">
                                                {displayDate}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        onClick={onClose}
                                        className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                                    >
                                        <XMarkIcon className="h-5 w-5" />
                                    </button>
                                </div>

                                {/* Content */}
                                <div className="px-6 py-4 space-y-4">
                                    {/* Game Name */}
                                    {instance?.recurringGameName && (
                                        <div className="p-3 bg-gray-50 rounded-lg">
                                            <p className="text-xs text-gray-500 mb-0.5">Recurring Game</p>
                                            <p className="font-medium text-gray-900">{instance.recurringGameName}</p>
                                        </div>
                                    )}

                                    {/* Review Warning */}
                                    {instance?.needsReview && instance?.reviewReason && (
                                        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                            <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-sm font-medium text-amber-800">Needs Review</p>
                                                <p className="text-sm text-amber-700">{instance.reviewReason}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Status Selector */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Status
                                        </label>
                                        <Listbox value={status} onChange={setStatus}>
                                            <div className="relative">
                                                <Listbox.Button className="relative w-full cursor-pointer rounded-lg bg-white py-2.5 pl-3 pr-10 text-left border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                                                    <span className="block truncate">
                                                        {INSTANCE_STATUS_OPTIONS.find(o => o.value === status)?.label || status}
                                                    </span>
                                                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                                        <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                                                    </span>
                                                </Listbox.Button>
                                                <Transition
                                                    as={Fragment}
                                                    leave="transition ease-in duration-100"
                                                    leaveFrom="opacity-100"
                                                    leaveTo="opacity-0"
                                                >
                                                    <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                                                        {INSTANCE_STATUS_OPTIONS.map((option) => (
                                                            <Listbox.Option
                                                                key={option.value}
                                                                value={option.value}
                                                                className={({ active }) =>
                                                                    `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                                                                        active ? 'bg-indigo-50 text-indigo-900' : 'text-gray-900'
                                                                    }`
                                                                }
                                                            >
                                                                {({ selected }) => (
                                                                    <>
                                                                        <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                                                                            {option.label}
                                                                        </span>
                                                                        <span className="block truncate text-xs text-gray-500">
                                                                            {option.description}
                                                                        </span>
                                                                        {selected && (
                                                                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-indigo-600">
                                                                                <CheckIcon className="h-5 w-5" />
                                                                            </span>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </Listbox.Option>
                                                        ))}
                                                    </Listbox.Options>
                                                </Transition>
                                            </div>
                                        </Listbox>
                                    </div>

                                    {/* Cancellation Reason (conditional) */}
                                    {showCancellationReason && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Reason
                                            </label>
                                            <select
                                                value={cancellationReason}
                                                onChange={(e) => setCancellationReason(e.target.value)}
                                                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                            >
                                                <option value="">Select a reason...</option>
                                                {CANCELLATION_REASONS.map((reason) => (
                                                    <option key={reason} value={reason}>
                                                        {reason.replace(/_/g, ' ')}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {/* Notes */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Notes
                                        </label>
                                        <textarea
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            rows={3}
                                            className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                            placeholder="Optional notes about this instance..."
                                        />
                                    </div>

                                    {/* Admin Notes */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Admin Notes
                                        </label>
                                        <textarea
                                            value={adminNotes}
                                            onChange={(e) => setAdminNotes(e.target.value)}
                                            rows={2}
                                            className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                            placeholder="Internal notes (admin only)..."
                                        />
                                    </div>

                                    {/* Error Message */}
                                    {error && (
                                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                            <p className="text-sm text-red-700">{error}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                                    <button
                                        onClick={onClose}
                                        disabled={saving}
                                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={saving}
                                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-lg shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                                    >
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};

export default RecurringGameInstanceEditModal;