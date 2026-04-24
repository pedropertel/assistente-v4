// Cliente Supabase — INSTÂNCIA ÚNICA do projeto (REGRA 5 do CLAUDE.md).
// Outros módulos DEVEM importar `supabase` daqui — nunca chamar createClient
// em outro lugar, pra evitar múltiplos clientes (e múltiplos onAuthStateChange).

const SUPABASE_URL = 'https://msbwplsknncnxwsalumd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_0C7x7G3Za4i4OpReOLErow_LEP1D-sc';

const supabaseJs = window.supabase;

export const supabase = supabaseJs.createClient(SUPABASE_URL, SUPABASE_KEY);
