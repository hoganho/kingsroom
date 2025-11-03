// src/pages/scraper-admin-tabs/SettingsTab.tsx

import React, { useState } from 'react';

export const SettingsTab: React.FC = () => {
    const [settings, setSettings] = useState({
        autoScraperEnabled: true,
        scheduleTime: '06:00',
        maxConcurrentJobs: 1,
        maxGamesPerJob: 50,
        consecutiveBlankThreshold: 10
    });

    const handleSave = () => {
        // Save settings to backend
        console.log('Saving settings:', settings);
        alert('Settings saved successfully!');
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Scraper Settings</h3>
                
                <div className="space-y-4">
                    <div>
                        <label className="flex items-center">
                            <input
                                type="checkbox"
                                checked={settings.autoScraperEnabled}
                                onChange={(e) => setSettings({...settings, autoScraperEnabled: e.target.checked})}
                                className="mr-2"
                            />
                            <span className="text-sm font-medium">Enable Automatic Scraping</span>
                        </label>
                        <p className="text-xs text-gray-500 mt-1">
                            Automatically scrape new tournaments on schedule
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Daily Schedule Time (AEST)
                        </label>
                        <input
                            type="time"
                            value={settings.scheduleTime}
                            onChange={(e) => setSettings({...settings, scheduleTime: e.target.value})}
                            className="px-3 py-2 border border-gray-300 rounded-md"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Max Games Per Job
                        </label>
                        <input
                            type="number"
                            value={settings.maxGamesPerJob}
                            onChange={(e) => setSettings({...settings, maxGamesPerJob: parseInt(e.target.value)})}
                            className="px-3 py-2 border border-gray-300 rounded-md"
                            min="1"
                            max="100"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Maximum number of games to process in a single job
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Consecutive Blank Threshold
                        </label>
                        <input
                            type="number"
                            value={settings.consecutiveBlankThreshold}
                            onChange={(e) => setSettings({...settings, consecutiveBlankThreshold: parseInt(e.target.value)})}
                            className="px-3 py-2 border border-gray-300 rounded-md"
                            min="5"
                            max="50"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Stop scanning after this many consecutive blank results
                        </p>
                    </div>

                    <div className="pt-4">
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            Save Settings
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
