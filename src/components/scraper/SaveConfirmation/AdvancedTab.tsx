// src/components/scraper/SaveConfirmation/AdvancedTab.tsx
// Advanced tab showing all editable fields

import React from 'react';
import type { UseGameDataEditorReturn } from '../../../hooks/useGameDataEditor';
import { QuickDataEditor } from './QuickDataEditor';

// ===================================================================
// TYPES
// ===================================================================

interface AdvancedTabProps {
  editor: UseGameDataEditorReturn;
}

// ===================================================================
// COMPONENT
// ===================================================================

export const AdvancedTab: React.FC<AdvancedTabProps> = ({ editor }) => {
  return (
    <div className="p-4">
      <QuickDataEditor 
        editor={editor} 
        showAdvanced={true} 
      />
    </div>
  );
};

export default AdvancedTab;
