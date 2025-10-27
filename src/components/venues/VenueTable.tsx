// src/components/venues/VenueTable.tsx

import * as APITypes from '../../API';
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';

type Venue = APITypes.Venue;

interface VenueTableProps {
  venues: Venue[];
  loading: boolean;
  onEdit: (venue: Venue) => void;
  onDelete: (id: string) => void;
}

export const VenueTable: React.FC<VenueTableProps> = ({ venues, loading, onEdit, onDelete }) => {
  if (loading) {
    return <p className="text-center text-gray-500 mt-8">Loading venues...</p>;
  }

  if (venues.length === 0) {
    return <p className="text-center text-gray-500 mt-8">No venues found. Click "Add Venue" to get started.</p>;
  }

  return (
    <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
      <table className="min-w-full divide-y divide-gray-300">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">ID</th>
            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Name</th>
            {/* ✅ NEW: Added Aliases column header */}
            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Aliases</th>
            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Address</th>
            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">City</th>
            <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {venues.map((venue) => (
            <tr key={venue.id} className="hover:bg-gray-50">
              <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-bold text-gray-900 sm:pl-6">
                {venue.venueNumber !== undefined ? venue.venueNumber : '-'}
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">{venue.name}</td>
              {/* ✅ NEW: Added cell to display aliases */}
              <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                {venue.aliases && venue.aliases.length > 0 ? venue.aliases.join(', ') : 'N/A'}
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{venue.address || 'N/A'}</td>
              <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{venue.city || 'N/A'}</td>
              <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6 space-x-4">
                <button onClick={() => onEdit(venue)} className="text-indigo-600 hover:text-indigo-900" title="Edit">
                  <PencilIcon className="h-5 w-5" aria-hidden="true" />
                </button>
                <button onClick={() => onDelete(venue.id)} className="text-red-600 hover:text-red-900" title="Delete">
                  <TrashIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};