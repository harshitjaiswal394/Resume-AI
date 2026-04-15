import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (url && key && key.startsWith('eyJ')) {
    try {
      _client = createClient(url, key);
      return _client;
    } catch (e) {
      console.warn('Failed to create Supabase client:', e);
    }
  }

  const msg = 'Supabase credentials missing or invalid. Auth and database features will not work until configured.';
  console.warn(msg);

  // Return a no-op proxy that won't crash at runtime
  return new Proxy({} as any, {
    get(_, prop) {
      if (prop === 'auth') {
        return new Proxy({} as any, {
          get(_, authProp) {
            return (..._args: any[]) => {
              const msg = `Supabase auth.${String(authProp)} called but Supabase is not configured.`;
              console.warn(msg);

              if (authProp === 'onAuthStateChange') {
                return {
                  data: {
                    subscription: {
                      unsubscribe: () => {}
                    }
                  }
                };
              }

              return Promise.resolve({
                data: { session: null, user: null, url: null },
                error: { message: msg, status: 400 }
              });
            };
          }
        });
      }
      return () => {
        const msg = `Supabase.${String(prop)} called but Supabase is not configured.`;
        console.warn(msg);
        return {
          from: () => ({
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: null, error: { message: msg } }),
                order: () => Promise.resolve({ data: [], error: { message: msg } })
              }),
              order: () => Promise.resolve({ data: [], error: { message: msg } })
            }),
            insert: () => Promise.resolve({ data: null, error: { message: msg } }),
            update: () => ({ eq: () => Promise.resolve({ data: null, error: { message: msg } }) }),
            delete: () => ({ eq: () => Promise.resolve({ data: null, error: { message: msg } }) }),
          }),
          channel: () => ({ on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }) }),
          storage: {
            from: () => ({
              upload: () => Promise.resolve({ data: null, error: { message: msg } }),
              getPublicUrl: () => ({ data: { publicUrl: '' } }),
              list: () => Promise.resolve({ data: [], error: null }),
              remove: () => Promise.resolve({ data: null, error: null }),
            })
          }
        };
      };
    }
  }) as any;
}

// Exported as a getter-backed proxy so every access goes through getClient()
// but callers still use `supabase.auth.xxx()` syntax unchanged.
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getClient() as any)[prop];
  }
});
