// src/lib/tournamentTemplates.ts

import type { GameData } from '../types/game';
import { 
    GameVariant, 
    GameType, 
    TournamentType, 
    GameFrequency, 
    RegistrationStatus 
} from '../API';

export interface TournamentTemplate {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: 'daily' | 'weekly' | 'special' | 'series' | 'satellite';
    fields: Partial<GameData>;
}

export const tournamentTemplates: TournamentTemplate[] = [
    {
        id: 'daily-nlh',
        name: 'Daily NLH Tournament',
        description: 'Standard daily No Limit Hold\'em freezeout',
        icon: '🎲',
        category: 'daily',
        fields: {
            gameVariant: GameVariant.NLHE,
            gameType: GameType.TOURNAMENT,
            tournamentType: TournamentType.FREEZEOUT,
            gameFrequency: GameFrequency.DAILY,
            isRegular: true,
            isSeries: false,
            isSatellite: false,
            hasGuarantee: false,
            startingStack: 30000,
            registrationStatus: RegistrationStatus.OPEN
        }
    },
    {
        id: 'daily-bounty',
        name: 'Daily Bounty Hunter',
        description: 'Daily knockout tournament with bounties',
        icon: '💰',
        category: 'daily',
        fields: {
            gameVariant: GameVariant.NLHE,
            gameType: GameType.TOURNAMENT,
            // BOUNTY might not exist, use FREEZEOUT as fallback
            tournamentType: (TournamentType as any).BOUNTY || TournamentType.FREEZEOUT,
            gameFrequency: GameFrequency.DAILY,
            isRegular: true,
            isSeries: false,
            isSatellite: false,
            hasGuarantee: true,
            startingStack: 25000,
            registrationStatus: RegistrationStatus.OPEN
        }
    },
    {
        id: 'weekly-plo',
        name: 'Weekly PLO',
        description: 'Weekly Pot Limit Omaha tournament',
        icon: '♠️',
        category: 'weekly',
        fields: {
            gameVariant: GameVariant.PLOM,
            gameType: GameType.TOURNAMENT,
            tournamentType: TournamentType.REBUY,
            gameFrequency: GameFrequency.WEEKLY,
            isRegular: true,
            isSeries: false,
            isSatellite: false,
            hasGuarantee: false,
            startingStack: 20000,
            registrationStatus: RegistrationStatus.OPEN
        }
    },
    {
        id: 'mystery-bounty',
        name: 'Mystery Bounty',
        description: 'Special event with mystery bounty prizes',
        icon: '🎯',
        category: 'special',
        fields: {
            gameVariant: GameVariant.NLHE,
            gameType: GameType.TOURNAMENT,
            // MYSTERY_BOUNTY might not exist, use FREEZEOUT as fallback
            tournamentType: (TournamentType as any).MYSTERY_BOUNTY || TournamentType.FREEZEOUT,
            // SPECIAL might not exist, use MONTHLY as fallback
            gameFrequency: (GameFrequency as any).SPECIAL || GameFrequency.MONTHLY,
            isRegular: false,
            isSeries: false,
            isSatellite: false,
            hasGuarantee: true,
            startingStack: 40000,
            registrationStatus: RegistrationStatus.OPEN
        }
    },
    {
        id: 'series-main',
        name: 'Series Main Event',
        description: 'Major series championship event',
        icon: '🏆',
        category: 'series',
        fields: {
            gameVariant: GameVariant.NLHE,
            gameType: GameType.TOURNAMENT,
            tournamentType: TournamentType.FREEZEOUT,
            // SPECIAL might not exist, use MONTHLY as fallback
            gameFrequency: (GameFrequency as any).SPECIAL || GameFrequency.MONTHLY,
            isRegular: false,
            isSeries: true,
            isSatellite: false,
            hasGuarantee: true,
            startingStack: 60000,
            registrationStatus: RegistrationStatus.OPEN
        }
    },
    {
        id: 'satellite',
        name: 'Satellite Qualifier',
        description: 'Qualifier for a larger tournament',
        icon: '🎫',
        category: 'satellite',
        fields: {
            gameVariant: GameVariant.NLHE,
            gameType: GameType.TOURNAMENT,
            tournamentType: TournamentType.FREEZEOUT,
            gameFrequency: GameFrequency.DAILY,
            isRegular: false,
            isSeries: false,
            isSatellite: true,
            hasGuarantee: false,
            startingStack: 15000,
            registrationStatus: RegistrationStatus.OPEN
        }
    }
];

/**
 * Detect the best matching template based on tournament name and existing data
 */
export const detectTemplate = (data: Partial<GameData>): TournamentTemplate | null => {
    if (!data.name) return null;
    
    const nameLower = data.name.toLowerCase();
    
    // Check for specific tournament types in name
    if (nameLower.includes('mystery') && nameLower.includes('bounty')) {
        return tournamentTemplates.find(t => t.id === 'mystery-bounty') || null;
    }
    
    if (nameLower.includes('bounty') || nameLower.includes('knockout')) {
        return tournamentTemplates.find(t => t.id === 'daily-bounty') || null;
    }
    
    if (nameLower.includes('satellite') || nameLower.includes('qualifier')) {
        return tournamentTemplates.find(t => t.id === 'satellite') || null;
    }
    
    if (nameLower.includes('main event') || nameLower.includes('championship')) {
        return tournamentTemplates.find(t => t.id === 'series-main') || null;
    }
    
    if (nameLower.includes('plo') || nameLower.includes('omaha')) {
        return tournamentTemplates.find(t => t.id === 'weekly-plo') || null;
    }
    
    // Default to daily NLH
    return tournamentTemplates.find(t => t.id === 'daily-nlh') || null;
};

/**
 * Apply a template to existing data (non-destructive - only fills missing fields)
 */
export const applyTemplateToData = (
    data: GameData, 
    template: TournamentTemplate,
    overwrite: boolean = false
): GameData => {
    const result = { ...data };
    
    for (const [key, value] of Object.entries(template.fields)) {
        const currentValue = result[key as keyof GameData];
        
        // Only apply if field is empty or overwrite is true
        if (overwrite || currentValue === null || currentValue === undefined || currentValue === '') {
            (result as any)[key] = value;
        }
    }
    
    return result;
};

/**
 * Get template suggestions based on current data
 */
export const getTemplateSuggestions = (data: Partial<GameData>): TournamentTemplate[] => {
    const suggestions: TournamentTemplate[] = [];
    
    // First, try to detect based on name
    const detected = detectTemplate(data);
    if (detected) suggestions.push(detected);
    
    // Then add relevant templates based on game variant
    if (data.gameVariant === GameVariant.PLOM) {
        const ploTemplate = tournamentTemplates.find(t => t.id === 'weekly-plo');
        if (ploTemplate && !suggestions.includes(ploTemplate)) {
            suggestions.push(ploTemplate);
        }
    }
    
    // Add based on tournament type - check if BOUNTY exists
    const BOUNTY = (TournamentType as any).BOUNTY;
    if (BOUNTY && data.tournamentType === BOUNTY) {
        const bountyTemplate = tournamentTemplates.find(t => t.id === 'daily-bounty');
        if (bountyTemplate && !suggestions.includes(bountyTemplate)) {
            suggestions.push(bountyTemplate);
        }
    }
    
    // Always include the default as a fallback
    const defaultTemplate = tournamentTemplates.find(t => t.id === 'daily-nlh');
    if (defaultTemplate && !suggestions.includes(defaultTemplate)) {
        suggestions.push(defaultTemplate);
    }
    
    return suggestions.slice(0, 3); // Return top 3 suggestions
};