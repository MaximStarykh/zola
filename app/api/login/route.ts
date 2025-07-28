import { privyClient } from '@/lib/privy/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const verifiedClaims = await privyClient.verifyAuthToken(token);
    const privyUserId = verifiedClaims.userId;
    const privyUser = await privyClient.getUser(privyUserId);
    const email = privyUser.email?.address;

    if (!email) {
      return NextResponse.json({ error: 'Email not found for user' }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdminClient();

    // Ensure user exists in auth.users
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(privyUserId);
    if (authError && authError.name === 'UserNotFoundError') {
      const { error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
        id: privyUserId,
        user_metadata: { privy_claims: verifiedClaims },
        app_metadata: { provider: 'privy' },
        email: email,
        email_confirm: true, // User is already verified by Privy
      });
      if (createAuthError) throw createAuthError;
    } else if (authError) {
      throw authError;
    }

    // Ensure user exists in public.users
    const { data: publicUser, error: publicUserError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', privyUserId)
      .single();

    if (!publicUser && publicUserError) {
      const { error: createPublicUserError } = await supabaseAdmin
        .from('users')
        .insert({ id: privyUserId, raw_user_meta_data: verifiedClaims });
      if (createPublicUserError) throw createPublicUserError;
    }

    // Generate a magic link for the user to get a session
    const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
    });

    if (linkError) throw linkError;

    const url = new URL(data.properties.action_link);
    const params = new URLSearchParams(url.hash.substring(1)); // remove '#' from hash
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (!accessToken || !refreshToken) {
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    return NextResponse.json({ accessToken, refreshToken });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
