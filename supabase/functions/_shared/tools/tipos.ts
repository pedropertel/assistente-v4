/**
 * tipos — contratos do function calling (extraídos da chat-claude
 * na 3.5.D.6; infra original da 3.I.1).
 *
 * Toda tool nova implementa `ToolDef` e entra no CATALOGO_TOOLS
 * (`./catalogo.ts`). Quais tools estão ATIVAS (e onde) é decisão de
 * config (`configuracoes.ai_tools.*`), não de código — REGRA 12.
 */

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Contexto que a Edge injeta em todo executor de tool. O modelo NUNCA
 * controla esses valores — entidade_id vem do request, ids vêm do fluxo.
 * Defesa contra o modelo "inventar" entidade ou mensagem de origem.
 */
export interface ToolContext {
  supabase: SupabaseClient;
  entidade_id: string | null;
  userMsgId: string;
  agenteId: string;
  // null quando o turn roda sem persona (fallback Assistente) — tools
  // transversais funcionam mesmo assim. Tipo mínimo (`{ id }`) pra não
  // acoplar este módulo ao PersonaRow completo da chat-claude; o
  // PersonaRow satisfaz estruturalmente.
  persona: { id: string } | null;
  requestId: string;
  // 3.H.1: true quando a mensagem veio de ditado por voz no front
  // (flag `origem_voz` no body). Tools de write usam pra preencher
  // origem='voz' + transcricao_original (rastreio do que foi ditado).
  origemVoz: boolean;
  textoOriginal: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Uma tool registrável: spec no formato Anthropic `tools` + executor.
 * O retorno do executor é serializado como JSON no bloco tool_result.
 *
 * 3.H.1: `prepararSpec` opcional gera o spec dinamicamente (ex: enum de
 * categorias vindo do banco, cacheado por isolate). Quando presente,
 * substitui `spec` no payload da Anthropic — `spec.name` continua sendo
 * a identidade da tool no catálogo e no loop.
 */
export interface ToolDef {
  spec: ToolSpec;
  prepararSpec?: (
    supabase: SupabaseClient,
    requestId: string,
  ) => Promise<ToolSpec>;
  executar: (
    input: Record<string, unknown>,
    ctx: ToolContext,
  ) => Promise<Record<string, unknown>>;
}
