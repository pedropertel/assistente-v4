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
 *   - Apenas Haiku 4.5 mapeado nesta versão.
 *   - Sonnet/Opus entram na 3.D quando router for ativado, com
 *     pricing validado naquele momento.
 *   - calcCustoUSD retorna 0 + log warning se modelo não mapeado
 *     (defesa: nunca cobra valor errado).
 *
 * Timeout:
 *   - 60s no SDK. Anthropic tipicamente responde Haiku em 800ms-2s,
 *     mas defesa pra picos.
 *
 * TODO 3.G.2: migrar MODEL_PRICING pra configuracoes.ai_defaults.
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

// Preços USD por 1M tokens. Validado 2026-05-02 via doc oficial Anthropic.
// Apenas Haiku na 3.B — Sonnet/Opus entram na 3.D quando router for ativado.
// TODO 3.G.2: migrar pra `configuracoes.ai_defaults.precos_modelos`.
export const MODEL_PRICING = {
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 },
} as const;

export function calcCustoUSD(
  modelo: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const p = MODEL_PRICING[modelo as keyof typeof MODEL_PRICING];
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
  return (tokensIn / 1_000_000) * p.input
       + (tokensOut / 1_000_000) * p.output;
}

export { Anthropic };
