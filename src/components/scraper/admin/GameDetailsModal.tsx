// src/components/scraper/admin/GameDetailsModal.tsx

import React from 'react';
import { XCircle } from 'lucide-react';
import { ScraperReport } from '../ScraperReport'; // Adjusted path, removed .tsx

export const GameDetailsModal: React.FC<{
    game: any;
    onClose: () => void;
}> = ({ game, onClose }) => {
    if (!game) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-y-auto m-4">
                <div className="p-6 border-b border-gray-200">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold">{game.data?.name || 'Game Details'}</h2>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                            <XCircle className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                
                <div className="p-6">
                    <ScraperReport data={game.data} />
                </div>
            </div>
        </div>
    );
};

