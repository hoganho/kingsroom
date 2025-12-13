// src/components/ui/MetricCard.tsx
// Backwards-compatible version - accepts both "label" and "title"

import { cx } from "@/lib/utils"
import { Card } from "./Card"

interface MetricCardProps {
  /** Title of the metric (new prop name) */
  title?: string
  /** @deprecated Use "title" instead - kept for backwards compatibility */
  label?: string
  value: string | number
  icon?: React.ReactNode
  /** Subtitle/secondary text (new prop name) */
  subtitle?: string
  /** @deprecated Use "subtitle" instead - kept for backwards compatibility */
  secondary?: string
  trend?: {
    value: string
    direction: "up" | "down" | "neutral"
  }
  className?: string
}

export function MetricCard({
  title,
  label,
  value,
  icon,
  subtitle,
  secondary,
  trend,
  className,
}: MetricCardProps) {
  // Support both old (label/secondary) and new (title/subtitle) prop names
  const displayTitle = title || label || ""
  const displaySubtitle = subtitle || secondary

  return (
    <Card className={cx("h-full", className)}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          {/* Title */}
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {displayTitle}
          </p>

          {/* Value */}
          <p className="mt-1 truncate text-xl font-semibold text-gray-900 dark:text-gray-50 sm:text-2xl">
            {value}
          </p>

          {/* Trend or Subtitle */}
          {trend && (
            <p
              className={cx(
                "mt-1 flex items-center gap-1 text-sm font-medium",
                trend.direction === "up" && "text-emerald-600 dark:text-emerald-400",
                trend.direction === "down" && "text-red-600 dark:text-red-400",
                trend.direction === "neutral" && "text-gray-500 dark:text-gray-400"
              )}
            >
              {trend.direction === "up" && (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17l5-5 5 5M7 7l5 5 5-5" />
                </svg>
              )}
              {trend.direction === "down" && (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 7l-5 5-5-5m10 10l-5-5-5 5" />
                </svg>
              )}
              {trend.value}
            </p>
          )}

          {displaySubtitle && !trend && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {displaySubtitle}
            </p>
          )}
        </div>

        {/* Icon */}
        {icon && (
          <div className="ml-4 flex-shrink-0 text-gray-400 dark:text-gray-500">
            {icon}
          </div>
        )}
      </div>
    </Card>
  )
}

export default MetricCard