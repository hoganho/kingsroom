import { useState } from 'react';

/**
 * This modal is for viewing the raw HTML source
 */
export const HtmlModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    html: string;
    gameId: string;
}> = ({ isOpen, onClose, html, gameId }) => {
    const [copySuccess, setCopySuccess] = useState(false);

    if (!isOpen) return null;

    // Use document.execCommand for copying, as navigator.clipboard
    // can be blocked in iFrames.
    const handleCopy = () => {
        const textarea = document.createElement('textarea');
        textarea.value = html;
        textarea.style.position = 'fixed'; // Prevent scrolling
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
        document.body.removeChild(textarea);
    };

    return (
        <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center p-4 border-b">
                    <div>
                        <h3 className="text-lg font-semibold">Raw HTML Response</h3>
                        <p className="text-xs text-gray-500 mt-1">{gameId}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={handleCopy}
                            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                        >
                            {copySuccess ? '✓ Copied!' : 'Copy to Clipboard'}
                        </button>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                        >
                            ×
                        </button>
                    </div>
                </div>
                <div className="p-4 overflow-auto flex-1">
                    <div className="bg-gray-50 rounded p-3 border border-gray-200">
                        {html ? (
                            <>
                                <div className="mb-2 text-sm text-gray-600">
                                    HTML Length: {html.length.toLocaleString()} characters
                                </div>
                                <pre className="whitespace-pre-wrap break-all text-xs font-mono text-gray-700">
                                    {html}
                                </pre>
                            </>
                        ) : (
                            <p className="text-gray-500 italic">No HTML data available</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
