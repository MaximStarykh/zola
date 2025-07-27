'use client'

import { PrivyProvider } from '@privy-io/react-auth'

export function PrivyWrapper({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        appearance: {
          accentColor: '#6A6FF5',
          theme: '#FFFFFF',
          showWalletLoginFirst: false,
          logo: 'https://auth.privy.io/logos/privy-logo.png',
          walletChainType: 'ethereum-and-solana',
          walletList: [
            'detected_wallets',
            'metamask',
            'phantom',
            'coinbase_wallet',
            'base_account',
            'rainbow',
            'solflare',
            'backpack',
            'okx_wallet',
            'wallet_connect',
          ],
        },
        loginMethods: ['email', 'wallet', 'google', 'apple', 'github', 'discord'],
        fundingMethodConfig: {
          moonpay: {
            useSandbox: true,
          },
        },
        embeddedWallets: {
          requireUserPasswordOnCreate: false,
          showWalletUIs: true,
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
          solana: {
            createOnLogin: 'users-without-wallets',
          },
        },
        mfa: {
          noPromptOnMfaRequired: false,
        },
        externalWallets: {
          solana: {
            // 🔥 Виправлення: видаляємо `connectors`, бо воно викликає onMount
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  )
}