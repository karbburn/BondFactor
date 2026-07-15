'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '../../../lib/supabase/client';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const sb = getSupabase();
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    async function handle() {
      // PKCE flow: exchange authorization code for session
      if (code) {
        const { error } = await sb.auth.exchangeCodeForSession(code);
        if (!error) {
          router.replace('/');
          return;
        }
        console.error('PKCE exchange failed:', error.message);
      }

      // Implicit flow: tokens in hash fragment — Supabase client auto-picks them up
      if (hash && hash.includes('access_token')) {
        // Clear the hash from the URL so refreshes don't re-process
        window.history.replaceState({}, '', window.location.pathname);
        // Supabase onAuthStateChange listener will pick up the session
        router.replace('/');
        return;
      }

      // Nothing worked
      router.replace('/login?error=auth_callback_failed');
    }

    handle();
  }, [router]);

  return (
    <div className="container loading-container">
      <div>Completing sign-in...</div>
    </div>
  );
}
