"use client"

import { usePrivy } from '@privy-io/react-auth'
import { useUser } from '@/lib/user-store/provider'
import { Button } from '@/components/ui/button'

export function LoginButton() {
  const { user } = useUser()
  const { login } = usePrivy()

  const isLoggedIn = !!user

  if (isLoggedIn) {
    return null // Don't render anything if the user is logged in
  }

  return (
    <Button
      variant="ghost"
      onClick={() => {
        console.log('Login button clicked from isolated component');
        login();
      }}
    >
      Login
    </Button>
  )
}
