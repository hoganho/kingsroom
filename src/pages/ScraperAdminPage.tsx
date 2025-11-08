// src/pages/ScraperAdminPage.tsx
// Scraper Administration Panel (CloudWatch removed for performance)

import React, { useState } from 'react';
import {
    Database, 
    List, 
    Activity, 
    Clock, 
    Target, 
    Settings,
    RefreshCw,
    HardDrive,
} from 'lucide-react';

// Import the tab components
import { OverviewTab } from './scraper-admin-tabs/OverviewTab';
import { AutoScraperTab } from './scraper-admin-tabs/AutoScraperTab';
import { SingleScraperTab } from './scraper-admin-tabs/SingleScraperTab';
import { BulkScraperTab } from './scraper-admin-tabs/BulkScraperTab';
import { JobHistoryTab } from './scraper-admin-tabs/JobHistoryTab';
import { URLManagementTab } from './scraper-admin-tabs/URLManagementTab';
//import { AnalyticsTab } from './scraper-admin-tabs/AnalyticsTab';
import { SettingsTab } from './scraper-admin-tabs/SettingsTab';
import { S3ManagementTab } from './scraper-admin-tabs/S3ManagementTab';

// Tab definitions
type TabKey = 'overview' | 'auto' | 'manual' | 'bulk' | 'jobs' | 'urls' | 'analytics' | 's3' | 'settings';

interface Tab {
    key: TabKey;
    label: string;
    icon: React.ReactNode;
    description: string;
}

const tabs: Tab[] = [
    { key: 'overview', label: 'Overview', icon: <Activity className="h-4 w-4" />, description: 'System metrics and health' },
    { key: 'manual', label: 'Manual Scrape', icon: <Target className="h-4 w-4" />, description: 'Scrape specific games' },
    { key: 'bulk', label: 'Bulk Scrape', icon: <Database className="h-4 w-4" />, description: 'Scrape range of games' },
    { key: 'auto', label: 'Auto Scrape', icon: <RefreshCw className="h-4 w-4" />, description: 'Automated scraping' },
    { key: 'jobs', label: 'Job History', icon: <Clock className="h-4 w-4" />, description: 'View all scraping jobs' },
    { key: 'urls', label: 'URL Management', icon: <List className="h-4 w-4" />, description: 'Manage scraped URLs' },
    //{ key: 'analytics', label: 'Analytics', icon: <BarChart3 className="h-4 w-4" />, description: 'Performance metrics' },
    { key: 's3', label: 'S3 Storage', icon: <HardDrive className="h-4 w-4" />, description: 'Manage HTML storage' },    
    { key: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" />, description: 'Configuration and preferences' }
];

// ===================================================================
// MAIN COMPONENT WITHOUT CLOUDWATCH
// ===================================================================
export const ScraperAdminPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabKey>('overview');

    // Simple tab switch handler (no CloudWatch tracking)
    const handleTabSwitch = (newTab: TabKey) => {
        setActiveTab(newTab);
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case 'overview':
                return <OverviewTab />;
            case 'auto':
                return <AutoScraperTab />;
            case 'manual':
                return <SingleScraperTab />;
            case 'bulk':
                return <BulkScraperTab />;
            case 'jobs':
                return <JobHistoryTab />;
            case 'urls':
                return <URLManagementTab />;
            case 's3':
                return <S3ManagementTab />;
            //case 'analytics':
            //    return <AnalyticsTab />;
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
                        Scraper system operational. Check the Analytics tab for performance metrics.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ScraperAdminPage;