// src/pages/ScraperAdminPage.tsx
// REFACTORED: Consolidated Auto, Manual, and Bulk tabs into a single "Scrape" tab.

import React, { useState } from 'react';
import {
    List, 
    Activity, 
    Clock, 
    Settings,
    HardDrive,
    Zap, // New Icon for the unified Scrape tab
} from 'lucide-react';

// Import the tab components
import { OverviewTab } from './scraper-admin-tabs/OverviewTab';
import { ScrapeTab } from './scraper-admin-tabs/ScraperTab';
import { JobHistoryTab } from './scraper-admin-tabs/JobHistoryTab';
import { URLManagementTab } from './scraper-admin-tabs/URLManagementTab';
import { SettingsTab } from './scraper-admin-tabs/SettingsTab';
import { S3ManagementTab } from './scraper-admin-tabs/S3ManagementTab';

// Tab definitions
type TabKey = 'overview' | 'scrape' | 'jobs' | 'urls' | 's3' | 'settings';

interface Tab {
    key: TabKey;
    label: string;
    icon: React.ReactNode;
    description: string;
}

// --- REFACTORED: tabs array ---
const tabs: Tab[] = [
    { key: 'overview', label: 'Overview', icon: <Activity className="h-4 w-4" />, description: 'System metrics and health' },
    { key: 'scrape', label: 'Scrape', icon: <Zap className="h-4 w-4" />, description: 'Run scraper jobs' },
    { key: 'jobs', label: 'Job History', icon: <Clock className="h-4 w-4" />, description: 'View all scraping jobs' },
    { key: 'urls', label: 'URL Management', icon: <List className="h-4 w-4" />, description: 'Manage scraped URLs' },
    { key: 's3', label: 'S3 Storage', icon: <HardDrive className="h-4 w-4" />, description: 'Manage HTML storage' },    
    { key: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" />, description: 'Configuration and preferences' }
];
// --- REMOVED: 'auto', 'manual', 'bulk' keys ---

// ===================================================================
// MAIN COMPONENT
// ===================================================================
export const ScraperAdminPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabKey>('overview');
    const [urlToReparse, setUrlToReparse] = useState<string | null>(null);

    const handleTabSwitch = (newTab: TabKey) => {
        setActiveTab(newTab);
    };

    // This function is passed to S3ManagementTab.
    // When called, it sets the URL and switches to the new 'scrape' tab.
    const handleReparse = (url: string) => {
        console.log(`[AdminPage] Setting URL to re-parse: ${url}`);
        setUrlToReparse(url);
        setActiveTab('scrape'); // Switch to the NEW unified scraper tab
    };

    // --- REFACTORED: renderTabContent ---
    const renderTabContent = () => {
        switch (activeTab) {
            case 'overview':
                return <OverviewTab />;
            case 'scrape':
                // Pass re-parse URL and clear function to the new consolidated tab
                return (
                    <ScrapeTab 
                        urlToReparse={urlToReparse}
                        onReparseComplete={() => setUrlToReparse(null)}
                    />
                );
            case 'jobs':
                return <JobHistoryTab />;
            case 'urls':
                return <URLManagementTab />;
            case 's3':
                // Pass the re-parse handler to the S3 tab
                return <S3ManagementTab onReparse={handleReparse} />;
            case 'settings':
                return <SettingsTab />;
            default:
                return <OverviewTab />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Scraper Administration</h1>
                        <p className="text-gray-600 mt-2">Manage and monitor tournament scraping operations</p>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="mb-6 bg-white rounded-lg shadow">
                    <div className="flex flex-wrap">
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => handleTabSwitch(tab.key)}
                                className={`flex items-center px-4 py-3 text-sm font-medium transition-colors ${
                                    activeTab === tab.key
                                        ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-700'
                                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                                title={tab.description}
                            >
                                {tab.icon}
                                <span className="ml-2">{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tab Content */}
                <div className="animate-fadeIn">
                    {renderTabContent()}
                </div>

                {/* Footer */}
                <div className="mt-8 text-center text-sm text-gray-500">
                    <p>
                        Scraper system operational.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ScraperAdminPage;