// src/pages/games/GameDetails.tsx
// Comprehensive Game Details Page - Modular Architecture
// =============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getClient } from '../../utils/apiClient';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { format } from 'date-fns';
import { formatCurrency } from '../../utils/generalHelpers';
import {
  UserGroupIcon,
  ClockIcon,
  MapPinIcon,
  LinkIcon,
  ArrowPathIcon,
  TableCellsIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

// Import tab components and types
import {
  StatusBadge,
  LoadingSpinner,
} from './game-tabs';

import type {
  Game,
  TournamentStructure,
  PlayerEntry,
  PlayerResult,
  RecurringGame,
  TournamentSeries,
  GameCost,
  GameFinancialSnapshot,
  SocialPost,
} from '../../API';

import { OverviewTab } from './game-tabs/OverviewTab';
import { FinancialsTab } from './game-tabs/FinancialsTab';
import { PlayersTab } from './game-tabs/PlayersTab';
import { ResultsTab } from './game-tabs/ResultsTab';
import { RelationsTab } from './game-tabs/RelationsTab';

// =============================================================================
// LOCAL TYPES
// =============================================================================

type TabId = 'overview' | 'financials' | 'players' | 'results' | 'relations';

interface GameData {
  game: Game;
  structure?: TournamentStructure | null;
  entries: PlayerEntry[];
  results: PlayerResult[];
  recurringGame?: RecurringGame | null;
  tournamentSeries?: TournamentSeries | null;
  parentGame?: Game | null;
  childGames: Game[];
  gameCost?: GameCost | null;
  financialSnapshot?: GameFinancialSnapshot | null;
  linkedSocialPosts: SocialPost[];
}

// =============================================================================
// GRAPHQL QUERIES
// =============================================================================

const GET_GAME_QUERY = /* GraphQL */ `
  query GetGame($id: ID!) {
    getGame(id: $id) {
      id
      name
      tournamentId
      gameType
      gameVariant
      gameStatus
      registrationStatus
      gameStartDateTime
      gameEndDateTime
      gameFrequency
      totalDuration
      
      # Financials
      buyIn
      rake
      venueFee
      startingStack
      hasGuarantee
      guaranteeAmount
      
      # Calculated Financial Metrics
      totalBuyInsCollected
      rakeRevenue
      prizepoolPlayerContributions
      prizepoolAddedValue
      prizepoolSurplus
      guaranteeOverlayCost
      gameProfit
      
      # Jackpot & Accumulator
      hasJackpotContributions
      jackpotContributionAmount
      hasAccumulatorTickets
      accumulatorTicketValue
      numberOfAccumulatorTicketsPaid
      
      # Aggregates & Results
      prizepoolPaid
      prizepoolCalculated
      totalUniquePlayers
      totalInitialEntries
      totalEntries
      totalRebuys
      totalAddons
      
      # Live Game Data
      playersRemaining
      totalChipsInPlay
      averagePlayerStack
      
      # Classification
      tournamentType
      isRegular
      isSatellite
      gameTags
      dealerDealt
      
      # New Classification Fields
      sessionMode
      variant
      bettingStructure
      speedType
      tableSize
      maxPlayers
      dealType
      buyInTier
      entryStructure
      bountyType
      bountyAmount
      bountyPercentage
      tournamentPurpose
      stackDepth
      lateRegistration
      payoutStructure
      scheduleType
      classificationSource
      classificationConfidence
      
      # Series Reference Fields
      isSeries
      seriesName
      isMainEvent
      eventNumber
      dayNumber
      flightLetter
      finalDay
      
      # Multi-Day Consolidation
      parentGameId
      consolidationType
      consolidationKey
      isPartialData
      missingFlightCount
      expectedTotalEntries
      
      # Assignment Statuses
      venueAssignmentStatus
      seriesAssignmentStatus
      recurringGameAssignmentStatus
      recurringGameAssignmentConfidence
      wasScheduledInstance
      deviationNotes
      instanceNumber
      
      # Structure
      levels
      
      # Data Source
      sourceUrl
      wasEdited
      lastEditedAt
      lastEditedBy
      
      # Relationships
      venueId
      venue {
        id
        name
        address
        city
        country
        fee
      }
      entityId
      entity {
        id
        entityName
        entityLogo
      }
      tournamentSeriesId
      recurringGameId
      
      createdAt
      updatedAt
    }
  }
`;

const GET_TOURNAMENT_STRUCTURE_QUERY = /* GraphQL */ `
  query GetTournamentStructure($gameId: ID!) {
    listTournamentStructures(filter: { gameId: { eq: $gameId } }, limit: 1) {
      items {
        id
        levels {
          levelNumber
          durationMinutes
          smallBlind
          bigBlind
          ante
        }
        breaks {
          levelNumberBeforeBreak
          durationMinutes
        }
      }
    }
  }
`;

const GET_PLAYER_ENTRIES_QUERY = /* GraphQL */ `
  query GetPlayerEntries($gameId: ID!) {
    listPlayerEntries(filter: { gameId: { eq: $gameId } }, limit: 500) {
      items {
        id
        status
        registrationTime
        eliminationTime
        gameStartDateTime
        lastKnownStackSize
        tableNumber
        seatNumber
        numberOfReEntries
        entryType
        player {
          id
          firstName
          lastName
        }
      }
    }
  }
`;

const GET_PLAYER_RESULTS_QUERY = /* GraphQL */ `
  query GetPlayerResults($gameId: ID!) {
    listPlayerResults(filter: { gameId: { eq: $gameId } }, limit: 500) {
      items {
        id
        finishingPlace
        prizeWon
        amountWon
        pointsEarned
        isMultiDayQualification
        totalRunners
        netProfitLoss
        totalBuyInsPaid
        player {
          id
          firstName
          lastName
        }
      }
    }
  }
`;

const GET_RECURRING_GAME_QUERY = /* GraphQL */ `
  query GetRecurringGame($id: ID!) {
    getRecurringGame(id: $id) {
      id
      name
      displayName
      description
      dayOfWeek
      startTime
      frequency
      typicalBuyIn
      typicalGuarantee
      isActive
      isSignature
      totalInstancesRun
      avgAttendance
      hasJackpotContributions
      jackpotContributionAmount
      hasAccumulatorTickets
      accumulatorTicketValue
      venue {
        id
        name
      }
    }
  }
`;

const GET_TOURNAMENT_SERIES_QUERY = /* GraphQL */ `
  query GetTournamentSeries($id: ID!) {
    getTournamentSeries(id: $id) {
      id
      name
      year
      seriesCategory
      status
      startDate
      endDate
      numberOfEvents
      guaranteedPrizepool
      estimatedPrizepool
      actualPrizepool
      title {
        id
        title
      }
      venue {
        id
        name
      }
    }
  }
`;

const GET_PARENT_GAME_QUERY = /* GraphQL */ `
  query GetParentGame($id: ID!) {
    getGame(id: $id) {
      id
      name
      gameStatus
      gameStartDateTime
      totalUniquePlayers
      totalEntries
      prizepoolPaid
    }
  }
`;

const GET_CHILD_GAMES_QUERY = /* GraphQL */ `
  query GetChildGames($parentGameId: ID!) {
    listGames(filter: { parentGameId: { eq: $parentGameId } }, limit: 50) {
      items {
        id
        name
        gameStatus
        gameStartDateTime
        dayNumber
        flightLetter
        totalUniquePlayers
        totalEntries
        finalDay
      }
    }
  }
`;

const GET_GAME_COST_QUERY = /* GraphQL */ `
  query GetGameCost($gameId: ID!) {
    listGameCosts(filter: { gameId: { eq: $gameId } }, limit: 1) {
      items {
        id
        totalDealerCost
        totalTournamentDirectorCost
        totalFloorStaffCost
        totalSecurityCost
        totalPrizeContribution
        totalJackpotContribution
        totalGuaranteeOverlayCost
        totalAddedValueCost
        totalBountyCost
        totalVenueRentalCost
        totalEquipmentRentalCost
        totalFoodBeverageCost
        totalMarketingCost
        totalStreamingCost
        totalInsuranceCost
        totalLicensingCost
        totalStaffTravelCost
        totalPlayerAccommodationCost
        totalPromotionCost
        totalOtherCost
        totalStaffCost
        totalDirectGameCost
        totalOperationsCost
        totalComplianceCost
        totalCost
        isEstimate
        costStatus
      }
    }
  }
`;

const GET_FINANCIAL_SNAPSHOT_QUERY = /* GraphQL */ `
  query GetGameFinancialSnapshot($gameId: ID!) {
    listGameFinancialSnapshots(filter: { gameId: { eq: $gameId } }, limit: 1) {
      items {
        id
        totalRevenue
        totalCost
        netProfit
        profitMargin
        revenuePerPlayer
        costPerPlayer
        profitPerPlayer
        rakePerEntry
        guaranteeCoverageRate
        guaranteeMet
      }
    }
  }
`;

const GET_LINKED_SOCIAL_POSTS_QUERY = /* GraphQL */ `
  query GetLinkedSocialPosts($gameId: ID!) {
    listSocialPosts(filter: { gameId: { eq: $gameId } }, limit: 20) {
      items {
        id
        platform
        postType
        textContent
        postedAt
        likeCount
        commentCount
        shareCount
        postUrl
      }
    }
  }
`;

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const GameDetails = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const fetchGameData = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const client = getClient();

      // Fetch main game data
      const gameResponse = await client.graphql({
        query: GET_GAME_QUERY,
        variables: { id }
      });

      if (!('data' in gameResponse) || !gameResponse.data?.getGame) {
        throw new Error('Game not found');
      }

      const game = gameResponse.data.getGame as Game;

      // Parallel fetch of related data
      const [
        structureRes,
        entriesRes,
        resultsRes,
        costRes,
        snapshotRes,
        socialRes
      ] = await Promise.all([
        client.graphql({ query: GET_TOURNAMENT_STRUCTURE_QUERY, variables: { gameId: id } }),
        client.graphql({ query: GET_PLAYER_ENTRIES_QUERY, variables: { gameId: id } }),
        client.graphql({ query: GET_PLAYER_RESULTS_QUERY, variables: { gameId: id } }),
        client.graphql({ query: GET_GAME_COST_QUERY, variables: { gameId: id } }),
        client.graphql({ query: GET_FINANCIAL_SNAPSHOT_QUERY, variables: { gameId: id } }),
        client.graphql({ query: GET_LINKED_SOCIAL_POSTS_QUERY, variables: { gameId: id } }).catch(() => null)
      ]);

      // Fetch recurring game if linked
      let recurringGame: RecurringGame | undefined;
      if (game.recurringGameId) {
        try {
          const rgRes = await client.graphql({
            query: GET_RECURRING_GAME_QUERY,
            variables: { id: game.recurringGameId }
          });
          if ('data' in rgRes && rgRes.data?.getRecurringGame) {
            recurringGame = rgRes.data.getRecurringGame;
          }
        } catch (e) {
          console.warn('Failed to fetch recurring game:', e);
        }
      }

      // Fetch tournament series if linked
      let tournamentSeries: TournamentSeries | undefined;
      if (game.tournamentSeriesId) {
        try {
          const tsRes = await client.graphql({
            query: GET_TOURNAMENT_SERIES_QUERY,
            variables: { id: game.tournamentSeriesId }
          });
          if ('data' in tsRes && tsRes.data?.getTournamentSeries) {
            tournamentSeries = tsRes.data.getTournamentSeries;
          }
        } catch (e) {
          console.warn('Failed to fetch tournament series:', e);
        }
      }

      // Fetch parent game if exists
      let parentGame: Game | undefined;
      if (game.parentGameId) {
        try {
          const pgRes = await client.graphql({
            query: GET_PARENT_GAME_QUERY,
            variables: { id: game.parentGameId }
          });
          if ('data' in pgRes && pgRes.data?.getGame) {
            parentGame = pgRes.data.getGame;
          }
        } catch (e) {
          console.warn('Failed to fetch parent game:', e);
        }
      }

      // Fetch child games
      let childGames: Game[] = [];
      try {
        const cgRes = await client.graphql({
          query: GET_CHILD_GAMES_QUERY,
          variables: { parentGameId: id }
        });
        if ('data' in cgRes && cgRes.data?.listGames?.items) {
          childGames = cgRes.data.listGames.items;
        }
      } catch (e) {
        console.warn('Failed to fetch child games:', e);
      }

      setGameData({
        game,
        structure: 'data' in structureRes ? structureRes.data?.listTournamentStructures?.items?.[0] : undefined,
        entries: 'data' in entriesRes ? entriesRes.data?.listPlayerEntries?.items || [] : [],
        results: 'data' in resultsRes ? resultsRes.data?.listPlayerResults?.items || [] : [],
        gameCost: 'data' in costRes ? costRes.data?.listGameCosts?.items?.[0] : undefined,
        financialSnapshot: 'data' in snapshotRes ? snapshotRes.data?.listGameFinancialSnapshots?.items?.[0] : undefined,
        linkedSocialPosts: socialRes && 'data' in socialRes ? socialRes.data?.listSocialPosts?.items || [] : [],
        recurringGame,
        tournamentSeries,
        parentGame,
        childGames
      });
    } catch (err) {
      console.error('Error fetching game data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load game details');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (gameId) {
      fetchGameData(gameId);
    }
  }, [gameId, fetchGameData]);

  const tabs: { id: TabId; label: string; count?: number }[] = useMemo(() => [
    { id: 'overview', label: 'Overview' },
    { id: 'financials', label: 'Financials' },
    { id: 'players', label: 'Players', count: gameData?.entries.length },
    { id: 'results', label: 'Results', count: gameData?.results.length },
    { id: 'relations', label: 'Relations' },
  ], [gameData]);

  // Loading State
  if (loading) {
    return (
      <PageWrapper title="Game Details" maxWidth="7xl">
        <LoadingSpinner />
      </PageWrapper>
    );
  }

  // Error State
  if (error || !gameData) {
    return (
      <PageWrapper title="Game Details" maxWidth="7xl">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <ExclamationTriangleIcon className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-700 font-medium">{error || 'Game not found'}</p>
          <button
            onClick={() => navigate('/games/search')}
            className="mt-4 text-indigo-600 hover:text-indigo-900 font-medium"
          >
            ← Back to Game Search
          </button>
        </div>
      </PageWrapper>
    );
  }

  const { 
    game, 
    structure, 
    entries, 
    results, 
    recurringGame, 
    tournamentSeries, 
    parentGame, 
    childGames, 
    gameCost, 
    financialSnapshot, 
    linkedSocialPosts 
  } = gameData;

  return (
    <PageWrapper
      title={game.name}
      maxWidth="7xl"
      actions={
        <div className="flex items-center space-x-3">
          {game.sourceUrl && (
            <a
              href={game.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              <LinkIcon className="h-4 w-4 mr-2" />
              Source
            </a>
          )}
          <button
            onClick={() => fetchGameData(gameId!)}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            <ArrowPathIcon className="h-4 w-4 mr-2" />
            Refresh
          </button>
          <button
            onClick={() => navigate('/games/search')}
            className="text-gray-600 hover:text-gray-900 text-sm font-medium"
          >
            ← Back
          </button>
        </div>
      }
    >
      {/* Header Card */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200 mb-6">
        <div className="px-6 py-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{game.name}</h1>
                <StatusBadge status={game.gameStatus} type="game" />
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                {game.tournamentId && (
                  <span>Tournament #{game.tournamentId}</span>
                )}
                <span>ID: {game.id.slice(0, 8)}...</span>
              </div>
            </div>
            
            {/* Quick Stats */}
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{game.totalEntries || 0}</p>
                <p className="text-xs text-gray-500">Entries</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{formatCurrency(game.prizepoolPaid)}</p>
                <p className="text-xs text-gray-500">Prizepool</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(game.buyIn)}</p>
                <p className="text-xs text-gray-500">Buy-In</p>
              </div>
            </div>
          </div>

          {/* Quick Info Bar */}
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center">
              <MapPinIcon className="h-5 w-5 text-gray-400 mr-2" />
              <div>
                <p className="text-xs text-gray-500">Venue</p>
                <p className="text-sm font-medium text-gray-900">{game.venue?.name || '-'}</p>
              </div>
            </div>
            <div className="flex items-center">
              <ClockIcon className="h-5 w-5 text-gray-400 mr-2" />
              <div>
                <p className="text-xs text-gray-500">Start Time</p>
                <p className="text-sm font-medium text-gray-900">
                  {game.gameStartDateTime 
                    ? format(new Date(game.gameStartDateTime), "dd MMM '@' HH:mm")
                    : '-'
                  }
                </p>
              </div>
            </div>
            <div className="flex items-center">
              <TableCellsIcon className="h-5 w-5 text-gray-400 mr-2" />
              <div>
                <p className="text-xs text-gray-500">Type</p>
                <p className="text-sm font-medium text-gray-900">{game.gameType} - {game.gameVariant}</p>
              </div>
            </div>
            <div className="flex items-center">
              <UserGroupIcon className="h-5 w-5 text-gray-400 mr-2" />
              <div>
                <p className="text-xs text-gray-500">Players</p>
                <p className="text-sm font-medium text-gray-900">
                  {game.totalUniquePlayers || 0} unique / {game.totalEntries || 0} entries
                </p>
              </div>
            </div>
          </div>

          {/* Warning Banners */}
          {game.isPartialData && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center">
              <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 mr-2" />
              <p className="text-sm text-amber-700">
                Partial data - {game.missingFlightCount} flight(s) missing. 
                Expected entries: {game.expectedTotalEntries}
              </p>
            </div>
          )}
          {game.wasEdited && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center">
              <InformationCircleIcon className="h-5 w-5 text-blue-500 mr-2" />
              <p className="text-sm text-blue-700">
                This game was manually edited
                {game.lastEditedBy && ` by ${game.lastEditedBy}`}
                {game.lastEditedAt && ` on ${format(new Date(game.lastEditedAt), 'dd MMM yyyy')}`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
                    activeTab === tab.id
                      ? 'bg-indigo-100 text-indigo-600'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'overview' && (
            <OverviewTab game={game} structure={structure} />
          )}
          {activeTab === 'financials' && (
            <FinancialsTab game={game} gameCost={gameCost} financialSnapshot={financialSnapshot} />
          )}
          {activeTab === 'players' && (
            <PlayersTab entries={entries} />
          )}
          {activeTab === 'results' && (
            <ResultsTab results={results} />
          )}
          {activeTab === 'relations' && (
            <RelationsTab 
              game={game}
              recurringGame={recurringGame}
              tournamentSeries={tournamentSeries}
              parentGame={parentGame}
              childGames={childGames}
              linkedSocialPosts={linkedSocialPosts}
            />
          )}
        </div>
      </div>
    </PageWrapper>
  );
};

export default GameDetails;