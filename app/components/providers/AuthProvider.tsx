'use client'

import { usePrivy, useLogin } from '@privy-io/react-auth'
import { useEffect } from 'react'
import { useUser } from '@/lib/user-store/provider'
import { getAccessToken } from '@privy-io/react-auth'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user: privyUser, authenticated, ready } = usePrivy()
  const { setUser, setIsLoading, user: appUser } = useUser()

  useEffect(() => {
    const syncUser = async () => {
      if (authenticated && privyUser) {
        try {
          setIsLoading(true)
          const accessToken = await getAccessToken()
          if (!accessToken) {
            throw new Error('Could not get access token')
          }

          const response = await fetch('/api/privy/sync-user', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ accessToken }),
          })

          if (!response.ok) {
            throw new Error('Failed to sync user')
          }

          const userProfile = await response.json()
          setUser(userProfile)
        } catch (error) {
          console.error('Error syncing user:', error)
          setUser(null) // Clear user on error
        } finally {
          setIsLoading(false)
        }
      } else if (!authenticated) {
        // If privy logs out, clear our app's user state
        setUser(null)
        setIsLoading(false)
      }
    }

    syncUser()
  }, [authenticated, privyUser, setUser, setIsLoading])

  return <>{children}</>
}
