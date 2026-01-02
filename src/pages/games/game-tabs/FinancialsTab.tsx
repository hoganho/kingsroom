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
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../../utils/generalHelpers';

import { Game, GameCost, GameFinancialSnapshot } from '../../../API';
import { SectionCard, DetailRow, StatCard } from './components';

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

      {/* Guarantee Status */}
      {game.hasGuarantee && (
        <div className={`rounded-lg p-4 ${guaranteeMet ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <div className="flex items-center">
            {guaranteeMet ? (
              <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
            ) : (
              <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mr-2" />
            )}
            <div className="flex-1">
              <p className={`font-medium ${guaranteeMet ? 'text-green-800' : 'text-red-800'}`}>
                {guaranteeMet ? 'Guarantee Met' : 'Guarantee Overlay'}
              </p>
              <p className={`text-sm ${guaranteeMet ? 'text-green-600' : 'text-red-600'}`}>
                Guarantee: {formatCurrency(game.guaranteeAmount)} | 
                Actual: {formatCurrency(game.prizepoolPaid || game.prizepoolCalculated)}
                {!guaranteeMet && game.guaranteeOverlayCost && (
                  <> | Overlay Cost: {formatCurrency(game.guaranteeOverlayCost)}</>
                )}
              </p>
            </div>
          </div>
        </div>
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

        {/* Prizepool Breakdown */}
        <SectionCard title="Prizepool Breakdown" icon={TrophyIcon}>
          <dl className="divide-y divide-gray-100">
            <DetailRow label="Player Contributions" value={formatCurrency(game.prizepoolPlayerContributions)} />
            <DetailRow label="Added Value (Overlay)" value={formatCurrency(game.prizepoolAddedValue)} />
            <DetailRow label="Prizepool Surplus" value={formatCurrency(game.prizepoolSurplus)} />
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

      {/* Costs Breakdown */}
      {gameCost && (
        <SectionCard 
          title="Cost Breakdown" 
          icon={BanknotesIcon}
          headerAction={
            gameCost.isEstimate && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                Estimated
              </span>
            )
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <dl className="divide-y divide-gray-100">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider py-2">Staff Costs</h4>
              <DetailRow label="Dealers" value={formatCurrency(gameCost.totalDealerCost)} />
              <DetailRow label="Tournament Director" value={formatCurrency(gameCost.totalTournamentDirectorCost)} />
              <DetailRow label="Floor Staff" value={formatCurrency(gameCost.totalFloorStaffCost)} />
              <DetailRow label="Security" value={formatCurrency(gameCost.totalSecurityCost)} />
              <DetailRow label="Total Staff" value={formatCurrency(gameCost.totalStaffCost)} className="font-semibold" />
            </dl>
            <dl className="divide-y divide-gray-100">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider py-2">Other Costs</h4>
              <DetailRow label="Venue Rental" value={formatCurrency(gameCost.totalVenueRentalCost)} />
              <DetailRow label="Equipment Rental" value={formatCurrency(gameCost.totalEquipmentRentalCost)} />
              <DetailRow label="Food & Beverage" value={formatCurrency(gameCost.totalFoodBeverageCost)} />
              <DetailRow label="Marketing" value={formatCurrency(gameCost.totalMarketingCost)} />
              <DetailRow label="Streaming" value={formatCurrency(gameCost.totalStreamingCost)} />
              <DetailRow label="Promotions" value={formatCurrency(gameCost.totalPromotionCost)} />
              <DetailRow label="Other" value={formatCurrency(gameCost.totalOtherCost)} />
            </dl>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <dl className="flex justify-between items-center">
              <dt className="text-sm font-medium text-gray-900">Total Cost</dt>
              <dd className="text-lg font-bold text-gray-900">{formatCurrency(gameCost.totalCost)}</dd>
            </dl>
          </div>
        </SectionCard>
      )}

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