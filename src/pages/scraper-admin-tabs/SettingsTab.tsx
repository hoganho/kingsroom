// src/pages/scraper-admin-tabs/SettingsTab.tsx
// VERSION: 2.0.0 - Added global auto-refresh toggle with backend persistence
//
// This controls the global auto-refresh setting that:
// - When OFF: Lambda exits early (no scraping), HomePage doesn't auto-refresh
// - When ON: Normal operation with scheduled refreshes
//
// The setting is stored in DynamoDB (ScraperSettings table) and checked by:
// - refreshRunningGames Lambda (exits early if disabled)
// - HomePage (disables auto-refresh timers if disabled)

import React, { useState, useEffect } from 'react';
import {
    Power,
    PowerOff,
    Clock,
    Settings,
    Save,
    RefreshCw,
    AlertTriangle,
    CheckCircle,
    Info,
} from 'lucide-react';
import { useScraperSettings } from '../../hooks/scraper/useScraperSettings';
import { formatRelativeAEST } from '../../utils/dateUtils';

// ============================================
// TOGGLE SWITCH COMPONENT
// ============================================

interface ToggleSwitchProps {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
    disabled?: boolean;
    size?: 'sm' | 'md' | 'lg';
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ 
    enabled, 
    onChange, 
    disabled = false,
    size = 'md' 
}) => {
    const sizeClasses = {
        sm: { track: 'w-8 h-4', thumb: 'w-3 h-3', translate: 'translate-x-4' },
        md: { track: 'w-11 h-6', thumb: 'w-5 h-5', translate: 'translate-x-5' },
        lg: { track: 'w-14 h-7', thumb: 'w-6 h-6', translate: 'translate-x-7' },
    };
    
    const classes = sizeClasses[size];
    
    return (
        <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={disabled}
            onClick={() => onChange(!enabled)}
            className={`
                relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent 
                transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                ${classes.track}
                ${enabled ? 'bg-green-500' : 'bg-gray-300'}
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
        >
            <span
                className={`
                    pointer-events-none inline-block rounded-full bg-white shadow-lg ring-0 
                    transition duration-200 ease-in-out transform
                    ${classes.thumb}
                    ${enabled ? classes.translate : 'translate-x-0'}
                `}
            />
        </button>
    );
};

// ============================================
// MAIN SETTINGS TAB COMPONENT
// ============================================

export const SettingsTab: React.FC = () => {
    const { 
        settings, 
        loading, 
        error, 
        updating,
        updateAutoRefresh,
        updateSettings,
        refreshSettings,
        isAutoRefreshEnabled,
        refreshIntervals,
    } = useScraperSettings();

    // Local form state
    const [localSettings, setLocalSettings] = useState({
        scheduleTime: '06:00',
        maxGamesPerJob: 50,
        consecutiveBlankThreshold: 10,
        runningRefreshIntervalMinutes: 30,
        startingSoonRefreshIntervalMinutes: 60,
        upcomingRefreshIntervalMinutes: 720,
    });

    const [disableReason, setDisableReason] = useState('');
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Sync local state with fetched settings
    useEffect(() => {
        if (settings) {
            setLocalSettings({
                scheduleTime: settings.scheduleTime || '06:00',
                maxGamesPerJob: settings.maxGamesPerJob || 50,
                consecutiveBlankThreshold: settings.consecutiveBlankThreshold || 10,
                runningRefreshIntervalMinutes: settings.runningRefreshIntervalMinutes || 30,
                startingSoonRefreshIntervalMinutes: settings.startingSoonRefreshIntervalMinutes || 60,
                upcomingRefreshIntervalMinutes: settings.upcomingRefreshIntervalMinutes || 720,
            });
            setDisableReason(settings.disabledReason || '');
        }
    }, [settings]);

    // Handle auto-refresh toggle
    const handleAutoRefreshToggle = async (enabled: boolean) => {
        const success = await updateAutoRefresh(enabled, enabled ? undefined : disableReason);
        if (success && !enabled) {
            setDisableReason(''); // Clear reason after saving
        }
    };

    // Handle other settings save
    const handleSaveSettings = async () => {
        setSaveSuccess(false);
        const success = await updateSettings(localSettings);
        if (success) {
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        }
    };

    // Loading state
    if (loading && !settings) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="text-center">
                    <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
                    <p className="mt-4 text-sm text-gray-500">Loading settings...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Error Display */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm text-red-800 font-medium">Error Loading Settings</p>
                        <p className="text-xs text-red-700 mt-1">{error}</p>
                        <button 
                            onClick={refreshSettings}
                            className="text-xs text-red-600 hover:text-red-800 underline mt-2"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            )}

            {/* ================================================================ */}
            {/* SECTION 1: Global Auto-Refresh Control (Primary Control) */}
            {/* ================================================================ */}
            <div className={`rounded-lg shadow-lg p-6 border-2 ${
                isAutoRefreshEnabled 
                    ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300' 
                    : 'bg-gradient-to-r from-red-50 to-orange-50 border-red-300'
            }`}>
                <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-full ${
                            isAutoRefreshEnabled 
                                ? 'bg-green-100 text-green-600' 
                                : 'bg-red-100 text-red-600'
                        }`}>
                            {isAutoRefreshEnabled ? (
                                <Power className="h-8 w-8" />
                            ) : (
                                <PowerOff className="h-8 w-8" />
                            )}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">
                                Auto-Refresh {isAutoRefreshEnabled ? 'Enabled' : 'Disabled'}
                            </h2>
                            <p className="text-sm text-gray-600 mt-1 max-w-lg">
                                {isAutoRefreshEnabled ? (
                                    <>
                                        The system is actively refreshing tournament data on schedule.
                                        <span className="block text-xs text-gray-500 mt-1">
                                            Running games refresh every {refreshIntervals.running} min, 
                                            starting soon every {refreshIntervals.startingSoon} min.
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        Auto-refresh is disabled. No scheduled scraping will occur.
                                        <span className="block text-xs text-red-600 mt-1 font-medium">
                                            Tournament data will not update automatically. Manual refresh only.
                                        </span>
                                    </>
                                )}
                            </p>
                            
                            {/* Last toggled info */}
                            {settings?.lastToggledAt && (
                                <p className="text-xs text-gray-400 mt-2">
                                    Last changed: {formatRelativeAEST(settings.lastToggledAt)}
                                    {settings.lastToggledBy && ` by ${settings.lastToggledBy}`}
                                </p>
                            )}
                            
                            {/* Disabled reason */}
                            {!isAutoRefreshEnabled && settings?.disabledReason && (
                                <p className="text-xs text-orange-600 mt-1">
                                    Reason: {settings.disabledReason}
                                </p>
                            )}
                        </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-2">
                        <ToggleSwitch
                            enabled={isAutoRefreshEnabled}
                            onChange={handleAutoRefreshToggle}
                            disabled={updating}
                            size="lg"
                        />
                        {updating && (
                            <span className="text-xs text-gray-500">Saving...</span>
                        )}
                    </div>
                </div>

                {/* Disable reason input (shown when toggling OFF) */}
                {!isAutoRefreshEnabled && (
                    <div className="mt-4 pt-4 border-t border-red-200">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Reason for disabling (optional)
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={disableReason}
                                onChange={(e) => setDisableReason(e.target.value)}
                                placeholder="e.g., Weekend - no games, Cost saving period"
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                            />
                            <button
                                onClick={() => updateSettings({ disabledReason: disableReason })}
                                disabled={updating}
                                className="px-3 py-2 bg-gray-600 text-white rounded-md text-sm hover:bg-gray-700 disabled:opacity-50"
                            >
                                Save Reason
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Info box about what this controls */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                    <p className="font-medium">What does this control?</p>
                    <ul className="mt-1 text-xs text-blue-700 space-y-1 list-disc list-inside">
                        <li><strong>Backend:</strong> The scheduled Lambda (refreshRunningGames) checks this setting and exits immediately if disabled - no ScraperAPI calls made.</li>
                        <li><strong>Frontend:</strong> The HomePage dashboard disables auto-refresh timers and shows a clear "Auto-refresh OFF" indicator.</li>
                        <li><strong>Cost saving:</strong> Use this during periods of no activity (weekends, holidays) to avoid unnecessary API costs.</li>
                    </ul>
                </div>
            </div>

            {/* ================================================================ */}
            {/* SECTION 2: Refresh Intervals */}
            {/* ================================================================ */}
            <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Clock className="h-5 w-5 text-blue-600" />
                    <h3 className="text-lg font-semibold">Refresh Intervals</h3>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                    Configure how often each game category is refreshed. These apply when auto-refresh is enabled.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Running Games (minutes)
                        </label>
                        <input
                            type="number"
                            value={localSettings.runningRefreshIntervalMinutes}
                            onChange={(e) => setLocalSettings({
                                ...localSettings, 
                                runningRefreshIntervalMinutes: parseInt(e.target.value) || 30
                            })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            min="5"
                            max="120"
                        />
                        <p className="text-xs text-gray-500 mt-1">Default: 30 minutes</p>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Starting Soon (minutes)
                        </label>
                        <input
                            type="number"
                            value={localSettings.startingSoonRefreshIntervalMinutes}
                            onChange={(e) => setLocalSettings({
                                ...localSettings, 
                                startingSoonRefreshIntervalMinutes: parseInt(e.target.value) || 60
                            })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            min="15"
                            max="240"
                        />
                        <p className="text-xs text-gray-500 mt-1">Default: 60 minutes (1 hour)</p>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Upcoming Games (minutes)
                        </label>
                        <input
                            type="number"
                            value={localSettings.upcomingRefreshIntervalMinutes}
                            onChange={(e) => setLocalSettings({
                                ...localSettings, 
                                upcomingRefreshIntervalMinutes: parseInt(e.target.value) || 720
                            })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            min="60"
                            max="1440"
                        />
                        <p className="text-xs text-gray-500 mt-1">Default: 720 minutes (12 hours)</p>
                    </div>
                </div>
            </div>

            {/* ================================================================ */}
            {/* SECTION 3: Scraper Job Settings */}
            {/* ================================================================ */}
            <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Settings className="h-5 w-5 text-gray-600" />
                    <h3 className="text-lg font-semibold">Scraper Job Settings</h3>
                </div>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Daily Schedule Time (AEST)
                        </label>
                        <input
                            type="time"
                            value={localSettings.scheduleTime}
                            onChange={(e) => setLocalSettings({...localSettings, scheduleTime: e.target.value})}
                            className="px-3 py-2 border border-gray-300 rounded-md"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Time for daily bulk scraping jobs (if enabled)
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Max Games Per Job
                        </label>
                        <input
                            type="number"
                            value={localSettings.maxGamesPerJob}
                            onChange={(e) => setLocalSettings({
                                ...localSettings, 
                                maxGamesPerJob: parseInt(e.target.value) || 50
                            })}
                            className="px-3 py-2 border border-gray-300 rounded-md"
                            min="1"
                            max="100"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Maximum number of games to process in a single refresh job
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Consecutive Blank Threshold
                        </label>
                        <input
                            type="number"
                            value={localSettings.consecutiveBlankThreshold}
                            onChange={(e) => setLocalSettings({
                                ...localSettings, 
                                consecutiveBlankThreshold: parseInt(e.target.value) || 10
                            })}
                            className="px-3 py-2 border border-gray-300 rounded-md"
                            min="5"
                            max="50"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Stop scanning after this many consecutive blank results
                        </p>
                    </div>
                </div>
            </div>

            {/* ================================================================ */}
            {/* SAVE BUTTON */}
            {/* ================================================================ */}
            <div className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
                <div>
                    {saveSuccess && (
                        <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            <span className="text-sm">Settings saved successfully!</span>
                        </div>
                    )}
                </div>
                <button
                    onClick={handleSaveSettings}
                    disabled={updating}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {updating ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                        <Save className="h-4 w-4" />
                    )}
                    Save All Settings
                </button>
            </div>
        </div>
    );
};

export default SettingsTab;