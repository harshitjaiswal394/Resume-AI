import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Create a dummy client or a proxy to avoid crashing on initialization
// if credentials are missing.
export const supabase = (supabaseUrl && supabaseAnonKey && supabaseAnonKey.startsWith('eyJ')) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : new Proxy({} as any, {
      get(_, prop) {
        if (prop === 'auth') {
          return new Proxy({} as any, {
            get(_, authProp) {
              return (...args: any[]) => {
                const msg = `Supabase auth.${String(authProp)} called but Supabase is not correctly configured. Check your NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env`;
                console.warn(msg);
                
                if (authProp === 'onAuthStateChange') {
                  return {
                    data: {
                      subscription: {
                        unsubscribe: () => {
                          console.log('Unsubscribed from mock onAuthStateChange');
                        }
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
            storage: { from: () => ({ upload: () => Promise.resolve({ data: null, error: { message: msg } }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) }
          };
        };
      }
    });

if (!supabaseUrl || !supabaseAnonKey || !supabaseAnonKey.startsWith('eyJ')) {
  console.warn('Supabase credentials missing or invalid. NEXT_PUBLIC_SUPABASE_ANON_KEY should start with "eyJ". Auth and database features will not work until configured.');
}
