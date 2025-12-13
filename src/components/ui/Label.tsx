// src/components/ui/Label.tsx
// Tremor Raw Label

import React from "react"

import { cx } from "@/lib/utils"

interface LabelProps extends React.ComponentPropsWithoutRef<"label"> {
  disabled?: boolean
}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, disabled, ...props }, forwardedRef) => {
    return (
      <label
        ref={forwardedRef}
        className={cx(
          // base
          "text-sm font-medium leading-none",
          // text color
          "text-gray-900 dark:text-gray-50",
          // disabled
          disabled && "text-gray-400 dark:text-gray-600",
          className
        )}
        aria-disabled={disabled}
        {...props}
      />
    )
  }
)

Label.displayName = "Label"

export { Label, type LabelProps }
