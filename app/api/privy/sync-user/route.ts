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
    const userId = verifiedClaims.userId;

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
      // Create a user object with all required fields and proper types
      const newUserData = {
        id: userId,
        email: `user-${userId}@example.com`, // Provide a default email
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        message_count: 0,
        premium: false,
        favorite_models: [], // Array of strings
        display_name: `User-${userId.slice(0, 8)}`,
        profile_image: '', // Empty string instead of null
        anonymous: false,
        daily_message_count: 0,
        daily_reset: new Date().toISOString(), // Current timestamp
        system_prompt: '', // Empty string instead of null
        preferences: {} // Empty object
      };

      const { data: newUser, error: insertError } = await supabaseAdmin
        .from('users')
        .insert([newUserData] as any) // Cast to any to bypass type checking
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
