// src/components/venues/DeleteConfirmationModal.tsx

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({ isOpen, onClose, onConfirm }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 transition-opacity">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 m-4">
        <h2 className="text-lg font-medium text-gray-900">Delete Venue</h2>
        <p className="mt-2 text-sm text-gray-500">
          Are you sure you want to delete this venue? This action cannot be undone.
        </p>
        <div className="mt-6 flex justify-end space-x-4">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="rounded-md border border-transparent bg-red-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-red-700">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};