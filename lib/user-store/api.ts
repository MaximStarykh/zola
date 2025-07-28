import { createClient } from "@/lib/supabase/client"
import type { UserProfile } from "@/lib/user/types"

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
