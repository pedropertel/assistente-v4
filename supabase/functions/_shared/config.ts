/**
 * config — leitura da tabela `configuracoes` com cache de isolate (3.G.2).
 *
 * Quando usar:
 *   import { getConfigs, lerConfig } from '../_shared/config.ts';
 *
 *   const configs = await getConfigs(supabase, request_id);
 *   const max = lerConfig(configs, 'ai_defaults.historico_max_mensagens', 20);
 *
 * REGRA 12 (Customização Total): valores que controlam o comportamento
 * da IA vivem no banco e serão editáveis por tela na Fase 4 — sem
 * redeploy. O código mantém FALLBACKS hardcoded pra cada chave: se a
 * chave sumir do banco (Pedro deletou, typo), a Edge continua de pé
 * com o comportamento padrão + warning no log. NUNCA 500 por config.
 *
 * Cache:
 *   - 1 SELECT por isolate (todas as rows de uma vez — a tabela é
 *     pequena, ~30 chaves). Cold-restart refresca (~5min de idle),
 *     mesmo padrão de agente/personas.
 *   - Falha na query NÃO é cacheada — próximo request tenta de novo.
 *   - Invalidação ATIVA (4.0/E4): `verificarVersaoCache` compara a chave
 *     `cache_version` no início de cada request; mudou → zera este cache
 *     e todos os registrados via `registrarResetDeCache` (agente,
 *     personas, nomes de entidades na chat-claude). Editou persona/config
 *     pela tela ou SQL → incrementa cache_version → efeito na resposta
 *     seguinte, sem esperar o isolate reciclar.
 *
 * Observabilidade:
 *   - `config.load_fail` (warning) quando o SELECT falha.
 *   - `config.chave_ausente` (warning) quando uma chave esperada não
 *     existe — sinal de deleção acidental ou seed faltando.
 */

import { logInfo, logWarn } from './logger.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

let cache: Map<string, unknown> | null = null;

// ──────────── Invalidação ativa (4.0 — E4 da revisão) ────────────

// Última cache_version vista por este isolate. null = ainda não checou
// (isolate frio) ou checagens anteriores falharam.
let versaoCache: number | null = null;

// Resets de caches de OUTROS módulos (chat-claude registra os dele no
// module init). Chamados quando a versão muda.
const resetsRegistrados: Array<() => void> = [];

export function registrarResetDeCache(fn: () => void): void {
  resetsRegistrados.push(fn);
}

/**
 * Compara `configuracoes.cache_version` com a última versão vista pelo
 * isolate; mudou → zera o cache local + todos os registrados. Chamar no
 * INÍCIO do request, ANTES de qualquer leitura cacheada (agente, configs).
 *
 * Custo: 1 SELECT leve (PK) por request — troca justa pelos 5-6 SELECTs
 * que os caches continuam economizando.
 *
 * Fail-open: erro na query, chave ausente ou tipo não-numérico → segue
 * com os caches atuais + warning (a Edge NUNCA quebra por config — mesmo
 * espírito do lerConfig). No primeiro check do isolate os caches ainda
 * estão vazios, então a "invalidação" é no-op (motivo cold_start no log).
 */
export async function verificarVersaoCache(
  supabase: SupabaseClient,
  requestId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'cache_version')
    .maybeSingle();

  const versao = !error && typeof data?.valor === 'number'
    ? data.valor
    : null;
  if (versao === null) {
    logWarn('config.versao_check_fail', {
      request_id: requestId,
      motivo: error ? 'erro_query' : 'chave_ausente_ou_tipo_invalido',
    });
    return;
  }

  if (versao !== versaoCache) {
    const motivo = versaoCache === null ? 'cold_start' : 'bump';
    versaoCache = versao;
    cache = null;
    for (const fn of resetsRegistrados) fn();
    logInfo('config.cache_invalidado', {
      request_id: requestId,
      versao,
      motivo,
    });
  }
}

export async function getConfigs(
  supabase: SupabaseClient,
  requestId: string,
): Promise<Map<string, unknown>> {
  if (cache) return cache;

  const { data, error } = await supabase
    .from('configuracoes')
    .select('chave, valor');

  if (error || !data) {
    // Não cacheia a falha — degrada pro fallback de cada lerConfig
    // neste request e tenta carregar de novo no próximo.
    logWarn('config.load_fail', { request_id: requestId });
    return new Map();
  }

  cache = new Map(data.map((r) => [r.chave as string, r.valor]));
  return cache;
}

export function lerConfig<T>(
  configs: Map<string, unknown>,
  chave: string,
  fallback: T,
  requestId?: string,
): T {
  if (!configs.has(chave)) {
    // Map vazio = load_fail já logado; só avisa chave ausente quando
    // o load funcionou (senão vira ruído de N warnings por request).
    if (configs.size > 0) {
      logWarn('config.chave_ausente', {
        request_id: requestId,
        chave,
      });
    }
    return fallback;
  }
  // C4 (revisão 2026-07-07): valida o tipo contra o shape do fallback.
  // A tela da Fase 4 (e o SQL de hoje) grava jsonb livre — um tipo errado
  // (ex: rate limit salvo como objeto, tools salvas como string) desligava
  // proteções em silêncio. Aqui: se o formato não bate com o fallback,
  // loga e usa o fallback (cumpre de verdade o "NUNCA quebra por config").
  const valor = configs.get(chave);
  const fbArray = Array.isArray(fallback);
  const okTipo = fbArray
    ? Array.isArray(valor)
    : (valor !== null && typeof valor === typeof fallback);
  if (!okTipo) {
    logWarn('config.tipo_invalido', {
      request_id: requestId,
      chave,
      tipo_recebido: Array.isArray(valor) ? 'array' : (valor === null ? 'null' : typeof valor),
      tipo_esperado: fbArray ? 'array' : typeof fallback,
    });
    return fallback;
  }
  return valor as T;
}
