import type { GameData } from '../../../types/game';

/**
 * SaveConfirmationModal component
 */
export const SaveConfirmationModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    gameData?: GameData;
    venueId: string;
    sourceUrl: string;
}> = ({ isOpen, onClose, onConfirm, gameData, venueId, sourceUrl }) => {
    if (!isOpen || !gameData) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
                <div className="p-4 border-b">
                    <h3 className="text-lg font-semibold">Confirm Save to Database</h3>
                </div>
                <div className="p-4 overflow-auto flex-1">
                    <div className="space-y-3">
                        <div className="bg-blue-50 p-3 rounded">
                            <p className="text-sm font-medium text-blue-900">Tournament Details</p>
                            <div className="mt-2 space-y-1 text-xs text-blue-700">
                                <p><strong>Name:</strong> {gameData.name}</p>
                                <p><strong>Status:</strong> {gameData.status}</p>
                                <p><strong>Start:</strong> {gameData.gameStartDateTime || 'Missing'}</p>
                                <p><strong>URL:</strong> {sourceUrl}</p>
                            </div>
                        </div>
                        <div className="bg-green-50 p-3 rounded">
                            <p className="text-sm font-medium text-green-900">Save Configuration</p>
                            <div className="mt-2 space-y-1 text-xs text-green-700">
                                <p><strong>Venue ID:</strong> {venueId}</p>
                                <p><strong>Type:</strong> Tournament</p>
                            </div>
                        </div>
                        <div className="bg-yellow-50 p-3 rounded">
                            <p className="text-sm font-medium text-yellow-900">⚠️ Note</p>
                            <p className="text-xs text-yellow-700 mt-1">
                                This will save the tournament data to the database. 
                                {gameData.status === 'RUNNING' && ' The tournament is currently RUNNING and can be refreshed later for updates.'}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t flex justify-end space-x-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 text-sm text-white bg-green-600 rounded hover:bg-green-700"
                    >
                        Confirm & Save
                    </button>
                </div>
            </div>
        </div>
    );
};

