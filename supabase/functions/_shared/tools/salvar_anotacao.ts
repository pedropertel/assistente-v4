/**
 * Tool `salvar_anotacao` (4.E.2) — Bloco de Notas do Pedro. Salva
 * anotações em Markdown na tabela `anotacoes`, tipicamente a partir de
 * uma resposta da conversa ("transforma essa resposta em uma anotação
 * com título X") ou de um pedido direto ("anota isso").
 *
 * Diferença pra `salvar_ideia` (Marina): ideia é INSIGHT a maturar
 * (workflow capturada→refinada); anotação é REGISTRO pronto pra
 * consultar (referência, lista, resumo). A description orienta o modelo
 * a distinguir.
 *
 * O modelo controla titulo + conteudo (markdown na íntegra — a aba
 * Notas renderiza com js/core/markdown.js). Rastreio vem do ctx:
 * entidade_id do request, origem chat/voz, mensagem_origem_id etc.
 * Write de baixo risco (soft-delete via arquivada) — sem confirmação.
 */

import { logWarn } from '../logger.ts';
import type { ToolDef } from './tipos.ts';

export const TOOL_SALVAR_ANOTACAO: ToolDef = {
  spec: {
    name: 'salvar_anotacao',
    description:
      'Salva uma anotação no bloco de notas do Pedro. Use quando ele ' +
      'pedir pra anotar, salvar ou transformar algo em anotação (ex: ' +
      '"transforma essa resposta em uma anotação com título X", "anota ' +
      'essa lista pra mim", "salva isso nas notas"). Quando ele pedir pra ' +
      'transformar UMA RESPOSTA da conversa, reproduza o conteúdo dela na ' +
      'íntegra (pode limpar saudações/perguntas finais). NÃO use pra ' +
      'ideias a maturar (salvar_ideia), tarefas ou eventos.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: {
          type: 'string',
          description:
            'Título da anotação. Se o Pedro deu um ("com título X"), use ' +
            'EXATAMENTE o que ele deu; senão, crie um curto e descritivo.',
        },
        copiar_resposta_anterior: {
          type: 'boolean',
          description:
            'Use true quando o Pedro pedir pra salvar/transformar A ' +
            'RESPOSTA ANTERIOR da conversa ("essa resposta", "isso que ' +
            'você escreveu"). O sistema copia o texto na ÍNTEGRA direto ' +
            'do banco — zero risco de resumir. Nesse caso NÃO envie ' +
            'conteudo.',
        },
        conteudo: {
          type: 'string',
          description:
            'Conteúdo em Markdown — APENAS quando não for cópia da ' +
            'resposta anterior (ex: "anota que o portão é código 4321"). ' +
            'Fiel ao que o Pedro pediu — NUNCA resuma nem encurte.',
        },
      },
      required: ['titulo'],
    },
  },
  executar: async (input, ctx) => {
    const titulo = typeof input.titulo === 'string' ? input.titulo.trim() : '';
    if (!titulo) {
      return { erro: 'titulo é obrigatório.' };
    }

    let conteudo = typeof input.conteudo === 'string'
      ? input.conteudo.trim()
      : '';

    // Fidelidade garantida por CÓDIGO (achado do Pedro, 4.E.2 fix):
    // Haiku resumia a resposta mesmo com instrução de copiar na íntegra.
    // Com o flag, buscamos a última resposta assistant da conversa direto
    // do banco — a nota fica idêntica, palavra por palavra.
    if (input.copiar_resposta_anterior === true) {
      let q = ctx.supabase
        .from('chat_mensagens')
        .select('conteudo')
        .eq('papel', 'assistant')
        .eq('arquivada', false)
        .is('erro', null)
        .order('created_at', { ascending: false })
        .limit(1);
      q = ctx.entidade_id === null
        ? q.is('entidade_id', null)
        : q.eq('entidade_id', ctx.entidade_id);
      const { data: ultima, error: errUltima } = await q.single();
      if (errUltima || !ultima?.conteudo) {
        return {
          erro: 'Não achei a resposta anterior desta conversa pra copiar.',
        };
      }
      conteudo = ultima.conteudo as string;
    }

    if (!conteudo) {
      return {
        erro: 'conteudo é obrigatório quando não é cópia da resposta anterior.',
      };
    }

    const { data, error } = await ctx.supabase
      .from('anotacoes')
      .insert({
        titulo,
        conteudo,
        entidade_id: ctx.entidade_id,
        origem: ctx.origemVoz ? 'voz' : 'chat',
        transcricao_original: ctx.origemVoz ? ctx.textoOriginal : null,
        mensagem_origem_id: ctx.userMsgId,
        agente_id: ctx.agenteId,
        persona_id: ctx.persona?.id ?? null,
      })
      .select('id, titulo')
      .single();

    if (error || !data) {
      logWarn('chat-claude.salvar_anotacao_fail', {
        request_id: ctx.requestId,
        pg_code: error?.code ?? null,
      });
      return { erro: 'Falha ao salvar a anotação. Tenta de novo.' };
    }

    return {
      sucesso: true,
      anotacao_id: data.id,
      titulo: data.titulo,
      mensagem_pro_modelo:
        'Anotação salva no bloco de notas. Confirme ao Pedro em 1 frase ' +
        'citando o título. Não repita o conteúdo inteiro de volta.',
    };
  },
};
