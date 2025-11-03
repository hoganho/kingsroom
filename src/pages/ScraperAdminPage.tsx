// src/pages/ScraperAdminPage-Updated.tsx
// Enhanced Scraper Administration Panel with CloudWatch Analytics

import React, { useState, useEffect } from 'react';
import {
    Database, 
    List, 
    Activity, 
    Clock, 
    Target, 
    Settings,
    RefreshCw,
    BarChart3  // New icon for Analytics
} from 'lucide-react';

// Import CloudWatch monitoring
import { useCloudWatchMetrics } from '../infrastructure/client-cloudwatch';

// Import the tab components
import { OverviewTab } from './scraper-admin-tabs/OverviewTab';
import { AutoScraperTab } from './scraper-admin-tabs/AutoScraperTab';
import { ManualTrackerTab } from './scraper-admin-tabs/ManualTrackerTab';
import { BulkScraperTab } from './scraper-admin-tabs/BulkScraperTab';
import { JobHistoryTab } from './scraper-admin-tabs/JobHistoryTab';
import { URLManagementTab } from './scraper-admin-tabs/URLManagementTab';
import { AnalyticsTab } from './scraper-admin-tabs/AnalyticsTab';
import { SettingsTab } from './scraper-admin-tabs/SettingsTab';

// Tab definitions
type TabKey = 'overview' | 'auto' | 'manual' | 'bulk' | 'jobs' | 'urls' | 'analytics' | 'settings';

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
    { key: 'analytics', label: 'Analytics', icon: <BarChart3 className="h-4 w-4" />, description: 'Performance metrics & monitoring' },  // NEW
    { key: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" />, description: 'Configuration and preferences' }
];

// ===================================================================
// MAIN COMPONENT WITH CLOUDWATCH INTEGRATION
// ===================================================================
export const ScraperAdminPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabKey>('overview');
    const cloudWatch = useCloudWatchMetrics();

    // Track page view and initialize CloudWatch
    useEffect(() => {
        // Track initial page view
        cloudWatch.trackPageView('ScraperAdminPage', {
            initialTab: activeTab,
            timestamp: new Date().toISOString()
        });

        // Track render performance
        cloudWatch.startMark('ScraperAdminPageRender');

        return () => {
            // Track how long the page was open
            const duration = cloudWatch.endMark('ScraperAdminPageRender');
            console.log(`User spent ${duration}ms on ScraperAdminPage`);
        };
    }, []);

    // Track tab switches with CloudWatch
    const handleTabSwitch = (newTab: TabKey) => {
        // Track the tab switch
        cloudWatch.trackTabSwitch(activeTab, newTab);
        
        // Track user action
        cloudWatch.trackUserAction('tab_switch', 'navigation', {
            from: activeTab,
            to: newTab,
            timestamp: new Date().toISOString()
        });

        // Track feature usage
        cloudWatch.trackFeatureUsage(`ScraperAdmin_${newTab}`, Date.now());
        
        setActiveTab(newTab);
    };

    const renderTabContent = () => {
        // Track tab view duration
        cloudWatch.startMark(`TabView_${activeTab}`);

        switch (activeTab) {
            case 'overview':
                return <OverviewTab />;
            case 'auto':
                return <AutoScraperTab />;
            case 'manual':
                return <ManualTrackerTab />;
            case 'bulk':
                return <BulkScraperTab />;
            case 'jobs':
                return <JobHistoryTab />;
            case 'urls':
                return <URLManagementTab />;
            case 'analytics':
                return <AnalyticsTab />;  // NEW
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
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">Scraper Administration</h1>
                            <p className="text-gray-600 mt-2">Manage and monitor tournament scraping operations</p>
                        </div>
                        {/* User Metrics Summary (if available) */}
                        {cloudWatch.userMetrics && (
                            <div className="text-right text-sm text-gray-500">
                                <p>Your session: {cloudWatch.userMetrics.totalActions || 0} actions</p>
                                <p>Active for: {cloudWatch.userMetrics.sessionDuration || '< 1 min'}</p>
                            </div>
                        )}
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
                                {/* Show badge for Analytics tab if there are issues */}
                                {tab.key === 'analytics' && (
                                    <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded-full">
                                        New
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tab Content with Performance Monitoring */}
                <div className="animate-fadeIn">
                    {renderTabContent()}
                </div>

                {/* Footer with Metrics Link */}
                <div className="mt-8 text-center text-sm text-gray-500">
                    <p>
                        Performance metrics are being tracked via CloudWatch. 
                        <a 
                            href="/scraper-admin?tab=analytics" 
                            className="text-blue-600 hover:underline ml-1"
                            onClick={(e) => {
                                e.preventDefault();
                                handleTabSwitch('analytics');
                            }}
                        >
                            View Analytics →
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ScraperAdminPage;
