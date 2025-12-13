// src/components/ui/Select.tsx
import React from "react"
import { ChevronDownIcon } from "@heroicons/react/24/outline"
import { tv, type VariantProps } from "tailwind-variants"
import { cx, focusInput, hasErrorInput } from "@/lib/utils"

const selectStyles = tv({
  base: [
    // base
    "relative block w-full appearance-none rounded-md border px-3 py-2 pr-10 shadow-sm outline-none transition sm:text-sm",
    // border color
    "border-gray-300 dark:border-gray-800",
    // text color
    "text-gray-900 dark:text-gray-50",
    // background color
    "bg-white dark:bg-gray-950",
    // disabled
    "disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed",
    "disabled:dark:border-gray-700 disabled:dark:bg-gray-800 disabled:dark:text-gray-500",
    // focus
    focusInput,
  ],
  variants: {
    hasError: {
      true: hasErrorInput,
    },
  },
})

interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement>,
    VariantProps<typeof selectStyles> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, hasError, children, ...props }, forwardedRef) => {
    return (
      <div className="relative w-full">
        <select
          ref={forwardedRef}
          className={cx(selectStyles({ hasError }), className)}
          {...props}
        >
          {children}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-500 dark:text-gray-400">
          <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
    )
  }
)

Select.displayName = "Select"

export { Select, selectStyles }