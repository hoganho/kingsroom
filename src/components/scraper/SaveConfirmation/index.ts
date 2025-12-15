// src/components/scraper/SaveConfirmation/index.ts
// REFACTORED: Updated exports for new tab structure

// Main modal
export { SaveConfirmationModal, default } from '../SaveConfirmationModal';

// Context
export { SaveConfirmationProvider, useSaveConfirmationContext } from './SaveConfirmationContext';
export type { SaveConfirmationContextValue, VenueOption, RecurringGame } from './SaveConfirmationContext';

// New tabs
export { DataTab } from './DataTab';
export { LinksTab } from './LinksTab';
export { GroupingTab } from './GroupingTab';
export { ReviewTab } from './ReviewTab';

// Kept components
export { EditableField } from './EditableField';
export { FieldSection, FIELD_SECTIONS } from './FieldSection';
export type { FieldSectionConfig } from './FieldSection';
export { RecurringGameEditor } from './RecurringGameEditor';
export { ConsolidationPreview, ConsolidationBadge } from './ConsolidationPreview';
export { SeriesDetailsEditor } from './SeriesDetailsEditor';