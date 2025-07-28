'use client';

import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

const AuthHandler = ({ children }: { children: React.ReactNode }) => {
  const { authenticated, getAccessToken } = usePrivy();
  const [isSyncing, setIsSyncing] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    const syncUser = async () => {
      if (authenticated && !isSyncing) {
        setIsSyncing(true);
        try {
          const accessToken = await getAccessToken();
          if (!accessToken) {
            setIsSyncing(false);
            return;
          }

          const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          });

          if (response.ok) {
            if (!supabase) {
              console.error('Supabase client is not available');
              return;
            }
            const { accessToken, refreshToken } = await response.json();
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
          } else {
            console.error('Failed to sync user with backend');
          }
        } catch (error) {
          console.error('Error syncing user:', error);
        } finally {
          setIsSyncing(false);
        }
      }
    };

    syncUser();
  }, [authenticated, getAccessToken, isSyncing, supabase]);

  return <>{children}</>;
};

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
      <AuthHandler>{children}</AuthHandler>
    </PrivyProvider>
  );
}