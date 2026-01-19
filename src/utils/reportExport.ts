// utils/reportExport.ts
// Export utilities for AI Insights reports - JSON, Markdown, HTML, PDF
// VERSION: 2.0.0 - Fixed print functionality

import type { DirectorReport, WeeklyOpsReportData, MonthlyBoardReportData, MetricsPack } from '../types/insights';

export type ExportFormat = 'json' | 'markdown' | 'html';

export interface ExportOptions {
  format: ExportFormat;
  includeMetadata?: boolean;
  includePackData?: boolean;
}

export interface ExportResult {
  success: boolean;
  blob?: Blob;
  filename?: string;
  html?: string; // For direct rendering
  error?: string;
}

// ===================================================================
// HELPERS
// ===================================================================

const formatCurrency = (value: number): string => {
  const isNegative = value < 0;
  const formatted = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(value));
  return isNegative ? `-${formatted}` : formatted;
};

const formatPercent = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return 'N/A';
  return `${value.toFixed(1)}%`;
};

const formatDate = (dateStr: string): string => {
  try {
    return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const sanitizeFilename = (name: string): string => name.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();

// ===================================================================
// JSON EXPORT
// ===================================================================

export function exportAsJson(
  report: DirectorReport,
  reportData: WeeklyOpsReportData | MonthlyBoardReportData,
  metricsPack?: MetricsPack | null
): ExportResult {
  try {
    const exportData = {
      exportedAt: new Date().toISOString(),
      report: {
        id: report.id,
        entityId: report.entityId,
        reportType: report.reportType,
        periodKey: report.periodKey,
        periodLabel: report.periodLabel,
        generatedAt: report.generatedAt,
        modelName: report.modelName,
        inputTokens: report.inputTokens,
        outputTokens: report.outputTokens,
        totalCost: report.totalCost,
        reportVersion: report.reportVersion,
      },
      reportData,
      metricsPack: metricsPack ? {
        id: metricsPack.id,
        periodLabel: metricsPack.periodLabel,
        periodStart: metricsPack.periodStart,
        periodEnd: metricsPack.periodEnd,
        gamesIncluded: metricsPack.gamesIncluded,
        venuesIncluded: metricsPack.venuesIncluded,
        enhancedModulesIncluded: metricsPack.enhancedModulesIncluded,
      } : null,
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const filename = `${sanitizeFilename(report.reportType)}-${report.periodKey}.json`;

    return { success: true, blob, filename };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ===================================================================
// MARKDOWN EXPORT
// ===================================================================

export function exportAsMarkdown(
  report: DirectorReport,
  reportData: WeeklyOpsReportData | MonthlyBoardReportData,
  metricsPack?: MetricsPack | null
): ExportResult {
  try {
    const lines: string[] = [];
    const isWeekly = 'weekSummary' in reportData;

    lines.push(`# ${report.reportType.replace(/_/g, ' ')} Report`);
    lines.push('');
    lines.push(`**Period:** ${report.periodLabel || report.periodKey}`);
    lines.push(`**Generated:** ${formatDate(report.generatedAt)}`);
    lines.push(`**Model:** ${report.modelName}`);
    if (metricsPack) {
      lines.push(`**Data:** ${metricsPack.gamesIncluded} games, ${metricsPack.venuesIncluded} venues`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');

    if (isWeekly) {
      const data = reportData as WeeklyOpsReportData;

      // Week Summary
      if (data.weekSummary) {
        lines.push('## Week Summary');
        lines.push('');
        lines.push(`**Health:** ${data.weekSummary.health}`);
        lines.push('');
        lines.push(`> ${data.weekSummary.headline}`);
        lines.push('');
        if (data.weekSummary.topWin) lines.push(`**Top Win:** ${data.weekSummary.topWin}`);
        if (data.weekSummary.topProblem) lines.push(`**Top Problem:** ${data.weekSummary.topProblem}`);
        if (data.weekSummary.vsLastWeek) lines.push(`**vs Last Week:** ${data.weekSummary.vsLastWeek}`);
        lines.push('');
      }

      // Metrics
      if (data.metrics) {
        lines.push('## Key Metrics');
        lines.push('');
        lines.push('| Metric | Value | Change |');
        lines.push('|--------|-------|--------|');
        if (data.metrics.revenue) lines.push(`| Revenue | ${formatCurrency(data.metrics.revenue.value)} | ${data.metrics.revenue.changePercent !== undefined ? `${data.metrics.revenue.changePercent >= 0 ? '+' : ''}${data.metrics.revenue.changePercent.toFixed(1)}%` : '-'} |`);
        if (data.metrics.profit) lines.push(`| Profit | ${formatCurrency(data.metrics.profit.value)} | ${data.metrics.profit.changePercent !== undefined ? `${data.metrics.profit.changePercent >= 0 ? '+' : ''}${data.metrics.profit.changePercent.toFixed(1)}%` : '-'} |`);
        if (data.metrics.margin) lines.push(`| Margin | ${formatPercent(data.metrics.margin.value)} | ${data.metrics.margin.changePercent !== undefined ? `${data.metrics.margin.changePercent >= 0 ? '+' : ''}${data.metrics.margin.changePercent.toFixed(1)}%` : '-'} |`);
        if (data.metrics.entries) lines.push(`| Entries | ${data.metrics.entries.value.toLocaleString()} | ${data.metrics.entries.changePercent !== undefined ? `${data.metrics.entries.changePercent >= 0 ? '+' : ''}${data.metrics.entries.changePercent.toFixed(1)}%` : '-'} |`);
        if (data.metrics.gamesRun) lines.push(`| Games Run | ${data.metrics.gamesRun.value} | ${data.metrics.gamesRun.changePercent !== undefined ? `${data.metrics.gamesRun.changePercent >= 0 ? '+' : ''}${data.metrics.gamesRun.changePercent.toFixed(1)}%` : '-'} |`);
        lines.push('');
      }

      // Problem Games
      if (data.problemGames && data.problemGames.length > 0) {
        lines.push('## Problem Games');
        lines.push('');
        for (const game of data.problemGames) {
          lines.push(`### ${game.gameName} @ ${game.venueName}`);
          lines.push(`- **Profit:** ${formatCurrency(game.profit)}`);
          lines.push(`- **Issue:** ${game.issue}`);
          lines.push(`- **Details:** ${game.details}`);
          lines.push(`- **Fix:** ${game.fix}`);
          lines.push('');
        }
      }

      // Venues
      if (data.venueQuickView && data.venueQuickView.length > 0) {
        lines.push('## Venue Performance');
        lines.push('');
        lines.push('| Venue | Profit | Games | Health | Action |');
        lines.push('|-------|--------|-------|--------|--------|');
        for (const v of data.venueQuickView) {
          lines.push(`| ${v.venueName} | ${formatCurrency(v.profit)} | ${v.games} | ${v.health} | ${v.oneAction || '-'} |`);
        }
        lines.push('');
      }

      // Actions
      if (data.thisWeekActions && data.thisWeekActions.length > 0) {
        lines.push('## This Week\'s Actions');
        lines.push('');
        for (const a of data.thisWeekActions) {
          lines.push(`- **P${a.priority}:** ${a.action}${a.deadline ? ` *(Deadline: ${a.deadline})*` : ''}`);
        }
        lines.push('');
      }

      // Alerts
      if (data.alerts && data.alerts.length > 0) {
        lines.push('## Alerts');
        lines.push('');
        for (const a of data.alerts) {
          lines.push(`### [${a.priority}] ${a.title}`);
          lines.push(a.description);
          if (a.action) lines.push(`**Action:** ${a.action}`);
          lines.push('');
        }
      }
    } else {
      // Monthly Board Report
      const data = reportData as MonthlyBoardReportData;

      if (data.executiveSummary) {
        lines.push('## Executive Summary');
        lines.push('');
        lines.push(`**Health:** ${data.executiveSummary.overallHealth} | **Trajectory:** ${data.executiveSummary.trajectory}`);
        lines.push('');
        lines.push(`> ${data.executiveSummary.headline}`);
        lines.push('');
      }

      if (data.financialPerformance) {
        lines.push('## Financial Performance');
        lines.push('');
        lines.push(`- **Revenue:** ${formatCurrency(data.financialPerformance.revenue.actual)}`);
        lines.push(`- **Profit:** ${formatCurrency(data.financialPerformance.profit.actual)}`);
        if (data.financialPerformance.profit.margin) {
          lines.push(`- **Margin:** ${formatPercent(data.financialPerformance.profit.margin)}`);
        }
        lines.push('');
      }

      if (data.strategicRecommendations && data.strategicRecommendations.length > 0) {
        lines.push('## Strategic Recommendations');
        lines.push('');
        for (const r of data.strategicRecommendations) {
          lines.push(`### P${r.priority}: ${r.recommendation}`);
          lines.push(r.rationale);
          lines.push(`*Timeframe: ${r.timeframe}*`);
          lines.push('');
        }
      }
    }

    const markdown = lines.join('\n');
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const filename = `${sanitizeFilename(report.reportType)}-${report.periodKey}.md`;

    return { success: true, blob, filename };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ===================================================================
// HTML EXPORT
// ===================================================================

export function exportAsHtml(
  report: DirectorReport,
  reportData: WeeklyOpsReportData | MonthlyBoardReportData,
  metricsPack?: MetricsPack | null
): ExportResult {
  try {
    const isWeekly = 'weekSummary' in reportData;
    const title = `${report.reportType.replace(/_/g, ' ')} - ${report.periodLabel || report.periodKey}`;

    const styles = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; background: #f9fafb; padding: 2rem; color: #1f2937; }
        h1 { font-size: 1.875rem; font-weight: 700; margin-bottom: 0.5rem; color: #111827; }
        h2 { font-size: 1.25rem; font-weight: 600; margin: 1.5rem 0 1rem; color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; }
        .meta { display: flex; gap: 1rem; flex-wrap: wrap; color: #6b7280; font-size: 0.875rem; margin-bottom: 1.5rem; }
        .meta span { background: #f3f4f6; padding: 0.25rem 0.75rem; border-radius: 0.375rem; }
        .card { background: white; border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .summary-card { background: linear-gradient(135deg, #f0fdf4, #ecfdf5); border: 1px solid #86efac; }
        .summary-card.concerning { background: linear-gradient(135deg, #fffbeb, #fef3c7); border-color: #fcd34d; }
        .summary-card.critical { background: linear-gradient(135deg, #fef2f2, #fee2e2); border-color: #fca5a5; }
        .headline { font-size: 1.125rem; font-weight: 500; color: #1f2937; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin: 1rem 0; }
        .metric { text-align: center; padding: 1rem; background: #f9fafb; border-radius: 0.5rem; border: 1px solid #e5e7eb; }
        .metric-value { font-size: 1.5rem; font-weight: 700; color: #111827; }
        .metric-value.positive { color: #059669; }
        .metric-value.negative { color: #dc2626; }
        .metric-label { font-size: 0.75rem; color: #6b7280; text-transform: uppercase; margin-top: 0.25rem; }
        .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
        .badge-green { background: #d1fae5; color: #065f46; }
        .badge-amber { background: #fef3c7; color: #92400e; }
        .badge-red { background: #fee2e2; color: #991b1b; }
        .badge-gray { background: #f3f4f6; color: #374151; }
        table { width: 100%; border-collapse: collapse; margin: 1rem 0; background: white; border-radius: 0.5rem; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { background: #f9fafb; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; color: #6b7280; }
        tr:last-child td { border-bottom: none; }
        tr:hover { background: #f9fafb; }
        .action-item { padding: 1rem; border-radius: 0.5rem; margin-bottom: 0.75rem; background: #f9fafb; border-left: 4px solid #6b7280; }
        .action-item.p1 { border-left-color: #dc2626; background: #fef2f2; }
        .action-item.p2 { border-left-color: #f59e0b; background: #fffbeb; }
        .alert { padding: 1rem; border-radius: 0.5rem; margin-bottom: 0.75rem; }
        .alert.critical { background: #fef2f2; border-left: 4px solid #ef4444; }
        .alert.high { background: #fffbeb; border-left: 4px solid #f59e0b; }
        .alert.medium { background: #eff6ff; border-left: 4px solid #3b82f6; }
        @media print { 
          body { background: white; padding: 1rem; } 
          .card { box-shadow: none; border: 1px solid #e5e7eb; page-break-inside: avoid; }
          h2 { page-break-after: avoid; }
          table { page-break-inside: avoid; }
        }
      </style>
    `;

    let content = '';

    if (isWeekly) {
      const data = reportData as WeeklyOpsReportData;

      // Summary
      if (data.weekSummary) {
        const summaryClass = data.weekSummary.health === 'CRITICAL' ? 'critical' : data.weekSummary.health === 'CONCERNING' || data.weekSummary.health === 'NEEDS_ATTENTION' ? 'concerning' : '';
        content += `
          <div class="card summary-card ${summaryClass}">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
              <div>
                <span class="badge badge-${data.weekSummary.health === 'EXCELLENT' || data.weekSummary.health === 'GOOD' ? 'green' : data.weekSummary.health === 'CRITICAL' ? 'red' : 'amber'}">${data.weekSummary.health}</span>
                ${data.weekSummary.vsLastWeek ? `<span style="color: #6b7280; font-size: 0.875rem; margin-left: 0.5rem;">${data.weekSummary.vsLastWeek}</span>` : ''}
              </div>
            </div>
            <p class="headline">${data.weekSummary.headline}</p>
            <div class="grid" style="grid-template-columns: 1fr 1fr; margin-top: 1rem;">
              ${data.weekSummary.topWin ? `<div style="padding: 0.75rem; background: rgba(255,255,255,0.6); border-radius: 0.5rem;"><strong style="color: #059669;">✓ Top Win:</strong><br>${data.weekSummary.topWin}</div>` : ''}
              ${data.weekSummary.topProblem ? `<div style="padding: 0.75rem; background: rgba(255,255,255,0.6); border-radius: 0.5rem;"><strong style="color: #dc2626;">⚠ Top Problem:</strong><br>${data.weekSummary.topProblem}</div>` : ''}
            </div>
          </div>
        `;
      }

      // Metrics
      if (data.metrics) {
        content += `<h2>Key Metrics</h2><div class="grid">`;
        if (data.metrics.revenue) content += `<div class="metric"><div class="metric-value">${formatCurrency(data.metrics.revenue.value)}</div><div class="metric-label">Revenue</div></div>`;
        if (data.metrics.profit) content += `<div class="metric"><div class="metric-value ${data.metrics.profit.value >= 0 ? 'positive' : 'negative'}">${formatCurrency(data.metrics.profit.value)}</div><div class="metric-label">Profit</div></div>`;
        if (data.metrics.margin) content += `<div class="metric"><div class="metric-value">${formatPercent(data.metrics.margin.value)}</div><div class="metric-label">Margin</div></div>`;
        if (data.metrics.entries) content += `<div class="metric"><div class="metric-value">${data.metrics.entries.value.toLocaleString()}</div><div class="metric-label">Entries</div></div>`;
        if (data.metrics.gamesRun) content += `<div class="metric"><div class="metric-value">${data.metrics.gamesRun.value}</div><div class="metric-label">Games Run</div></div>`;
        content += `</div>`;
      }

      // Venues
      if (data.venueQuickView && data.venueQuickView.length > 0) {
        content += `<h2>Venue Performance</h2><table><thead><tr><th>Venue</th><th>Profit</th><th>Games</th><th>Health</th><th>Action</th></tr></thead><tbody>`;
        for (const v of data.venueQuickView) {
          content += `<tr><td><strong>${v.venueName}</strong></td><td class="${v.profit >= 0 ? 'positive' : 'negative'}" style="color: ${v.profit >= 0 ? '#059669' : '#dc2626'}; font-weight: 600;">${formatCurrency(v.profit)}</td><td>${v.games}</td><td><span class="badge badge-${v.health === 'EXCELLENT' || v.health === 'GOOD' ? 'green' : v.health === 'CRITICAL' ? 'red' : 'amber'}">${v.health}</span></td><td style="font-size: 0.875rem;">${v.oneAction || '-'}</td></tr>`;
        }
        content += `</tbody></table>`;
      }

      // Problem Games
      if (data.problemGames && data.problemGames.length > 0) {
        content += `<h2>Problem Games</h2>`;
        for (const g of data.problemGames) {
          content += `<div class="card" style="border-left: 4px solid #dc2626;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
              <strong>${g.gameName}</strong>
              <span style="color: #dc2626; font-weight: 600;">${formatCurrency(g.profit)}</span>
            </div>
            <div style="color: #6b7280; font-size: 0.875rem;">@ ${g.venueName}</div>
            <div style="margin-top: 0.5rem;"><strong>Issue:</strong> ${g.issue}</div>
            <div><strong>Details:</strong> ${g.details}</div>
            <div style="color: #2563eb;"><strong>Fix:</strong> ${g.fix}</div>
          </div>`;
        }
      }

      // Actions
      if (data.thisWeekActions && data.thisWeekActions.length > 0) {
        content += `<h2>This Week's Actions</h2>`;
        for (const a of data.thisWeekActions) {
          content += `<div class="action-item ${a.priority === 1 ? 'p1' : a.priority === 2 ? 'p2' : ''}"><strong>P${a.priority}:</strong> ${a.action}${a.deadline ? `<br><small style="color: #6b7280;">Deadline: ${a.deadline}</small>` : ''}</div>`;
        }
      }

      // Alerts
      if (data.alerts && data.alerts.length > 0) {
        content += `<h2>Alerts</h2>`;
        for (const a of data.alerts) {
          content += `<div class="alert ${a.priority.toLowerCase()}"><strong>[${a.priority}] ${a.title}</strong><p style="margin: 0.5rem 0;">${a.description}</p>${a.action ? `<p style="color: #2563eb; font-size: 0.875rem;"><strong>Action:</strong> ${a.action}</p>` : ''}</div>`;
        }
      }
    } else {
      // Monthly Board
      const data = reportData as MonthlyBoardReportData;

      if (data.executiveSummary) {
        content += `
          <div class="card summary-card">
            <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
              <span class="badge badge-${data.executiveSummary.overallHealth === 'EXCELLENT' || data.executiveSummary.overallHealth === 'GOOD' ? 'green' : data.executiveSummary.overallHealth === 'CRITICAL' ? 'red' : 'amber'}">${data.executiveSummary.overallHealth}</span>
              <span class="badge badge-gray">${data.executiveSummary.trajectory}</span>
            </div>
            <p class="headline">${data.executiveSummary.headline}</p>
          </div>
        `;
      }

      if (data.financialPerformance) {
        content += `<h2>Financial Performance</h2><div class="grid">`;
        content += `<div class="metric"><div class="metric-value">${formatCurrency(data.financialPerformance.revenue.actual)}</div><div class="metric-label">Revenue</div></div>`;
        content += `<div class="metric"><div class="metric-value ${data.financialPerformance.profit.actual >= 0 ? 'positive' : 'negative'}">${formatCurrency(data.financialPerformance.profit.actual)}</div><div class="metric-label">Profit</div></div>`;
        if (data.financialPerformance.profit.margin) content += `<div class="metric"><div class="metric-value">${formatPercent(data.financialPerformance.profit.margin)}</div><div class="metric-label">Margin</div></div>`;
        content += `</div>`;
      }

      if (data.strategicRecommendations && data.strategicRecommendations.length > 0) {
        content += `<h2>Strategic Recommendations</h2>`;
        for (const r of data.strategicRecommendations) {
          content += `<div class="action-item ${r.priority === 1 ? 'p1' : r.priority === 2 ? 'p2' : ''}"><strong>P${r.priority}: ${r.recommendation}</strong><p style="margin: 0.5rem 0; color: #4b5563;">${r.rationale}</p><small style="color: #6b7280;">Timeframe: ${r.timeframe}</small></div>`;
        }
      }
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${styles}
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">
    <span>Generated: ${formatDate(report.generatedAt)}</span>
    <span>Model: ${report.modelName}</span>
    ${metricsPack ? `<span>Data: ${metricsPack.gamesIncluded} games, ${metricsPack.venuesIncluded} venues</span>` : ''}
  </div>
  ${content}
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const filename = `${sanitizeFilename(report.reportType)}-${report.periodKey}.html`;

    return { success: true, blob, filename, html };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ===================================================================
// MAIN EXPORT FUNCTION
// ===================================================================

export function exportReport(
  report: DirectorReport,
  reportData: WeeklyOpsReportData | MonthlyBoardReportData,
  options: ExportOptions,
  metricsPack?: MetricsPack | null
): ExportResult {
  switch (options.format) {
    case 'json':
      return exportAsJson(report, reportData, metricsPack);
    case 'markdown':
      return exportAsMarkdown(report, reportData, metricsPack);
    case 'html':
      return exportAsHtml(report, reportData, metricsPack);
    default:
      return { success: false, error: `Unknown format: ${options.format}` };
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Print report to PDF via browser print dialog
 * Fixed: Uses document.write instead of blob URL for reliable cross-browser support
 */
export function printToPdf(
  report: DirectorReport,
  reportData: WeeklyOpsReportData | MonthlyBoardReportData,
  metricsPack?: MetricsPack | null
): void {
  const result = exportAsHtml(report, reportData, metricsPack);
  
  if (!result.success || !result.html) {
    console.error('Failed to generate HTML for printing:', result.error);
    alert('Failed to generate print preview. Please try downloading as HTML instead.');
    return;
  }

  // Open new window and write HTML directly (more reliable than blob URLs)
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  
  if (!printWindow) {
    // Popup was blocked - fallback to download
    console.warn('Print window was blocked. Falling back to HTML download.');
    alert('Popup was blocked. Please allow popups or download the HTML file instead.');
    return;
  }

  try {
    printWindow.document.open();
    printWindow.document.write(result.html);
    printWindow.document.close();

    // Wait for content to load, then trigger print
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 250);
    };

    // Fallback if onload doesn't fire
    setTimeout(() => {
      if (printWindow && !printWindow.closed) {
        printWindow.focus();
        printWindow.print();
      }
    }, 1000);
  } catch (error) {
    console.error('Print failed:', error);
    printWindow.close();
    alert('Print failed. Please try downloading as HTML instead.');
  }
}

/**
 * Open report in a new tab for viewing (without print dialog)
 */
export function openInNewTab(
  report: DirectorReport,
  reportData: WeeklyOpsReportData | MonthlyBoardReportData,
  metricsPack?: MetricsPack | null
): void {
  const result = exportAsHtml(report, reportData, metricsPack);
  
  if (!result.success || !result.html) {
    console.error('Failed to generate HTML:', result.error);
    return;
  }

  const newWindow = window.open('', '_blank');
  if (newWindow) {
    newWindow.document.open();
    newWindow.document.write(result.html);
    newWindow.document.close();
  }
}