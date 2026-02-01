// src/components/financial/IncomeStatement.tsx
// Xero-style income statement with Tremor styling
// Used by: FinancialsTab, VenueGameDetails (PLRow expanded view)
// =============================================================================

import React from 'react';
import { cx, formatCurrency } from '@/lib/utils';

// Types matching the GraphQL schema
interface GameData {
  name?: string | null;
  tournamentId?: string | number | null;
  totalEntries?: number | null;
  totalUniquePlayers?: number | null;
  totalRebuys?: number | null;
  totalAddons?: number | null;
  prizepoolPaid?: number | null;
  hasGuarantee?: boolean | null;
  guaranteeAmount?: number | null;
  guaranteeOverlayCost?: number | null;
}

interface FinancialSnapshotData {
  // Revenue
  rakeRevenue?: number | null;
  venueFee?: number | null;
  totalRevenue?: number | null;
  
  // Prizepool
  prizepoolPlayerContributions?: number | null;
  prizepoolAddedValue?: number | null;
  
  // Staff Costs
  totalDealerCost?: number | null;
  totalTournamentDirectorCost?: number | null;
  totalFloorStaffCost?: number | null;
  totalSecurityCost?: number | null;
  totalStaffCost?: number | null;
  
  // Prize & Guarantee Costs (Cost of Sales)
  totalGuaranteeOverlayCost?: number | null;
  totalAddedValueCost?: number | null;
  totalPrizeContribution?: number | null;
  totalJackpotContribution?: number | null;
  totalBountyCost?: number | null;
  totalPrizepoolCost?: number | null;
  
  // Operating Costs
  totalVenueRentalCost?: number | null;
  totalEquipmentRentalCost?: number | null;
  totalFoodBeverageCost?: number | null;
  totalMarketingCost?: number | null;
  totalStreamingCost?: number | null;
  totalPromotionCost?: number | null;
  totalOtherCost?: number | null;
  totalOperatingCost?: number | null;
  
  // Totals
  totalCost?: number | null;
  netProfit?: number | null;
  profitMargin?: number | null;
  
  // Per Player Metrics
  revenuePerPlayer?: number | null;
  costPerPlayer?: number | null;
  profitPerPlayer?: number | null;
  rakePerEntry?: number | null;
  
  // Guarantee
  guaranteeCoverageRate?: number | null;
}

interface IncomeStatementProps {
  game?: GameData | null;
  financialSnapshot?: FinancialSnapshotData | null;
  /** Compact mode for inline/expanded row display (smaller text) */
  compact?: boolean;
  /** Show supplementary sections (Per Player, Guarantee, Prizepool) */
  showSupplementary?: boolean;
  /** Custom class name for container */
  className?: string;
}

// Helper to check if a value is > 0
const hasValue = (val: number | null | undefined): boolean => (val ?? 0) > 0;

// Line item component with Tremor styling
const LineItem: React.FC<{
  label: string;
  value: number | null | undefined;
  indent?: number;
  bold?: boolean;
  className?: string;
}> = ({ label, value, indent = 0, bold = false, className = '' }) => {
  const displayValue = value ?? 0;
  const paddingLeft = indent * 20;
  
  return (
    <div 
      className={cx(
        "flex justify-between py-1",
        bold && "font-medium",
        className
      )}
      style={{ paddingLeft }}
    >
      <span className="text-gray-700 dark:text-gray-300">{label}</span>
      <span className="tabular-nums text-gray-900 dark:text-gray-50">
        {formatCurrency(displayValue)}
      </span>
    </div>
  );
};

// Section header with Tremor styling
const SectionHeader: React.FC<{ title: string; className?: string }> = ({ title, className = '' }) => (
  <div 
    className={cx(
      "text-xs font-semibold uppercase tracking-wide pt-4 pb-2",
      "text-gray-500 dark:text-gray-400",
      "border-b border-gray-200 dark:border-gray-800",
      className
    )}
  >
    {title}
  </div>
);

// Sub-section header (for grouped costs)
const SubSectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="text-xs font-medium uppercase tracking-wide pt-2 pb-1 pl-5 text-gray-400 dark:text-gray-500">
    {title}
  </div>
);

// Subtotal line with Tremor styling
const SubtotalLine: React.FC<{
  label: string;
  value: number | null | undefined;
  variant?: 'default' | 'gross' | 'net';
}> = ({ label, value, variant = 'default' }) => {
  const displayValue = value ?? 0;
  const isPositive = displayValue >= 0;
  
  const valueStyles = {
    default: 'text-gray-900 dark:text-gray-50',
    gross: isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
    net: isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
  };
  
  const containerStyles = {
    default: 'border-t border-gray-200 dark:border-gray-800',
    gross: 'border-t border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 -mx-4 px-4 rounded',
    net: 'border-t-2 border-gray-900 dark:border-gray-100 bg-gray-100 dark:bg-gray-800 -mx-4 px-4 rounded',
  };
  
  return (
    <div className={cx("flex justify-between py-2 mt-1", containerStyles[variant])}>
      <span className={cx(
        "font-semibold",
        variant === 'net' ? "text-gray-900 dark:text-gray-50" : "text-gray-700 dark:text-gray-300"
      )}>
        {label}
      </span>
      <span className={cx("font-semibold tabular-nums", valueStyles[variant])}>
        {formatCurrency(displayValue)}
      </span>
    </div>
  );
};

// Metric row for supplementary section
const MetricRow: React.FC<{
  label: string;
  value: string | number | null | undefined;
  valueColor?: 'default' | 'positive' | 'negative' | 'warning';
  isCurrency?: boolean;
}> = ({ label, value, valueColor = 'default', isCurrency = true }) => {
  const colorStyles = {
    default: 'text-gray-900 dark:text-gray-50',
    positive: 'text-emerald-600 dark:text-emerald-400',
    negative: 'text-red-600 dark:text-red-400',
    warning: 'text-amber-600 dark:text-amber-400',
  };
  
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className={cx("tabular-nums font-medium", colorStyles[valueColor])}>
        {isCurrency && typeof value === 'number' ? formatCurrency(value) : value}
      </span>
    </div>
  );
};

/**
 * IncomeStatement - Xero-style P&L with Tremor styling
 * 
 * Structure:
 * - Revenue
 * - Less: Cost of Sales (Prizepool Costs)
 * = Gross Profit
 * - Less: Operating Expenses (Staff + Other)
 * = Net Profit
 */
export const IncomeStatement: React.FC<IncomeStatementProps> = ({
  game,
  financialSnapshot,
  compact: _compact = false, // Reserved for future compact mode styling
  showSupplementary = true,
  className = '',
}) => {
  const fs = financialSnapshot;
  
  // Use game.guaranteeOverlayCost as fallback when snapshot doesn't have it
  const guaranteeOverlayCost = fs?.totalGuaranteeOverlayCost ?? game?.guaranteeOverlayCost ?? 0;
  
  // Calculate totals
  const totalRevenue = fs?.totalRevenue ?? 0;
  const totalPrizepoolCost = fs?.totalPrizepoolCost ?? (
    guaranteeOverlayCost +
    (fs?.totalAddedValueCost ?? 0) +
    (fs?.totalPrizeContribution ?? 0) +
    (fs?.totalJackpotContribution ?? 0) +
    (fs?.totalBountyCost ?? 0)
  );
  const grossProfit = totalRevenue - totalPrizepoolCost;
  
  const totalStaffCost = fs?.totalStaffCost ?? (
    (fs?.totalDealerCost ?? 0) +
    (fs?.totalTournamentDirectorCost ?? 0) +
    (fs?.totalFloorStaffCost ?? 0) +
    (fs?.totalSecurityCost ?? 0)
  );
  
  const totalOperatingCost = fs?.totalOperatingCost ?? (
    (fs?.totalVenueRentalCost ?? 0) +
    (fs?.totalEquipmentRentalCost ?? 0) +
    (fs?.totalFoodBeverageCost ?? 0) +
    (fs?.totalMarketingCost ?? 0) +
    (fs?.totalStreamingCost ?? 0) +
    (fs?.totalPromotionCost ?? 0) +
    (fs?.totalOtherCost ?? 0)
  );
  
  const totalExpenses = totalStaffCost + totalOperatingCost;
  const netProfit = fs?.netProfit ?? (grossProfit - totalExpenses);
  const profitMargin = fs?.profitMargin ?? (totalRevenue > 0 ? netProfit / totalRevenue : 0);

  // Check for cost categories
  const hasStaffCosts = hasValue(fs?.totalDealerCost) || 
    hasValue(fs?.totalTournamentDirectorCost) ||
    hasValue(fs?.totalFloorStaffCost) ||
    hasValue(fs?.totalSecurityCost);

  const hasPrizepoolCosts = guaranteeOverlayCost > 0 || 
    hasValue(fs?.totalAddedValueCost) ||
    hasValue(fs?.totalPrizeContribution) ||
    hasValue(fs?.totalJackpotContribution) ||
    hasValue(fs?.totalBountyCost);

  const hasOperatingCosts = hasValue(fs?.totalVenueRentalCost) || 
    hasValue(fs?.totalEquipmentRentalCost) ||
    hasValue(fs?.totalFoodBeverageCost) ||
    hasValue(fs?.totalMarketingCost) ||
    hasValue(fs?.totalStreamingCost) ||
    hasValue(fs?.totalPromotionCost) ||
    hasValue(fs?.totalOtherCost);

  return (
    <div className={cx("text-sm", className)}>
      {/* Main Income Statement */}
      <div>
        {/* ==================== REVENUE ==================== */}
        <SectionHeader title="Revenue" className="pt-0" />
        <div className="py-1">
          <LineItem label="Rake Revenue" value={fs?.rakeRevenue} indent={1} />
          {hasValue(fs?.venueFee) && (
            <LineItem label="Venue Fee" value={fs?.venueFee} indent={1} />
          )}
        </div>
        <SubtotalLine label="Total Revenue" value={totalRevenue} />

        {/* ==================== COST OF SALES ==================== */}
        {(hasPrizepoolCosts || totalPrizepoolCost > 0) && (
          <>
            <SectionHeader title="Cost of Sales" />
            <div className="py-1">
              {guaranteeOverlayCost > 0 && (
                <LineItem label="Guarantee Overlay" value={guaranteeOverlayCost} indent={1} />
              )}
              {hasValue(fs?.totalAddedValueCost) && (
                <LineItem label="Promotional Added Value" value={fs?.totalAddedValueCost} indent={1} />
              )}
              {hasValue(fs?.totalPrizeContribution) && (
                <LineItem label="Prize Contribution" value={fs?.totalPrizeContribution} indent={1} />
              )}
              {hasValue(fs?.totalJackpotContribution) && (
                <LineItem label="Jackpot Contribution" value={fs?.totalJackpotContribution} indent={1} />
              )}
              {hasValue(fs?.totalBountyCost) && (
                <LineItem label="Bounty Payments" value={fs?.totalBountyCost} indent={1} />
              )}
            </div>
            <SubtotalLine label="Total Cost of Sales" value={totalPrizepoolCost} />
          </>
        )}

        {/* ==================== GROSS PROFIT ==================== */}
        <div className="mt-3">
          <SubtotalLine label="Gross Profit" value={grossProfit} variant="gross" />
        </div>

        {/* ==================== OPERATING EXPENSES ==================== */}
        {(hasStaffCosts || hasOperatingCosts || totalExpenses > 0) && (
          <>
            <SectionHeader title="Operating Expenses" />
            
            {/* Staff Costs */}
            {hasStaffCosts && (
              <>
                <SubSectionHeader title="Staff Costs" />
                {hasValue(fs?.totalDealerCost) && (
                  <LineItem label="Dealers" value={fs?.totalDealerCost} indent={2} />
                )}
                {hasValue(fs?.totalTournamentDirectorCost) && (
                  <LineItem label="Tournament Director" value={fs?.totalTournamentDirectorCost} indent={2} />
                )}
                {hasValue(fs?.totalFloorStaffCost) && (
                  <LineItem label="Floor Staff" value={fs?.totalFloorStaffCost} indent={2} />
                )}
                {hasValue(fs?.totalSecurityCost) && (
                  <LineItem label="Security" value={fs?.totalSecurityCost} indent={2} />
                )}
              </>
            )}

            {/* Other Operating Costs */}
            {hasOperatingCosts && (
              <>
                <SubSectionHeader title="Other Expenses" />
                {hasValue(fs?.totalVenueRentalCost) && (
                  <LineItem label="Venue Rental" value={fs?.totalVenueRentalCost} indent={2} />
                )}
                {hasValue(fs?.totalEquipmentRentalCost) && (
                  <LineItem label="Equipment Rental" value={fs?.totalEquipmentRentalCost} indent={2} />
                )}
                {hasValue(fs?.totalFoodBeverageCost) && (
                  <LineItem label="Food & Beverage" value={fs?.totalFoodBeverageCost} indent={2} />
                )}
                {hasValue(fs?.totalMarketingCost) && (
                  <LineItem label="Marketing" value={fs?.totalMarketingCost} indent={2} />
                )}
                {hasValue(fs?.totalStreamingCost) && (
                  <LineItem label="Streaming" value={fs?.totalStreamingCost} indent={2} />
                )}
                {hasValue(fs?.totalPromotionCost) && (
                  <LineItem label="Promotions" value={fs?.totalPromotionCost} indent={2} />
                )}
                {hasValue(fs?.totalOtherCost) && (
                  <LineItem label="Other Expenses" value={fs?.totalOtherCost} indent={2} />
                )}
              </>
            )}
            
            <SubtotalLine label="Total Operating Expenses" value={totalExpenses} />
          </>
        )}

        {/* ==================== NET PROFIT ==================== */}
        <div className="mt-4">
          <SubtotalLine label="Net Profit" value={netProfit} variant="net" />
          <div className="flex justify-between py-1 text-sm -mx-4 px-4">
            <span className="text-gray-500 dark:text-gray-400">Profit Margin</span>
            <span className={cx(
              "font-medium tabular-nums",
              netProfit >= 0 
                ? "text-emerald-600 dark:text-emerald-400" 
                : "text-red-600 dark:text-red-400"
            )}>
              {(profitMargin * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* ==================== SUPPLEMENTARY INFORMATION ==================== */}
      {showSupplementary && (
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-4">
            Supplementary Information
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Per Player Metrics */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-900 dark:text-gray-50 mb-3 pb-2 border-b border-gray-200 dark:border-gray-800">
                Per Player Metrics
              </div>
              <div className="space-y-1 text-sm">
                <MetricRow label="Revenue" value={fs?.revenuePerPlayer} />
                <MetricRow label="Cost" value={fs?.costPerPlayer} />
                <MetricRow 
                  label="Profit" 
                  value={fs?.profitPerPlayer} 
                  valueColor={(fs?.profitPerPlayer ?? 0) >= 0 ? 'positive' : 'negative'}
                />
                <MetricRow label="Rake per Entry" value={fs?.rakePerEntry} />
              </div>
            </div>

            {/* Prizepool Analysis */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-900 dark:text-gray-50 mb-3 pb-2 border-b border-gray-200 dark:border-gray-800">
                Prizepool Analysis
              </div>
              <div className="space-y-1 text-sm">
                <MetricRow label="Player Contributions" value={fs?.prizepoolPlayerContributions} />
                {guaranteeOverlayCost > 0 && (
                  <MetricRow 
                    label="Guarantee Overlay" 
                    value={guaranteeOverlayCost} 
                    valueColor="negative"
                  />
                )}
                {hasValue(fs?.prizepoolAddedValue) && (
                  <MetricRow 
                    label="Added Value" 
                    value={fs?.prizepoolAddedValue} 
                    valueColor="positive"
                  />
                )}
                <div className="pt-2 mt-2 border-t border-gray-100 dark:border-gray-800">
                  <MetricRow 
                    label="Total Paid" 
                    value={game?.prizepoolPaid} 
                  />
                </div>
              </div>
            </div>

            {/* Guarantee Performance */}
            {game?.hasGuarantee && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-900 dark:text-gray-50 mb-3 pb-2 border-b border-gray-200 dark:border-gray-800">
                  Guarantee Performance
                </div>
                <div className="space-y-1 text-sm">
                  <MetricRow label="Guarantee Amount" value={game?.guaranteeAmount} />
                  <MetricRow 
                    label="Coverage Rate" 
                    value={fs?.guaranteeCoverageRate 
                      ? `${(fs.guaranteeCoverageRate * 100).toFixed(0)}%` 
                      : '-'
                    }
                    valueColor={(fs?.guaranteeCoverageRate ?? 0) >= 1 ? 'positive' : 'warning'}
                    isCurrency={false}
                  />
                  {guaranteeOverlayCost > 0 && (
                    <div className="pt-2 mt-2 border-t border-gray-100 dark:border-gray-800">
                      <MetricRow 
                        label="Overlay Cost" 
                        value={guaranteeOverlayCost} 
                        valueColor="negative"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default IncomeStatement;