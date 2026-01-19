/**
 * Social Pulse Digest
 * ===================
 * Generates competitor activity summaries from social media data.
 */

function generateSocialPulseDigest(entityId, socialData, period) {
  // Handle undefined or null socialData
  if (!socialData) {
    return {
      ourActivity: { postCount: 0, engagement: 0, topPost: null, venueBreakdown: {} },
      competitorDigest: {},
      marketSignals: { eventAnnouncements: [], guaranteeChanges: [], scheduleChanges: [], promotions: [] },
      summary: { shareOfVoice: 0, engagementRank: 0, marketPostVolume: 0 }
    };
  }
  
  const { ourAccounts = [], ourPosts = [], competitorAccounts = [], competitorPosts = [] } = socialData;
  
  // Our activity summary
  const ourPostCount = ourPosts.length;
  const ourEngagement = ourPosts.reduce((sum, p) => {
    return sum + (p.likes || 0) + (p.comments || 0) + (p.shares || 0);
  }, 0);
  
  const ourTopPost = ourPosts.length > 0 
    ? [...ourPosts].sort((a, b) => {
        const aEng = (a.likes || 0) + (a.comments || 0) + (a.shares || 0);
        const bEng = (b.likes || 0) + (b.comments || 0) + (b.shares || 0);
        return bEng - aEng;
      })[0]
    : null;
  
  // Group our posts by venue
  const ourVenueBreakdown = {};
  for (const post of ourPosts) {
    const venueId = post.venueId || 'general';
    if (!ourVenueBreakdown[venueId]) {
      ourVenueBreakdown[venueId] = { posts: 0, engagement: 0 };
    }
    ourVenueBreakdown[venueId].posts++;
    ourVenueBreakdown[venueId].engagement += (post.likes || 0) + (post.comments || 0) + (post.shares || 0);
  }
  
  // Competitor digest
  const competitorDigest = {};
  for (const account of competitorAccounts) {
    const accountPosts = competitorPosts.filter(p => p.accountId === account.id);
    const engagement = accountPosts.reduce((sum, p) => {
      return sum + (p.likes || 0) + (p.comments || 0) + (p.shares || 0);
    }, 0);
    
    competitorDigest[account.id] = {
      accountName: account.accountName || account.handle,
      platform: account.platform,
      posts: accountPosts.length,
      engagement,
      avgEngagement: accountPosts.length > 0 ? Math.round(engagement / accountPosts.length) : 0,
      highlights: accountPosts.slice(0, 3).map(p => ({
        content: p.content?.substring(0, 100),
        engagement: (p.likes || 0) + (p.comments || 0) + (p.shares || 0),
        postedAt: p.postedAt
      }))
    };
  }
  
  // Extract market signals from competitor posts
  const marketSignals = extractMarketSignals(competitorPosts);
  
  // Calculate summary metrics
  const totalMarketPosts = ourPostCount + competitorPosts.length;
  const shareOfVoice = totalMarketPosts > 0 ? (ourPostCount / totalMarketPosts) * 100 : 0;
  
  // Engagement rank
  const allEngagements = [
    { type: 'our', engagement: ourEngagement },
    ...Object.values(competitorDigest).map(c => ({ type: 'competitor', engagement: c.engagement }))
  ].sort((a, b) => b.engagement - a.engagement);
  
  const engagementRank = allEngagements.findIndex(e => e.type === 'our') + 1;
  
  return {
    ourActivity: {
      postCount: ourPostCount,
      engagement: ourEngagement,
      topPost: ourTopPost ? {
        content: ourTopPost.content?.substring(0, 100),
        engagement: (ourTopPost.likes || 0) + (ourTopPost.comments || 0) + (ourTopPost.shares || 0),
        postedAt: ourTopPost.postedAt
      } : null,
      venueBreakdown: ourVenueBreakdown
    },
    competitorDigest,
    marketSignals,
    summary: {
      shareOfVoice: Math.round(shareOfVoice * 10) / 10,
      engagementRank,
      marketPostVolume: totalMarketPosts
    }
  };
}

function extractMarketSignals(posts) {
  const signals = {
    eventAnnouncements: [],
    guaranteeChanges: [],
    scheduleChanges: [],
    promotions: []
  };
  
  for (const post of posts) {
    const content = (post.content || '').toLowerCase();
    
    // Event/tournament announcements
    if (content.includes('tournament') || content.includes('series') || content.includes('championship')) {
      const guaranteeMatch = content.match(/\$[\d,]+k?/);
      signals.eventAnnouncements.push({
        accountId: post.accountId,
        content: post.content?.substring(0, 150),
        guarantee: guaranteeMatch ? guaranteeMatch[0] : null,
        postedAt: post.postedAt
      });
    }
    
    // Guarantee mentions
    if (content.includes('guarantee') && content.includes('increase')) {
      signals.guaranteeChanges.push({
        accountId: post.accountId,
        content: post.content?.substring(0, 150),
        postedAt: post.postedAt
      });
    }
    
    // Schedule changes
    if (content.includes('new schedule') || content.includes('schedule change') || content.includes('new time')) {
      signals.scheduleChanges.push({
        accountId: post.accountId,
        content: post.content?.substring(0, 150),
        postedAt: post.postedAt
      });
    }
    
    // Promotions
    if (content.includes('promo') || content.includes('bonus') || content.includes('discount') || 
        content.includes('free') || content.includes('special offer')) {
      signals.promotions.push({
        accountId: post.accountId,
        content: post.content?.substring(0, 150),
        postedAt: post.postedAt
      });
    }
  }
  
  return signals;
}

module.exports = {
  generateSocialPulseDigest,
  extractMarketSignals
};