// src/components/layout/MobileSidebar.tsx
// Tremor-style mobile sidebar drawer for Kingsroom

import { Fragment, useState } from "react"
import { Dialog, Transition } from "@headlessui/react"
import { Link, useLocation } from "react-router-dom"
import {
  Bars3Icon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline"
import { cx, focusRing } from "@/lib/utils"
import { Button } from "@/components/ui/Button"
import { EntitySelector } from "@/components/entities/EntitySelector"

// ============================================
// TYPES
// ============================================

interface NavItem {
  name: string
  href?: string
  icon: React.ComponentType<{ className?: string }>
  children?: NavItem[]
  requiredPaths?: string[]
}

interface MobileSidebarProps {
  mainNav: NavItem[]
  settingsNav: NavItem[]
  scraperNav: NavItem[]
  debugNav: NavItem[]
}

// ============================================
// NAV ITEM COMPONENT
// ============================================

interface MobileNavItemProps {
  item: NavItem
  isActive: (href: string) => boolean
  expandedItems: Set<string>
  toggleExpanded: (name: string) => void
  onClose: () => void
  depth?: number
}

function MobileNavItem({
  item,
  isActive,
  expandedItems,
  toggleExpanded,
  onClose,
  depth = 0,
}: MobileNavItemProps) {
  const hasChildren = item.children && item.children.length > 0
  const isExpanded = expandedItems.has(item.name)
  const Icon = item.icon
  const paddingLeft = depth === 0 ? "pl-3" : "pl-9"

  // Item with children but no direct link
  if (hasChildren && !item.href) {
    return (
      <div>
        <button
          onClick={() => toggleExpanded(item.name)}
          className={cx(
            "flex w-full items-center justify-between gap-x-2.5 rounded-md px-3 py-2 text-base font-medium transition sm:text-sm",
            "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
            "dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-50",
            focusRing,
            paddingLeft
          )}
        >
          <span className="flex items-center gap-x-2.5">
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            {item.name}
          </span>
          {isExpanded ? (
            <ChevronDownIcon className="size-5 shrink-0" />
          ) : (
            <ChevronRightIcon className="size-5 shrink-0" />
          )}
        </button>
        {isExpanded && (
          <div className="mt-1 space-y-1">
            {item.children!.map((child) => (
              <MobileNavItem
                key={child.name}
                item={child}
                isActive={isActive}
                expandedItems={expandedItems}
                toggleExpanded={toggleExpanded}
                onClose={onClose}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Simple leaf link
  const active = item.href ? isActive(item.href) : false
  return (
    <Link
      to={item.href!}
      onClick={onClose}
      className={cx(
        "flex items-center gap-x-2.5 rounded-md px-3 py-2 text-base font-medium transition sm:text-sm",
        active
          ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
          : "text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-50",
        focusRing,
        paddingLeft
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      {item.name}
    </Link>
  )
}

// ============================================
// NAV SECTION
// ============================================

interface MobileNavSectionProps {
  title?: string
  items: NavItem[]
  isActive: (href: string) => boolean
  expandedItems: Set<string>
  toggleExpanded: (name: string) => void
  onClose: () => void
}

function MobileNavSection({
  title,
  items,
  isActive,
  expandedItems,
  toggleExpanded,
  onClose,
}: MobileNavSectionProps) {
  if (items.length === 0) return null

  return (
    <div>
      {title && (
        <span className="mb-2 block px-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
          {title}
        </span>
      )}
      <ul role="list" className="space-y-1">
        {items.map((item) => (
          <li key={item.name}>
            <MobileNavItem
              item={item}
              isActive={isActive}
              expandedItems={expandedItems}
              toggleExpanded={toggleExpanded}
              onClose={onClose}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export function MobileSidebar({
  mainNav,
  settingsNav,
  scraperNav,
  debugNav,
}: MobileSidebarProps) {
  const [open, setOpen] = useState(false)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const location = useLocation()

  const isActive = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(href + "/")
  }

  const toggleExpanded = (name: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const handleClose = () => setOpen(false)

  return (
    <>
      {/* Trigger button */}
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="p-2 text-white hover:bg-gray-800 hover:text-white dark:text-white dark:hover:bg-gray-800"
      >
        <Bars3Icon className="size-6" aria-hidden="true" />
      </Button>

      {/* Drawer */}
      <Transition.Root show={open} as={Fragment}>
        <Dialog as="div" className="relative z-50 lg:hidden" onClose={setOpen}>
          {/* Backdrop */}
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-900/80" />
          </Transition.Child>

          <div className="fixed inset-0 flex">
            {/* Drawer panel */}
            <Transition.Child
              as={Fragment}
              enter="transform transition ease-out duration-300"
              enterFrom="-translate-x-full"
              enterTo="translate-x-0"
              leave="transform transition ease-in duration-200"
              leaveFrom="translate-x-0"
              leaveTo="-translate-x-full"
            >
              <Dialog.Panel className="relative flex w-full max-w-xs flex-col bg-white dark:bg-gray-950">
                {/* Close button */}
                <div className="absolute right-0 top-0 -mr-12 pt-4">
                  <button
                    type="button"
                    className="mr-1 flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
                    onClick={handleClose}
                  >
                    <span className="sr-only">Close sidebar</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>

                {/* Header */}
                <div className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 px-4 dark:border-gray-800">
                  <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                    Menu
                  </Dialog.Title>
                </div>

                {/* Entity Selector */}
                <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                  <EntitySelector showLabel className="w-full" />
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto px-4 py-4">
                  <div className="space-y-6">
                    <MobileNavSection
                      items={mainNav}
                      isActive={isActive}
                      expandedItems={expandedItems}
                      toggleExpanded={toggleExpanded}
                      onClose={handleClose}
                    />

                    {settingsNav.length > 0 && (
                      <MobileNavSection
                        title="Settings"
                        items={settingsNav}
                        isActive={isActive}
                        expandedItems={expandedItems}
                        toggleExpanded={toggleExpanded}
                        onClose={handleClose}
                      />
                    )}

                    {scraperNav.length > 0 && (
                      <MobileNavSection
                        title="Scraper"
                        items={scraperNav}
                        isActive={isActive}
                        expandedItems={expandedItems}
                        toggleExpanded={toggleExpanded}
                        onClose={handleClose}
                      />
                    )}

                    {debugNav.length > 0 && (
                      <MobileNavSection
                        title="Debug"
                        items={debugNav}
                        isActive={isActive}
                        expandedItems={expandedItems}
                        toggleExpanded={toggleExpanded}
                        onClose={handleClose}
                      />
                    )}
                  </div>
                </nav>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition.Root>
    </>
  )
}

export default MobileSidebar