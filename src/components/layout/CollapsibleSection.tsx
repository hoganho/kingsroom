// components/layout/CollapsibleSection.tsx

import type { ReactNode } from 'react';

type Props = {
    title: ReactNode;
    children: ReactNode;
    defaultOpen?: boolean;
    className?: string;
};

/**
 * A reusable, styled component for creating a collapsible section.
 * Uses the native HTML <details> element for accessibility and simplicity.
 */
export const CollapsibleSection: React.FC<Props> = ({
    title,
    children,
    defaultOpen = true,
    className = ''
}) => {
    return (
        <details className={`border rounded-lg bg-white shadow-sm ${className}`} open={defaultOpen}>
            <summary className="cursor-pointer select-none p-3 font-medium bg-gray-50 hover:bg-gray-100 rounded-t-lg">
                {title}
            </summary>
            <div className="p-3 border-t border-gray-200">
                {children}
            </div>
        </details>
    );
};