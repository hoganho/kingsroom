// src/components/ui/MetricCard.tsx
import { Card, Flex, Text, Metric } from '@tremor/react';
import type { ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  secondary?: string;
}

export function MetricCard({ label, value, icon, secondary }: MetricCardProps) {
  return (
    <Card className="h-full">
      <Flex justifyContent="between" alignItems="center">
        <div>
          <Text className="text-xs uppercase tracking-wide text-gray-500">
            {label}
          </Text>
          <Metric className="mt-1">{value}</Metric>
          {secondary && (
            <Text className="mt-1 text-xs text-gray-400">
              {secondary}
            </Text>
          )}
        </div>
        {icon && <div className="text-gray-300">{icon}</div>}
      </Flex>
    </Card>
  );
}