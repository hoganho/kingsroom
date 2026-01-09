/**
 * BootstrapPreviewTable.tsx
 * 
 * Component to display bootstrap preview results with expandable/tooltip details
 * showing which games will be grouped into each template.
 * 
 * Location: src/components/games/recurring-games/BootstrapPreviewTable.tsx
 */

import React, { useState } from 'react';
import {
  type BootstrapRecurringGamesResult,
  type BootstrapTemplateDetail,
} from '../../../services/recurringGameService';

interface BootstrapPreviewTableProps {
  result: BootstrapRecurringGamesResult;
  onExecute?: () => void;
  isExecuting?: boolean;
}

// Normalized sample game for display
interface NormalizedSampleGame {
  name: string;
  buyIn?: number;
  time?: string;
}

/**
 * Normalize sample games from AWSJSON to consistent format
 * Handles both string[] (old format) and object[] (new format)
 */
const normalizeSampleGames = (sampleGames: unknown): NormalizedSampleGame[] => {
  if (!sampleGames) return [];
  
  // If it's a string (JSON), parse it
  let parsed = sampleGames;
  if (typeof sampleGames === 'string') {
    try {
      parsed = JSON.parse(sampleGames);
    } catch {
      return [];
    }
  }
  
  if (!Array.isArray(parsed)) return [];
  
  return parsed.map((game): NormalizedSampleGame => {
    if (typeof game === 'string') {
      // Old format: just a string name
      return { name: game };
    }
    if (typeof game === 'object' && game !== null) {
      // New format: object with name, buyIn, time
      const g = game as Record<string, unknown>;
      return {
        name: String(g.name || ''),
        buyIn: typeof g.buyIn === 'number' ? g.buyIn : undefined,
        time: typeof g.time === 'string' ? g.time : undefined,
      };
    }
    return { name: String(game) };
  });
};

// Day abbreviations for display
const DAY_ABBREV: Record<string, string> = {
  SUNDAY: 'SUN',
  MONDAY: 'MON',
  TUESDAY: 'TUE',
  WEDNESDAY: 'WED',
  THURSDAY: 'THU',
  FRIDAY: 'FRI',
  SATURDAY: 'SAT',
};

// Day sort order
const DAY_ORDER: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

/**
 * Individual row with expandable sample games
 */
const TemplateRow: React.FC<{ 
  template: BootstrapTemplateDetail; 
  isExpanded: boolean; 
  onToggle: () => void;
}> = ({
  template,
  isExpanded,
  onToggle,
}) => {
  const sampleGames = normalizeSampleGames(template.sampleGames);
  
  return (
    <>
      {/* Main Row */}
      <tr
        className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300">
            {DAY_ABBREV[template.dayOfWeek] || template.dayOfWeek}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-gray-100">{template.name}</span>
            {template.gameType === 'CASH_GAME' && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                Cash
              </span>
            )}
            {sampleGames.length > 0 && (
              <button
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Click to see sample games"
              >
                <svg
                  className={`w-4 h-4 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-center">
          <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 rounded-full text-sm font-semibold bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300">
            {template.gameCount}
          </span>
        </td>
        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
          {template.buyInRange || (template.avgBuyIn ? `$${template.avgBuyIn}` : '-')}
        </td>
        <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">
          {template.timeSlot || '-'}
        </td>
        <td className="px-4 py-3 text-center">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              template.confidence && parseInt(template.confidence) >= 90
                ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                : template.confidence && parseInt(template.confidence) >= 80
                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300'
            }`}
          >
            {template.confidence || '-'}
          </span>
        </td>
      </tr>

      {/* Expanded Sample Games */}
      {isExpanded && sampleGames.length > 0 && (
        <tr className="bg-gray-50 dark:bg-gray-800/50">
          <td colSpan={6} className="px-4 py-3">
            <div className="ml-8 p-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Sample Games ({sampleGames.length} of {template.gameCount})
              </div>
              <div className="space-y-1.5">
                {sampleGames.map((game, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-sm py-1 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <span className="text-gray-700 dark:text-gray-300 truncate flex-1 mr-4" title={game.name}>
                      {game.name}
                    </span>
                    <div className="flex items-center gap-4 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                      {game.buyIn != null && (
                        <span className="font-medium">${game.buyIn}</span>
                      )}
                      {game.time && (
                        <span>{game.time}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {template.gameCount > sampleGames.length && (
                <div className="mt-2 text-xs text-gray-400 dark:text-gray-500 italic">
                  ...and {template.gameCount - sampleGames.length} more games
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

/**
 * Main Preview Table Component
 */
export const BootstrapPreviewTable: React.FC<BootstrapPreviewTableProps> = ({
  result,
  onExecute,
  isExecuting = false,
}) => {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [expandAll, setExpandAll] = useState(false);

  // Sort templates by day of week
  const sortedTemplates = [...result.templateDetails].sort(
    (a, b) => (DAY_ORDER[a.dayOfWeek] || 0) - (DAY_ORDER[b.dayOfWeek] || 0)
  );

  const toggleRow = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const toggleExpandAll = () => {
    if (expandAll) {
      setExpandedRows(new Set());
    } else {
      setExpandedRows(new Set(sortedTemplates.map((_, i) => i)));
    }
    setExpandAll(!expandAll);
  };

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
          <div className="text-sm text-gray-500 dark:text-gray-400">Analyzed</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{result.totalGamesAnalyzed}</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
          <div className="text-sm text-gray-500 dark:text-gray-400">Eligible</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{result.eligibleGames}</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
          <div className="text-sm text-gray-500 dark:text-gray-400">Templates</div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{result.templateDetails.length}</div>
        </div>
      </div>

      {/* Table Header with Actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {result.preview ? 'Preview Results' : 'Created Templates'}
        </h3>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleExpandAll}
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
          >
            {expandAll ? 'Collapse All' : 'Expand All'}
          </button>
          {result.preview && onExecute && (
            <button
              onClick={onExecute}
              disabled={isExecuting || result.templateDetails.length === 0}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-colors ${
                isExecuting || result.templateDetails.length === 0
                  ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-500'
              }`}
            >
              {isExecuting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Creating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Execute Bootstrap ({result.templateDetails.length} templates)
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Templates Table */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">
                Day
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Template Name
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">
                Games
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">
                Buy-in Range
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">
                Time
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">
                Confidence
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {sortedTemplates.map((template, index) => (
              <TemplateRow
                key={index}
                template={template}
                isExpanded={expandedRows.has(index)}
                onToggle={() => toggleRow(index)}
              />
            ))}
          </tbody>
        </table>

        {sortedTemplates.length === 0 && (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No templates to create. Try adjusting the clustering parameters.
          </div>
        )}
      </div>

      {/* Clustering Method Info */}
      {result.clusteringMethod && (
        <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Clustering method: {result.clusteringMethod}
        </div>
      )}

      {/* Errors */}
      {result.errors && result.errors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <h4 className="font-medium text-red-800 dark:text-red-200 mb-2">Errors</h4>
          <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-300">
            {result.errors.map((error, idx) => (
              <li key={idx}>{typeof error === 'string' ? error : JSON.stringify(error)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default BootstrapPreviewTable;
