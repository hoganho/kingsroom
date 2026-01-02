// src/components/layout/Sidebar.tsx
// Tremor-style sidebar adapted for Kingsroom

"use client"

import { cx, focusRing } from "@/lib/utils"
import {
  HomeIcon,
  UserGroupIcon,
  TrophyIcon,
  BeakerIcon,
  BuildingOffice2Icon,
  BuildingLibraryIcon,
  WrenchIcon,
  HashtagIcon,
  UsersIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChartBarIcon,
  MegaphoneIcon,
  BugAntIcon,
} from "@heroicons/react/24/outline"
import { Link, useLocation } from "react-router-dom"
import { useState, useEffect, useMemo } from "react"
import { useUserPermissions } from "@/hooks/useUserPermissions"
import { MobileSidebar } from "./MobileSidebar"
import { UserProfile, UserProfileMobile } from "./UserProfile"
import { EntitySelector } from "@/components/entities/EntitySelector"
import logo from "@/assets/Kings-Room-Logo_web.png"

// ============================================
// NAVIGATION CONFIG
// ============================================

interface NavItem {
  name: string
  href?: string
  icon: React.ComponentType<{ className?: string }>
  children?: NavItem[]
  requiredPaths?: string[]
}

const mainNavigation: NavItem[] = [
  {
    name: "Home",
    href: "/home",
    icon: HomeIcon,
    requiredPaths: ["/home"],
  },
  {
    name: "Players",
    href: "/players/dashboard",
    icon: UserGroupIcon,
    requiredPaths: ["/players/dashboard", "/players/search"],
    children: [
      { name: "Dashboard", href: "/players/dashboard", icon: UserGroupIcon, requiredPaths: ["/players/dashboard"] },
      { name: "Player Search", href: "/players/search", icon: UserGroupIcon, requiredPaths: ["/players/search"] },
    ],
  },
  {
    name: "Series",
    href: "/series/dashboard",
    icon: TrophyIcon,
    requiredPaths: ["/series/dashboard", "/series/details", "/series/game"],
    children: [
      { name: "Dashboard", href: "/series/dashboard", icon: TrophyIcon, requiredPaths: ["/series/dashboard"] },
    ],
  },
  {
    name: "Games",
    href: "/games/dashboard",
    icon: BeakerIcon,
    requiredPaths: ["/games/dashboard", "/games/search"],
    children: [
      { name: "Dashboard", href: "/games/dashboard", icon: BeakerIcon, requiredPaths: ["/games/dashboard"] },
      { name: "Game Search", href: "/games/search", icon: BeakerIcon, requiredPaths: ["/games/search"] },
    ],
  },
  {
    name: "Venues",
    href: "/venues",
    icon: BuildingOffice2Icon,
    requiredPaths: ["/venues", "/venues/details", "/venues/game"],
  },
  {
    name: "Entities",
    href: "/entities",
    icon: BuildingLibraryIcon,
    requiredPaths: ["/entities"],
  },
  {
    name: "Social",
    href: "/social/pulse",
    icon: MegaphoneIcon,
    requiredPaths: ["/social/pulse", "/social/dashboard"],
    children: [
      { name: "Pulse", href: "/social/pulse", icon: MegaphoneIcon, requiredPaths: ["/social/pulse"] },
      { name: "Dashboard", href: "/social/dashboard", icon: MegaphoneIcon, requiredPaths: ["/social/dashboard"] },
    ],
  },
]

const settingsNavigation: NavItem[] = [
  { name: "Entity Management", href: "/settings/entity-management", icon: BuildingOffice2Icon, requiredPaths: ["/settings/entity-management"] },
  { name: "Venue Management", href: "/settings/venue-management", icon: BuildingOffice2Icon, requiredPaths: ["/settings/venue-management"] },
  { name: "Game Management", href: "/settings/game-management", icon: BeakerIcon, requiredPaths: ["/settings/game-management"] },
  { name: "Series Management", href: "/settings/series-management", icon: TrophyIcon, requiredPaths: ["/settings/series-management"] },
  { name: 'Metrics Management', href: '/settings/metrics-management', icon: ChartBarIcon, requiredPaths: ["/settings/metrics-management"] },
  { name: "Social Accounts", href: "/settings/social-accounts", icon: HashtagIcon, requiredPaths: ["/settings/social-accounts"] },
  { name: "User Management", href: "/settings/user-management", icon: UsersIcon, requiredPaths: ["/settings/user-management"] },
]

const scraperNavigation: NavItem[] = [
  { name: "Scraper Admin", href: "/scraper/admin", icon: WrenchIcon, requiredPaths: ["/scraper/admin"] },
]

const debugNavigation: NavItem[] = [
  { name: "Games Debug", href: "/debug/games", icon: BugAntIcon, requiredPaths: ["/debug/games"] },
  { name: "Players Debug", href: "/debug/players", icon: BugAntIcon, requiredPaths: ["/debug/players"] },
  { name: "Social Debug", href: "/debug/social", icon: BugAntIcon, requiredPaths: ["/debug/social"] },
  { name: "Database Monitor", href: "/debug/database-monitor", icon: BugAntIcon, requiredPaths: ["/debug/database-monitor"] },
]

// ============================================
// NAV ITEM COMPONENT
// ============================================

interface NavItemProps {
  item: NavItem
  isActive: (href: string) => boolean
  expandedItems: Set<string>
  toggleExpanded: (name: string) => void
  depth?: number
}

function NavItemComponent({ item, isActive, expandedItems, toggleExpanded, depth = 0 }: NavItemProps) {
  const hasChildren = item.children && item.children.length > 0
  const isExpanded = expandedItems.has(item.name)
  const Icon = item.icon
  const paddingLeft = depth === 0 ? "pl-2" : "pl-8"

  // Item with children but no direct link
  if (hasChildren && !item.href) {
    return (
      <div>
        <button
          onClick={() => toggleExpanded(item.name)}
          className={cx(
            "flex w-full items-center justify-between gap-x-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition",
            "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
            "dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-50",
            focusRing,
            paddingLeft
          )}
        >
          <span className="flex items-center gap-x-2.5">
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {item.name}
          </span>
          {isExpanded ? (
            <ChevronDownIcon className="size-4 shrink-0" />
          ) : (
            <ChevronRightIcon className="size-4 shrink-0" />
          )}
        </button>
        {isExpanded && (
          <div className="mt-1 space-y-0.5">
            {item.children!.map((child) => (
              <NavItemComponent
                key={child.name}
                item={child}
                isActive={isActive}
                expandedItems={expandedItems}
                toggleExpanded={toggleExpanded}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Item with children AND direct link
  if (hasChildren && item.href) {
    const active = isActive(item.href)
    return (
      <div>
        <div
          className={cx(
            "flex items-center rounded-md overflow-hidden",
            active && "bg-indigo-50 dark:bg-indigo-500/10"
          )}
        >
          <Link
            to={item.href}
            className={cx(
              "flex flex-1 items-center gap-x-2.5 px-2 py-1.5 text-sm font-medium transition",
              active
                ? "text-indigo-600 dark:text-indigo-400"
                : "text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50",
              focusRing,
              paddingLeft
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {item.name}
          </Link>
          <button
            onClick={() => toggleExpanded(item.name)}
            className={cx(
              "px-2 py-1.5",
              active
                ? "text-indigo-600 hover:bg-indigo-100 dark:text-indigo-400 dark:hover:bg-indigo-500/20"
                : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900",
              focusRing
            )}
          >
            {isExpanded ? (
              <ChevronDownIcon className="size-4" />
            ) : (
              <ChevronRightIcon className="size-4" />
            )}
          </button>
        </div>
        {isExpanded && (
          <div className="mt-1 space-y-0.5">
            {item.children!.map((child) => (
              <NavItemComponent
                key={child.name}
                item={child}
                isActive={isActive}
                expandedItems={expandedItems}
                toggleExpanded={toggleExpanded}
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
      className={cx(
        "flex items-center gap-x-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition",
        active
          ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
          : "text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-50",
        focusRing,
        paddingLeft
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {item.name}
    </Link>
  )
}

// ============================================
// NAV SECTION COMPONENT
// ============================================

interface NavSectionProps {
  title?: string
  items: NavItem[]
  isActive: (href: string) => boolean
  expandedItems: Set<string>
  toggleExpanded: (name: string) => void
}

function NavSection({ title, items, isActive, expandedItems, toggleExpanded }: NavSectionProps) {
  if (items.length === 0) return null

  return (
    <div>
      {title && (
        <span className="mb-1 block px-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          {title}
        </span>
      )}
      <ul role="list" className="space-y-0.5">
        {items.map((item) => (
          <li key={item.name}>
            <NavItemComponent
              item={item}
              isActive={isActive}
              expandedItems={expandedItems}
              toggleExpanded={toggleExpanded}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

// ============================================
// MAIN SIDEBAR COMPONENT
// ============================================

export function Sidebar() {
  const location = useLocation()
  const { canAccess } = useUserPermissions()
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const buildVersion = import.meta.env.VITE_BUILD_VERSION || "dev"

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

  // Filter navigation based on permissions
  const filterNav = (items: NavItem[]): NavItem[] => {
    return items
      .map((item) => {
        const hasAccess = item.requiredPaths?.some((path) => canAccess(path)) ?? true
        if (!hasAccess) return null
        if (item.children) {
          const filtered = filterNav(item.children)
          if (filtered.length === 0) return null
          return { ...item, children: filtered }
        }
        return item
      })
      .filter((item): item is NavItem => item !== null)
  }

  const filteredMain = useMemo(() => filterNav(mainNavigation), [canAccess])
  const filteredSettings = useMemo(() => filterNav(settingsNavigation), [canAccess])
  const filteredScraper = useMemo(() => filterNav(scraperNavigation), [canAccess])
  const filteredDebug = useMemo(() => filterNav(debugNavigation), [canAccess])

  // Auto-expand active sections
  useEffect(() => {
    const allItems = [...mainNavigation, ...settingsNavigation, ...scraperNavigation, ...debugNavigation]
    allItems.forEach((item) => {
      if (item.children) {
        const childActive = item.children.some((c) => c.href && isActive(c.href))
        const parentActive = item.href && isActive(item.href)
        if (childActive || parentActive) {
          setExpandedItems((prev) => new Set(prev).add(item.name))
        }
      }
    })
  }, [location.pathname])

  return (
    <>
      {/* Desktop sidebar (lg+) */}
      <nav className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <aside className="flex grow flex-col gap-y-4 overflow-y-auto border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
          {/* Logo */}
          <div className="flex h-16 shrink-0 items-center justify-center border-b border-gray-200 bg-gray-900 px-4 dark:border-gray-800">
            <img src={logo} alt="Kings Room" className="h-10 object-contain" />
          </div>

          {/* Entity Selector */}
          <div className="px-4">
            <EntitySelector showLabel className="w-full" />
          </div>

          {/* Navigation */}
          <nav className="flex flex-1 flex-col gap-y-6 overflow-y-auto px-4 pb-4">
            <NavSection
              items={filteredMain}
              isActive={isActive}
              expandedItems={expandedItems}
              toggleExpanded={toggleExpanded}
            />

            {filteredSettings.length > 0 && (
              <NavSection
                title="Settings"
                items={filteredSettings}
                isActive={isActive}
                expandedItems={expandedItems}
                toggleExpanded={toggleExpanded}
              />
            )}

            {filteredScraper.length > 0 && (
              <NavSection
                title="Scraper"
                items={filteredScraper}
                isActive={isActive}
                expandedItems={expandedItems}
                toggleExpanded={toggleExpanded}
              />
            )}

            {filteredDebug.length > 0 && (
              <NavSection
                title="Debug"
                items={filteredDebug}
                isActive={isActive}
                expandedItems={expandedItems}
                toggleExpanded={toggleExpanded}
              />
            )}
          </nav>

          {/* Footer */}
          <div className="border-t border-gray-200 p-4 dark:border-gray-800">
            <UserProfile />
            <div className="mt-3 text-xs text-gray-500">
              <div>Version: {buildVersion}</div>
              <div>© 2025 Top Set Ventures</div>
            </div>
          </div>
        </aside>
      </nav>

      {/* Mobile header (< lg) */}
      <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between gap-x-4 border-b border-gray-800 bg-gray-900 px-4 shadow-sm lg:hidden dark:border-gray-800 dark:bg-gray-900">
        {/* Left side - Burger menu + Logo */}
        <div className="flex items-center gap-3">
          <MobileSidebar
            mainNav={filteredMain}
            settingsNav={filteredSettings}
            scraperNav={filteredScraper}
            debugNav={filteredDebug}
          />
          <img src={logo} alt="Kings Room" className="h-8 object-contain" />
        </div>

        {/* Right side - Profile */}
        <div className="flex items-center gap-2">
          <UserProfileMobile />
        </div>
      </div>
    </>
  )
}

export default Sidebar