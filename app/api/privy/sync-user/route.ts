import { privyClient } from '@/lib/privy/server';
import { createGuestServerClient } from '@/lib/supabase/server-guest';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { accessToken } = await request.json();

    if (!accessToken) {
      return NextResponse.json({ error: 'Access token is required' }, { status: 400 });
    }

    const verifiedClaims = await privyClient.verifyAuthToken(accessToken);
    const { userId, email } = verifiedClaims;

    if (!userId) {
      return NextResponse.json({ error: 'Invalid access token' }, { status: 401 });
    }

    const supabaseAdmin = await createGuestServerClient();
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase client failed to initialize' }, { status: 500 });
    }

    // Check if user exists
    let { data: user, error: selectError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (selectError && selectError.code !== 'PGRST116') { // PGRST116: 'No rows found'
      console.error('Error selecting user:', selectError);
      return NextResponse.json({ error: 'Failed to retrieve user' }, { status: 500 });
    }

    // If user does not exist, create a new one
    if (!user) {
      const { data: newUser, error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          id: userId,
          email: email || '', // email might be null
          created_at: new Date().toISOString(),
          // Set default values for other required fields
          message_count: 0,
          premium: false,
          favorite_models: [],
        })
        .select('*')
        .single();

      if (insertError) {
        console.error('Error inserting user:', insertError);
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
      }
      user = newUser;
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('User sync error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
