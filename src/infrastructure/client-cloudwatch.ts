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

// Define the correct UserMetricsSummary type based on your schema
interface UserMetricsSummary {
    userId: string;
    userName?: string;
    totalActions?: number;
    totalPageViews?: number;
    totalErrors?: number;
    lastActive?: string;
    mostUsedFeature?: string;
}

// Extended ScraperJob interface to include requester if needed
interface ExtendedScraperJob extends Omit<ScraperJob, 'requester'> {
    requester?: string;
}

// ===================================================================
// Enhanced CloudWatch Client Service with User Context
// ===================================================================

export class ClientCloudWatchService {
    private static instance: ClientCloudWatchService;
    private client: any = null;  // Initialize as null, will be set after Amplify is configured
    private performanceMarks = new Map<string, PerformanceMark>();
    private metricsBuffer: MetricData[] = [];
    private flushTimer: NodeJS.Timeout | null = null;
    private userId: string | null = null;
    private userName: string | null = null;
    // userEmail is kept for future use but marked as potentially unused
    private _userEmail: string | null = null;
    private sessionId: string;
    private sessionStartTime: number;
    private isAuthenticated: boolean = false;
    private isInitialized: boolean = false;
    
    private constructor() {
        this.sessionId = this.generateSessionId();
        this.sessionStartTime = Date.now();
        // Don't start services until Amplify is configured
    }
    
    /**
     * Initialize the CloudWatch service after Amplify has been configured
     * This should be called from your App component after Amplify.configure()
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            // Now it's safe to generate the client
            this.client = generateClient();
            
            // Start periodic flush
            this.startPeriodicFlush();
            
            // Initialize user context
            await this.initializeUserContext();
            
            // Add beforeunload listener
            if (typeof window !== 'undefined') {
                window.addEventListener('beforeunload', () => {
                    this.flush();
                });
            }
            
            this.isInitialized = true;
            console.log('ClientCloudWatchService initialized successfully');
        } catch (error) {
            console.error('Failed to initialize ClientCloudWatchService:', error);
            // Don't throw - allow the app to continue working
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
                    this._userEmail = payload.email as string;
                    this.isAuthenticated = true;
                    
                    console.log('User context initialized:', {
                        userId: this.userId,
                        userName: this.userName
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
        if (!this.isInitialized) {
            await this.initialize();
        }
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
        this._userEmail = null;
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
    
    /**
     * Get user email (for future use)
     */
    public getUserEmail(): string | null {
        return this._userEmail;
    }
    
    // ===================================================================
    // Enhanced Metrics Recording with User Context
    // ===================================================================
    
    /**
     * Record a metric with automatic user context
     */
    public recordMetric(metric: MetricData): void {
        if (!this.isInitialized) {
            console.warn('ClientCloudWatchService not initialized. Call initialize() first.');
            return;
        }

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
        if (!this.isInitialized || !this.client) {
            return;
        }

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
                            userId
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
                authMode: 'userPool' // Use Cognito User Pool authentication
            }) as GraphQLResult<any>;
            
            if (response.errors) {
                console.error('Failed to publish client metrics:', response);
            } else {
                console.log('Metrics published successfully');
            }
        } catch (error) {
            console.error('Failed to publish client metrics:', error);
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
    
    public endPerformanceMark(name: string, category?: string): number {
        const mark = this.performanceMarks.get(name);
        if (!mark) {
            console.warn(`Performance mark ${name} not found`);
            return 0;
        }
        
        const duration = performance.now() - mark.start;
        this.performanceMarks.delete(name);
        
        this.recordMetric({
            metricName: `${category || 'Performance'}.${name}`,
            value: duration,
            unit: 'Milliseconds',
            dimensions: {
                MarkName: name,
                Category: category || 'General'
            }
        });
        
        return duration;
    }
    
    // ===================================================================
    // User Interaction Tracking
    // ===================================================================
    
    /**
     * Track page view with optional metadata
     * @param pageName The name of the page
     * @param metadata Optional metadata object
     */
    public trackPageView(pageName: string, metadata?: Record<string, any>): void {
        this.recordMetric({
            metricName: MetricType.PAGE_VIEW,
            value: 1,
            dimensions: {
                PageName: pageName,
                Path: window.location.pathname,
                UserTier: this.getUserTier()
            },
            metadata
        });
    }
    
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
    
    public trackUserAction(action: string, category: string, metadata?: Record<string, any>): void {
        this.recordMetric({
            metricName: MetricType.USER_ACTION,
            value: 1,
            dimensions: {
                Action: action,
                Category: category,
                UserSegment: this.getUserSegment()
            },
            metadata
        });
    }
    
    /**
     * Track feature usage
     * @param featureName Name of the feature
     * @param action Action performed (string)
     * @param metadata Optional metadata
     */
    public trackFeatureUsage(featureName: string, action: string, metadata?: Record<string, any>): void {
        this.recordMetric({
            metricName: MetricType.FEATURE_USAGE,
            value: 1,
            dimensions: {
                FeatureName: featureName,
                Action: action,
                UserTier: this.getUserTier()
            },
            metadata: {
                ...metadata,
                timestamp: new Date().toISOString()
            }
        });
    }
    
    public trackEngagement(engagementType: string, duration?: number): void {
        this.recordMetric({
            metricName: MetricType.USER_ENGAGEMENT,
            value: duration || 1,
            unit: duration ? 'Milliseconds' : 'Count',
            dimensions: {
                EngagementType: engagementType,
                UserSegment: this.getUserSegment()
            }
        });
    }
    
    // ===================================================================
    // Scraper-Specific Tracking
    // ===================================================================
    
    /**
     * Track job started - handles both ScraperJob and extended types
     */
    public trackJobStarted(job: ScraperJob | ExtendedScraperJob | undefined | null): void {
        if (!job) return;
        
        const extendedJob = job as ExtendedScraperJob;
        
        this.recordMetric({
            metricName: MetricType.JOB_STARTED,
            value: 1,
            dimensions: {
                JobId: job.id,
                TriggerSource: job.triggerSource || 'UNKNOWN',
                Requester: extendedJob.requester || 'UNKNOWN'
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
    
    public trackURLAdded(url: ScrapeURL | undefined | null): void {
        if (!url) return;
        
        this.recordMetric({
            metricName: MetricType.URL_TRACKED,
            value: 1,
            dimensions: {
                URL: url.url,
                Status: url.status || 'UNKNOWN'
            }
        });
    }
    
    public trackBulkOperation(operation: string, count: number, success: boolean): void {
        this.recordMetric({
            metricName: MetricType.BULK_OPERATION,
            value: count,
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
    ): Promise<T> {
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
     * Get current session duration in milliseconds
     */
    public getSessionDuration(): number {
        return Date.now() - this.sessionStartTime;
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
            sessionDuration: this.getSessionDuration(),
            metricsBuffered: this.metricsBuffer.length
        };
    }
    
    /**
     * Get current user metrics summary
     * FIXED: Using correct fields from GraphQL schema
     */
    public async getUserMetricsSummary(): Promise<UserMetricsSummary | null> {
        if (!this.isInitialized || !this.client) {
            console.warn('ClientCloudWatchService not initialized');
            return null;
        }

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
                            totalActions
                            totalPageViews
                            totalErrors
                            lastActive
                            mostUsedFeature
                        }
                    }
                `,
                variables: {
                    timeRange: 'LAST_24_HOURS'
                },
                authMode: 'userPool' // Use Cognito User Pool authentication
            }) as GraphQLResult<{ getMyMetrics: UserMetricsSummary }>;
            
            if (response.errors) {
                console.error('GraphQL errors getting user metrics:', response.errors);
                return null;
            }
            
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
// Extended UserMetricsSummary with session info
// ===================================================================

export interface ExtendedUserMetrics extends UserMetricsSummary {
    sessionDuration?: number;
}

// ===================================================================
// React Hook with User Context
// ===================================================================

export function useCloudWatchMetrics() {
    const cloudWatch = ClientCloudWatchService.getInstance(); // This is a STABLE singleton
    const [userMetrics, setUserMetrics] = useState<ExtendedUserMetrics | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    
    useEffect(() => {
        const initializeService = async () => {
            // Initialize the CloudWatch service
            await cloudWatch.initialize();
            setIsInitialized(true);
            
            // Update user context when component mounts
            await cloudWatch.updateUserContext();
            
            // Load user metrics summary
            const metrics = await cloudWatch.getUserMetricsSummary();
            if (metrics) {
                // Add session duration to the metrics
                setUserMetrics({
                    ...metrics,
                    sessionDuration: cloudWatch.getSessionDuration()
                });
            }
        };
        
        initializeService();
        
        // Update session duration periodically
        const interval = setInterval(() => {
            setUserMetrics(prev => prev ? {
                ...prev,
                sessionDuration: cloudWatch.getSessionDuration()
            } : null);
        }, 60000); // Update every minute
        
        return () => clearInterval(interval);
    }, [cloudWatch]); // Add stable cloudWatch dependency

    // Return the stable instance AND the reactive state separately
    return {
        cloudWatch,
        isInitialized,
        userMetrics
    };
}

// Export singleton instance
export const cloudWatchClient = ClientCloudWatchService.getInstance();