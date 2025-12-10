// src/components/ui/TimeRangeToggle.tsx

export type TimeRangeKey = 'ALL' | '12M' | '6M' | '3M' | '1M';

const RANGE_LABELS: { key: TimeRangeKey; label: string }[] = [
  { key: 'ALL', label: 'All time' },
  { key: '12M', label: '12m' },
  { key: '6M',  label: '6m' },
  { key: '3M',  label: '3m' },
  { key: '1M',  label: '1m' },
];

interface Props {
  value: TimeRangeKey;
  onChange: (value: TimeRangeKey) => void;
}

export function TimeRangeToggle({ value, onChange }: Props) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-100 p-1">
      {RANGE_LABELS.map(range => (
        <button
          key={range.key}
          onClick={() => onChange(range.key)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
            value === range.key
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
          }`}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}