import { getSupabase } from './client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...((options.headers as Record<string, string>) || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `API error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
