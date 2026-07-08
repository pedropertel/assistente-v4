/**
 * Tool `lancar_custo_sitio` (3.H.1) — Alemão registra entradas/saídas
 * do Sítio Monte da Vitória em `sitio_lancamentos`, tipicamente por voz.
 * Extraída da chat-claude na 3.5.D.6 (código idêntico).
 *
 * - Spec DINÂMICO (`prepararSpec`): enum de categorias vem do banco
 *   (dedupli­cado por nome — existem 2 "Outros" em saída, achado 3.H.0;
 *   resolução nome→id prefere a categoria do tipo do lançamento).
 * - Valores chegam em REAIS do modelo e viram centavos aqui (CHECK > 0).
 * - `data` opcional YYYY-MM-DD (modelo resolve "ontem" via {data_hora});
 *   default hoje em Brasília.
 * - `entidade_id` é resolvido por slug='sitio' (NOT NULL na tabela e o
 *   chat geral manda entidade nula).
 * - Retorno instrui o modelo a ECOAR o resumo por extenso (melhoria 1
 *   aprovada — defesa contra transcrição de voz errada virar registro
 *   silenciosamente errado). Correção = arquivar pela tela (Fase 4).
 */

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { logWarn } from '../logger.ts';
import type { ToolDef } from './tipos.ts';

// Caches de isolate pro sítio: entidade (id fixo) e categorias
// (nome/tipo/id — alimentam o enum dinâmico do spec e a resolução
// nome→id no executor). Cold-restart refresca; TODO 4.x invalidação.
let cachedEntidadeSitioId: string | null = null;
let cachedCategoriasSitio:
  | Array<{ id: string; nome: string; tipo: string }>
  | null = null;

async function getEntidadeSitioId(
  supabase: SupabaseClient,
): Promise<string | null> {
  if (cachedEntidadeSitioId) return cachedEntidadeSitioId;
  const { data } = await supabase
    .from('entidades')
    .select('id')
    .eq('slug', 'sitio')
    .single();
  // C1: só cacheia se achou de verdade (não cacheia null de falha).
  if (data?.id) cachedEntidadeSitioId = data.id as string;
  return (data?.id as string) ?? null;
}

async function getCategoriasSitio(
  supabase: SupabaseClient,
): Promise<Array<{ id: string; nome: string; tipo: string }>> {
  if (cachedCategoriasSitio) return cachedCategoriasSitio;
  const { data, error } = await supabase
    .from('sitio_categorias')
    .select('id, nome, tipo')
    .neq('ativa', false)
    .order('nome');
  // C1: NÃO cachear falha/vazio (senão a tool do sítio fica quebrada até o
  // isolate reciclar — enum vazio no spec vira 400 ou "categoria não existe"
  // em toda mensagem). Retorna sem cachear; próximo request tenta de novo.
  if (error || !data || data.length === 0) return [];
  cachedCategoriasSitio = data as Array<{ id: string; nome: string; tipo: string }>;
  return cachedCategoriasSitio;
}

/** Data de hoje em Brasília no formato YYYY-MM-DD (coluna é date). */
function hojeBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
}

const FORMAS_PAGAMENTO = ['pix', 'dinheiro', 'transferencia', 'cartao', 'boleto'];

export const TOOL_LANCAR_CUSTO_SITIO: ToolDef = {
  spec: {
    name: 'lancar_custo_sitio',
    description:
      'Registra um lançamento financeiro (entrada ou saída) do Sítio ' +
      'Monte da Vitória. Use quando o Pedro relatar um gasto, compra, ' +
      'pagamento ou receita do sítio (ex: "paguei 350 de diarista", ' +
      '"comprei 10 sacos de adubo a 85 cada", "vendi 20 sacas de café"). ' +
      'Não use pra gastos das outras empresas.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  prepararSpec: async (supabase, _requestId) => {
    const categorias = await getCategoriasSitio(supabase);
    const nomes = [...new Set(categorias.map((c) => c.nome))];
    // C1: se a lista vier vazia (falha transitória), NÃO manda `enum: []`
    // (schema inválido → Anthropic rejeita a chamada inteira com 400).
    // Omite o enum: vira string livre; o executor valida contra o banco.
    const campoCategoria = nomes.length > 0
      ? {
        type: 'string',
        enum: nomes,
        description: 'Categoria do lançamento (lista oficial do sítio).',
      }
      : {
        type: 'string',
        description: 'Categoria do lançamento (validada no banco ao gravar).',
      };
    return {
      name: 'lancar_custo_sitio',
      description: TOOL_LANCAR_CUSTO_SITIO.spec.description,
      input_schema: {
        type: 'object',
        properties: {
          tipo: {
            type: 'string',
            enum: ['entrada', 'saida'],
            description: 'saida = gasto/pagamento; entrada = receita/venda.',
          },
          categoria: campoCategoria,
          descricao: {
            type: 'string',
            description: 'Descrição curta e fiel ao que o Pedro disse.',
          },
          valor_reais: {
            type: 'number',
            description: 'Valor TOTAL em reais (ex: 350 ou 89.90).',
          },
          forma_pagamento: {
            type: 'string',
            enum: FORMAS_PAGAMENTO,
            description: 'Se o Pedro não disser, pergunte antes de lançar.',
          },
          data: {
            type: 'string',
            description:
              'YYYY-MM-DD. Só preencha se o Pedro indicar outra data ' +
              '("ontem", "sábado"); ausente = hoje.',
          },
          quantidade: {
            type: 'number',
            description: 'Opcional (ex: 10 sacos → 10).',
          },
          unidade: {
            type: 'string',
            description: 'Opcional (saco, kg, saca, litro, diária...).',
          },
          valor_unitario_reais: {
            type: 'number',
            description: 'Opcional: valor unitário em reais (ex: 85).',
          },
          fornecedor: {
            type: 'string',
            description: 'Opcional: de quem comprou / quem recebeu.',
          },
        },
        required: ['tipo', 'categoria', 'descricao', 'valor_reais', 'forma_pagamento'],
      },
    };
  },
  executar: async (input, ctx) => {
    const tipo = input.tipo === 'entrada' ? 'entrada' : 'saida';
    const descricao = typeof input.descricao === 'string'
      ? input.descricao.trim()
      : '';
    const valorReais = Number(input.valor_reais);
    const formaPagamento = typeof input.forma_pagamento === 'string'
      ? input.forma_pagamento
      : '';

    if (!descricao || !Number.isFinite(valorReais) || valorReais <= 0) {
      return { erro: 'descricao e valor_reais (> 0) são obrigatórios.' };
    }
    if (!FORMAS_PAGAMENTO.includes(formaPagamento)) {
      return {
        erro: `forma_pagamento inválida. Aceitas: ${FORMAS_PAGAMENTO.join(', ')}.`,
      };
    }

    const entidadeSitioId = await getEntidadeSitioId(ctx.supabase);
    if (!entidadeSitioId) {
      return { erro: "Entidade 'sitio' não encontrada no banco." };
    }

    // Resolve categoria por nome (case-insensitive), preferindo a do
    // tipo do lançamento (há nomes duplicados entre/no mesmo tipo).
    const categorias = await getCategoriasSitio(ctx.supabase);
    const nomeBuscado = typeof input.categoria === 'string'
      ? input.categoria.trim().toLowerCase()
      : '';
    const candidatas = categorias.filter(
      (c) => c.nome.toLowerCase() === nomeBuscado,
    );
    const categoria = candidatas.find((c) => c.tipo === tipo) ?? candidatas[0];
    if (!categoria) {
      const validas = [...new Set(
        categorias.filter((c) => c.tipo === tipo).map((c) => c.nome),
      )].join(', ');
      return {
        erro: `Categoria '${input.categoria}' não existe. ` +
          `Válidas pra ${tipo}: ${validas}.`,
      };
    }

    // Data: validação leve; inválida/ausente = hoje em Brasília.
    const data = typeof input.data === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(input.data)
      ? input.data
      : hojeBrasilia();

    const quantidade = Number.isFinite(Number(input.quantidade)) &&
        Number(input.quantidade) > 0
      ? Number(input.quantidade)
      : null;
    const unidade = typeof input.unidade === 'string' &&
        input.unidade.trim().length > 0
      ? input.unidade.trim()
      : null;
    const valorUnitarioReais = Number(input.valor_unitario_reais);
    const valorUnitarioCentavos = Number.isFinite(valorUnitarioReais) &&
        valorUnitarioReais > 0
      ? Math.round(valorUnitarioReais * 100)
      : null;
    const fornecedor = typeof input.fornecedor === 'string' &&
        input.fornecedor.trim().length > 0
      ? input.fornecedor.trim()
      : null;

    const { data: row, error } = await ctx.supabase
      .from('sitio_lancamentos')
      .insert({
        entidade_id: entidadeSitioId,
        categoria_id: categoria.id,
        tipo,
        data_lancamento: data,
        descricao,
        valor_centavos: Math.round(valorReais * 100),
        quantidade,
        unidade,
        valor_unitario_centavos: valorUnitarioCentavos,
        forma_pagamento: formaPagamento,
        fornecedor,
        origem: ctx.origemVoz ? 'voz' : 'chat',
        transcricao_original: ctx.origemVoz ? ctx.textoOriginal : null,
        mensagem_origem_id: ctx.userMsgId,
        agente_id: ctx.agenteId,
        persona_id: ctx.persona?.id ?? null,
      })
      .select('id')
      .single();

    if (error || !row) {
      logWarn('chat-claude.lancar_custo_sitio_fail', {
        request_id: ctx.requestId,
        pg_code: error?.code ?? null,
      });
      return { erro: 'Falha ao gravar o lançamento. Tenta de novo.' };
    }

    const valorFmt = (valorReais).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
    const resumo = [
      tipo === 'saida' ? 'Saída' : 'Entrada',
      valorFmt,
      categoria.nome,
      data,
      formaPagamento,
      quantidade && unidade ? `${quantidade} ${unidade}` : null,
      fornecedor,
    ].filter(Boolean).join(' · ');

    return {
      sucesso: true,
      lancamento_id: row.id,
      resumo,
      mensagem_pro_modelo:
        'Lançamento gravado. ECOE o resumo por extenso pro Pedro conferir ' +
        '(valor, categoria, data, forma de pagamento) e diga que se algo ' +
        'estiver errado é só avisar que arquiva. Não invente dados.',
    };
  },
};
