/**
 * Cliente Supabase com service_role pra Edge Functions.
 *
 * Quando usar:
 *   import { getSupabaseAdmin } from '../_shared/supabase-admin.ts';
 *
 *   const supabase = getSupabaseAdmin();
 *   const { data, error } = await supabase.from('agentes').select('*');
 *
 * Por que service_role e não anon key:
 *   - Edge Functions operam como sistema (não como user). Bypassam RLS
 *     pra ler/escrever em qualquer tabela.
 *   - REGRA: NUNCA expor service_role no frontend. Vive APENAS aqui,
 *     dentro do ambiente de execução da Edge Function (que é isolado
 *     do browser).
 *
 * Como a auth do user é validada (não responsabilidade deste módulo):
 *   - O front chama a Edge mandando Authorization: Bearer <jwt> no header.
 *   - A Edge pode validar o JWT manualmente quando precisar saber QUEM
 *     chamou (ex: pra logar user_id). Single-user → quase sempre
 *     desnecessário, mas o header está lá se precisar.
 *
 * Cache por invocação:
 *   - Edge Function Deno é stateless entre requests, mas o módulo é
 *     carregado 1x por isolate. A variável `cachedClient` evita criar
 *     N clientes em uma mesma invocação que chame `getSupabaseAdmin()`
 *     várias vezes.
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)',
    );
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedClient;
}
