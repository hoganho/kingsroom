// hooks/useAIInsights.ts
// Hook for AI Insights data fetching and mutations

import { useState, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import {
  generateMetricsPack,
  generateDirectorReport,
  regenerateDirectorReport,
} from '../graphql/mutations';
import {
  getLatestMetricsPack,
  listAvailablePeriods,
} from '../graphql/queries';
import {
  listMetricsPacksByEntity,
  listDirectorReportsByEntity,
} from '../graphql/aiInsightsOperations';
// Use Amplify-generated types for API operations
import type {
  ReportType,
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

export interface UseAIInsightsReturn {
  loading: boolean;
  error: string | null;
  generating: boolean;
  generatingAI: boolean;
  generatePack: (entityId: string, reportType: ReportType, periodKey?: string, forceRegenerate?: boolean) => Promise<GenerateMetricsPackResult>;
  generateReport: (entityId: string, reportType: ReportType, periodKey?: string, options?: GenerateReportOptions) => Promise<GenerateDirectorReportResult>;
  regenerateReport: (directorReportId: string, reason?: string, options?: { provider?: string; model?: string }) => Promise<GenerateDirectorReportResult>;
  getLatestPack: (entityId: string, reportType: ReportType) => Promise<MetricsPack | null>;
  getAvailablePeriods: (entityId: string, reportType: ReportType, limit?: number) => Promise<string[]>;
  listPacks: (entityId: string, limit?: number) => Promise<MetricsPack[]>;
  listReports: (entityId: string, limit?: number) => Promise<DirectorReport[]>;
  clearError: () => void;
}

export interface GenerateReportOptions {
  metricsPackId?: string;
  forceRegenerate?: boolean;
  provider?: string;
  model?: string;
}

// Parse JSON strings safely
export function parsePackData(data: string | PackData | null | undefined): PackData | null {
  if (!data) return null;
  if (typeof data === 'object') return data as PackData;
  try {
    return JSON.parse(data) as PackData;
  } catch (e) {
    console.error('Failed to parse pack data:', e);
    return null;
  }
}

export function parseReportData(data: string | DirectorReportData | null | undefined): DirectorReportData | null {
  if (!data) return null;
  if (typeof data === 'object') return data as DirectorReportData;
  try {
    return JSON.parse(data) as DirectorReportData;
  } catch (e) {
    console.error('Failed to parse report data:', e);
    return null;
  }
}

export function useAIInsights(): UseAIInsightsReturn {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Generate MetricsPack
  const generatePack = useCallback(async (
    entityId: string,
    reportType: ReportType,
    periodKey?: string,
    forceRegenerate = false
  ): Promise<GenerateMetricsPackResult> => {
    setGenerating(true);
    setError(null);
    
    try {
      const result = await client.graphql({
        query: generateMetricsPack,
        variables: { input: { entityId, reportType, periodKey, forceRegenerate } }
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

  // Generate DirectorReport (AI-generated)
  const generateReport = useCallback(async (
    entityId: string,
    reportType: ReportType,
    periodKey?: string,
    options?: GenerateReportOptions
  ): Promise<GenerateDirectorReportResult> => {
    setGeneratingAI(true);
    setError(null);
    
    try {
      const result = await client.graphql({
        query: generateDirectorReport,
        variables: {
          input: {
            entityId,
            reportType,
            periodKey,
            metricsPackId: options?.metricsPackId,
            forceRegenerate: options?.forceRegenerate || false,
            provider: options?.provider,
            model: options?.model,
          }
        }
      }) as { data: { generateDirectorReport: GenerateDirectorReportResult } };
      
      return result.data.generateDirectorReport;
    } catch (err: any) {
      const errorMsg = err.errors?.[0]?.message || err.message || 'Failed to generate director report';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setGeneratingAI(false);
    }
  }, []);

  // Regenerate DirectorReport
  const regenerateReport = useCallback(async (
    directorReportId: string,
    reason?: string,
    options?: { provider?: string; model?: string }
  ): Promise<GenerateDirectorReportResult> => {
    setGeneratingAI(true);
    setError(null);
    
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
      
      return result.data.regenerateDirectorReport;
    } catch (err: any) {
      const errorMsg = err.errors?.[0]?.message || err.message || 'Failed to regenerate report';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setGeneratingAI(false);
    }
  }, []);

  // Get latest MetricsPack
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

  // List available periods
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

  // List MetricsPacks for entity
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

  // List DirectorReports for entity
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

  return {
    loading,
    error,
    generating,
    generatingAI,
    generatePack,
    generateReport,
    regenerateReport,
    getLatestPack,
    getAvailablePeriods,
    listPacks,
    listReports,
    clearError,
  };
}

export default useAIInsights;
