// hooks/useAIInsights.ts
// Hook for AI Insights data fetching and mutations
// VERSION: 2.0.0 - Added async polling support for long-running AI generation

import { useState, useCallback, useRef, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import {
  generateMetricsPack,
  generateDirectorReport,
  regenerateDirectorReport,
} from '../graphql/mutations';
import {
  getLatestMetricsPack,
  listAvailablePeriods,
  listAvailablePeriodOptions,
  resolvePeriod,
} from '../graphql/queries';
import {
  listMetricsPacksByEntity,
  listDirectorReportsByEntity,
} from '../graphql/aiInsightsOperations';

// Use Amplify-generated types for API operations
import type {
  ReportType,
  PeriodSelectionInput,
  PeriodType,
  ResolvedPeriod,
  ListAvailablePeriodOptionsResult,
} from '../API';

// Use custom types for parsed data structures
import type {
  MetricsPack,
  DirectorReport,
  GenerateMetricsPackResult,
  GenerateDirectorReportResult,
  PackData,
  DirectorReportData,
} from '../types/insights';

// Create the GraphQL client
const client = generateClient();

// ===================================================================
// CONSTANTS
// ===================================================================

/** Report generation status values */
export const ReportStatus = {
  PENDING: 'PENDING',
  GENERATING: 'GENERATING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  NOT_FOUND: 'NOT_FOUND',
} as const;

export type ReportStatusType = typeof ReportStatus[keyof typeof ReportStatus];

/** Polling configuration */
const POLLING_CONFIG = {
  /** Initial delay before first poll (ms) */
  initialDelay: 1000,
  /** Base interval between polls (ms) */
  baseInterval: 2000,
  /** Maximum interval between polls (ms) */
  maxInterval: 10000,
  /** Maximum time to poll before giving up (ms) - 5 minutes */
  maxPollingTime: 5 * 60 * 1000,
  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: 1.5,
};

// ===================================================================
// HOOK INTERFACE
// ===================================================================

export interface UseAIInsightsReturn {
  // State
  loading: boolean;
  error: string | null;
  generating: boolean;
  generatingAI: boolean;
  
  // Generation status for polling
  generationStatus: GenerationStatus | null;
  
  // MetricsPack Operations
  generatePack: (
    entityId: string,
    reportType: ReportType,
    options?: GeneratePackOptions
  ) => Promise<GenerateMetricsPackResult>;
  getLatestPack: (entityId: string, reportType: ReportType) => Promise<MetricsPack | null>;
  listPacks: (entityId: string, limit?: number) => Promise<MetricsPack[]>;
  
  // DirectorReport Operations (with polling)
  generateReport: (
    entityId: string,
    reportType: ReportType,
    options?: GenerateReportOptions
  ) => Promise<GenerateDirectorReportResult>;
  regenerateReport: (
    directorReportId: string,
    reason?: string,
    options?: { provider?: string; model?: string }
  ) => Promise<GenerateDirectorReportResult>;
  listReports: (entityId: string, limit?: number) => Promise<DirectorReport[]>;
  
  // Status polling
  checkReportStatus: (reportId: string) => Promise<ReportStatusResult>;
  cancelPolling: () => void;
  
  // Period Operations
  getAvailablePeriods: (entityId: string, reportType: ReportType, limit?: number) => Promise<string[]>;
  getAvailablePeriodOptions: (
    entityId: string,
    options?: ListPeriodOptionsInput
  ) => Promise<ListAvailablePeriodOptionsResult>;
  previewPeriod: (periodSelection: PeriodSelectionInput) => Promise<ResolvedPeriod | null>;
  
  // Utilities
  clearError: () => void;
  clearGenerationStatus: () => void;
}

export interface GenerationStatus {
  reportId: string;
  status: ReportStatusType;
  statusMessage?: string;
  progress?: number; // 0-100
  startedAt: Date;
  elapsedMs: number;
  pollCount: number;
}

export interface ReportStatusResult {
  success: boolean;
  id?: string;
  status: ReportStatusType;
  statusMessage?: string;
  error?: string;
  directorReport?: DirectorReport;
  generationDurationMs?: number;
}

export interface GeneratePackOptions {
  periodKey?: string;
  periodSelection?: PeriodSelectionInput;
  includeComparison?: boolean;
  forceRegenerate?: boolean;
}

export interface GenerateReportOptions {
  periodKey?: string;
  periodSelection?: PeriodSelectionInput;
  metricsPackId?: string;
  forceRegenerate?: boolean;
  provider?: string;
  model?: string;
  /** If true, don't poll - just return the initial response */
  skipPolling?: boolean;
  /** Callback for status updates during polling */
  onStatusUpdate?: (status: GenerationStatus) => void;
}

export interface ListPeriodOptionsInput {
  periodTypes?: Array<PeriodType | null>;
  limit?: number;
}

// ===================================================================
// DATA PARSERS
// ===================================================================

export function parsePackData(data: string | PackData | null | undefined): PackData | null {
  if (!data) return null;
  if (typeof data === 'object') return data as PackData;
  try {
    let parsed = JSON.parse(data);
    // Handle double-encoded JSON strings (Lambda sometimes double-stringifies)
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    return parsed as PackData;
  } catch (e) {
    console.error('Failed to parse pack data:', e);
    return null;
  }
}

export function parseReportData(data: string | DirectorReportData | null | undefined): DirectorReportData | null {
  if (!data) return null;
  if (typeof data === 'object') return data as DirectorReportData;
  try {
    let parsed = JSON.parse(data);
    // Handle double-encoded JSON strings (Lambda sometimes double-stringifies)
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    return parsed as DirectorReportData;
  } catch (e) {
    console.error('Failed to parse report data:', e);
    return null;
  }
}

// ===================================================================
// GraphQL Query for Status Polling
// ===================================================================

// Add this to your graphql/queries.ts if not present:
export const getDirectorReportStatusQuery = /* GraphQL */ `
  query GetDirectorReportStatus($id: ID!) {
    getDirectorReportStatus(id: $id) {
      success
      id
      status
      statusMessage
      error
      requestedAt
      generatedAt
      generationDurationMs
      directorReport {
        id
        entityId
        reportType
        periodKey
        periodLabel
        periodStart
        periodEnd
        metricsPackId
        reportData
        status
        generatedAt
        modelProvider
        modelName
        inputTokens
        outputTokens
        totalCost
        generationDurationMs
        enhancedModulesUsed
        dataCompleteness
        createdAt
        updatedAt
      }
    }
  }
`;

// ===================================================================
// MAIN HOOK
// ===================================================================

export function useAIInsights(): UseAIInsightsReturn {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus | null>(null);
  
  // Refs for polling control
  const pollingRef = useRef<{
    active: boolean;
    timeoutId: NodeJS.Timeout | null;
    startTime: number;
    pollCount: number;
  }>({
    active: false,
    timeoutId: null,
    startTime: 0,
    pollCount: 0,
  });

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      cancelPolling();
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearGenerationStatus = useCallback(() => setGenerationStatus(null), []);
  
  const cancelPolling = useCallback(() => {
    pollingRef.current.active = false;
    if (pollingRef.current.timeoutId) {
      clearTimeout(pollingRef.current.timeoutId);
      pollingRef.current.timeoutId = null;
    }
  }, []);

  // ===================================================================
  // STATUS POLLING
  // ===================================================================

  /**
   * Check report generation status
   */
  const checkReportStatus = useCallback(async (reportId: string): Promise<ReportStatusResult> => {
    try {
      const result = await client.graphql({
        query: getDirectorReportStatusQuery,
        variables: { id: reportId }
      }) as { data: { getDirectorReportStatus: ReportStatusResult } };
      
      return result.data.getDirectorReportStatus;
    } catch (err: any) {
      console.error('Failed to check report status:', err);
      return {
        success: false,
        status: ReportStatus.FAILED,
        error: err.message || 'Failed to check status',
      };
    }
  }, []);

  /**
   * Poll for report completion with exponential backoff
   */
  const pollForCompletion = useCallback(async (
    reportId: string,
    onStatusUpdate?: (status: GenerationStatus) => void
  ): Promise<GenerateDirectorReportResult> => {
    const startTime = Date.now();
    pollingRef.current = {
      active: true,
      timeoutId: null,
      startTime,
      pollCount: 0,
    };

    let currentInterval = POLLING_CONFIG.baseInterval;

    const updateStatus = (status: ReportStatusType, message?: string) => {
      const newStatus: GenerationStatus = {
        reportId,
        status,
        statusMessage: message,
        progress: status === ReportStatus.PENDING ? 10 : status === ReportStatus.GENERATING ? 50 : 100,
        startedAt: new Date(startTime),
        elapsedMs: Date.now() - startTime,
        pollCount: pollingRef.current.pollCount,
      };
      setGenerationStatus(newStatus);
      onStatusUpdate?.(newStatus);
    };

    // Initial status
    updateStatus(ReportStatus.PENDING, 'Starting report generation...');

    // Wait initial delay
    await new Promise(resolve => setTimeout(resolve, POLLING_CONFIG.initialDelay));

    while (pollingRef.current.active) {
      pollingRef.current.pollCount++;
      
      // Check if we've exceeded max polling time
      if (Date.now() - startTime > POLLING_CONFIG.maxPollingTime) {
        cancelPolling();
        const errorMsg = 'Report generation timed out. The report may still be processing - please refresh to check.';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }

      try {
        const statusResult = await checkReportStatus(reportId);
        
        if (!statusResult.success && statusResult.status === ReportStatus.NOT_FOUND) {
          // Report doesn't exist yet, keep polling
          updateStatus(ReportStatus.PENDING, 'Waiting for report generation to start...');
        } else if (statusResult.status === ReportStatus.COMPLETED) {
          // Success!
          cancelPolling();
          updateStatus(ReportStatus.COMPLETED, 'Report generated successfully!');
          
          return {
            success: true,
            directorReportId: reportId,
            directorReport: statusResult.directorReport,
            status: ReportStatus.COMPLETED,
            generationDurationMs: statusResult.generationDurationMs,
            tokenUsage: statusResult.directorReport?.inputTokens !== undefined ? {
                inputTokens: statusResult.directorReport.inputTokens ?? 0,
                outputTokens: statusResult.directorReport.outputTokens ?? 0,
                totalCost: statusResult.directorReport.totalCost ?? 0,
            } : undefined,
          };
        } else if (statusResult.status === ReportStatus.FAILED) {
          // Failed
          cancelPolling();
          updateStatus(ReportStatus.FAILED, statusResult.error || 'Generation failed');
          return {
            success: false,
            error: statusResult.error || 'Report generation failed',
            status: ReportStatus.FAILED,
          };
        } else {
          // Still processing (PENDING or GENERATING)
          updateStatus(
            statusResult.status as ReportStatusType,
            statusResult.statusMessage || 'Generating report...'
          );
        }
      } catch (pollError: any) {
        console.warn('Polling error (will retry):', pollError);
        // Don't fail on transient errors, just keep polling
      }

      // Wait before next poll (with exponential backoff)
      await new Promise(resolve => {
        pollingRef.current.timeoutId = setTimeout(resolve, currentInterval);
      });
      
      // Increase interval with backoff, up to max
      currentInterval = Math.min(
        currentInterval * POLLING_CONFIG.backoffMultiplier,
        POLLING_CONFIG.maxInterval
      );
    }

    // Polling was cancelled
    return { success: false, error: 'Polling cancelled' };
  }, [checkReportStatus, cancelPolling]);

  // ===================================================================
  // METRICS PACK OPERATIONS
  // ===================================================================

  const generatePack = useCallback(async (
    entityId: string,
    reportType: ReportType,
    options?: GeneratePackOptions
  ): Promise<GenerateMetricsPackResult> => {
    setGenerating(true);
    setError(null);
    
    try {
      const result = await client.graphql({
        query: generateMetricsPack,
        variables: {
          input: {
            entityId,
            reportType,
            periodKey: options?.periodKey,
            periodSelection: options?.periodSelection,
            includeComparison: options?.includeComparison,
            forceRegenerate: options?.forceRegenerate || false,
          }
        }
      }) as { data: { generateMetricsPack: GenerateMetricsPackResult } };
      
      return result.data.generateMetricsPack;
    } catch (err: any) {
      const errorMsg = err.errors?.[0]?.message || err.message || 'Failed to generate metrics pack';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setGenerating(false);
    }
  }, []);

  const getLatestPack = useCallback(async (
    entityId: string,
    reportType: ReportType
  ): Promise<MetricsPack | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await client.graphql({
        query: getLatestMetricsPack,
        variables: { entityId, reportType }
      }) as { data: { getLatestMetricsPack: MetricsPack | null } };
      
      return result.data.getLatestMetricsPack;
    } catch (err: any) {
      const errorMsg = err.errors?.[0]?.message || err.message || 'Failed to fetch metrics pack';
      setError(errorMsg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const listPacks = useCallback(async (
    entityId: string,
    limit = 10
  ): Promise<MetricsPack[]> => {
    try {
      const result = await client.graphql({
        query: listMetricsPacksByEntity,
        variables: { entityId, sortDirection: 'DESC', limit }
      }) as { data: { metricsPacksByEntity: { items: MetricsPack[] } } };
      
      return result.data.metricsPacksByEntity?.items || [];
    } catch (err: any) {
      console.error('Failed to list metrics packs:', err);
      return [];
    }
  }, []);

  // ===================================================================
  // DIRECTOR REPORT OPERATIONS (with async polling)
  // ===================================================================

  /**
   * Generate DirectorReport with automatic polling for completion
   */
  const generateReport = useCallback(async (
    entityId: string,
    reportType: ReportType,
    options?: GenerateReportOptions
  ): Promise<GenerateDirectorReportResult> => {
    setGeneratingAI(true);
    setError(null);
    setGenerationStatus(null);
    
    try {
      // Step 1: Initiate generation (returns immediately with PENDING status)
      const result = await client.graphql({
        query: generateDirectorReport,
        variables: {
          input: {
            entityId,
            reportType,
            periodKey: options?.periodKey,
            periodSelection: options?.periodSelection,
            metricsPackId: options?.metricsPackId,
            forceRegenerate: options?.forceRegenerate || false,
            provider: options?.provider,
            model: options?.model,
          }
        }
      }) as { data: { generateDirectorReport: GenerateDirectorReportResult } };
      
      const initialResult = result.data.generateDirectorReport;
      
      // If already completed (cached result), return immediately
      if (initialResult.directorReport && initialResult.status === ReportStatus.COMPLETED) {
        return initialResult;
      }
      
      // If failed immediately, return error
      if (!initialResult.success) {
        setError(initialResult.error || 'Failed to start report generation');
        return initialResult;
      }
      
      // If skipPolling requested, return the pending status
      if (options?.skipPolling) {
        return initialResult;
      }
      
      // Step 2: Poll for completion
      const reportId = initialResult.directorReportId;
      if (!reportId) {
        const errorMsg = 'No report ID returned from generation request';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
      
      const finalResult = await pollForCompletion(reportId, options?.onStatusUpdate);
      return finalResult;
      
    } catch (err: any) {
      const errorMsg = err.errors?.[0]?.message || err.message || 'Failed to generate director report';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setGeneratingAI(false);
    }
  }, [pollForCompletion]);

  /**
   * Regenerate an existing DirectorReport
   */
  const regenerateReport = useCallback(async (
    directorReportId: string,
    reason?: string,
    options?: { provider?: string; model?: string }
  ): Promise<GenerateDirectorReportResult> => {
    setGeneratingAI(true);
    setError(null);
    setGenerationStatus(null);
    
    try {
      const result = await client.graphql({
        query: regenerateDirectorReport,
        variables: {
          input: {
            directorReportId,
            reason,
            provider: options?.provider,
            model: options?.model,
          }
        }
      }) as { data: { regenerateDirectorReport: GenerateDirectorReportResult } };
      
      const initialResult = result.data.regenerateDirectorReport;
      
      // If already completed, return immediately
      if (initialResult.directorReport && initialResult.status === ReportStatus.COMPLETED) {
        return initialResult;
      }
      
      if (!initialResult.success) {
        setError(initialResult.error || 'Failed to start report regeneration');
        return initialResult;
      }
      
      // Poll for completion
      const reportId = initialResult.directorReportId || directorReportId;
      const finalResult = await pollForCompletion(reportId);
      return finalResult;
      
    } catch (err: any) {
      const errorMsg = err.errors?.[0]?.message || err.message || 'Failed to regenerate report';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setGeneratingAI(false);
    }
  }, [pollForCompletion]);

  const listReports = useCallback(async (
    entityId: string,
    limit = 10
  ): Promise<DirectorReport[]> => {
    try {
      const result = await client.graphql({
        query: listDirectorReportsByEntity,
        variables: { entityId, sortDirection: 'DESC', limit }
      }) as { data: { directorReportsByEntity: { items: DirectorReport[] } } };
      
      return result.data.directorReportsByEntity?.items || [];
    } catch (err: any) {
      console.error('Failed to list director reports:', err);
      return [];
    }
  }, []);

  // ===================================================================
  // PERIOD OPERATIONS
  // ===================================================================

  const getAvailablePeriods = useCallback(async (
    entityId: string,
    reportType: ReportType,
    limit = 20
  ): Promise<string[]> => {
    try {
      const result = await client.graphql({
        query: listAvailablePeriods,
        variables: { entityId, reportType, limit }
      }) as { data: { listAvailablePeriods: string[] } };
      
      return result.data.listAvailablePeriods || [];
    } catch (err: any) {
      console.error('Failed to fetch available periods:', err);
      return [];
    }
  }, []);

  const getAvailablePeriodOptions = useCallback(async (
    entityId: string,
    options?: ListPeriodOptionsInput
  ): Promise<ListAvailablePeriodOptionsResult> => {
    try {
      const result = await client.graphql({
        query: listAvailablePeriodOptions,
        variables: {
          input: {
            entityId,
            periodTypes: options?.periodTypes,
            limit: options?.limit || 50,
          }
        }
      }) as { data: { listAvailablePeriodOptions: ListAvailablePeriodOptionsResult } };
      
      return result.data.listAvailablePeriodOptions || { 
        __typename: 'ListAvailablePeriodOptionsResult' as const, 
        periods: [], 
        dataRange: { __typename: 'DataRangeInfo' as const, totalSnapshots: 0 } 
      };
    } catch (err: any) {
      console.error('Failed to fetch available period options:', err);
      return { 
        __typename: 'ListAvailablePeriodOptionsResult' as const, 
        periods: [], 
        dataRange: { __typename: 'DataRangeInfo' as const, totalSnapshots: 0 } 
      };
    }
  }, []);

  const previewPeriod = useCallback(async (
    periodSelection: PeriodSelectionInput
  ): Promise<ResolvedPeriod | null> => {
    try {
      const result = await client.graphql({
        query: resolvePeriod,
        variables: { periodSelection }
      }) as { data: { resolvePeriod: ResolvedPeriod } };
      
      return result.data.resolvePeriod;
    } catch (err: any) {
      console.error('Failed to resolve period:', err);
      return null;
    }
  }, []);

  // ===================================================================
  // RETURN HOOK
  // ===================================================================

  return {
    loading,
    error,
    generating,
    generatingAI,
    generationStatus,
    generatePack,
    generateReport,
    regenerateReport,
    getLatestPack,
    getAvailablePeriods,
    getAvailablePeriodOptions,
    previewPeriod,
    listPacks,
    listReports,
    checkReportStatus,
    cancelPolling,
    clearError,
    clearGenerationStatus,
  };
}

export default useAIInsights;