// src/infrastructure/client-cloudwatch.ts
// Enhanced client-side CloudWatch monitoring with user authentication

import { generateClient } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';
import { useState, useEffect } from 'react';
import type { GraphQLResult } from '@aws-amplify/api-graphql';
import type { ScraperJob, ScrapeURL } from '../API';

// ===================================================================
// TYPES & INTERFACES
// ===================================================================

interface MetricData {
    metricName: string;
    value: number;
    unit?: 'Count' | 'Milliseconds' | 'Seconds' | 'Bytes' | 'Percent' | 'None';
    dimensions?: Record<string, string | number | boolean>;
    metadata?: any;
    timestamp?: Date;
}

interface PerformanceMark {
    start: number;
    name: string;
}

// ===================================================================
// Enhanced CloudWatch Client Service with User Context
// ===================================================================

export class ClientCloudWatchService {
    private static instance: ClientCloudWatchService;
    private client = generateClient();
    private performanceMarks = new Map<string, PerformanceMark>();
    private metricsBuffer: MetricData[] = [];
    private flushTimer: NodeJS.Timeout | null = null;
    private userId: string | null = null;
    private userName: string | null = null;
    private userEmail: string | null = null;
    private sessionId: string;
    private isAuthenticated: boolean = false;
    
    private constructor() {
        this.sessionId = this.generateSessionId();
        this.startPeriodicFlush();
        this.initializeUserContext();
        
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => {
                this.flush();
            });
        }
    }
    
    public static getInstance(): ClientCloudWatchService {
        if (!ClientCloudWatchService.instance) {
            ClientCloudWatchService.instance = new ClientCloudWatchService();
        }
        return ClientCloudWatchService.instance;
    }
    
    // ===================================================================
    // Session Management
    // ===================================================================
    
    private generateSessionId(): string {
        return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    private startPeriodicFlush(): void {
        this.flushTimer = setInterval(() => {
            this.flush();
        }, 30000); // Flush every 30 seconds
    }
    
    public stopPeriodicFlush(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
    }
    
    // ===================================================================
    // User Context Management
    // ===================================================================
    
    /**
     * Initialize user context from Amplify Auth
     */
    private async initializeUserContext(): Promise<void> {
        try {
            const session = await fetchAuthSession();
            
            if (session.tokens) {
                const idToken = session.tokens.idToken;
                const payload = idToken?.payload;
                
                if (payload) {
                    this.userId = payload.sub as string;
                    this.userName = (payload.name || 
                                   payload['cognito:username'] || 
                                   payload.email) as string;
                    this.userEmail = payload.email as string;
                    this.isAuthenticated = true;
                    
                    console.log('User context initialized:', {
                        userId: this.userId,
                        userName: this.userName
                    });
                    
                    // Track user login
                    this.recordMetric({
                        metricName: MetricType.USER_LOGIN,
                        value: 1,
                        dimensions: {
                            UserId: this.userId,
                            UserName: this.userName
                        }
                    });
                }
            }
        } catch (error) {
            console.log('User not authenticated or error getting auth:', error);
            this.isAuthenticated = false;
        }
    }
    
    /**
     * Update user context (call when auth state changes)
     */
    public async updateUserContext(): Promise<void> {
        await this.initializeUserContext();
    }
    
    /**
     * Clear user context on logout
     */
    public clearUserContext(): void {
        // Track logout before clearing
        if (this.userId) {
            this.recordMetric({
                metricName: MetricType.USER_LOGOUT,
                value: 1,
                dimensions: {
                    UserId: this.userId,
                    UserName: this.userName || 'unknown'
                }
            });
        }
        
        this.userId = null;
        this.userName = null;
        this.userEmail = null;
        this.isAuthenticated = false;
        
        // Flush any remaining metrics
        this.flush();
    }
    
    /**
     * Set user ID explicitly
     */
    public setUserId(userId: string): void {
        this.userId = userId;
    }
    
    // ===================================================================
    // Enhanced Metrics Recording with User Context
    // ===================================================================
    
    /**
     * Record a metric with automatic user context
     */
    public recordMetric(metric: MetricData): void {
        const enrichedMetric: MetricData = {
            ...metric,
            timestamp: metric.timestamp || new Date(),
            dimensions: {
                ...metric.dimensions,
                SessionId: this.sessionId,
                // Only add user dimensions if authenticated
                ...(this.isAuthenticated && {
                    UserId: this.userId || 'unknown',
                    UserName: this.userName || 'unknown',
                    IsAuthenticated: 'true'
                }),
                ...(!this.isAuthenticated && {
                    IsAuthenticated: 'false'
                })
            }
        };
        
        this.metricsBuffer.push(enrichedMetric);
        
        if (this.metricsBuffer.length >= 20) {
            this.flush();
        }
    }
    
    /**
     * Send buffered metrics to CloudWatch via Lambda (with auth context)
     */
    public async flush(): Promise<void> {
        if (this.metricsBuffer.length === 0) return;
        
        const metricsToSend = [...this.metricsBuffer];
        this.metricsBuffer = [];
        
        try {
            // The Lambda will automatically receive user context from Amplify
            const response = await this.client.graphql({
                query: `
                    mutation PublishClientMetrics($metrics: [ClientMetricInput!]!) {
                        publishClientMetrics(metrics: $metrics) {
                            success
                            message
                        }
                    }
                `,
                variables: {
                    metrics: metricsToSend.map(m => ({
                        metricName: m.metricName,
                        value: m.value,
                        unit: m.unit || 'Count',
                        dimensions: JSON.stringify(m.dimensions),
                        timestamp: m.timestamp?.toISOString(),
                        metadata: m.metadata ? JSON.stringify(m.metadata) : null
                    }))
                },
                authMode: 'userPool' // Use correct GraphQLAuthMode
            }) as GraphQLResult<any>;
            
            if (response.data?.publishClientMetrics?.success) {
                console.log('Metrics published for user:', this.userId);
            }
        } catch (error: any) {
            console.error('Failed to publish client metrics:', error);
            
            // If auth error, try to refresh context
            if (error?.errors?.[0]?.message?.includes('Unauthorized')) {
                await this.updateUserContext();
            }
            
            // Re-add metrics to buffer for retry
            this.metricsBuffer = [...metricsToSend, ...this.metricsBuffer];
        }
    }
    
    // ===================================================================
    // Performance Tracking
    // ===================================================================
    
    public startPerformanceMark(name: string): void {
        this.performanceMarks.set(name, {
            start: performance.now(),
            name
        });
    }
    
    public endPerformanceMark(name: string): number {
        const mark = this.performanceMarks.get(name);
        if (!mark) {
            console.warn(`No performance mark found for: ${name}`);
            return 0;
        }
        
        const duration = performance.now() - mark.start;
        this.performanceMarks.delete(name);
        
        this.recordMetric({
            metricName: MetricType.RENDER_TIME,
            value: duration,
            unit: 'Milliseconds',
            dimensions: {
                MarkName: name
            }
        });
        
        return duration;
    }
    
    // ===================================================================
    // User-Specific Tracking Methods
    // ===================================================================
    
    /**
     * Track page views
     */
    public trackPageView(page: string, metadata?: Record<string, any>): void {
        this.recordMetric({
            metricName: MetricType.PAGE_VIEW,
            value: 1,
            dimensions: {
                Page: page,
                ...metadata
            },
            metadata
        });
    }
    
    /**
     * Track tab switches in the scraper admin
     */
    public trackTabSwitch(fromTab: string, toTab: string): void {
        this.recordMetric({
            metricName: MetricType.TAB_SWITCH,
            value: 1,
            dimensions: {
                FromTab: fromTab,
                ToTab: toTab
            }
        });
    }
    
    /**
     * Track user-specific actions
     */
    public trackUserAction(action: string, category: string, metadata?: Record<string, any>): void {
        this.recordMetric({
            metricName: MetricType.USER_ACTION,
            value: 1,
            dimensions: {
                Action: action,
                Category: category,
                UserRole: metadata?.userRole || 'user',
                ...metadata
            },
            metadata: {
                ...metadata,
                userEmail: this.userEmail,
                timestamp: new Date().toISOString()
            }
        });
    }
    
    /**
     * Track feature usage per user
     */
    public trackFeatureUsage(featureName: string, duration?: number): void {
        this.recordMetric({
            metricName: MetricType.FEATURE_USAGE,
            value: 1,
            dimensions: {
                FeatureName: featureName,
                UserTier: this.getUserTier()
            },
            metadata: {
                duration,
                userId: this.userId
            }
        });
    }
    
    /**
     * Track user engagement score
     */
    public trackEngagement(score: number, activity: string): void {
        this.recordMetric({
            metricName: MetricType.USER_ENGAGEMENT,
            value: score,
            unit: 'Percent',
            dimensions: {
                Activity: activity,
                UserSegment: this.getUserSegment()
            }
        });
    }
    
    // ===================================================================
    // Scraper-Specific Tracking
    // ===================================================================
    
    public trackJobStarted(job: Partial<ScraperJob>): void {
        this.recordMetric({
            metricName: MetricType.JOB_STARTED,
            value: 1,
            dimensions: {
                JobId: job.id || 'unknown',
                TriggerSource: job.triggerSource || 'MANUAL',
                MaxGames: job.maxGames || 0
            }
        });
    }
    
    public trackJobCancelled(jobId: string): void {
        this.recordMetric({
            metricName: MetricType.JOB_CANCELLED,
            value: 1,
            dimensions: {
                JobId: jobId
            }
        });
    }
    
    public trackURLAdded(url: Partial<ScrapeURL>): void {
        this.recordMetric({
            metricName: MetricType.URL_TRACKED,
            value: 1,
            dimensions: {
                Status: url.status || 'ACTIVE'
            }
        });
    }
    
    public trackBulkOperation(operation: string, itemCount: number, success: boolean): void {
        this.recordMetric({
            metricName: MetricType.BULK_OPERATION,
            value: itemCount,
            dimensions: {
                Operation: operation,
                Success: success ? 'true' : 'false'
            }
        });
    }
    
    // ===================================================================
    // Error Tracking
    // ===================================================================
    
    public trackError(error: Error, category: string, metadata?: Record<string, any>): void {
        const metricName = category === 'API' ? MetricType.API_ERROR : 
                          category === 'CLIENT' ? MetricType.CLIENT_ERROR :
                          MetricType.VALIDATION_ERROR;
        
        this.recordMetric({
            metricName,
            value: 1,
            dimensions: {
                ErrorMessage: error.message.substring(0, 100), // Truncate for dimension limit
                ErrorCategory: category,
                ErrorName: error.name
            },
            metadata: {
                ...metadata,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        });
    }
    
    // ===================================================================
    // API Call Tracking
    // ===================================================================
    
    public async trackAPICall<T>(
        operationName: string,
        apiCall: () => Promise<T>
    ): Promise<T | null> {
        const startTime = performance.now();
        
        try {
            const result = await apiCall();
            const duration = performance.now() - startTime;
            
            this.recordMetric({
                metricName: MetricType.API_LATENCY,
                value: duration,
                unit: 'Milliseconds',
                dimensions: {
                    Operation: operationName,
                    Success: 'true'
                }
            });
            
            return result;
        } catch (error) {
            const duration = performance.now() - startTime;
            
            this.recordMetric({
                metricName: MetricType.API_LATENCY,
                value: duration,
                unit: 'Milliseconds',
                dimensions: {
                    Operation: operationName,
                    Success: 'false'
                }
            });
            
            this.trackError(error as Error, 'API', {
                operation: operationName
            });
            
            throw error;
        }
    }
    
    // ===================================================================
    // User Analytics Helpers
    // ===================================================================
    
    /**
     * Get user tier based on activity or subscription
     */
    private getUserTier(): string {
        // Implement your user tier logic
        // This could be based on subscription, activity level, etc.
        return 'standard'; // 'free', 'standard', 'premium', etc.
    }
    
    /**
     * Get user segment for analytics
     */
    private getUserSegment(): string {
        // Implement segmentation logic
        // Could be based on behavior, signup date, etc.
        return 'active'; // 'new', 'active', 'power', 'dormant', etc.
    }
    
    /**
     * Get session summary
     */
    public getSessionSummary(): Record<string, any> {
        return {
            sessionId: this.sessionId,
            userId: this.userId,
            userName: this.userName,
            isAuthenticated: this.isAuthenticated,
            sessionDuration: Date.now() - parseInt(this.sessionId.split('-')[1]),
            metricsBuffered: this.metricsBuffer.length
        };
    }
    
    /**
     * Get current user metrics summary
     */
    public async getUserMetricsSummary(): Promise<any> {
        if (!this.isAuthenticated) {
            return null;
        }
        
        try {
            const response = await this.client.graphql({
                query: `
                    query GetMyMetrics($timeRange: String) {
                        getMyMetrics(timeRange: $timeRange) {
                            userId
                            userName
                            timeRange
                            metrics
                            topActions {
                                action
                                category
                                count
                                lastPerformed
                            }
                            sessionCount
                            averageSessionDuration
                        }
                    }
                `,
                variables: {
                    timeRange: 'LAST_24_HOURS'
                },
                authMode: 'userPool' // Use correct GraphQLAuthMode
            }) as GraphQLResult<any>;
            
            return response.data?.getMyMetrics || null;
        } catch (error) {
            console.error('Failed to get user metrics:', error);
            return null;
        }
    }
}

// ===================================================================
// Metric Types for User Tracking
// ===================================================================

export enum MetricType {
    // Original metric types
    USER_ACTION = 'UserAction',
    PAGE_VIEW = 'PageView',
    TAB_SWITCH = 'TabSwitch',
    API_LATENCY = 'APILatency',
    RENDER_TIME = 'RenderTime',
    DATA_LOAD_TIME = 'DataLoadTime',
    JOB_STARTED = 'JobStarted',
    JOB_CANCELLED = 'JobCancelled',
    URL_TRACKED = 'URLTracked',
    BULK_OPERATION = 'BulkOperation',
    CLIENT_ERROR = 'ClientError',
    API_ERROR = 'APIError',
    VALIDATION_ERROR = 'ValidationError',
    
    // New user-specific metrics
    USER_LOGIN = 'UserLogin',
    USER_LOGOUT = 'UserLogout',
    FEATURE_USAGE = 'FeatureUsage',
    USER_ENGAGEMENT = 'UserEngagement',
    SESSION_DURATION = 'SessionDuration',
    USER_PREFERENCE_CHANGED = 'UserPreferenceChanged'
}

// ===================================================================
// React Hook with User Context
// ===================================================================

export function useCloudWatchMetrics() {
    const cloudWatch = ClientCloudWatchService.getInstance();
    const [userMetrics, setUserMetrics] = useState<any>(null);
    
    useEffect(() => {
        // Update user context when component mounts
        cloudWatch.updateUserContext();
        
        // Load user metrics summary
        cloudWatch.getUserMetricsSummary().then(setUserMetrics);
    }, []);
    
    return {
        // All original methods
        recordMetric: cloudWatch.recordMetric.bind(cloudWatch),
        flush: cloudWatch.flush.bind(cloudWatch),
        startMark: cloudWatch.startPerformanceMark.bind(cloudWatch),
        endMark: cloudWatch.endPerformanceMark.bind(cloudWatch),
        trackPageView: cloudWatch.trackPageView.bind(cloudWatch),
        trackTabSwitch: cloudWatch.trackTabSwitch.bind(cloudWatch),
        trackUserAction: cloudWatch.trackUserAction.bind(cloudWatch),
        trackJobStarted: cloudWatch.trackJobStarted.bind(cloudWatch),
        trackJobCancelled: cloudWatch.trackJobCancelled.bind(cloudWatch),
        trackURLAdded: cloudWatch.trackURLAdded.bind(cloudWatch),
        trackBulkOperation: cloudWatch.trackBulkOperation.bind(cloudWatch),
        trackError: cloudWatch.trackError.bind(cloudWatch),
        trackAPICall: cloudWatch.trackAPICall.bind(cloudWatch),
        
        // New user-specific methods
        trackFeatureUsage: cloudWatch.trackFeatureUsage.bind(cloudWatch),
        trackEngagement: cloudWatch.trackEngagement.bind(cloudWatch),
        updateUserContext: cloudWatch.updateUserContext.bind(cloudWatch),
        clearUserContext: cloudWatch.clearUserContext.bind(cloudWatch),
        
        // User metrics data
        userMetrics,
        
        // Session info
        getSessionSummary: cloudWatch.getSessionSummary.bind(cloudWatch)
    };
}

// Export singleton instance
export const cloudWatchClient = ClientCloudWatchService.getInstance();