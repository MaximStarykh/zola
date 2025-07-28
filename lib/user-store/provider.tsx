// app/providers/user-provider.tsx
"use client"

import {
  fetchUserProfile,
  signOutUser,
  subscribeToUserUpdates,
  updateUserProfile,
} from "@/lib/user-store/api"
import type { UserProfile } from "@/lib/user/types"
import { createContext, useContext, useEffect, useState } from "react"

type UserContextType = {
  user: UserProfile | null
  isLoading: boolean
  updateUser: (updates: Partial<UserProfile>) => Promise<void>
  refreshUser: () => Promise<void>
  signOut: () => Promise<void>
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true) // Start with loading true

  const updateUser = async (updates: Partial<UserProfile>) => {
    if (!user?.id) return

    // Optimistically update the user state
    setUser((prev) => (prev ? { ...prev, ...updates } : null))

    // Then, send the update to the server
    await updateUserProfile(user.id, updates)
  }

  const signOut = async () => {
    setUser(null)
  }

  return (
    <UserContext.Provider
      value={{
        user,
        isLoading,
        updateUser,
        signOut,
        // Expose setUser to be used by the Privy auth wrapper
        setUser,
        setIsLoading,
      }}
    >
      {children}
    </UserContext.Provider>
  )
}

// Custom hook to use the user context
export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider")
  }
  return context
}
