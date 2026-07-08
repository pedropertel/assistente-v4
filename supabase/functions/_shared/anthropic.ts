/**
 * anthropic — wrapper SDK Anthropic + tabela de preços +
 * cálculo de custo USD.
 *
 * Quando usar:
 *   import { getAnthropicClient, calcCustoUSD } from '../_shared/anthropic.ts';
 *
 *   const client = getAnthropicClient();
 *   const response = await client.messages.create({...});
 *   const custo = calcCustoUSD(modelo, response.usage.input_tokens,
 *                              response.usage.output_tokens);
 *
 * Cache lazy do client:
 *   - Cliente Anthropic é criado 1x por isolate Deno (mesmo padrão
 *     do supabase-admin.ts).
 *   - Lê ANTHROPIC_API_KEY de Deno.env (configurado como Edge Secret).
 *   - Throw com mensagem clara se key faltar.
 *
 * Pricing fail-safe:
 *   - 3.G.2: pricing primário vem de configuracoes.ai_defaults.precos_modelos
 *     (parâmetro opcional de calcCustoUSD). MODEL_PRICING é o fallback.
 *   - calcCustoUSD retorna 0 + log warning se modelo não mapeado
 *     (defesa: nunca cobra valor errado).
 *
 * Timeout:
 *   - 60s no SDK. Anthropic tipicamente responde Haiku em 800ms-2s,
 *     mas defesa pra picos.
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.92.0';
import { logWarn } from './logger.ts';

let cachedClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cachedClient) return cachedClient;

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY env var');
  }

  cachedClient = new Anthropic({
    apiKey,
    timeout: 60_000, // 60s
  });

  return cachedClient;
}

// Preços USD por 1M tokens. Haiku validado 2026-05-02; Sonnet 4.6 e Opus 4.7
// validados 2026-05-03 via doc oficial Anthropic
// (platform.claude.com/docs/en/about-claude/models/overview).
// 3.G.2: fallback — pricing primário vem de configuracoes.
export const MODEL_PRICING = {
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 },
  'claude-sonnet-4-6':         { input: 3.00, output: 15.00 },
  'claude-opus-4-7':           { input: 5.00, output: 25.00 },
} as const;

// Shape de uma entrada de pricing (USD por 1M tokens).
export interface PrecoModelo {
  input: number;
  output: number;
}

export function calcCustoUSD(
  modelo: string,
  tokensIn: number,
  tokensOut: number,
  // 3.G.2: pricing vindo de configuracoes.ai_defaults.precos_modelos.
  // Ausente/sem o modelo → cai no MODEL_PRICING hardcoded (fail-safe).
  pricing?: Record<string, PrecoModelo>,
  // D3 (3.5.D.3) — prompt caching: usage.input_tokens NÃO inclui tokens
  // cacheados. Cache write custa 1.25× do preço de input, read 0.1×
  // (multiplicadores fixos da API Anthropic, TTL 5min). Default 0 mantém
  // os callers sem caching (Roteador) intactos.
  cacheWriteTokens: number = 0,
  cacheReadTokens: number = 0,
): number {
  const p = pricing?.[modelo] ??
    MODEL_PRICING[modelo as keyof typeof MODEL_PRICING];
  if (!p) {
    // Fail-safe: modelo não mapeado → custo zero + warning visível
    // no logger (não escala silenciosamente). Defesa contra bug que
    // faça router voltar pra modelo não validado.
    logWarn('anthropic.modelo_nao_mapeado', {
      modelo,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
    });
    return 0;
  }
  const inputEquivalente = tokensIn +
    cacheWriteTokens * 1.25 +
    cacheReadTokens * 0.1;
  return (inputEquivalente / 1_000_000) * p.input
       + (tokensOut / 1_000_000) * p.output;
}

/**
 * Modelos Anthropic que NÃO aceitam o parâmetro `temperature`.
 *
 * Opus 4.7 e modelos com Adaptive Thinking deprecaram `temperature` —
 * a API responde com `400 invalid_request_error` ("`temperature` is
 * deprecated for this model.") quando enviado.
 *
 * Validado em runtime na 3.D.3.2 (Opus 4.7 falhou com temperature=0.7).
 * Adaptive Thinking documentado em
 * platform.claude.com/docs/en/about-claude/models/overview.
 *
 * 3.G.2: a lista primária vem de configuracoes.ai_defaults.
 * modelos_sem_temperature (consumida direto na chat-claude).
 * Este export é mantido como referência/fallback documental.
 */
export const MODELOS_SEM_TEMPERATURE: ReadonlySet<string> = new Set([
  'claude-opus-4-7',
]);

export function suportaTemperature(modelo: string): boolean {
  return !MODELOS_SEM_TEMPERATURE.has(modelo);
}

export { Anthropic };
