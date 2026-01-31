// src/components/dashboard/RegistrationBadge.tsx
// Badge showing registration status (OPEN or FINAL)

import React from 'react';
import { SignalIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { Badge } from '@/components/ui/Badge';

interface RegistrationBadgeProps {
  status: string | null | undefined;
}

export const RegistrationBadge: React.FC<RegistrationBadgeProps> = ({ status }) => {
  if (!status || !['OPEN', 'FINAL'].includes(status)) return null;
  
  if (status === 'OPEN') {
    return (
      <Badge variant="success" className="text-[10px]">
        <SignalIcon className="w-3 h-3 mr-0.5" />
        Reg Open
      </Badge>
    );
  }
  
  if (status === 'FINAL') {
    return (
      <Badge variant="warning" className="text-[10px]">
        <XCircleIcon className="w-3 h-3 mr-0.5" />
        Final
      </Badge>
    );
  }
  
  return null;
};
