import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ChatsProvider } from "@/lib/chat-store/chats/provider"
import { ChatSessionProvider } from "@/lib/chat-store/session/provider"
import { ModelProvider } from "@/lib/model-store/provider"
import { TanstackQueryProvider } from "@/lib/tanstack-query/tanstack-query-provider"
import { UserPreferencesProvider } from "@/lib/user-preference-store/provider"
import { UserProvider } from "@/lib/user-store/provider"
import { ThemeProvider } from "next-themes"
import Script from "next/script"
import { AuthProvider } from "./components/providers/AuthProvider"
import { LayoutClient } from "./layout-client"
import { PrivyProvider } from "@privy-io/react-auth"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Zola",
  description:
    "Zola is the open-source interface for AI chat. Multi-model, BYOK-ready, and fully self-hostable. Use Claude, OpenAI, Gemini, local models, and more, all in one place.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const isDev = process.env.NODE_ENV === "development"

  return (
    <html lang="en" suppressHydrationWarning>
      {!isDev ? (
        <Script
          async
          src="https://analytics.umami.is/script.js"
          data-website-id="42e5b68c-5478-41a6-bc68-088d029cee52"
        />
      ) : null}
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
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
            <LayoutClient />
            <UserProvider>
              <AuthProvider>
                <ModelProvider>
                  <ChatsProvider>
                    <ChatSessionProvider>
                      <UserPreferencesProvider>
                        <TooltipProvider
                          delayDuration={200}
                          skipDelayDuration={500}
                        >
                          <ThemeProvider
                            attribute="class"
                            defaultTheme="light"
                            enableSystem
                            disableTransitionOnChange
                          >
                            <SidebarProvider defaultOpen>
                              <Toaster position="top-center" />
                              {children}
                            </SidebarProvider>
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
      </body>
    </html>
  )
}
