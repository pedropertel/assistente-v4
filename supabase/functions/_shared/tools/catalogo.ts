/**
 * catalogo — registro central das tools que a Edge sabe EXECUTAR.
 * Extraído da chat-claude na 3.5.D.6.
 *
 * FILOSOFIA (decisão Pedro, 2026-07-06): tools são capacidades do
 * SISTEMA, não da persona. A persona define o TOM, não o PODER.
 * Tool presa a uma persona cria buraco de UX — persona sem a tool
 * "finge" que executou (validado nos testes da 3.I.3: Marcos e Alemão
 * respondiam "Anotado ✓" sem gravar nada).
 *
 * 3.G.2: QUAIS tools estão ativas (e onde) vem de `configuracoes`:
 * - `ai_tools.transversais`: nomes disponíveis em TODO turn, inclusive
 *   fallback sem persona (custo: ~200 tokens de definition/chamada).
 * - `ai_tools.por_persona`: exceção pra tools com credencial/risco
 *   (ex: tools Meta do Marcos na 3.F) — slug → lista de nomes.
 *
 * O catálogo é o que a Edge sabe EXECUTAR (código não vai pro banco).
 * Config referencia por nome; nome desconhecido na config → warning +
 * ignora (fail-safe, tratado na chat-claude).
 *
 * Tool nova (ex: 3.F Meta): criar `_shared/tools/<nome>.ts` exportando
 * um ToolDef e registrar aqui.
 */

import type { ToolDef } from './tipos.ts';
import { TOOL_SALVAR_IDEIA } from './salvar_ideia.ts';
import { TOOL_LANCAR_CUSTO_SITIO } from './lancar_custo_sitio.ts';

export const CATALOGO_TOOLS: Record<string, ToolDef> = {
  salvar_ideia: TOOL_SALVAR_IDEIA,
  lancar_custo_sitio: TOOL_LANCAR_CUSTO_SITIO,
};
