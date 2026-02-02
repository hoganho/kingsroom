/**
 * Player Activity Trends Calculator
 * ==================================
 * Calculates week-on-week and month-on-month player activity trends
 * by consuming PlayerActivitySnapshot data.
 * 
 * Used by metricsPackGenerator to include trending data in MetricsPacks
 * for AI report generation.
 * 
 * @version 1.0.0
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

// Initialize DynamoDB client
const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// Table name helper
const getTableName = (baseName) => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    return `${baseName}-${apiId}-${env}`;
};

/**
 * Get week key from a date (e.g., "2025-W05")
 */
function getWeekKey(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Get previous week key
 */
function getPreviousWeekKey(weekKey) {
    const [year, week] = weekKey.split('-W').map(Number);
    if (week === 1) {
        // Go to last week of previous year (approximation)
        return `${year - 1}-W52`;
    }
    return `${year}-W${String(week - 1).padStart(2, '0')}`;
}

/**
 * Get month key from a date (e.g., "2025-02")
 */
function getMonthKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get previous month key
 */
function getPreviousMonthKey(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    if (month === 1) {
        return `${year - 1}-12`;
    }
    return `${year}-${String(month - 1).padStart(2, '0')}`;
}

/**
 * Parse JSON safely
 */
function safeJsonParse(str, defaultValue = {}) {
    if (!str) return defaultValue;
    if (typeof str === 'object') return str;
    try {
        return JSON.parse(str);
    } catch (e) {
        console.warn('Failed to parse JSON:', e.message);
        return defaultValue;
    }
}

/**
 * Calculate delta between two distributions
 */
function calculateDistributionDelta(current, previous) {
    const delta = {};
    const allKeys = new Set([...Object.keys(current || {}), ...Object.keys(previous || {})]);
    
    for (const key of allKeys) {
        const currentVal = current?.[key] || 0;
        const previousVal = previous?.[key] || 0;
        const change = currentVal - previousVal;
        const percentChange = previousVal > 0 
            ? ((change / previousVal) * 100).toFixed(1)
            : (currentVal > 0 ? 100 : 0);
        
        delta[key] = {
            current: currentVal,
            previous: previousVal,
            change,
            percentChange: parseFloat(percentChange),
            trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable'
        };
    }
    
    return delta;
}

/**
 * Fetch a snapshot by ID
 */
async function getSnapshot(snapshotId) {
    const snapshotTable = getTableName('PlayerActivitySnapshot');
    
    try {
        const response = await docClient.send(new GetCommand({
            TableName: snapshotTable,
            Key: { id: snapshotId }
        }));
        return response.Item;
    } catch (error) {
        console.warn(`[TRENDS] Snapshot not found: ${snapshotId}`);
        return null;
    }
}

/**
 * Get the most recent daily snapshot
 */
async function getLatestDailySnapshot() {
    const snapshotTable = getTableName('PlayerActivitySnapshot');
    
    try {
        // Scan for DAILY snapshots, sorted by date descending
        const response = await docClient.send(new ScanCommand({
            TableName: snapshotTable,
            FilterExpression: 'snapshotType = :type',
            ExpressionAttributeValues: {
                ':type': 'DAILY'
            },
            Limit: 10
        }));
        
        if (!response.Items || response.Items.length === 0) {
            return null;
        }
        
        // Sort by dateKey descending
        const sorted = response.Items.sort((a, b) => 
            (b.dateKey || '').localeCompare(a.dateKey || '')
        );
        
        return sorted[0];
    } catch (error) {
        console.error('[TRENDS] Error fetching latest daily snapshot:', error.message);
        return null;
    }
}

/**
 * Calculate weekly trends (week-on-week comparison)
 * 
 * @param {string} weekKey - The current week key (e.g., "2025-W05")
 * @returns {Object} Weekly trends data
 */
async function calculateWeeklyTrends(weekKey) {
    const currentWeekKey = weekKey || getWeekKey(new Date());
    const previousWeekKey = getPreviousWeekKey(currentWeekKey);
    
    console.log(`[TRENDS] Calculating weekly trends: ${previousWeekKey} → ${currentWeekKey}`);
    
    // Fetch weekly snapshots
    const currentSnapshot = await getSnapshot(`WEEKLY_${currentWeekKey}`);
    const previousSnapshot = await getSnapshot(`WEEKLY_${previousWeekKey}`);
    
    // If no weekly snapshot, try latest daily
    const latestDaily = currentSnapshot ? null : await getLatestDailySnapshot();
    const effectiveCurrent = currentSnapshot || latestDaily;
    
    if (!effectiveCurrent) {
        console.warn('[TRENDS] No current snapshot available for weekly trends');
        return {
            available: false,
            reason: 'No snapshot data available',
            currentWeek: currentWeekKey,
            previousWeek: previousWeekKey
        };
    }
    
    // Parse distributions
    const currentTargeting = safeJsonParse(effectiveCurrent.playerTargetingDistribution);
    const previousTargeting = previousSnapshot 
        ? safeJsonParse(previousSnapshot.playerTargetingDistribution)
        : {};
    
    const currentCategories = safeJsonParse(effectiveCurrent.accountCategoryDistribution);
    const previousCategories = previousSnapshot
        ? safeJsonParse(previousSnapshot.accountCategoryDistribution)
        : {};
    
    return {
        available: true,
        periodType: 'WEEKLY',
        currentPeriod: currentWeekKey,
        previousPeriod: previousWeekKey,
        snapshotDate: effectiveCurrent.snapshotDate,
        
        // Totals comparison
        totals: {
            players: {
                current: effectiveCurrent.totalPlayers || 0,
                previous: previousSnapshot?.totalPlayers || 0,
                change: (effectiveCurrent.totalPlayers || 0) - (previousSnapshot?.totalPlayers || 0)
            },
            playerVenues: {
                current: effectiveCurrent.totalPlayerVenues || 0,
                previous: previousSnapshot?.totalPlayerVenues || 0,
                change: (effectiveCurrent.totalPlayerVenues || 0) - (previousSnapshot?.totalPlayerVenues || 0)
            }
        },
        
        // Targeting classification trends
        targetingClassification: {
            distribution: currentTargeting,
            delta: calculateDistributionDelta(currentTargeting, previousTargeting),
            highlights: generateTargetingHighlights(currentTargeting, previousTargeting)
        },
        
        // Account category trends (if available)
        accountCategory: currentCategories && Object.keys(currentCategories).length > 0 ? {
            distribution: currentCategories,
            delta: calculateDistributionDelta(currentCategories, previousCategories),
            highlights: generateCategoryHighlights(currentCategories, previousCategories)
        } : null,
        
        // VIP stats
        vipStats: effectiveCurrent.totalVIPs ? {
            totalVIPs: effectiveCurrent.totalVIPs,
            previousVIPs: previousSnapshot?.totalVIPs || null,
            change: previousSnapshot?.totalVIPs 
                ? effectiveCurrent.totalVIPs - previousSnapshot.totalVIPs
                : null
        } : null,
        
        // Data quality
        dataQuality: {
            hasCurrentSnapshot: !!currentSnapshot,
            hasPreviousSnapshot: !!previousSnapshot,
            usedLatestDaily: !currentSnapshot && !!latestDaily,
            dailySnapshotCount: effectiveCurrent.dailySnapshotCount || 1
        }
    };
}

/**
 * Calculate monthly trends (month-on-month comparison)
 * 
 * @param {string} monthKey - The current month key (e.g., "2025-02")
 * @returns {Object} Monthly trends data
 */
async function calculateMonthlyTrends(monthKey) {
    const currentMonthKey = monthKey || getMonthKey(new Date());
    const previousMonthKey = getPreviousMonthKey(currentMonthKey);
    
    console.log(`[TRENDS] Calculating monthly trends: ${previousMonthKey} → ${currentMonthKey}`);
    
    // Fetch monthly snapshots
    const currentSnapshot = await getSnapshot(`MONTHLY_${currentMonthKey}`);
    const previousSnapshot = await getSnapshot(`MONTHLY_${previousMonthKey}`);
    
    if (!currentSnapshot) {
        // Try to use latest weekly or daily
        const weekKey = getWeekKey(new Date());
        const weeklySnapshot = await getSnapshot(`WEEKLY_${weekKey}`);
        const latestDaily = weeklySnapshot ? null : await getLatestDailySnapshot();
        const fallback = weeklySnapshot || latestDaily;
        
        if (!fallback) {
            console.warn('[TRENDS] No snapshot data available for monthly trends');
            return {
                available: false,
                reason: 'No monthly snapshot data available',
                currentMonth: currentMonthKey,
                previousMonth: previousMonthKey
            };
        }
        
        // Use fallback with warning
        return await buildMonthlyTrendsFromFallback(
            fallback, 
            previousSnapshot,
            currentMonthKey,
            previousMonthKey
        );
    }
    
    // Parse distributions
    const currentCategories = safeJsonParse(currentSnapshot.accountCategoryDistribution);
    const previousCategories = previousSnapshot
        ? safeJsonParse(previousSnapshot.accountCategoryDistribution)
        : {};
    
    const currentTargeting = safeJsonParse(currentSnapshot.playerTargetingDistribution);
    const previousTargeting = previousSnapshot
        ? safeJsonParse(previousSnapshot.playerTargetingDistribution)
        : {};
    
    // Parse VIP stats
    const currentVIPStats = safeJsonParse(currentSnapshot.vipStatsByEntity);
    const previousVIPStats = previousSnapshot
        ? safeJsonParse(previousSnapshot.vipStatsByEntity)
        : {};
    
    return {
        available: true,
        periodType: 'MONTHLY',
        currentPeriod: currentMonthKey,
        previousPeriod: previousMonthKey,
        snapshotDate: currentSnapshot.snapshotDate,
        
        // Totals comparison
        totals: {
            players: {
                current: currentSnapshot.totalPlayers || 0,
                previous: previousSnapshot?.totalPlayers || 0,
                change: (currentSnapshot.totalPlayers || 0) - (previousSnapshot?.totalPlayers || 0)
            },
            playerVenues: {
                current: currentSnapshot.totalPlayerVenues || 0,
                previous: previousSnapshot?.totalPlayerVenues || 0,
                change: (currentSnapshot.totalPlayerVenues || 0) - (previousSnapshot?.totalPlayerVenues || 0)
            }
        },
        
        // Account category trends (primary for monthly)
        accountCategory: {
            distribution: currentCategories,
            delta: calculateDistributionDelta(currentCategories, previousCategories),
            transitions: safeJsonParse(currentSnapshot.accountCategoryTransitions),
            highlights: generateCategoryHighlights(currentCategories, previousCategories),
            updatesThisMonth: currentSnapshot.accountCategoryUpdated || 0
        },
        
        // Targeting classification trends
        targetingClassification: {
            distribution: currentTargeting,
            delta: calculateDistributionDelta(currentTargeting, previousTargeting),
            highlights: generateTargetingHighlights(currentTargeting, previousTargeting)
        },
        
        // VIP trends by entity
        vipTrends: {
            totalVIPs: currentSnapshot.totalVIPs || 0,
            previousVIPs: previousSnapshot?.totalVIPs || 0,
            change: (currentSnapshot.totalVIPs || 0) - (previousSnapshot?.totalVIPs || 0),
            byEntity: calculateVIPEntityDelta(currentVIPStats, previousVIPStats)
        },
        
        // Data quality
        dataQuality: {
            hasCurrentSnapshot: true,
            hasPreviousSnapshot: !!previousSnapshot,
            snapshotType: 'MONTHLY'
        }
    };
}

/**
 * Build monthly trends from fallback (weekly/daily) snapshot
 */
async function buildMonthlyTrendsFromFallback(fallback, previousMonthly, currentMonthKey, previousMonthKey) {
    const currentCategories = safeJsonParse(fallback.accountCategoryDistribution);
    const previousCategories = previousMonthly
        ? safeJsonParse(previousMonthly.accountCategoryDistribution)
        : {};
    
    return {
        available: true,
        periodType: 'MONTHLY',
        currentPeriod: currentMonthKey,
        previousPeriod: previousMonthKey,
        snapshotDate: fallback.snapshotDate,
        
        // Using fallback data
        dataSource: 'FALLBACK',
        dataSourceType: fallback.snapshotType,
        
        totals: {
            players: {
                current: fallback.totalPlayers || 0,
                previous: previousMonthly?.totalPlayers || 0,
                change: (fallback.totalPlayers || 0) - (previousMonthly?.totalPlayers || 0)
            }
        },
        
        accountCategory: currentCategories && Object.keys(currentCategories).length > 0 ? {
            distribution: currentCategories,
            delta: calculateDistributionDelta(currentCategories, previousCategories),
            highlights: generateCategoryHighlights(currentCategories, previousCategories),
            note: 'Based on latest available snapshot, not month-end'
        } : null,
        
        vipTrends: fallback.totalVIPs ? {
            totalVIPs: fallback.totalVIPs,
            previousVIPs: previousMonthly?.totalVIPs || null
        } : null,
        
        dataQuality: {
            hasCurrentSnapshot: false,
            hasPreviousSnapshot: !!previousMonthly,
            usedFallback: true,
            fallbackType: fallback.snapshotType
        }
    };
}

/**
 * Generate targeting classification highlights (notable changes)
 */
function generateTargetingHighlights(current, previous) {
    const highlights = [];
    const delta = calculateDistributionDelta(current, previous);
    
    // Find significant changes (>10% or >20 players)
    for (const [classification, stats] of Object.entries(delta)) {
        if (Math.abs(stats.change) >= 20 || Math.abs(stats.percentChange) >= 10) {
            const direction = stats.change > 0 ? 'increased' : 'decreased';
            highlights.push({
                classification,
                change: stats.change,
                percentChange: stats.percentChange,
                message: `${classification} ${direction} by ${Math.abs(stats.change)} players (${Math.abs(stats.percentChange)}%)`
            });
        }
    }
    
    // Sort by absolute change
    highlights.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    
    return highlights.slice(0, 5); // Top 5 highlights
}

/**
 * Generate account category highlights
 */
function generateCategoryHighlights(current, previous) {
    const highlights = [];
    const delta = calculateDistributionDelta(current, previous);
    
    // Category order for significance
    const categoryImportance = { VIP: 5, REGULAR: 4, COMMITTED: 3, CASUAL: 2, TRIALIST: 1 };
    
    for (const [category, stats] of Object.entries(delta)) {
        if (stats.change !== 0) {
            const direction = stats.change > 0 ? 'grew' : 'shrank';
            const importance = categoryImportance[category] || 0;
            
            highlights.push({
                category,
                change: stats.change,
                percentChange: stats.percentChange,
                current: stats.current,
                importance,
                message: `${category} ${direction} by ${Math.abs(stats.change)} (now ${stats.current} players)`
            });
        }
    }
    
    // Sort by importance then by change magnitude
    highlights.sort((a, b) => {
        if (b.importance !== a.importance) return b.importance - a.importance;
        return Math.abs(b.change) - Math.abs(a.change);
    });
    
    return highlights;
}

/**
 * Calculate VIP delta by entity
 */
function calculateVIPEntityDelta(current, previous) {
    const entityDelta = {};
    const allEntities = new Set([...Object.keys(current || {}), ...Object.keys(previous || {})]);
    
    for (const entityId of allEntities) {
        const curr = current?.[entityId] || {};
        const prev = previous?.[entityId] || {};
        
        entityDelta[entityId] = {
            currentVIPs: curr.vipCount || 0,
            previousVIPs: prev.vipCount || 0,
            change: (curr.vipCount || 0) - (prev.vipCount || 0),
            currentThreshold: curr.threshold || 0,
            previousThreshold: prev.threshold || 0,
            thresholdChange: (curr.threshold || 0) - (prev.threshold || 0)
        };
    }
    
    return entityDelta;
}

/**
 * Main function: Calculate player activity trends for a report period
 * 
 * @param {string} reportType - 'WEEKLY_OPS' or 'MONTHLY_EXEC'
 * @param {string} periodKey - The period key (e.g., "2025-W05" or "2025-02")
 * @returns {Object} Complete trends data for inclusion in MetricsPack
 */
async function calculatePlayerActivityTrends(reportType, periodKey) {
    console.log(`[TRENDS] Calculating trends for ${reportType}, period: ${periodKey}`);
    
    try {
        if (reportType === 'WEEKLY_OPS') {
            const weekKey = periodKey?.includes('-W') ? periodKey : getWeekKey(new Date());
            return {
                type: 'WEEKLY',
                weekly: await calculateWeeklyTrends(weekKey),
                generatedAt: new Date().toISOString()
            };
        } else if (reportType === 'MONTHLY_EXEC') {
            const monthKey = periodKey?.match(/^\d{4}-\d{2}$/) ? periodKey : getMonthKey(new Date());
            return {
                type: 'MONTHLY',
                monthly: await calculateMonthlyTrends(monthKey),
                generatedAt: new Date().toISOString()
            };
        } else {
            // Default: return both if available
            const now = new Date();
            return {
                type: 'BOTH',
                weekly: await calculateWeeklyTrends(getWeekKey(now)),
                monthly: await calculateMonthlyTrends(getMonthKey(now)),
                generatedAt: new Date().toISOString()
            };
        }
    } catch (error) {
        console.error('[TRENDS] Error calculating trends:', error);
        return {
            available: false,
            error: error.message,
            generatedAt: new Date().toISOString()
        };
    }
}

module.exports = {
    calculatePlayerActivityTrends,
    calculateWeeklyTrends,
    calculateMonthlyTrends,
    getWeekKey,
    getMonthKey
};
