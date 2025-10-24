import type { GameData, MissingField } from '../../types/game';
import { ValidationSummary } from './ValidationSummary';
import { BlindStructure } from './BlindStructure'; // Import BlindStructure

/**
 * ScraperReport component now shows a validation summary AND all Game model fields.
 */
export const ScraperReport: React.FC<{ data?: GameData, missingFields?: MissingField[] }> = ({ data, missingFields }) => {
    if (!data) return null;

    // reportConfig remains unchanged, driving the detailed report
    const reportConfig = [
        {
            title: 'Game Details',
            model: 'Game',
            fields: [
                'name', 'gameStartDateTime', 'gameEndDateTime', 'status', 'registrationStatus',
                'structureLabel', 'seriesName', 'variant', 'gameVariant', 'prizepool', 
                'revenueByEntries', 'totalEntries', 'totalRebuys', 'totalAddons', 'totalDuration', 'gameTags'
            ]
        },
        {
            title: 'Tournament Details',
            model: 'Game',
            fields: [
                'tournamentType', 'buyIn', 'rake', 'startingStack', 'hasGuarantee', 'guaranteeAmount'
            ]
        }
    ];

    const getMissingField = (model: string, field: string) => {
        return missingFields?.find(mf => mf.model === model && mf.field === field);
    };

    const renderFieldValue = (value: any) => {
        if (value === null || value === undefined) return null;
        if (Array.isArray(value)) {
            if (value.length === 0) return null;
            return <span className="font-mono text-xs">[{value.join(', ')}]</span>;
        }
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    };

    return (
        <div className="mt-4 space-y-4">
            {/* Validation Summary - NEW! */}
            <ValidationSummary data={data} />
            
            {/* Detailed Report - EXISTING */}
            {reportConfig.map(section => (
                <div key={section.title} className="border rounded-lg p-3 bg-gray-50">
                    <h4 className="font-bold text-sm mb-2 text-gray-700">{section.title}</h4>
                    <div className="grid grid-cols-1 gap-1">
                        {section.fields.map(field => {
                            const value = (data as any)[field];
                            const missingField = getMissingField(section.model, field);
                            const hasValue = value !== null && value !== undefined && value !== '' &&
                                           (!Array.isArray(value) || value.length > 0);

                            return (
                                <div key={field} className="flex items-center text-xs">
                                    <span className="font-medium text-gray-600 w-32">{field}:</span>
                                    {hasValue ? (
                                        <span className="text-gray-800">{renderFieldValue(value)}</span>
                                    ) : (
                                        <span className="text-red-500 italic">
                                            Missing {missingField ? `(${missingField.reason})` : ''}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            {/* Blind Structure */}
            <BlindStructure levels={data.levels} />

            {/* Found Keys Debug Section */}
            {data.foundKeys && data.foundKeys.length > 0 && (
                <details className="border rounded-lg p-3 bg-blue-50">
                    <summary className="cursor-pointer text-sm font-medium text-blue-800">
                        Found Keys ({data.foundKeys.length})
                    </summary>
                    <div className="mt-2 text-xs font-mono text-blue-700">
                        {data.foundKeys.join(', ')}
                    </div>
                </details>
            )}
        </div>
    );
};

