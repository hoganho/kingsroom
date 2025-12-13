// src/components/layout/UserProfile.tsx
// User profile display for sidebar

import { useAuth } from "@/contexts/AuthContext"
import { cx, focusRing } from "@/lib/utils"
import {
  ArrowRightStartOnRectangleIcon,
} from "@heroicons/react/24/outline"

// ============================================
// DESKTOP USER PROFILE
// ============================================

export function UserProfile() {
  const { user, signOut } = useAuth()

  if (!user) return null

  const displayName = user.firstName || user.email?.split("@")[0] || "User"
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <div className="flex items-center gap-3">
      {/* Avatar */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-medium text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
        {initials}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-50">
          {displayName}
        </p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {user.email}
        </p>
      </div>

      {/* Sign out button */}
      <button
        onClick={signOut}
        className={cx(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          "text-gray-500 hover:bg-gray-100 hover:text-gray-700",
          "dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200",
          "transition-colors",
          focusRing
        )}
        aria-label="Sign out"
      >
        <ArrowRightStartOnRectangleIcon className="h-5 w-5" />
      </button>
    </div>
  )
}

// ============================================
// MOBILE USER PROFILE (compact)
// ============================================

export function UserProfileMobile() {
  const { user, signOut } = useAuth()

  if (!user) return null

  const displayName = user.firstName || user.email?.split("@")[0] || "User"
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <div className="flex items-center gap-2">
      {/* Avatar button */}
      <button
        className={cx(
          "flex h-8 w-8 items-center justify-center rounded-full",
          "bg-indigo-600 text-xs font-medium text-white",
          "dark:bg-indigo-600 dark:text-white",
          "hover:ring-2 hover:ring-indigo-400 hover:ring-offset-2",
          "hover:ring-offset-gray-900",
          "transition-all",
          focusRing
        )}
        aria-label={`Signed in as ${displayName}`}
      >
        {initials}
      </button>

      {/* Sign out button */}
      <button
        onClick={signOut}
        className={cx(
          "flex h-8 w-8 items-center justify-center rounded-md",
          "text-gray-300 hover:bg-gray-800 hover:text-white",
          "dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white",
          "transition-colors",
          focusRing
        )}
        aria-label="Sign out"
      >
        <ArrowRightStartOnRectangleIcon className="h-5 w-5" />
      </button>
    </div>
  )
}