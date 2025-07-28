// app/providers/user-provider.tsx
"use client"

import {
  fetchUserProfile,
  signOutUser,
  subscribeToUserUpdates,
  updateUserProfile,
} from "@/lib/user-store/api"
import type { UserProfile } from "@/lib/user/types"
import { createClient } from "@/lib/supabase/client"
import { createContext, useContext, useEffect, useState } from "react"

const supabase = createClient()

type UserContextType = {
  user: UserProfile | null
  isLoading: boolean
  updateUser: (updates: Partial<UserProfile>) => Promise<void>
  refreshUser: () => Promise<void>
  signOut: () => Promise<void>
  // Internal methods used by AuthProvider
  setUser: (user: UserProfile | null) => void
  setIsLoading: (isLoading: boolean) => void
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
    await signOutUser()
    setUser(null)
  }

  const refreshUser = async (): Promise<void> => {
    if (!user?.id) return;
    
    setIsLoading(true);
    try {
      const updatedProfile = await fetchUserProfile(user.id);
      if (updatedProfile) {
        setUser(updatedProfile);
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
    } finally {
      setIsLoading(false);
    }
  }

  // Set up subscription to user updates
  useEffect(() => {
    if (!user?.id) return
    
    const unsubscribe = subscribeToUserUpdates(user.id, (payload) => {
      setUser((current) => (current ? { ...current, ...payload.new } : null))
    })
    
    return () => unsubscribe()
  }, [user?.id])

  // Initial user load
  useEffect(() => {
    const loadUser = async () => {
      if (!supabase) {
        console.error('Supabase client is not available')
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        
        if (error) {
          console.error('Error getting user:', error)
          return
        }

        if (user) {
          const userProfile = await fetchUserProfile(user.id)
          if (userProfile) {
            setUser(userProfile)
          }
        }
      } catch (error) {
        console.error('Error loading user:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    loadUser()
  }, [])

  return (
    <UserContext.Provider
      value={{
        user,
        isLoading,
        updateUser,
        signOut,
        refreshUser,
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
