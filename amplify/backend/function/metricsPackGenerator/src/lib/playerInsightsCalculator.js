/**
 * Player Insights Calculator
 * ==========================
 * Calculates player behavior metrics without exposing PII.
 */

const { round, calculateGrowthPercent } = require('./kpiCalculator');

function calculatePlayerInsights(playerData, comparisonData = null) {
  const { entries = [], results = [] } = playerData;
  const compEntries = comparisonData?.entries || [];
  
  // Get unique players
  const currentPlayers = new Set(entries.map(e => e.playerId).filter(Boolean));
  const priorPlayers = compEntries.length > 0 
    ? new Set(compEntries.map(e => e.playerId).filter(Boolean))
    : new Set();
  
  const totalUniquePlayers = currentPlayers.size;
  const totalEntries = entries.length;
  
  // Volume metrics
  const avgEntriesPerPlayer = totalUniquePlayers > 0 ? totalEntries / totalUniquePlayers : 0;
  
  // New vs returning players
  const newPlayers = [...currentPlayers].filter(p => !priorPlayers.has(p)).length;
  const returningPlayers = [...currentPlayers].filter(p => priorPlayers.has(p)).length;
  
  // Multi-venue players
  const playerVenues = {};
  for (const entry of entries) {
    if (!entry.playerId || !entry.venueId) continue;
    if (!playerVenues[entry.playerId]) playerVenues[entry.playerId] = new Set();
    playerVenues[entry.playerId].add(entry.venueId);
  }
  const multiVenuePlayers = Object.values(playerVenues).filter(v => v.size > 1).length;
  const singleVenuePlayers = Object.values(playerVenues).filter(v => v.size === 1).length;
  const avgVenuesPerPlayer = totalUniquePlayers > 0 
    ? Object.values(playerVenues).reduce((sum, v) => sum + v.size, 0) / totalUniquePlayers 
    : 0;
  
  // Retention and churn (if comparison data available)
  let retentionRate = null;
  let churnRate = null;
  let acquisitionRate = null;
  
  if (priorPlayers.size > 0) {
    const retained = [...priorPlayers].filter(p => currentPlayers.has(p)).length;
    retentionRate = (retained / priorPlayers.size) * 100;
    churnRate = 100 - retentionRate;
    
    if (totalUniquePlayers > 0) {
      acquisitionRate = (newPlayers / totalUniquePlayers) * 100;
    }
  }
  
  // Player frequency distribution
  const playerFrequency = {};
  for (const entry of entries) {
    if (!entry.playerId) continue;
    playerFrequency[entry.playerId] = (playerFrequency[entry.playerId] || 0) + 1;
  }
  
  const frequencyBuckets = {
    'oneGame': { count: 0, players: [] },
    'twoToThree': { count: 0, players: [] },
    'fourToSix': { count: 0, players: [] },
    'sevenToTen': { count: 0, players: [] },
    'elevenPlus': { count: 0, players: [] }
  };
  
  for (const [playerId, freq] of Object.entries(playerFrequency)) {
    if (freq === 1) frequencyBuckets.oneGame.count++;
    else if (freq <= 3) frequencyBuckets.twoToThree.count++;
    else if (freq <= 6) frequencyBuckets.fourToSix.count++;
    else if (freq <= 10) frequencyBuckets.sevenToTen.count++;
    else frequencyBuckets.elevenPlus.count++;
  }
  
  const frequencyDistribution = [
    {
      bucket: '1 game',
      playerCount: frequencyBuckets.oneGame.count,
      percentOfPlayers: totalUniquePlayers > 0 ? round((frequencyBuckets.oneGame.count / totalUniquePlayers) * 100, 1) : 0
    },
    {
      bucket: '2-3 games',
      playerCount: frequencyBuckets.twoToThree.count,
      percentOfPlayers: totalUniquePlayers > 0 ? round((frequencyBuckets.twoToThree.count / totalUniquePlayers) * 100, 1) : 0
    },
    {
      bucket: '4-6 games',
      playerCount: frequencyBuckets.fourToSix.count,
      percentOfPlayers: totalUniquePlayers > 0 ? round((frequencyBuckets.fourToSix.count / totalUniquePlayers) * 100, 1) : 0
    },
    {
      bucket: '7-10 games',
      playerCount: frequencyBuckets.sevenToTen.count,
      percentOfPlayers: totalUniquePlayers > 0 ? round((frequencyBuckets.sevenToTen.count / totalUniquePlayers) * 100, 1) : 0
    },
    {
      bucket: '11+ games',
      playerCount: frequencyBuckets.elevenPlus.count,
      percentOfPlayers: totalUniquePlayers > 0 ? round((frequencyBuckets.elevenPlus.count / totalUniquePlayers) * 100, 1) : 0
    }
  ];
  
  // Top 20% contribution estimate
  const sortedByFreq = Object.entries(playerFrequency).sort((a, b) => b[1] - a[1]);
  const top20Count = Math.ceil(sortedByFreq.length * 0.2);
  const top20Entries = sortedByFreq.slice(0, top20Count).reduce((sum, [, freq]) => sum + freq, 0);
  const top20PercentContribution = totalEntries > 0 ? (top20Entries / totalEntries) * 100 : 0;
  
  // Growth metrics
  const priorPlayerCount = priorPlayers.size;
  const playerGrowth = totalUniquePlayers - priorPlayerCount;
  const playerGrowthPercent = calculateGrowthPercent(totalUniquePlayers, priorPlayerCount);
  
  return {
    volume: {
      totalUniquePlayers,
      totalEntries,
      avgEntriesPerPlayer: round(avgEntriesPerPlayer, 2)
    },
    engagement: {
      newPlayers,
      returningPlayers,
      multiVenuePlayers
    },
    retention: {
      retentionRate: retentionRate !== null ? round(retentionRate, 1) : null,
      churnRate: churnRate !== null ? round(churnRate, 1) : null,
      acquisitionRate: acquisitionRate !== null ? round(acquisitionRate, 1) : null
    },
    value: {
      top20PercentContribution: round(top20PercentContribution, 1)
    },
    frequencyDistribution,
    venueLoyalty: {
      singleVenuePlayers,
      multiVenuePlayers,
      avgVenuesPerPlayer: round(avgVenuesPerPlayer, 2)
    },
    growth: {
      playerGrowth,
      playerGrowthPercent: round(playerGrowthPercent, 1)
    }
  };
}

module.exports = {
  calculatePlayerInsights
};
