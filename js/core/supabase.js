// Cliente Supabase — INSTÂNCIA ÚNICA do projeto (REGRA 5 do CLAUDE.md).
// Outros módulos DEVEM importar `supabase` daqui — nunca chamar createClient
// em outro lugar, pra evitar múltiplos clientes (e múltiplos onAuthStateChange).

const SUPABASE_URL = 'https://msbwplsknncnxwsalumd.supabase.co';

// Anon JWT clássica (sistema legacy do Supabase). Compatível
// com Edge Functions Gateway (sb_publishable_* não funciona
// como Bearer token nele). Pública por design — vai pro bundle
// JS, RLS protege os dados. Rotação: gerar nova via Dashboard
// → Settings → API → JWT Settings → Generate new JWT secret.
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zYndwbHNrbm5jbnh3c2FsdW1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NTUzMTAsImV4cCI6MjA4OTQzMTMxMH0.qDSAYC8KQO_PQsdRrwsIdYWdkrwqO2riFiDjJ08zctI';

const supabaseJs = window.supabase;

export const supabase = supabaseJs.createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * invokeFunction — chama uma Edge Function do Supabase via supabase-js.
 *
 * Quando usar:
 *   Toda chamada do front pra qualquer Edge Function da Fase 3 em diante
 *   (health-check, chat-claude, meta-sync, etc). Não usar fetch direto —
 *   o supabase-js já injeta o header Authorization com a anon JWT
 *   automaticamente, mantém base URL única e padroniza o tratamento de
 *   erro entre todas as chamadas.
 *
 * Parâmetros:
 *   - name: slug da função (ex: 'health-check', 'chat-claude').
 *   - payload: objeto que vira o JSON body do POST. Default {}.
 *
 * Contrato de retorno:
 *   Sempre devolve { data, error } — NUNCA joga exception. O caller
 *   decide o que fazer com o erro.
 *
 *   - Sucesso: { data: <body parseado>, error: null }
 *   - Erro:    { data: null, error: { message, status?, code? } }
 *
 * Padrão de uso:
 *   const { data, error } = await invokeFunction('health-check');
 *   if (error) {
 *     showToast(`Erro: ${error.message}`, 'error');
 *     return;
 *   }
 *   // ... usa data ...
 *
 * Logging:
 *   Em caso de erro, loga no console nome da função + mensagem + status.
 *   NUNCA loga payload — pode conter dados sensíveis (chat, credenciais,
 *   tokens) em chamadas futuras.
 */
export async function invokeFunction(name, payload) {
  const body = payload === undefined ? {} : payload;
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    const status = (error.context && error.context.status) || error.status;
    const code = error.code;
    const message = error.message || 'Erro desconhecido ao chamar Edge Function';
    console.error(`[invokeFunction] ${name} falhou:`, { message, status, code });
    return { data: null, error: { message, status, code } };
  }

  return { data, error: null };
}
