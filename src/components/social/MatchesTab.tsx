// src/components/social/MatchesTab.tsx
// Displays match candidates with comprehensive signal breakdown
// Shows ALL possible signals and how each performed (matched, not matched, no data)

import React, { useState, useMemo } from 'react';
import {
  CheckCircleIcon,
  LinkIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  MapPinIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

import type { GameMatchCandidate } from '../../API';

// ===================================================================
// TYPES
// ===================================================================

type SignalStatus = 'MATCHED' | 'NOT_MATCHED' | 'NOT_EVALUATED' | 'NOT_APPLICABLE';

interface SignalResult {
  key: string;
  label: string;
  status: SignalStatus;
  contribution: number;
  extractedValue?: string | number | null;
  gameValue?: string | number | null;
  details?: string;
  weight?: number;
  penalty?: number;
}

interface CategoryData {
  label: string;
  icon: string;
  signals: SignalResult[];
  score?: number;      // Primary field from backend
  earned?: number;     // Alias for score
  max?: number;        // gameMatcher uses this
  possible?: number;   // Alias for maxPossible
  maxPossible?: number;
  percentage: number;
  penalties?: number;
}

interface ParsedSignals {
  confidence: number;
  rawScore: number;
  reason: string;
  meetsMinimum: boolean;
  wouldAutoLink: boolean;
  breakdown: Record<string, CategoryData>;
  allSignals: SignalResult[];
}

interface MatchesTabProps {
  candidates: GameMatchCandidate[];
  primaryMatch: GameMatchCandidate | null;
  selectedGameId: string | null;
  onSelectGame: (gameId: string) => void;
  isLinking: boolean;
}

// ===================================================================
// CONSTANTS
// ===================================================================

const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  identity: { label: 'Identity', icon: '🎯', color: 'text-purple-600' },
  financial: { label: 'Financial', icon: '💰', color: 'text-green-600' },
  temporal: { label: 'Date/Time', icon: '📅', color: 'text-blue-600' },
  venue: { label: 'Venue', icon: '📍', color: 'text-orange-600' },
  structure: { label: 'Structure', icon: '🏗️', color: 'text-indigo-600' },
  attributes: { label: 'Attributes', icon: '📊', color: 'text-cyan-600' },
  content: { label: 'Content Type', icon: '📝', color: 'text-pink-600' },
  penalties: { label: 'Penalties', icon: '⚠️', color: 'text-red-600' },
};

const STATUS_DISPLAY: Record<SignalStatus, { icon: string; color: string; bgColor: string; label: string }> = {
  MATCHED: { icon: '✅', color: 'text-green-600', bgColor: 'bg-green-50', label: 'Matched' },
  NOT_MATCHED: { icon: '❌', color: 'text-red-500', bgColor: 'bg-red-50', label: 'Not Matched' },
  NOT_EVALUATED: { icon: '⚪', color: 'text-gray-400', bgColor: 'bg-gray-50', label: 'No Data' },
  NOT_APPLICABLE: { icon: '➖', color: 'text-gray-300', bgColor: 'bg-gray-50', label: 'N/A' },
};

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

/**
 * Parse matchSignals JSON string into structured data
 * Handles double-stringification bug where Lambda returns '"{...}"' instead of '{...}'
 */
const parseSignals = (matchSignals: string | null | undefined): ParsedSignals | null => {
  if (!matchSignals) return null;
  
  try {
    let parsed = typeof matchSignals === 'string' ? JSON.parse(matchSignals) : matchSignals;
    
    // Handle double-stringification: if result is still a string, parse again
    if (typeof parsed === 'string') {
      console.log('[MatchesTab] Detected double-stringified matchSignals, parsing again...');
      parsed = JSON.parse(parsed);
    }
    
    return parsed as ParsedSignals;
  } catch (e) {
    console.warn('[MatchesTab] Failed to parse matchSignals:', e);
    return null;
  }
};

/**
 * Format a value for display
 */
const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    // Check if it looks like a dollar amount
    if (value >= 100) return `$${value.toLocaleString()}`;
    return value.toString();
  }
  if (typeof value === 'string') {
    // Truncate long strings
    if (value.length > 30) return value.substring(0, 27) + '...';
    return value;
  }
  return String(value);
};

// ===================================================================
// SUB-COMPONENTS
// ===================================================================

/**
 * Confidence badge with color coding
 */
const ConfidenceBadge: React.FC<{ confidence: number; size?: 'sm' | 'md' | 'lg' }> = ({ 
  confidence, 
  size = 'md' 
}) => {
  const getColor = () => {
    if (confidence >= 80) return 'bg-green-100 text-green-800 border-green-300';
    if (confidence >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    if (confidence >= 40) return 'bg-orange-100 text-orange-800 border-orange-300';
    return 'bg-red-100 text-red-800 border-red-300';
  };
  
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-0.5',
    lg: 'text-base px-3 py-1 font-semibold',
  };
  
  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${getColor()} ${sizeClasses[size]}`}>
      {Math.round(confidence)}%
    </span>
  );
};

/**
 * Individual signal row - shows status, values, and contribution
 */
const SignalRow: React.FC<{ signal: SignalResult; showValues?: boolean }> = ({ signal, showValues = true }) => {
  const status = STATUS_DISPLAY[signal.status] || STATUS_DISPLAY.NOT_EVALUATED;
  
  return (
    <div className={`flex items-start gap-2 py-1.5 px-2 rounded ${status.bgColor}`}>
      {/* Status icon */}
      <span className="text-sm flex-shrink-0 mt-0.5">{status.icon}</span>
      
      {/* Label and details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${status.color}`}>
            {signal.label}
          </span>
          {signal.contribution !== 0 && (
            <span className={`text-xs font-semibold ${signal.contribution > 0 ? 'text-green-600' : 'text-red-500'}`}>
              {signal.contribution > 0 ? '+' : ''}{signal.contribution}
            </span>
          )}
        </div>
        
        {/* Values comparison */}
        {showValues && (signal.extractedValue !== null || signal.gameValue !== null) && (
          <div className="text-xs text-gray-500 mt-0.5">
            <span className="text-gray-600">{formatValue(signal.extractedValue)}</span>
            <span className="mx-1">→</span>
            <span className="text-gray-600">{formatValue(signal.gameValue)}</span>
          </div>
        )}
        
        {/* Details/reason */}
        {signal.details && (
          <div className="text-xs text-gray-400 mt-0.5 italic">
            {signal.details}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Category breakdown panel - shows all signals in a category
 */
const CategoryPanel: React.FC<{
  categoryKey: string;
  data: CategoryData;
  defaultExpanded?: boolean;
}> = ({ categoryKey, data, defaultExpanded = false }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const meta = CATEGORY_META[categoryKey] || { label: categoryKey, icon: '📋', color: 'text-gray-600' };
  
  // Handle both field names (score/earned, possible/maxPossible/max)
  const earned = data.score ?? data.earned ?? 0;
  const possible = data.maxPossible ?? data.max ?? data.possible ?? 0;
  const percentage = data.percentage ?? (possible > 0 ? Math.round((earned / possible) * 100) : 0);
  
  // Count signals by status
  const counts = useMemo(() => {
    const c = { matched: 0, notMatched: 0, noData: 0, na: 0 };
    (data.signals || []).forEach(s => {
      if (s.status === 'MATCHED') c.matched++;
      else if (s.status === 'NOT_MATCHED') c.notMatched++;
      else if (s.status === 'NOT_EVALUATED') c.noData++;
      else c.na++;
    });
    return c;
  }, [data.signals]);
  
  const hasAnyData = counts.matched > 0 || counts.notMatched > 0;
  
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`w-full px-3 py-2 flex items-center justify-between text-left hover:bg-gray-50 transition-colors ${
          hasAnyData ? 'bg-white' : 'bg-gray-50'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{meta.icon}</span>
          <span className={`text-sm font-medium ${meta.color}`}>{meta.label}</span>
          
          {/* Mini status counts */}
          <div className="flex items-center gap-1 ml-2">
            {counts.matched > 0 && (
              <span className="text-xs text-green-600 bg-green-100 px-1.5 py-0.5 rounded">
                {counts.matched}✓
              </span>
            )}
            {counts.notMatched > 0 && (
              <span className="text-xs text-red-500 bg-red-100 px-1.5 py-0.5 rounded">
                {counts.notMatched}✗
              </span>
            )}
            {counts.noData > 0 && (
              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                {counts.noData}?
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Score */}
          <span className="text-xs text-gray-500">
            {earned}/{possible}
            {data.penalties && data.penalties < 0 && (
              <span className="text-red-500 ml-1">({data.penalties})</span>
            )}
          </span>
          
          {/* Progress bar */}
          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full ${
                percentage >= 80 ? 'bg-green-500' :
                percentage >= 50 ? 'bg-yellow-500' :
                percentage > 0 ? 'bg-orange-500' : 'bg-gray-300'
              }`}
              style={{ width: `${Math.min(100, percentage)}%` }}
            />
          </div>
          
          {/* Expand icon */}
          {expanded ? (
            <ChevronUpIcon className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDownIcon className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>
      
      {/* Expanded signals */}
      {expanded && (
        <div className="px-2 py-2 border-t border-gray-100 bg-gray-50 space-y-1">
          {data.signals.map((signal, idx) => (
            <SignalRow key={signal.key || idx} signal={signal} />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Game match card with expandable signal breakdown
 */
const GameMatchCard: React.FC<{
  candidate: GameMatchCandidate;
  isSelected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  showBreakdown?: boolean;
}> = ({ candidate, isSelected, onSelect, disabled, showBreakdown = true }) => {
  const [expanded, setExpanded] = useState(false);
  
  const signals = useMemo(() => parseSignals(candidate.matchSignals), [candidate.matchSignals]);
  
  return (
    <div 
      className={`border rounded-lg overflow-hidden transition-all ${
        isSelected 
          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' 
          : 'border-gray-200 hover:border-gray-300 bg-white'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      onClick={() => !disabled && onSelect()}
    >
      {/* Main card content */}
      <div className="p-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {candidate.isPrimaryMatch && (
                <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                  Best Match
                </span>
              )}
              {signals?.wouldAutoLink && (
                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                  ⚡ Auto-linkable
                </span>
              )}
              <span className="text-xs text-gray-500">#{candidate.rank}</span>
            </div>
            <h4 className="font-medium text-gray-900 mt-1 truncate">
              {candidate.gameName || 'Unnamed Game'}
            </h4>
          </div>
          <ConfidenceBadge confidence={candidate.matchConfidence} size="lg" />
        </div>
        
        {/* Details row */}
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
          {candidate.gameDate && (
            <div className="flex items-center gap-1">
              <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
              {new Date(candidate.gameDate).toLocaleDateString()}
            </div>
          )}
          {candidate.buyIn !== null && candidate.buyIn !== undefined && (
            <div className="flex items-center gap-1">
              <CurrencyDollarIcon className="w-3.5 h-3.5 text-gray-400" />
              ${candidate.buyIn}
            </div>
          )}
          {candidate.venueName && (
            <div className="flex items-center gap-1 col-span-2">
              <MapPinIcon className="w-3.5 h-3.5 text-gray-400" />
              {candidate.venueName}
            </div>
          )}
          {candidate.totalEntries && (
            <div className="flex items-center gap-1">
              <UserGroupIcon className="w-3.5 h-3.5 text-gray-400" />
              {candidate.totalEntries} entries
            </div>
          )}
        </div>
        
        {/* Match reason & expand button */}
        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Matched by: <span className="text-gray-700 font-medium">
              {signals?.reason?.replace(/_/g, ' ') || candidate.matchReason?.replace(/_/g, ' ') || 'unknown'}
            </span>
          </span>
          
          {showBreakdown && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
            >
              {expanded ? 'Hide' : 'Show'} breakdown
              {expanded ? (
                <ChevronUpIcon className="w-3 h-3" />
              ) : (
                <ChevronDownIcon className="w-3 h-3" />
              )}
            </button>
          )}
        </div>
        
        {/* Selection indicator */}
        {isSelected && (
          <div className="mt-2 flex items-center gap-1 text-blue-600 text-xs font-medium">
            <CheckCircleIcon className="w-4 h-4" />
            Selected for linking
          </div>
        )}
      </div>
      
      {/* Expanded breakdown */}
      {expanded && signals?.breakdown && (
        <div className="px-3 pb-3 border-t border-gray-200 bg-gray-50">
          <div className="pt-3">
            {/* Score summary */}
            <div className="flex items-center justify-between mb-3">
              <h5 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Signal Breakdown
              </h5>
              <span className="text-xs text-gray-500">
                Raw score: <span className="font-medium">{signals.rawScore}</span>
              </span>
            </div>
            
            {/* Category panels */}
            <div className="space-y-2">
              {Object.entries(signals.breakdown).map(([key, data]) => {
                const catData = data as CategoryData;
                const catScore = catData.score ?? catData.earned ?? 0;
                const hasPenalties = (catData.penalties || 0) < 0;
                return (
                  <CategoryPanel
                    key={key}
                    categoryKey={key}
                    data={catData}
                    defaultExpanded={catScore > 0 || hasPenalties}
                  />
                );
              })}
            </div>
            
            {/* Threshold summary */}
            <div className="mt-3 pt-2 border-t border-gray-200 flex items-center justify-between text-xs">
              <span className={signals.meetsMinimum ? 'text-green-600' : 'text-red-500'}>
                {signals.meetsMinimum ? '✅ Meets minimum (15%)' : '❌ Below minimum (15%)'}
              </span>
              <span className={signals.wouldAutoLink ? 'text-blue-600' : 'text-gray-500'}>
                {signals.wouldAutoLink ? '⚡ Auto-link eligible (80%+)' : '🔗 Manual link required'}
              </span>
            </div>
          </div>
        </div>
      )}
      
      {/* Fallback for missing breakdown */}
      {expanded && signals && !signals.breakdown && (
        <div className="px-3 pb-3 border-t border-gray-200 bg-gray-50">
          <div className="pt-3 text-xs text-gray-500">
            <p>Detailed breakdown not available.</p>
            <p className="mt-1">Reason: {signals.reason || candidate.matchReason || 'Unknown'}</p>
          </div>
        </div>
      )}
      
      {/* Fallback for no signals at all */}
      {expanded && !signals && (
        <div className="px-3 pb-3 border-t border-gray-200 bg-gray-50">
          <div className="pt-3 text-xs text-gray-500">
            <p>No signal data available for this match.</p>
            <p className="mt-1">Match reason: {candidate.matchReason?.replace(/_/g, ' ') || 'Unknown'}</p>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Help section explaining the scoring system
 */
const ScoringHelp: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <InformationCircleIcon className="w-5 h-5 text-blue-500" />
          <span className="text-sm font-medium text-blue-800">How matching works</span>
        </div>
        {expanded ? (
          <ChevronUpIcon className="w-4 h-4 text-blue-500" />
        ) : (
          <ChevronDownIcon className="w-4 h-4 text-blue-500" />
        )}
      </button>
      
      {expanded && (
        <div className="mt-3 text-xs text-blue-700 space-y-2">
          <p>
            Each potential match is scored based on how well the extracted post data matches the game record.
            Higher scores indicate better matches.
          </p>
          
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="flex items-center gap-2">
              <span>✅</span>
              <span>Signal matched (adds points)</span>
            </div>
            <div className="flex items-center gap-2">
              <span>❌</span>
              <span>Signal didn't match (may subtract)</span>
            </div>
            <div className="flex items-center gap-2">
              <span>⚪</span>
              <span>No data to compare</span>
            </div>
            <div className="flex items-center gap-2">
              <span>➖</span>
              <span>Not applicable</span>
            </div>
          </div>
          
          <div className="pt-2 border-t border-blue-200 mt-2">
            <p className="font-medium mb-1">Confidence thresholds:</p>
            <ul className="space-y-1 ml-4">
              <li><span className="text-green-600 font-medium">≥80%</span> — Auto-linkable, high confidence</li>
              <li><span className="text-yellow-600 font-medium">60-79%</span> — Good match, review recommended</li>
              <li><span className="text-orange-600 font-medium">40-59%</span> — Possible match, verify manually</li>
              <li><span className="text-red-600 font-medium">&lt;40%</span> — Low confidence, likely not a match</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const MatchesTab: React.FC<MatchesTabProps> = ({
  candidates,
  primaryMatch,
  selectedGameId,
  onSelectGame,
  isLinking,
}) => {
  // Empty state
  if (!candidates || candidates.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <LinkIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p className="font-medium">No matching games found</p>
        <p className="text-sm mt-1">Try adjusting the date range or check if the game exists</p>
      </div>
    );
  }
  
  // Sort by confidence
  const sortedCandidates = useMemo(() => 
    [...candidates].sort((a, b) => b.matchConfidence - a.matchConfidence),
    [candidates]
  );
  
  return (
    <div className="p-4">
      {/* Help section */}
      <ScoringHelp />
      
      {/* Summary */}
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {candidates.length} potential match{candidates.length !== 1 ? 'es' : ''} found
        </div>
        {primaryMatch && (
          <div className="text-sm">
            <span className="text-gray-500">Best match: </span>
            <ConfidenceBadge confidence={primaryMatch.matchConfidence} size="sm" />
          </div>
        )}
      </div>
      
      {/* Match cards */}
      <div className="space-y-3">
        {sortedCandidates.map((candidate) => (
          <GameMatchCard
            key={candidate.gameId}
            candidate={candidate}
            isSelected={selectedGameId === candidate.gameId}
            onSelect={() => onSelectGame(candidate.gameId)}
            disabled={isLinking}
            showBreakdown={true}
          />
        ))}
      </div>
    </div>
  );
};

export default MatchesTab;