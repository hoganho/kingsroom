// src/components/scraper/SaveConfirmation/DebugTab.tsx
// Debug tab for viewing raw and enriched game data payloads

import React, { useState } from 'react';
import type { GameData } from '../../../types/game';
import type { EnrichedGameData } from '../../../types/enrichment';
import { scrapedDataToEnrichInput } from '../../../services/enrichmentService';
import type { ScrapedGameData } from '../../../API';

// ===================================================================
// TYPES
// ===================================================================

interface DebugTabProps {
  /** Original scraped/input data before any edits */
  originalData: GameData;
  /** Current edited data (what user has modified) */
  editedData: GameData;
  /** Enriched game data from enrichment preview (if available) */
  enrichedGame: EnrichedGameData | null;
  /** Entity ID for building enrichment input */
  entityId: string;
  /** Source URL for building enrichment input */
  sourceUrl: string;
  /** Venue ID (if selected) */
  venueId?: string;
  /** Whether enrichment is currently loading */
  isLoading?: boolean;
  /** Any enrichment error */
  error?: Error | null;
}

type ViewMode = 'original' | 'edited' | 'enrichInput' | 'enriched' | 'comparison';

// ===================================================================
// COMPONENT
// ===================================================================

export const DebugTab: React.FC<DebugTabProps> = ({
  originalData,
  editedData,
  enrichedGame,
  entityId,
  sourceUrl,
  venueId,
  isLoading = false,
  error = null,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('edited');
  const [copied, setCopied] = useState<string | null>(null);

  // Build the enrichment input that would be sent
  const enrichmentInput = React.useMemo(() => {
    try {
      return scrapedDataToEnrichInput(
        editedData as unknown as ScrapedGameData,
        entityId,
        sourceUrl,
        { venueId }
      );
    } catch (e) {
      return { error: String(e) };
    }
  }, [editedData, entityId, sourceUrl, venueId]);

  const copyToClipboard = async (data: unknown, label: string) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  const renderJsonBlock = (data: unknown, label: string) => (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-sm text-gray-700">{label}</h4>
        <button
          onClick={() => copyToClipboard(data, label)}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            copied === label
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {copied === label ? '✓ Copied!' : '📋 Copy'}
        </button>
      </div>
      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-auto max-h-[500px] font-mono">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );

  const renderComparison = () => {
    const allKeys = new Set([
      ...Object.keys(originalData),
      ...Object.keys(editedData),
      ...(enrichedGame ? Object.keys(enrichedGame) : []),
    ]);

    const sortedKeys = Array.from(allKeys).sort();

    return (
      <div className="overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-gray-100">
            <tr>
              <th className="text-left p-2 border font-medium">Field</th>
              <th className="text-left p-2 border font-medium">Original</th>
              <th className="text-left p-2 border font-medium">Edited</th>
              <th className="text-left p-2 border font-medium">Enriched</th>
            </tr>
          </thead>
          <tbody>
            {sortedKeys.map((key) => {
              const origVal = (originalData as Record<string, unknown>)[key];
              const editVal = (editedData as Record<string, unknown>)[key];
              const enrichVal = enrichedGame
                ? (enrichedGame as unknown as Record<string, unknown>)[key]
                : undefined;

              const hasChange =
                JSON.stringify(origVal) !== JSON.stringify(editVal) ||
                (enrichVal !== undefined &&
                  JSON.stringify(editVal) !== JSON.stringify(enrichVal));

              return (
                <tr
                  key={key}
                  className={hasChange ? 'bg-yellow-50' : 'hover:bg-gray-50'}
                >
                  <td className="p-2 border font-mono font-medium">{key}</td>
                  <td className="p-2 border font-mono text-gray-600">
                    {formatValue(origVal)}
                  </td>
                  <td
                    className={`p-2 border font-mono ${
                      JSON.stringify(origVal) !== JSON.stringify(editVal)
                        ? 'text-blue-600 font-medium'
                        : 'text-gray-600'
                    }`}
                  >
                    {formatValue(editVal)}
                  </td>
                  <td
                    className={`p-2 border font-mono ${
                      enrichVal !== undefined &&
                      JSON.stringify(editVal) !== JSON.stringify(enrichVal)
                        ? 'text-green-600 font-medium'
                        : 'text-gray-600'
                    }`}
                  >
                    {enrichedGame ? formatValue(enrichVal) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">🔍 Debug View</h3>
        {isLoading && (
          <span className="text-xs text-blue-600 animate-pulse">
            Loading enrichment...
          </span>
        )}
        {error && (
          <span className="text-xs text-red-600">
            Error: {error.message}
          </span>
        )}
      </div>

      {/* View Mode Selector */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'original', label: 'Original Data', icon: '📄' },
          { id: 'edited', label: 'Edited Data', icon: '✏️' },
          { id: 'enrichInput', label: 'Enrich Input', icon: '📤' },
          { id: 'enriched', label: 'Enriched Output', icon: '📥' },
          { id: 'comparison', label: 'Comparison', icon: '⚖️' },
        ].map((mode) => (
          <button
            key={mode.id}
            onClick={() => setViewMode(mode.id as ViewMode)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              viewMode === mode.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <span className="mr-1">{mode.icon}</span>
            {mode.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="border rounded-lg p-4 bg-gray-50">
        {viewMode === 'original' && (
          renderJsonBlock(originalData, 'Original Game Data')
        )}

        {viewMode === 'edited' && (
          renderJsonBlock(editedData, 'Edited Game Data (Current State)')
        )}

        {viewMode === 'enrichInput' && (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 mb-2">
              This is the payload that would be sent to <code className="bg-gray-200 px-1 rounded">enrichGameData</code> mutation:
            </div>
            {renderJsonBlock(enrichmentInput, 'EnrichGameDataInput')}
          </div>
        )}

        {viewMode === 'enriched' && (
          <div className="space-y-4">
            {enrichedGame ? (
              <>
                <div className="text-sm text-gray-600 mb-2">
                  This is the enriched game data returned from the enricher (would be passed to saveGame):
                </div>
                {renderJsonBlock(enrichedGame, 'EnrichedGameData')}
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                {isLoading ? (
                  <span className="animate-pulse">Loading enrichment preview...</span>
                ) : error ? (
                  <span className="text-red-600">
                    Enrichment failed: {error.message}
                  </span>
                ) : (
                  <span>No enrichment data available yet</span>
                )}
              </div>
            )}
          </div>
        )}

        {viewMode === 'comparison' && (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 mb-2">
              Side-by-side comparison of all fields. <span className="text-yellow-600">Yellow rows</span> indicate changes.
            </div>
            {renderComparison()}
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-gray-100 rounded p-2">
          <div className="text-gray-500">Original Fields</div>
          <div className="font-bold">{Object.keys(originalData).length}</div>
        </div>
        <div className="bg-gray-100 rounded p-2">
          <div className="text-gray-500">Edited Fields</div>
          <div className="font-bold">{Object.keys(editedData).length}</div>
        </div>
        <div className="bg-gray-100 rounded p-2">
          <div className="text-gray-500">Enriched Fields</div>
          <div className="font-bold">
            {enrichedGame ? Object.keys(enrichedGame).length : '-'}
          </div>
        </div>
        <div className="bg-gray-100 rounded p-2">
          <div className="text-gray-500">Changes Made</div>
          <div className="font-bold">
            {countChanges(originalData, editedData)}
          </div>
        </div>
      </div>
    </div>
  );
};

// ===================================================================
// HELPERS
// ===================================================================

const formatValue = (value: unknown): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') {
    if (value.length > 50) return `"${value.substring(0, 50)}..."`;
    return `"${value}"`;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[${value.length} items]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    return `{${keys.length} keys}`;
  }
  return String(value);
};

const countChanges = (original: GameData, edited: GameData): number => {
  let count = 0;
  const allKeys = new Set([...Object.keys(original), ...Object.keys(edited)]);
  
  allKeys.forEach((key) => {
    const origVal = (original as Record<string, unknown>)[key];
    const editVal = (edited as Record<string, unknown>)[key];
    if (JSON.stringify(origVal) !== JSON.stringify(editVal)) {
      count++;
    }
  });
  
  return count;
};

export default DebugTab;
