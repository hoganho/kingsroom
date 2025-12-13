// src/components/ui/Card.tsx
// Tremor Raw Card adapted for Kingsroom

import { Slot } from "@radix-ui/react-slot"
import React from "react"

import { cx } from "@/lib/utils"

// ============================================
// CARD
// ============================================

interface CardProps extends React.ComponentPropsWithoutRef<"div"> {
  asChild?: boolean
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, asChild, ...props }, forwardedRef) => {
    const Component = asChild ? Slot : "div"
    return (
      <Component
        ref={forwardedRef}
        className={cx(
          // base
          "relative w-full rounded-lg border p-4 sm:p-6 text-left",
          // background color
          "bg-white dark:bg-gray-950",
          // border color
          "border-gray-200 dark:border-gray-800",
          className
        )}
        {...props}
      />
    )
  }
)

Card.displayName = "Card"

// ============================================
// CARD HEADER
// ============================================

interface CardHeaderProps extends React.ComponentPropsWithoutRef<"div"> {}

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, ...props }, forwardedRef) => {
    return (
      <div
        ref={forwardedRef}
        className={cx("flex flex-col space-y-1.5", className)}
        {...props}
      />
    )
  }
)

CardHeader.displayName = "CardHeader"

// ============================================
// CARD TITLE
// ============================================

interface CardTitleProps extends React.ComponentPropsWithoutRef<"h3"> {}

const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, ...props }, forwardedRef) => {
    return (
      <h3
        ref={forwardedRef}
        className={cx(
          "text-sm font-semibold text-gray-900 dark:text-gray-50",
          className
        )}
        {...props}
      />
    )
  }
)

CardTitle.displayName = "CardTitle"

// ============================================
// CARD DESCRIPTION
// ============================================

interface CardDescriptionProps extends React.ComponentPropsWithoutRef<"p"> {}

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  CardDescriptionProps
>(({ className, ...props }, forwardedRef) => {
  return (
    <p
      ref={forwardedRef}
      className={cx("text-xs text-gray-500 dark:text-gray-400", className)}
      {...props}
    />
  )
})

CardDescription.displayName = "CardDescription"

// ============================================
// CARD CONTENT
// ============================================

interface CardContentProps extends React.ComponentPropsWithoutRef<"div"> {}

const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, ...props }, forwardedRef) => {
    return <div ref={forwardedRef} className={cx("pt-4", className)} {...props} />
  }
)

CardContent.displayName = "CardContent"

// ============================================
// CARD FOOTER
// ============================================

interface CardFooterProps extends React.ComponentPropsWithoutRef<"div"> {}

const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, ...props }, forwardedRef) => {
    return (
      <div
        ref={forwardedRef}
        className={cx(
          "flex items-center pt-4 border-t border-gray-200 dark:border-gray-800",
          className
        )}
        {...props}
      />
    )
  }
)

CardFooter.displayName = "CardFooter"

// ============================================
// CLICKABLE CARD (for dashboards)
// ============================================

interface ClickableCardProps extends React.ComponentPropsWithoutRef<"button"> {
  asChild?: boolean
}

const ClickableCard = React.forwardRef<HTMLButtonElement, ClickableCardProps>(
  ({ className, asChild, ...props }, forwardedRef) => {
    const Component = asChild ? Slot : "button"
    return (
      <Component
        ref={forwardedRef}
        className={cx(
          // base
          "relative w-full rounded-lg border p-4 sm:p-6 text-left",
          // background color
          "bg-white dark:bg-gray-950",
          // border color
          "border-gray-200 dark:border-gray-800",
          // hover
          "hover:bg-gray-50 dark:hover:bg-gray-900/50",
          "hover:border-gray-300 dark:hover:border-gray-700",
          // focus
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
          "dark:focus-visible:ring-offset-gray-950",
          // transition
          "transition-all duration-150",
          // cursor
          "cursor-pointer",
          className
        )}
        {...props}
      />
    )
  }
)

ClickableCard.displayName = "ClickableCard"

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  ClickableCard,
  type CardProps,
}
