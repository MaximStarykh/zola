import { createClient } from "@/lib/supabase/client"
import type { UserProfile } from "@/lib/user/types"

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const supabase = createClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) {
    console.error('Error fetching user profile:', error)
    return null
  }

  return data as UserProfile
}

export async function updateUserProfile(
  id: string,
  updates: Partial<UserProfile>
): Promise<boolean> {
  const supabase = createClient()
  if (!supabase) return false

  const { error } = await supabase.from("users").update(updates).eq("id", id)

  if (error) {
    console.error("Failed to update user:", error)
    return false
  }

  return true
}

export async function signOutUser(): Promise<boolean> {
  const supabase = createClient()
  if (!supabase) return false
  
  const { error } = await supabase.auth.signOut()
  
  if (error) {
    console.error('Error signing out:', error)
    return false
  }
  
  return true
}

export function subscribeToUserUpdates(
  userId: string,
  callback: (payload: any) => void
) {
  const supabase = createClient()
  if (!supabase) return () => {}
  
  const subscription = supabase
    .channel('user_changes')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `id=eq.${userId}`
      },
      callback
    )
    .subscribe()

  return () => {
    subscription.unsubscribe()
  }
}
