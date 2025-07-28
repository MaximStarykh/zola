'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { ThemeProvider } from 'next-themes'
import { SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ChatsProvider } from '@/lib/chat-store/chats/provider'
import { ChatSessionProvider } from '@/lib/chat-store/session/provider'
import { ModelProvider } from '@/lib/model-store/provider'
import { UserPreferencesProvider } from '@/lib/user-preference-store/provider'
import { UserProvider } from '@/lib/user-store/provider'
import { TanstackQueryProvider } from '@/lib/tanstack-query/tanstack-query-provider'
import { AuthProvider } from '../components/providers/AuthProvider'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        appearance: {
          accentColor: '#6A6FF5',
          theme: '#FFFFFF',
          showWalletLoginFirst: false,
          logo: 'https://auth.privy.io/logos/privy-logo.png',
        },
        loginMethods: ['email', 'wallet', 'google', 'apple', 'github', 'discord'],
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
          requireUserPasswordOnCreate: false,
        },
        mfa: {
          noPromptOnMfaRequired: false,
        },
      }}
    >
      <TanstackQueryProvider>
        <UserProvider>
          <AuthProvider>
            <ModelProvider>
              <ChatsProvider>
                <ChatSessionProvider>
                  <UserPreferencesProvider>
                    <TooltipProvider>
                      <ThemeProvider
                        attribute="class"
                        defaultTheme="dark"
                        enableSystem
                        disableTransitionOnChange
                      >
                        <Toaster />
                        <SidebarProvider>{children}</SidebarProvider>
                      </ThemeProvider>
                    </TooltipProvider>
                  </UserPreferencesProvider>
                </ChatSessionProvider>
              </ChatsProvider>
            </ModelProvider>
          </AuthProvider>
        </UserProvider>
      </TanstackQueryProvider>
    </PrivyProvider>
  )
}
