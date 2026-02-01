// src/pages/games/game-tabs/FinancialsTab.tsx
// Financials tab for GameDetails - Revenue, costs, and profit analysis
// =============================================================================

import { useMemo } from 'react';
import {
  BanknotesIcon,
  TrophyIcon,
  UserGroupIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  DocumentDuplicateIcon,
  CalculatorIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../../utils/generalHelpers';

import { Game, GameCost, GameFinancialSnapshot } from '../../../API';
import { SectionCard, DetailRow, StatCard } from './components';
import { IncomeStatement } from '../../../components/financial';

interface FinancialsTabProps {
  game: Game;
  gameCost?: GameCost | null;
  financialSnapshot?: GameFinancialSnapshot | null;
}

export const FinancialsTab: React.FC<FinancialsTabProps> = ({ 
  game, 
  gameCost, 
  financialSnapshot 
}) => {
  const guaranteeMet = useMemo(() => {
    if (!game.hasGuarantee || !game.guaranteeAmount) return null;
    const actual = game.prizepoolPaid || game.prizepoolCalculated || 0;
    return actual >= game.guaranteeAmount;
  }, [game]);

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          icon={BanknotesIcon}
          label="Buy-In"
          value={formatCurrency(game.buyIn)}
          subValue={game.rake ? `incl. ${formatCurrency(game.rake)} rake` : undefined}
          iconColor="text-green-500"
        />
        <StatCard 
          icon={TrophyIcon}
          label="Prizepool"
          value={formatCurrency(game.prizepoolPaid || game.prizepoolCalculated)}
          subValue={game.prizepoolPaid !== game.prizepoolCalculated ? `Calc: ${formatCurrency(game.prizepoolCalculated)}` : undefined}
          iconColor="text-yellow-500"
        />
        <StatCard 
          icon={financialSnapshot?.netProfit && financialSnapshot.netProfit >= 0 ? ArrowTrendingUpIcon : ArrowTrendingDownIcon}
          label="Total Profit"
          value={formatCurrency(financialSnapshot?.netProfit)}
          subValue={financialSnapshot?.profitMargin ? `${(financialSnapshot.profitMargin * 100).toFixed(1)}% margin` : undefined}
          iconColor={financialSnapshot?.netProfit && financialSnapshot.netProfit >= 0 ? 'text-green-500' : 'text-red-500'}
        />
        <StatCard 
          icon={UserGroupIcon}
          label="Profit per Player"
          value={formatCurrency(financialSnapshot?.profitPerPlayer)}
          iconColor={(financialSnapshot?.profitPerPlayer ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}
        />
      </div>

      {/* Guarantee Status - Three states: met, met with overlay, not met */}
      {game.hasGuarantee && (
        <div className={`rounded-lg p-4 ${
          !guaranteeMet 
            ? 'bg-red-50 border border-red-200' 
            : (game.guaranteeOverlayCost ?? 0) > 0 
              ? 'bg-amber-50 border border-amber-200'
              : 'bg-green-50 border border-green-200'
        }`}>
          <div className="flex items-center">
            {!guaranteeMet ? (
              <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mr-2" />
            ) : (game.guaranteeOverlayCost ?? 0) > 0 ? (
              <CheckCircleIcon className="h-5 w-5 text-amber-500 mr-2" />
            ) : (
              <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
            )}
            <div className="flex-1">
              <p className={`font-medium ${
                !guaranteeMet 
                  ? 'text-red-800' 
                  : (game.guaranteeOverlayCost ?? 0) > 0 
                    ? 'text-amber-800'
                    : 'text-green-800'
              }`}>
                {!guaranteeMet 
                  ? 'Guarantee Not Met' 
                  : (game.guaranteeOverlayCost ?? 0) > 0 
                    ? 'Guarantee Met (with Overlay)'
                    : 'Guarantee Met'
                }
              </p>
              <p className={`text-sm ${
                !guaranteeMet 
                  ? 'text-red-600' 
                  : (game.guaranteeOverlayCost ?? 0) > 0 
                    ? 'text-amber-600'
                    : 'text-green-600'
              }`}>
                Guarantee: {formatCurrency(game.guaranteeAmount)} | 
                Actual: {formatCurrency(game.prizepoolPaid || game.prizepoolCalculated)}
                {(game.guaranteeOverlayCost ?? 0) > 0 && (
                  <> | Overlay Cost: <span className="font-semibold">{formatCurrency(game.guaranteeOverlayCost)}</span></>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Income Statement - Xero-style P&L view */}
      {financialSnapshot && (
        <SectionCard title="Profit and Loss" icon={CalculatorIcon}>
          <IncomeStatement
            game={game}
            financialSnapshot={financialSnapshot}
            compact={false}
            showSupplementary={true}
          />
        </SectionCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Breakdown */}
        <SectionCard title="Revenue Breakdown" icon={ArrowTrendingUpIcon}>
          <dl className="divide-y divide-gray-100">
            <DetailRow label="Total Buy-Ins Collected" value={formatCurrency(game.totalBuyInsCollected)} />
            <DetailRow label="Rake Revenue" value={formatCurrency(game.rakeRevenue)} />
            <DetailRow label="Venue Fee" value={formatCurrency(game.venueFee)} />
            <DetailRow 
              label="Total Revenue" 
              value={formatCurrency(financialSnapshot?.totalRevenue)} 
              className="font-semibold bg-gray-50 -mx-4 px-4"
            />
          </dl>
        </SectionCard>

        {/* Prizepool Breakdown - Separate Overlay and Added Value */}
        <SectionCard title="Prizepool Breakdown" icon={TrophyIcon}>
          <dl className="divide-y divide-gray-100">
            <DetailRow label="Player Contributions" value={formatCurrency(game.prizepoolPlayerContributions)} />
            {(game.guaranteeOverlayCost ?? 0) > 0 && (
              <DetailRow 
                label="Guarantee Overlay" 
                value={formatCurrency(game.guaranteeOverlayCost)} 
                className="text-red-600"
              />
            )}
            {(game.prizepoolAddedValue ?? 0) > 0 && (
              <DetailRow 
                label="Promotional Added Value" 
                value={formatCurrency(game.prizepoolAddedValue)} 
                className="text-green-600"
              />
            )}
            {(game.prizepoolSurplus ?? 0) > 0 && (
              <DetailRow label="Prizepool Surplus" value={formatCurrency(game.prizepoolSurplus)} />
            )}
            {game.hasJackpotContributions && (
              <DetailRow 
                label="Jackpot Deductions" 
                value={`-${formatCurrency((game.jackpotContributionAmount || 0) * (game.totalEntries || 0))}`} 
              />
            )}
            <DetailRow 
              label="Prizepool Paid" 
              value={formatCurrency(game.prizepoolPaid)} 
              className="font-semibold bg-gray-50 -mx-4 px-4"
            />
          </dl>
        </SectionCard>
      </div>

      {/* Jackpot & Accumulator Info */}
      {(game.hasJackpotContributions || game.hasAccumulatorTickets) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {game.hasJackpotContributions && (
            <SectionCard title="Jackpot Contributions" icon={BanknotesIcon}>
              <dl className="divide-y divide-gray-100">
                <DetailRow label="Contribution per Entry" value={formatCurrency(game.jackpotContributionAmount)} />
                <DetailRow label="Total Entries" value={game.totalEntries} />
                <DetailRow 
                  label="Total Jackpot Contribution" 
                  value={formatCurrency((game.jackpotContributionAmount || 0) * (game.totalEntries || 0))} 
                  className="font-semibold"
                />
              </dl>
            </SectionCard>
          )}
          {game.hasAccumulatorTickets && (
            <SectionCard title="Accumulator Tickets" icon={DocumentDuplicateIcon}>
              <dl className="divide-y divide-gray-100">
                <DetailRow label="Ticket Value" value={formatCurrency(game.accumulatorTicketValue)} />
                <DetailRow label="Tickets Paid" value={game.numberOfAccumulatorTicketsPaid} />
                <DetailRow 
                  label="Total Ticket Value" 
                  value={formatCurrency((game.accumulatorTicketValue || 0) * (game.numberOfAccumulatorTicketsPaid || 0))} 
                  className="font-semibold"
                />
              </dl>
            </SectionCard>
          )}
        </div>
      )}

      {/* Costs Breakdown - Now includes Prizepool Costs */}
      <SectionCard 
        title="Cost Breakdown" 
        icon={BanknotesIcon}
        headerAction={
          gameCost?.isEstimate && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
              Estimated
            </span>
          )
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8">
          {/* Staff Costs */}
          <dl className="divide-y divide-gray-100">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider py-2">Staff Costs</h4>
            <DetailRow label="Dealers" value={formatCurrency(gameCost?.totalDealerCost ?? financialSnapshot?.totalDealerCost)} />
            <DetailRow label="Tournament Director" value={formatCurrency(gameCost?.totalTournamentDirectorCost ?? financialSnapshot?.totalTournamentDirectorCost)} />
            <DetailRow label="Floor Staff" value={formatCurrency(gameCost?.totalFloorStaffCost ?? financialSnapshot?.totalFloorStaffCost)} />
            <DetailRow label="Security" value={formatCurrency(gameCost?.totalSecurityCost ?? financialSnapshot?.totalSecurityCost)} />
            <DetailRow label="Total Staff" value={formatCurrency(gameCost?.totalStaffCost ?? financialSnapshot?.totalStaffCost)} className="font-semibold" />
          </dl>

          {/* Prizepool Costs */}
          <dl className="divide-y divide-gray-100">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider py-2">Prizepool Costs</h4>
            <DetailRow 
              label="Guarantee Overlay" 
              value={formatCurrency(financialSnapshot?.totalGuaranteeOverlayCost ?? game.guaranteeOverlayCost)} 
              className={(financialSnapshot?.totalGuaranteeOverlayCost ?? game.guaranteeOverlayCost ?? 0) > 0 ? 'text-red-600' : ''}
            />
            <DetailRow 
              label="Added Value" 
              value={formatCurrency(financialSnapshot?.totalAddedValueCost)} 
            />
            <DetailRow 
              label="Prize Contribution" 
              value={formatCurrency(financialSnapshot?.totalPrizeContribution)} 
            />
            <DetailRow 
              label="Jackpot Contribution" 
              value={formatCurrency(financialSnapshot?.totalJackpotContribution)} 
            />
            <DetailRow 
              label="Bounty Cost" 
              value={formatCurrency(financialSnapshot?.totalBountyCost)} 
            />
            <DetailRow 
              label="Total Prizepool Costs" 
              value={formatCurrency(
                (financialSnapshot?.totalGuaranteeOverlayCost ?? game.guaranteeOverlayCost ?? 0) +
                (financialSnapshot?.totalAddedValueCost ?? 0) +
                (financialSnapshot?.totalPrizeContribution ?? 0) +
                (financialSnapshot?.totalJackpotContribution ?? 0) +
                (financialSnapshot?.totalBountyCost ?? 0)
              )} 
              className="font-semibold"
            />
          </dl>

          {/* Operating Costs */}
          <dl className="divide-y divide-gray-100">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider py-2">Operating Costs</h4>
            <DetailRow label="Venue Rental" value={formatCurrency(gameCost?.totalVenueRentalCost ?? financialSnapshot?.totalVenueRentalCost)} />
            <DetailRow label="Equipment Rental" value={formatCurrency(gameCost?.totalEquipmentRentalCost ?? financialSnapshot?.totalEquipmentRentalCost)} />
            <DetailRow label="Food & Beverage" value={formatCurrency(gameCost?.totalFoodBeverageCost ?? financialSnapshot?.totalFoodBeverageCost)} />
            <DetailRow label="Marketing" value={formatCurrency(gameCost?.totalMarketingCost ?? financialSnapshot?.totalMarketingCost)} />
            <DetailRow label="Streaming" value={formatCurrency(gameCost?.totalStreamingCost ?? financialSnapshot?.totalStreamingCost)} />
            <DetailRow label="Promotions" value={formatCurrency(gameCost?.totalPromotionCost ?? financialSnapshot?.totalPromotionCost)} />
            <DetailRow label="Other" value={formatCurrency(gameCost?.totalOtherCost ?? financialSnapshot?.totalOtherCost)} />
          </dl>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200">
          <dl className="flex justify-between items-center">
            <dt className="text-sm font-medium text-gray-900">Total Cost</dt>
            <dd className="text-lg font-bold text-red-600">{formatCurrency(financialSnapshot?.totalCost ?? gameCost?.totalCost)}</dd>
          </dl>
        </div>
      </SectionCard>

      {/* Per-Player Metrics */}
      {financialSnapshot && (
        <SectionCard title="Per-Player Metrics" icon={UserGroupIcon}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(financialSnapshot.revenuePerPlayer)}</p>
              <p className="text-xs text-gray-500 mt-1">Revenue / Player</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(financialSnapshot.costPerPlayer)}</p>
              <p className="text-xs text-gray-500 mt-1">Cost / Player</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className={`text-2xl font-bold ${(financialSnapshot.profitPerPlayer || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(financialSnapshot.profitPerPlayer)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Profit / Player</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(financialSnapshot.rakePerEntry)}</p>
              <p className="text-xs text-gray-500 mt-1">Rake / Entry</p>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
};

export default FinancialsTab;