// components/insights/ReportDownloadButton.tsx
// Download button with format options for reports
// VERSION: 2.0.0 - Added View in Tab option, fixed print functionality

import React, { useState, useRef, useEffect } from 'react';
import { Download, FileJson, FileText, Printer, ChevronDown, Check, ExternalLink } from 'lucide-react';
import { exportReport, downloadBlob, printToPdf, openInNewTab, type ExportFormat } from '../../utils/reportExport';
import type { DirectorReport, WeeklyOpsReportData, MonthlyBoardReportData, MetricsPack } from '../../types/insights';

interface ReportDownloadButtonProps {
  report: DirectorReport;
  reportData: WeeklyOpsReportData | MonthlyBoardReportData;
  metricsPack?: MetricsPack | null;
  className?: string;
}

interface FormatOption {
  id: ExportFormat | 'print' | 'view';
  label: string;
  description: string;
  icon: React.ReactNode;
  divider?: boolean;
}

const formatOptions: FormatOption[] = [
  { id: 'view', label: 'View in New Tab', description: 'Open formatted report', icon: <ExternalLink className="w-4 h-4" />, divider: true },
  { id: 'print', label: 'Print / Save PDF', description: 'Print or save as PDF', icon: <Printer className="w-4 h-4" /> },
  { id: 'html', label: 'Download HTML', description: 'Web page format', icon: <FileText className="w-4 h-4" /> },
  { id: 'markdown', label: 'Download Markdown', description: 'Documentation format', icon: <FileText className="w-4 h-4" /> },
  { id: 'json', label: 'Download JSON', description: 'Raw data format', icon: <FileJson className="w-4 h-4" /> },
];

export const ReportDownloadButton: React.FC<ReportDownloadButtonProps> = ({ report, reportData, metricsPack, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAction = async (actionId: ExportFormat | 'print' | 'view') => {
    setDownloading(true);
    try {
      const parsedData = typeof reportData === 'string' ? JSON.parse(reportData) : reportData;

      if (actionId === 'view') {
        openInNewTab(report, parsedData, metricsPack);
        setLastAction('view');
      } else if (actionId === 'print') {
        printToPdf(report, parsedData, metricsPack);
        setLastAction('print');
      } else {
        const result = exportReport(report, parsedData, { format: actionId }, metricsPack);
        if (result.success && result.blob && result.filename) {
          downloadBlob(result.blob, result.filename);
          setLastAction(actionId);
        } else {
          console.error('Export failed:', result.error);
          alert(`Export failed: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('Action failed:', error);
      alert(`Action failed: ${error}`);
    } finally {
      setDownloading(false);
      setTimeout(() => { setIsOpen(false); setLastAction(null); }, 1000);
    }
  };

  return (
    <div className={`relative inline-block ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={downloading}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        <Download className={`w-4 h-4 ${downloading ? 'animate-bounce' : ''}`} />
        Export
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-60 rounded-lg shadow-lg bg-white border border-gray-200 py-1 z-50">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Export Report</p>
          </div>
          {formatOptions.map((option, index) => (
            <React.Fragment key={option.id}>
              {option.divider && index > 0 && (
                <div className="border-b border-gray-100 my-1" />
              )}
              <button
                onClick={() => handleAction(option.id)}
                disabled={downloading}
                className={`w-full px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors ${downloading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`p-1.5 rounded-lg ${lastAction === option.id ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}`}>
                  {lastAction === option.id ? <Check className="w-4 h-4" /> : option.icon}
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium text-gray-900">{option.label}</div>
                  <div className="text-xs text-gray-500">{option.description}</div>
                </div>
              </button>
              {option.divider && (
                <div className="border-b border-gray-100 my-1" />
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReportDownloadButton;