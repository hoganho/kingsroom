// src/components/ui/Modal.tsx
import React from "react"
import { XMarkIcon } from "@heroicons/react/24/outline"
import { cx } from "@/lib/utils"

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  maxWidth?: "sm" | "md" | "lg" | "xl"
}

export function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  maxWidth = "md" 
}: ModalProps) {
  if (!isOpen) return null

  const maxWidthClasses = {
    sm: "sm:max-w-sm",
    md: "sm:max-w-md",
    lg: "sm:max-w-lg",
    xl: "sm:max-w-xl",
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity dark:bg-gray-900 dark:bg-opacity-80" 
          onClick={onClose}
        />

        {/* Panel */}
        <div className={cx(
          "relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-950 px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:p-6",
          maxWidthClasses[maxWidth]
        )}>
          {/* Header */}
          <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
            <button
              type="button"
              className="rounded-md bg-white dark:bg-gray-950 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              onClick={onClose}
            >
              <span className="sr-only">Close</span>
              <XMarkIcon className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          <div>
            {title && (
              <div className="mb-4">
                <h3 className="text-lg font-semibold leading-6 text-gray-900 dark:text-gray-50">
                  {title}
                </h3>
              </div>
            )}
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}