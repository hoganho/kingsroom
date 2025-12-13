// src/components/ui/TimeRangeToggle.tsx
import { cx, focusRing } from "@/lib/utils"

export type TimeRangeKey = "ALL" | "12M" | "6M" | "3M" | "1M"

const RANGE_OPTIONS: { key: TimeRangeKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "12M", label: "12m" },
  { key: "6M", label: "6m" },
  { key: "3M", label: "3m" },
  { key: "1M", label: "1m" },
]

interface TimeRangeToggleProps {
  value: TimeRangeKey
  onChange: (value: TimeRangeKey) => void
  className?: string
}

export function TimeRangeToggle({ value, onChange, className }: TimeRangeToggleProps) {
  return (
    <div
      className={cx(
        "inline-flex rounded-lg p-1",
        "bg-gray-100 dark:bg-gray-900",
        "border border-gray-200 dark:border-gray-800",
        className
      )}
    >
      {RANGE_OPTIONS.map((option) => {
        const isActive = value === option.key
        return (
          <button
            key={option.key}
            onClick={() => onChange(option.key)}
            className={cx(
              "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
              focusRing,
              isActive
                ? [
                    "bg-white dark:bg-gray-800",
                    "text-gray-900 dark:text-gray-50",
                    "shadow-sm",
                  ]
                : [
                    "text-gray-600 dark:text-gray-400",
                    "hover:text-gray-900 dark:hover:text-gray-50",
                    "hover:bg-gray-50 dark:hover:bg-gray-800/50",
                  ]
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default TimeRangeToggle