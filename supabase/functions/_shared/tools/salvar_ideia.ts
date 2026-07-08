/**
 * Tool `salvar_ideia` (3.I.2) — Marina captura ideias do Pedro na tabela
 * `ideias`. Extraída da chat-claude na 3.5.D.6 (código idêntico).
 *
 * O modelo controla APENAS o conteúdo da ideia (titulo, conteudo, tags,
 * proxima_acao_sugerida). Campos de rastreio e classificação vêm do
 * contexto da Edge: origem='chat', status='capturada' (workflow começa
 * aqui), entidade_id do request, mensagem_origem_id/agente_id/persona_id
 * do fluxo. Valores conforme CHECKs validados na 3.I.0
 * (`ideias_origem_check`, `ideias_status_check`).
 *
 * Write de baixo risco (soft-delete via status='arquivada') — sem
 * confirmação humana. Confirmação inline entra na 3.F pra writes
 * destrutivos (pausar campanha Meta).
 */

import { logWarn } from '../logger.ts';
import type { ToolDef } from './tipos.ts';

export const TOOL_SALVAR_IDEIA: ToolDef = {
  spec: {
    name: 'salvar_ideia',
    description:
      'Salva uma ideia do Pedro na biblioteca de ideias do sistema. ' +
      'Use quando o Pedro compartilhar uma ideia, insight ou "pensamento ' +
      'pra não esquecer" — mesmo que ele não peça explicitamente pra salvar, ' +
      'se o conteúdo é claramente uma ideia a capturar. Não use pra tarefas ' +
      'ou eventos (isso é outro fluxo).',
    input_schema: {
      type: 'object',
      properties: {
        titulo: {
          type: 'string',
          description: 'Título curto da ideia (máx ~80 chars), em pt-BR.',
        },
        conteudo: {
          type: 'string',
          description:
            'A ideia em si, reescrita de forma clara mas fiel ao que o ' +
            'Pedro disse. Não adicionar opinião própria aqui.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Tags curtas em minúsculas pra busca futura (ex: ["cedtec", ' +
            '"marketing"]). Opcional.',
        },
        proxima_acao_sugerida: {
          type: 'string',
          description:
            'Sugestão de próximo passo concreto, se houver um óbvio. ' +
            'Opcional — ideia precisa maturar antes de virar tarefa.',
        },
      },
      required: ['titulo', 'conteudo'],
    },
  },
  executar: async (input, ctx) => {
    const titulo = typeof input.titulo === 'string' ? input.titulo.trim() : '';
    const conteudo = typeof input.conteudo === 'string'
      ? input.conteudo.trim()
      : '';
    if (!titulo || !conteudo) {
      return {
        erro: 'titulo e conteudo são obrigatórios e não podem ser vazios.',
      };
    }

    // Sanitiza tags: só strings não-vazias, minúsculas, sem duplicata.
    const tags = Array.isArray(input.tags)
      ? [
        ...new Set(
          input.tags
            .filter((t): t is string => typeof t === 'string')
            .map((t) => t.trim().toLowerCase())
            .filter((t) => t.length > 0),
        ),
      ]
      : [];

    const proximaAcao = typeof input.proxima_acao_sugerida === 'string' &&
        input.proxima_acao_sugerida.trim().length > 0
      ? input.proxima_acao_sugerida.trim()
      : null;

    const { data, error } = await ctx.supabase
      .from('ideias')
      .insert({
        titulo,
        conteudo,
        tags,
        proxima_acao_sugerida: proximaAcao,
        entidade_id: ctx.entidade_id,
        origem: ctx.origemVoz ? 'voz' : 'chat',
        transcricao_original: ctx.origemVoz ? ctx.textoOriginal : null,
        status: 'capturada',
        mensagem_origem_id: ctx.userMsgId,
        agente_id: ctx.agenteId,
        persona_id: ctx.persona?.id ?? null,
      })
      .select('id, titulo')
      .single();

    if (error || !data) {
      // Mensagem vai pro modelo via tool_result (is_error) — ele explica
      // ao Pedro que não conseguiu salvar. Detalhe técnico só no log.
      logWarn('chat-claude.salvar_ideia_fail', {
        request_id: ctx.requestId,
        pg_code: error?.code ?? null,
      });
      return { erro: 'Falha ao salvar a ideia no banco. Tenta de novo.' };
    }

    return {
      sucesso: true,
      ideia_id: data.id,
      titulo: data.titulo,
      mensagem_pro_modelo:
        'Ideia salva. Confirme ao Pedro em 1 frase e, se proxima_acao_sugerida ' +
        'foi preenchida, mencione a sugestão sem pressionar.',
    };
  },
};
