import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin, hash } = new URL(request.url);
  const code = searchParams.get('code');

  // PKCE flow: exchange authorization code for session
  if (code) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.redirect(`${origin}/login?error=missing_supabase_config`);
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(origin);
    }
    console.error('Auth callback error:', error.message);
  }

  // Implicit flow: tokens arrive in hash fragment, client-side Supabase picks them up
  if (hash && hash.includes('access_token')) {
    return NextResponse.redirect(origin);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
