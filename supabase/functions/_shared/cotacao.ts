/**
 * cotacao — cotação USD→BRL real com cache de isolate (3.G.1).
 *
 * Quando usar:
 *   import { getCotacaoUSDBRL } from '../_shared/cotacao.ts';
 *   const custo_brl = custo_usd * (await getCotacaoUSDBRL(request_id));
 *
 * Fonte: awesomeapi (decisão registrada em CONVENÇÕES.md desde a 3.B):
 *   GET https://economia.awesomeapi.com.br/json/last/USD-BRL
 *   → { "USDBRL": { "bid": "5.43", ... } }
 *
 * Estratégia de resiliência (NUNCA trava nem derruba a resposta):
 *   1. Cache por isolate com TTL de 1h — 1 fetch/hora no máximo.
 *   2. Dedup de chamadas concorrentes (promise in-flight compartilhada).
 *   3. Timeout de 2s no fetch (AbortController).
 *   4. Falha do fetch → usa cache VELHO se existir (cotação de 2h atrás
 *      é melhor que fixa), senão COTACAO_FALLBACK = 5.0.
 *   5. Sanidade do valor: bid precisa ser número finito entre 1 e 20 —
 *      fora disso trata como falha (defesa contra API retornando lixo).
 *
 * Observabilidade:
 *   - `cotacao.atualizada` (info) quando busca com sucesso.
 *   - `cotacao.fetch_fail` (warning) com o valor usado no lugar.
 */

import { logInfo, logWarn } from './logger.ts';

const COTACAO_FALLBACK = 5.0;
const TTL_MS = 60 * 60 * 1000; // 1h
const TIMEOUT_MS = 2_000;
const URL_COTACAO = 'https://economia.awesomeapi.com.br/json/last/USD-BRL';

let cache: { valor: number; obtidaEm: number } | null = null;
let inflight: Promise<number> | null = null;

export async function getCotacaoUSDBRL(requestId: string): Promise<number> {
  if (cache && Date.now() - cache.obtidaEm < TTL_MS) return cache.valor;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const resp = await fetch(URL_COTACAO, { signal: ctrl.signal });
      clearTimeout(timer);

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const bid = Number(json?.USDBRL?.bid);
      if (!Number.isFinite(bid) || bid < 1 || bid > 20) {
        throw new Error(`bid fora de sanidade: ${json?.USDBRL?.bid}`);
      }

      cache = { valor: bid, obtidaEm: Date.now() };
      logInfo('cotacao.atualizada', { valor: bid });
      return bid;
    } catch (err) {
      const usando = cache?.valor ?? COTACAO_FALLBACK;
      logWarn('cotacao.fetch_fail', {
        request_id: requestId,
        erro: err instanceof Error ? err.message.slice(0, 200) : String(err),
        usando,
        cache_velho: cache !== null,
      });
      return usando;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
