/**
 * cotacao — cotação USD→BRL real com cache de isolate (3.G.1).
 *
 * Quando usar:
 *   import { getCotacaoUSDBRL } from '../_shared/cotacao.ts';
 *   const custo_brl = custo_usd * (await getCotacaoUSDBRL(request_id));
 *
 * Fontes (cadeia, na ordem — primeira que responder com valor são
 * vence):
 *   1. open.er-api.com/v6/latest/USD        → rates.BRL
 *   2. currency-api via CDN jsdelivr        → usd.brl
 *
 * ⚠️ awesomeapi (decisão original da 3.B) NÃO funciona daqui: devolve
 * `429 QuotaExceeded` pro IP de egress compartilhado do Supabase
 * (validado em 2026-07-06 com função de debug dentro do runtime).
 * As duas fontes acima atualizam ~1x/dia — suficiente pra exibição
 * de custo; não é aplicação financeira.
 *
 * Estratégia de resiliência (NUNCA trava nem derruba a resposta):
 *   1. Cache por isolate com TTL de 1h — no máx. 1 rodada de fetch/hora.
 *   2. Dedup de chamadas concorrentes (promise in-flight compartilhada).
 *   3. Timeout de 2s por fonte (AbortController).
 *   4. Todas as fontes falharam → usa cache VELHO se existir (cotação
 *      de horas atrás é melhor que fixa), senão COTACAO_FALLBACK = 5.0.
 *   5. Sanidade do valor: número finito entre 1 e 20 — fora disso
 *      trata como falha (defesa contra API retornando lixo).
 *
 * Observabilidade:
 *   - `cotacao.atualizada` (info) com valor + fonte que respondeu.
 *   - `cotacao.fonte_fail` (warning) por fonte que falhar.
 *   - `cotacao.todas_fontes_fail` (warning) com o valor usado no lugar.
 */

import { logInfo, logWarn } from './logger.ts';

const COTACAO_FALLBACK = 5.0;
const TTL_MS = 60 * 60 * 1000; // 1h
const TIMEOUT_MS = 2_000;

interface FonteCotacao {
  nome: string;
  url: string;
  // deno-lint-ignore no-explicit-any -- shape varia por fonte
  extrair: (json: any) => number;
}

const FONTES: FonteCotacao[] = [
  {
    nome: 'er-api',
    url: 'https://open.er-api.com/v6/latest/USD',
    extrair: (j) => Number(j?.rates?.BRL),
  },
  {
    nome: 'currency-api-cdn',
    url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
    extrair: (j) => Number(j?.usd?.brl),
  },
];

let cache: { valor: number; obtidaEm: number } | null = null;
let inflight: Promise<number> | null = null;

async function buscarDeFonte(
  fonte: FonteCotacao,
  requestId: string,
): Promise<number | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const resp = await fetch(fonte.url, { signal: ctrl.signal });
    clearTimeout(timer);

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const valor = fonte.extrair(await resp.json());
    if (!Number.isFinite(valor) || valor < 1 || valor > 20) {
      throw new Error(`valor fora de sanidade: ${valor}`);
    }
    return valor;
  } catch (err) {
    logWarn('cotacao.fonte_fail', {
      request_id: requestId,
      fonte: fonte.nome,
      erro: err instanceof Error ? err.message.slice(0, 200) : String(err),
    });
    return null;
  }
}

export async function getCotacaoUSDBRL(requestId: string): Promise<number> {
  if (cache && Date.now() - cache.obtidaEm < TTL_MS) return cache.valor;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      for (const fonte of FONTES) {
        const valor = await buscarDeFonte(fonte, requestId);
        if (valor !== null) {
          cache = { valor, obtidaEm: Date.now() };
          logInfo('cotacao.atualizada', { valor, fonte: fonte.nome });
          return valor;
        }
      }

      const usando = cache?.valor ?? COTACAO_FALLBACK;
      logWarn('cotacao.todas_fontes_fail', {
        request_id: requestId,
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
