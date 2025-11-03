// src/utils/scraperAnalytics.ts
// Analytics and monitoring utilities for the scraper system

import type {
    ScraperJob,
    ScrapeURL,
    // ScraperMetrics, // Removed: TS6196
    // ScrapeAttempt, // Removed: TS6196
    // ScraperJobStatus, // Removed: TS6196
    // ScrapeURLStatus, // Removed: TS6196
    // ScrapeAttemptStatus // Removed: TS6196
} from '../API';

// ===================================================================
// Performance Analytics
// ===================================================================

export class ScraperAnalytics {
    /**
     * Calculate success rate for a set of jobs
     */
    static calculateJobSuccessRate(jobs: ScraperJob[]): number {
        if (jobs.length === 0) return 0;
        
        const successful = jobs.filter(job => 
            job.status === 'COMPLETED' && 
            (job.errors || 0) < (job.totalURLsProcessed || 0) * 0.1 // Less than 10% errors
        ).length;
        
        return (successful / jobs.length) * 100;
    }

    /**
     * Calculate average processing time per URL
     */
    static calculateAverageProcessingTime(jobs: ScraperJob[]): number {
        const totalTime = jobs.reduce((sum, job) => 
            sum + (job.durationSeconds || 0), 0
        );
        const totalURLs = jobs.reduce((sum, job) => 
            sum + (job.totalURLsProcessed || 0), 0
        );
        
        return totalURLs > 0 ? totalTime / totalURLs : 0;
    }

    /**
     * Identify problematic URLs
     */
    static identifyProblematicURLs(urls: ScrapeURL[]): {
        highFailure: ScrapeURL[];
        slowProcessing: ScrapeURL[];
        stale: ScrapeURL[];
    } {
        const highFailure = urls.filter(url => {
            const failureRate = url.timesScraped > 0 
                ? (url.timesFailed / url.timesScraped) * 100
                : 0;
            return failureRate > 50 && url.timesScraped > 5;
        });

        const slowProcessing = urls.filter(url => 
            (url.averageScrapingTime || 0) > 10 // More than 10 seconds
        );

        const stale = urls.filter(url => {
            if (!url.lastScrapedAt) return true;
            const daysSinceLastScrape = 
                (Date.now() - new Date(url.lastScrapedAt).getTime()) / 
                (1000 * 60 * 60 * 24);
            return daysSinceLastScrape > 30 && url.status === 'ACTIVE';
        });

        return { highFailure, slowProcessing, stale };
    }

    /**
     * Generate job performance report
     */
    static generateJobReport(job: ScraperJob): {
        summary: string;
        performance: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
        recommendations: string[];
    } {
        const successRate = job.successRate || 0;
        const avgTime = job.averageScrapingTime || 0;
        
        // Fix: TS18049 - Provide default values for possibly null/undefined properties
        const totalProcessed = job.totalURLsProcessed || 0;
        const errors = job.errors || 0;
        const errorRate = totalProcessed > 0
            ? (errors / totalProcessed) * 100
            : 0;

        let performance: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
        const recommendations: string[] = [];

        if (successRate >= 95 && avgTime < 3) {
            performance = 'EXCELLENT';
        } else if (successRate >= 85 && avgTime < 5) {
            performance = 'GOOD';
        } else if (successRate >= 70 && avgTime < 10) {
            performance = 'FAIR';
        } else {
            performance = 'POOR';
        }

        // Generate recommendations
        if (successRate < 85) {
            recommendations.push('Review failed URLs and update venue mappings');
        }
        if (avgTime > 5) {
            recommendations.push('Consider optimizing scraping logic or increasing Lambda resources');
        }
        if (errorRate > 10) {
            recommendations.push('Investigate error patterns and add retry logic');
        }

        // Fix: TS2339 - 'consecutiveFailures' is not on ScraperJob. Swapped for 'errorMessages'.
        if (job.errorMessages && job.errorMessages.length > 0) {
            recommendations.push('Some URLs are consistently failing - consider marking as DO_NOT_SCRAPE');
        }

        const summary = `Job ${job.jobId} completed with ${successRate.toFixed(1)}% success rate, ` +
            `processing ${job.totalURLsProcessed} URLs in ${job.durationSeconds}s ` +
            `(avg ${avgTime.toFixed(2)}s per URL)`;

        return { summary, performance, recommendations };
    }

    /**
     * Calculate hourly distribution of jobs
     */
    static calculateHourlyDistribution(jobs: ScraperJob[]): Map<number, number> {
        const distribution = new Map<number, number>();
        
        // Initialize all hours
        for (let i = 0; i < 24; i++) {
            distribution.set(i, 0);
        }

        jobs.forEach(job => {
            const hour = new Date(job.startTime).getHours();
            distribution.set(hour, (distribution.get(hour) || 0) + 1);
        });

        return distribution;
    }

    /**
     * Identify peak scraping times
     */
    static identifyPeakTimes(jobs: ScraperJob[]): {
        peakHour: number;
        offPeakHours: number[];
    } {
        const distribution = this.calculateHourlyDistribution(jobs);
        
        let peakHour = 0;
        let maxJobs = 0;
        
        distribution.forEach((count, hour) => {
            if (count > maxJobs) {
                maxJobs = count;
                peakHour = hour;
            }
        });

        const avgJobs = Array.from(distribution.values())
            .reduce((a, b) => a + b, 0) / 24;
        
        const offPeakHours = Array.from(distribution.entries())
            .filter(([_, count]) => count < avgJobs * 0.5)
            .map(([hour]) => hour);

        return { peakHour, offPeakHours };
    }
}

// ===================================================================
// Error Analysis
// ===================================================================

export class ErrorAnalyzer {
    /**
     * Categorize errors from job error messages
     */
    static categorizeErrors(errorMessages: string[]): Map<string, number> {
        const categories = new Map<string, number>();
        
        const patterns = [
            { pattern: /venue/i, category: 'Venue Assignment' },
            { pattern: /timeout/i, category: 'Timeout' },
            { pattern: /network|connection/i, category: 'Network' },
            { pattern: /parse|parsing/i, category: 'Parsing' },
            { pattern: /save|database/i, category: 'Database' },
            { pattern: /scraping.*disabled/i, category: 'Do Not Scrape' },
            { pattern: /blank|inactive/i, category: 'Inactive Tournament' },
        ];

        errorMessages.forEach(message => {
            let categorized = false;
            
            for (const { pattern, category } of patterns) {
                if (pattern.test(message)) {
                    categories.set(category, (categories.get(category) || 0) + 1);
                    categorized = true;
                    break;
                }
            }
            
            if (!categorized) {
                categories.set('Other', (categories.get('Other') || 0) + 1);
            }
        });

        return categories;
    }

    /**
     * Generate error report
     */
    static generateErrorReport(jobs: ScraperJob[]): {
        totalErrors: number;
        errorRate: number;
        topErrors: Array<{ category: string; count: number; percentage: number }>;
        recommendations: string[];
    } {
        const allErrors: string[] = [];
        let totalProcessed = 0;

        jobs.forEach(job => {
            // Fix: TS2345 - Filter out possible null values from the errorMessages array
            if (job.errorMessages) {
                const validErrors = job.errorMessages.filter(
                    (msg): msg is string => msg !== null
                );
                allErrors.push(...validErrors);
            }
            totalProcessed += job.totalURLsProcessed || 0;
        });

        const totalErrors = allErrors.length;
        const errorRate = totalProcessed > 0 ? (totalErrors / totalProcessed) * 100 : 0;
        
        const categorized = this.categorizeErrors(allErrors);
        const topErrors = Array.from(categorized.entries())
            .map(([category, count]) => ({
                category,
                count,
                percentage: (count / totalErrors) * 100
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        const recommendations: string[] = [];
        
        topErrors.forEach(error => {
            switch (error.category) {
                case 'Venue Assignment':
                    recommendations.push('Review and update venue mapping logic');
                    break;
                case 'Timeout':
                    recommendations.push('Increase Lambda timeout or optimize scraping speed');
                    break;
                case 'Network':
                    recommendations.push('Add retry logic with exponential backoff');
                    break;
                case 'Parsing':
                    recommendations.push('Update HTML parsing logic for changed page structure');
                    break;
                case 'Database':
                    recommendations.push('Check DynamoDB capacity and throttling');
                    break;
            }
        });

        return { totalErrors, errorRate, topErrors, recommendations };
    }
}

// ===================================================================
// URL Health Checker
// ===================================================================

export class URLHealthChecker {
    /**
     * Calculate health score for a URL
     */
    static calculateHealthScore(url: ScrapeURL): number {
        let score = 100;
        
        // Penalize for failures
        if (url.timesScraped > 0) {
            const failureRate = (url.timesFailed / url.timesScraped) * 100;
            score -= failureRate * 0.5;
        }
        
        // Penalize for consecutive failures
        score -= (url.consecutiveFailures || 0) * 10;
        
        // Penalize for slow processing
        if ((url.averageScrapingTime || 0) > 10) {
            score -= 20;
        } else if ((url.averageScrapingTime || 0) > 5) {
            score -= 10;
        }
        
        // Penalize for staleness
        if (url.lastScrapedAt) {
            const daysSinceLastScrape = 
                (Date.now() - new Date(url.lastScrapedAt).getTime()) / 
                (1000 * 60 * 60 * 24);
            if (daysSinceLastScrape > 30) {
                score -= 30;
            } else if (daysSinceLastScrape > 7) {
                score -= 10;
            }
        }
        
        return Math.max(0, Math.min(100, score));
    }

    /**
     * Get health status
     */
    static getHealthStatus(score: number): 'HEALTHY' | 'WARNING' | 'CRITICAL' {
        if (score >= 80) return 'HEALTHY';
        if (score >= 50) return 'WARNING';
        return 'CRITICAL';
    }

    /**
     * Generate URL health report
     */
    static generateHealthReport(urls: ScrapeURL[]): {
        healthy: number;
        warning: number;
        critical: number;
        averageHealth: number;
        recommendations: Map<string, string[]>;
    } {
        let healthy = 0;
        let warning = 0;
        let critical = 0;
        let totalScore = 0;
        const recommendations = new Map<string, string[]>();

        urls.forEach(url => {
            const score = this.calculateHealthScore(url);
            const status = this.getHealthStatus(score);
            totalScore += score;

            switch (status) {
                case 'HEALTHY':
                    healthy++;
                    break;
                case 'WARNING':
                    warning++;
                    break;
                case 'CRITICAL':
                    critical++;
                    const urlRecs: string[] = [];
                    
                    if (url.consecutiveFailures && url.consecutiveFailures > 3) {
                        urlRecs.push('Consider marking as DO_NOT_SCRAPE');
                    }
                    if ((url.averageScrapingTime || 0) > 10) {
                        urlRecs.push('Investigate slow processing time');
                    }
                    if (url.status === 'ERROR') {
                        urlRecs.push('Review error logs and fix issues');
                    }
                    
                    recommendations.set(url.url, urlRecs);
                    break;
            }
        });

        const averageHealth = urls.length > 0 ? totalScore / urls.length : 0;

        return { healthy, warning, critical, averageHealth, recommendations };
    }
}

// ===================================================================
// Trend Analyzer
// ===================================================================

export class TrendAnalyzer {
    /**
     * Calculate trend direction
     */
    static calculateTrend(values: number[]): 'INCREASING' | 'DECREASING' | 'STABLE' {
        if (values.length < 2) return 'STABLE';
        
        let increasing = 0;
        let decreasing = 0;
        
        for (let i = 1; i < values.length; i++) {
            if (values[i] > values[i - 1]) {
                increasing++;
            } else if (values[i] < values[i - 1]) {
                decreasing++;
            }
        }
        
        const threshold = values.length * 0.6;
        if (increasing > threshold) return 'INCREASING';
        if (decreasing > threshold) return 'DECREASING';
        return 'STABLE';
    }

    /**
     * Analyze job trends over time
     */
    static analyzeJobTrends(jobs: ScraperJob[]): {
        volumeTrend: 'INCREASING' | 'DECREASING' | 'STABLE';
        successRateTrend: 'INCREASING' | 'DECREASING' | 'STABLE';
        performanceTrend: 'INCREASING' | 'DECREASING' | 'STABLE';
    } {
        // Sort jobs by time
        const sortedJobs = [...jobs].sort((a, b) => 
            new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );

        // Calculate trends
        const volumes = sortedJobs.map(j => j.totalURLsProcessed || 0);
        const successRates = sortedJobs.map(j => j.successRate || 0);
        const avgTimes = sortedJobs.map(j => j.averageScrapingTime || 0);

        return {
            volumeTrend: this.calculateTrend(volumes),
            successRateTrend: this.calculateTrend(successRates),
            performanceTrend: this.calculateTrend(avgTimes.map(t => -t)) // Invert for performance
        };
    }

    /**
     * Predict next run requirements
     */
    static predictNextRun(recentJobs: ScraperJob[]): {
        expectedURLs: number;
        expectedDuration: number;
        recommendedMaxGames: number;
    } {
        if (recentJobs.length === 0) {
            return {
                expectedURLs: 10,
                expectedDuration: 30,
                recommendedMaxGames: 10
            };
        }

        // Calculate averages from recent jobs
        const avgURLs = recentJobs.reduce((sum, job) => 
            sum + (job.totalURLsProcessed || 0), 0
        ) / recentJobs.length;

        const avgDuration = recentJobs.reduce((sum, job) => 
            sum + (job.durationSeconds || 0), 0
        ) / recentJobs.length;

        const avgNewGames = recentJobs.reduce((sum, job) => 
            sum + (job.newGamesScraped || 0), 0
        ) / recentJobs.length;

        // Apply trend adjustment
        const trends = this.analyzeJobTrends(recentJobs);
        let trendMultiplier = 1;
        
        if (trends.volumeTrend === 'INCREASING') {
            trendMultiplier = 1.2;
        } else if (trends.volumeTrend === 'DECREASING') {
            trendMultiplier = 0.8;
        }

        return {
            expectedURLs: Math.round(avgURLs * trendMultiplier),
            expectedDuration: Math.round(avgDuration * trendMultiplier),
            recommendedMaxGames: Math.max(5, Math.min(50, Math.round(avgNewGames * 1.5)))
        };
    }
}

// ===================================================================
// Export Analytics Functions
// ===================================================================

export const analyzeScraperPerformance = (
    jobs: ScraperJob[],
    urls: ScrapeURL[]
): {
    jobMetrics: ReturnType<typeof ScraperAnalytics.generateJobReport>;
    urlHealth: ReturnType<typeof URLHealthChecker.generateHealthReport>;
    errorAnalysis: ReturnType<typeof ErrorAnalyzer.generateErrorReport>;
    trends: ReturnType<typeof TrendAnalyzer.analyzeJobTrends>;
    predictions: ReturnType<typeof TrendAnalyzer.predictNextRun>;
} => {
    const recentJob = jobs[0];
    const jobMetrics = recentJob 
        ? ScraperAnalytics.generateJobReport(recentJob)
        : { 
            summary: 'No recent jobs', 
            performance: 'POOR' as const, 
            recommendations: [] 
          };

    const urlHealth = URLHealthChecker.generateHealthReport(urls);
    const errorAnalysis = ErrorAnalyzer.generateErrorReport(jobs);
    const trends = TrendAnalyzer.analyzeJobTrends(jobs);
    const predictions = TrendAnalyzer.predictNextRun(jobs.slice(0, 10));

    return {
        jobMetrics,
        urlHealth,
        errorAnalysis,
        trends,
        predictions
    };
};

// ===================================================================
// Export Classes
// ===================================================================

// Removed: TS2323, TS2484 - This block was redeclaring
// exports already made at the class definition.
/*
export {
    ScraperAnalytics,
    ErrorAnalyzer,
    URLHealthChecker,
    TrendAnalyzer
};
*/