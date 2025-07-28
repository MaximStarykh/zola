'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useEffect } from 'react'
import { useUser } from '@/lib/user-store/provider'
import { getAccessToken } from '@privy-io/react-auth'
import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/app/types/database.types'

// Initialize Supabase client outside the component to ensure it's a stable singleton
const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user: privyUser, authenticated, ready } = usePrivy()
  const { setUser, setIsLoading } = useUser()

  useEffect(() => {
    if (ready && authenticated) {
      // User is authenticated, sync with backend
      const syncUser = async () => {
        setIsLoading(true)
        try {
          const accessToken = await getAccessToken()
          if (!accessToken) {
            throw new Error('Could not get access token from Privy')
          }

          // Call the login endpoint to create a Supabase session
          const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          })

          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Failed to login with backend: ${errorText}`)
          }

          const { accessToken: supabaseAccessToken, refreshToken: supabaseRefreshToken } = await response.json()

          // Set the Supabase session
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: supabaseAccessToken,
            refresh_token: supabaseRefreshToken,
          })

          if (sessionError) {
            throw new Error(`Failed to set Supabase session: ${sessionError.message}`)
          }

          // Now that session is set, fetch user profile from our DB
          if (!privyUser) throw new Error('Privy user not found after authentication.')

          const { data: dbUser, error: profileError } = await supabase
            .from('users')
            .select('*')
            .eq('id', privyUser.id)
            .single()

          if (profileError) {
            throw new Error(`Failed to fetch user profile: ${profileError.message}`)
          }

          if (!dbUser) {
            throw new Error('User not found in database after login.')
          }

          // Transform the database user to match the expected UserProfile type
          const userProfile = {
            ...dbUser,
            display_name: dbUser.display_name ?? 'New User',
            profile_image: dbUser.profile_image ?? '', // Provide a default empty string
          }

          setUser(userProfile)

        } catch (error) {
          console.error('Error syncing user:', error)
          setUser(null) // Clear user on error
        } finally {
          setIsLoading(false)
        }
      }

      syncUser()
    } else if (ready && !authenticated) {
      // User is not authenticated, clear user state and sign out from Supabase
      const signOut = async () => {
        await supabase.auth.signOut()
        setUser(null)
        setIsLoading(false)
      }
      signOut()
    }
  }, [ready, authenticated, privyUser, setUser, setIsLoading, supabase])

  return <>{children}</>
}
