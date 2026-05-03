/**
 * chat-claude — chamada Anthropic com agente, placeholders e histórico
 * lidos do banco. Memória de curto prazo via messages[] das últimas N
 * mensagens persistidas na mesma entidade.
 *
 * Escopo da 3.C (consolidado):
 *   - Recebe { texto: string, entidade_id?: uuid } no body.
 *   - Lê o agente 'assistente' do banco (prompt_base, modelo, temperatura,
 *     max_tokens). Cache em variável de módulo do isolate (cold-start
 *     refresca; TODO 4.x: cache_version pra invalidação ativa).
 *   - INSERT user antes da chamada Anthropic.
 *   - Substitui placeholders {usuario}, {data_hora}, {entidade_atual},
 *     {persona_ativa} no prompt_base. Chave desconhecida vira string vazia
 *     + log warning chat-claude.placeholder_orfao (observabilidade).
 *   - Busca últimas 20 mensagens da mesma entidade (papel != 'system' AND
 *     erro IS NULL AND id != userMsgId), ordem cronológica.
 *   - Chama Anthropic com agente.modelo / temperatura / max_tokens, system
 *     processado, e messages: [...historico, {role:'user', content:texto}].
 *   - INSERT assistant depois (com métricas + mensagem_pai_id).
 *   - Em erro Anthropic: INSERT assistant com `erro` preenchido (preserva
 *     cadeia + filtro de histórico ignora estes na próxima chamada).
 *   - Devolve texto + métricas (modelo, tokens, custo USD/BRL, latência).
 *
 * Custo estimado por chamada: ~R$ 0.005-0.010 (Haiku 4.5: $1/M input,
 *   $5/M output. Prompt_base ~4500 chars + histórico variável → ~700-1500
 *   tokens input por chamada típica).
 *
 * Tratamento de erro:
 *   - 400 input inválido (texto vazio, payload mal formado, entidade_id
 *     não-UUID, BadRequestError da Anthropic).
 *   - 429 rate limit Anthropic.
 *   - 503 Anthropic 5xx (degradado).
 *   - 500 auth fail (key inválida — crítico, log com detalhes).
 *   - 500 persistence_failure (INSERT user falhou — não chama Anthropic).
 *   - 500 genérico inclui caso 'agente não encontrado/inativo' (REGRA 12:
 *     se Pedro deletou ou desativou o seed, fail-fast e mensagem educativa
 *     no log — sem fallback hardcoded silencioso).
 *   - Warnings não-bloqueantes: chat-claude.placeholder_orfao (typo no
 *     prompt_base) e chat-claude.historico_fail (query do histórico falhou,
 *     mas chamada prossegue sem contexto).
 *   - Detalhes vão pro logger estruturado, NUNCA pro response body.
 *
 * Atomicidade:
 *   - SEM transação (decisão #8 do plan file). INSERT user vai antes;
 *     se Anthropic explodir entre INSERTs, mensagem do user vira "órfã"
 *     (sem assistant). Aceitável: Pedro vê sua mensagem, manda de novo.
 *     Cadeia preservada via mensagem_pai_id.
 *
 * Fora de escopo desta Edge:
 *   - Roteador / personas (3.D)
 *   - Tools / function calling (3.F)
 *   - Streaming SSE (3.E)
 *   - Resolução de nome real da entidade no placeholder (3.D)
 *   - Cotação USD→BRL real (3.G.1 — hoje fixa em 5.0)
 *   - historico_max_mensagens em configuracoes (3.G.2 — hoje hardcoded em 20)
 */

import {
  getCorsHeaders,
  handleCorsPreflightRequest,
} from '../_shared/cors.ts';
import {
  generateRequestId,
  logError,
  logInfo,
  logWarn,
} from '../_shared/logger.ts';
import {
  Anthropic,
  calcCustoUSD,
  getAnthropicClient,
} from '../_shared/anthropic.ts';
import { getSupabaseAdmin } from '../_shared/supabase-admin.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// Cotação fixa pra cálculo de custo BRL.
// TODO 3.G.1: substituir por cotação real via awesomeapi.com.br/json/USD-BRL.
const COTACAO_USD_BRL = 5.0;

// Janela de contexto enviada à Anthropic (últimas N mensagens da entidade).
// TODO 3.G.2: ler de configuracoes.ai_defaults.historico_max_mensagens
// (decisão #7 do plan file aprovada — fica em 20 fixas até a 3.G.2 migrar).
const MAX_HISTORICO = 20;

function jsonResponse(
  req: Request,
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'application/json',
    },
  });
}

// Validação leve de UUID (sem depender de lib).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Linha do banco da tabela `agentes` (campos que a Edge usa).
// `temperatura` chega como string porque PG numeric vira string em JSON
// (cast pra Number antes de passar pro SDK Anthropic — ver chamada).
interface AgenteRow {
  id: string;
  prompt_base: string;
  modelo: string;
  temperatura: string;
  max_tokens: number;
}

// Cache do agente assistente — primeiro request por isolate faz lookup,
// próximos reusam. Custo: 1 query extra a cada cold-start.
// TODO 4.x: invalidação via cache_version ou updated_at em agentes
// quando UI de edição existir (botão "reload" é hacky).
let cachedAgente: AgenteRow | null = null;

async function getAgenteAssistente(supabase: SupabaseClient): Promise<AgenteRow> {
  if (cachedAgente) return cachedAgente;

  const { data, error } = await supabase
    .from('agentes')
    .select('id, prompt_base, modelo, temperatura, max_tokens')
    .eq('slug', 'assistente')
    .eq('ativo', true)
    .single();

  if (error || !data) {
    throw new Error(
      `Agente 'assistente' não encontrado ou inativo. ` +
      `Verifique a tabela agentes (slug='assistente', ativo=true).`,
    );
  }

  cachedAgente = data as AgenteRow;
  return cachedAgente;
}

/**
 * Substitui placeholders `{chave}` no prompt por valores do dict.
 *
 * Comportamento:
 *   - Chaves conhecidas em `values` → substituídas pelo valor.
 *   - Chaves desconhecidas (typo no prompt_base, ex: `{usuario_typo}`) →
 *     substituídas por string vazia (não ficam literais no prompt).
 *
 * Observabilidade:
 *   Faz duplo passe — primeiro substitui, depois detecta o que foi
 *   "órfão" (chave no prompt mas ausente em `values`). Loga warning
 *   estruturado `chat-claude.placeholder_orfao` com a lista deduplicada
 *   pra Pedro ver no Dashboard quando o prompt_base tiver typo. Output
 *   já vem limpo (não polui o prompt enviado à Anthropic).
 *
 * Regex `/\{([a-zA-Z_]+)\}/g` captura snake_case alfabético — alinha
 * com convenção de nomenclatura dos placeholders do projeto.
 */
function substituirPlaceholders(
  prompt: string,
  values: Record<string, string>,
  requestId: string,
): string {
  const processado = prompt.replace(
    /\{([a-zA-Z_]+)\}/g,
    (_, key) => values[key] ?? '',
  );

  // Segundo passe: detecta órfãos (chaves no prompt ausentes do dict).
  // Set deduplica caso o mesmo typo apareça N vezes no prompt.
  const orfaos = [
    ...new Set(
      [...prompt.matchAll(/\{([a-zA-Z_]+)\}/g)]
        .map((m) => m[1])
        .filter((k) => !(k in values)),
    ),
  ];

  if (orfaos.length > 0) {
    logWarn('chat-claude.placeholder_orfao', {
      request_id: requestId,
      chaves_orfas: orfaos,
    });
  }

  return processado;
}

/**
 * Formata data/hora atual em Brasília no formato pt-BR longo.
 * Ex: "2 de maio de 2026 às 21:30".
 *
 * Usa Intl.DateTimeFormat com timeZone explícito — não depende
 * do timezone do servidor (Edge pode rodar em qualquer região).
 */
function formatarDataHoraBrasilia(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date());
}

/**
 * Busca últimas N mensagens da mesma entidade pra construir messages[]
 * da Anthropic — IA ganha memória de curto prazo (contexto da conversa).
 *
 * Filtros:
 *   - papel != 'system' (mensagens do roteador interno entram só na 3.D)
 *   - erro IS NULL (mensagens de erro poluem contexto da IA)
 *   - id != exceto_id (exclui a mensagem user atual já INSERTed antes
 *     da chamada — senão apareceria 2× no array)
 *   - mesma entidade do request (entidade_id NULL pra chat geral, ou UUID
 *     pra entidade específica). Conversas de empresas diferentes não se
 *     misturam.
 *
 * Ordem: ORDER BY created_at DESC LIMIT N (mais barato em tabela grande)
 * + reverse() no JS pra cronológico (Anthropic espera oldest first).
 *
 * Falha graciosa: se a query falhar, loga warning estruturado e retorna
 * array vazio — chamada Anthropic prossegue sem contexto. Pedro vê
 * resposta genérica em vez de erro 500.
 */
async function buscarHistoricoMensagens(
  supabase: SupabaseClient,
  entidade_id: string | null,
  exceto_id: string,
  requestId: string,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  let q = supabase
    .from('chat_mensagens')
    .select('papel, conteudo')
    .neq('papel', 'system')
    .is('erro', null)
    .neq('id', exceto_id)
    .order('created_at', { ascending: false })
    .limit(MAX_HISTORICO);

  q = entidade_id === null
    ? q.is('entidade_id', null)
    : q.eq('entidade_id', entidade_id);

  const { data, error } = await q;
  if (error) {
    logWarn('chat-claude.historico_fail', {
      request_id: requestId,
      exceto_id,
    });
    return [];
  }

  return (data || [])
    .reverse()
    .map((m) => ({
      role: m.papel as 'user' | 'assistant',
      content: m.conteudo,
    }));
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const request_id = generateRequestId();

  try {
    // ───────────────────────── parse + validate ─────────────────────────
    let body: { texto?: unknown; entidade_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse(req, 400, {
        ok: false,
        error: 'invalid_input',
        message: 'Body precisa ser JSON válido.',
        request_id,
      });
    }

    const texto = typeof body?.texto === 'string' ? body.texto.trim() : '';
    if (!texto) {
      return jsonResponse(req, 400, {
        ok: false,
        error: 'invalid_input',
        message: 'texto é obrigatório e não pode ser vazio.',
        request_id,
      });
    }

    let entidade_id: string | null = null;
    if (body?.entidade_id !== undefined && body?.entidade_id !== null) {
      if (typeof body.entidade_id !== 'string' || !UUID_RE.test(body.entidade_id)) {
        return jsonResponse(req, 400, {
          ok: false,
          error: 'invalid_input',
          message: 'entidade_id precisa ser UUID válido.',
          request_id,
        });
      }
      entidade_id = body.entidade_id;
    }

    logInfo('chat-claude.start', {
      request_id,
      has_entidade: entidade_id !== null,
    });
    // NOTA: NÃO loga texto — pode conter dados sensíveis.

    // ──────────── Setup Supabase + lookup agente ────────────
    const supabase = getSupabaseAdmin();
    const agente = await getAgenteAssistente(supabase);

    // ──────────── Substituição de placeholders no prompt ────────────
    // TODO 3.D: resolver entidade_atual pra nome real (SELECT em entidades
    // pelo entidade_id) quando seletor de entidade entrar na UI.
    // TODO multi-user (fora do roadmap): lookup do nome do user via session.
    const promptProcessado = substituirPlaceholders(
      agente.prompt_base,
      {
        usuario: 'Pedro Pertel',
        data_hora: formatarDataHoraBrasilia(),
        entidade_atual: entidade_id ? '(entidade ativa)' : '(geral)',
        persona_ativa: '',
      },
      request_id,
    );

    // ──────────── INSERT user ANTES da Anthropic ────────────
    const { data: userMsg, error: errUser } = await supabase
      .from('chat_mensagens')
      .insert({
        papel: 'user',
        conteudo: texto,
        entidade_id,
        agente_id: agente.id,
      })
      .select('id')
      .single();

    if (errUser || !userMsg) {
      logError('chat-claude.insert_user_fail', { request_id }, errUser);
      return jsonResponse(req, 500, {
        ok: false,
        error: 'persistence_failure',
        message: 'Erro ao registrar mensagem.',
        request_id,
      });
    }

    const userMsgId = userMsg.id as string;

    // ──────────── Busca histórico pra dar contexto à IA ────────────
    // Query roda DEPOIS do INSERT user (exceto_id evita duplicar a msg
    // atual no array). Falha graciosa: array vazio → IA responde sem
    // memória dessa vez (degradação aceitável em vez de 500).
    const historico = await buscarHistoricoMensagens(
      supabase,
      entidade_id,
      userMsgId,
      request_id,
    );

    // ──────────── Chamada Anthropic (try interno) ────────────
    const client = getAnthropicClient();
    const t0 = Date.now();

    let response;
    try {
      response = await client.messages.create({
        model: agente.modelo,
        max_tokens: agente.max_tokens,
        temperature: Number(agente.temperatura),
        system: promptProcessado,
        messages: [
          ...historico,
          { role: 'user', content: texto },
        ],
      });
    } catch (anthropicErr) {
      // INSERT assistant com erro preenchido (preserva cadeia)
      const erroMsg = anthropicErr instanceof Error
        ? anthropicErr.message.slice(0, 500)
        : 'Erro desconhecido na chamada Anthropic';

      const { error: errAssistantErr } = await supabase
        .from('chat_mensagens')
        .insert({
          papel: 'assistant',
          conteudo: '[erro durante chamada]',
          entidade_id,
          agente_id: agente.id,
          modelo_usado: agente.modelo,
          erro: erroMsg,
          mensagem_pai_id: userMsgId,
        });
      if (errAssistantErr) {
        logError('chat-claude.insert_assistant_err_fail', { request_id, userMsgId }, errAssistantErr);
      }

      // re-throw pra cair no catch externo que mapeia HTTP
      throw anthropicErr;
    }

    const latencia_ms = Date.now() - t0;

    // ──────────────────────────── extract ───────────────────────────────
    const firstBlock = response.content[0];
    const conteudo = firstBlock?.type === 'text' ? firstBlock.text : '';
    const tokens_entrada = response.usage.input_tokens;
    const tokens_saida = response.usage.output_tokens;
    const modelo_usado = response.model;
    const custo_usd = calcCustoUSD(modelo_usado, tokens_entrada, tokens_saida);
    const custo_brl = custo_usd * COTACAO_USD_BRL;

    // ──────────── INSERT assistant (sucesso) ────────────
    const { error: errAssistant } = await supabase
      .from('chat_mensagens')
      .insert({
        papel: 'assistant',
        conteudo,
        entidade_id,
        agente_id: agente.id,
        persona_id: null,
        modelo_usado,
        tokens_entrada,
        tokens_saida,
        custo_usd,
        custo_brl,
        latencia_ms,
        mensagem_pai_id: userMsgId,
      });

    if (errAssistant) {
      // Anthropic já respondeu — Pedro merece a resposta. Persistência
      // incompleta vira observabilidade pra debug.
      logError('chat-claude.insert_assistant_fail', { request_id, userMsgId }, errAssistant);
    }

    logInfo('chat-claude.done', {
      request_id,
      modelo_usado,
      tokens_entrada,
      tokens_saida,
      custo_usd,
      latencia_ms,
      user_msg_id: userMsgId,
    });

    return jsonResponse(req, 200, {
      ok: true,
      conteudo,
      modelo_usado,
      tokens_entrada,
      tokens_saida,
      custo_usd,
      custo_brl,
      latencia_ms,
      request_id,
    });
  } catch (err) {
    logError('chat-claude.fail', { request_id }, err);

    // ──────────────────────── mapeia erro Anthropic ─────────────────────
    if (err instanceof Anthropic.RateLimitError) {
      return jsonResponse(req, 429, {
        ok: false,
        error: 'rate_limit',
        message: 'Muitas requisições. Tenta de novo em alguns segundos.',
        request_id,
      });
    }

    if (err instanceof Anthropic.AuthenticationError) {
      // CRÍTICO: key inválida. Não expõe ao front.
      return jsonResponse(req, 500, {
        ok: false,
        error: 'auth_failure',
        message: 'Erro de configuração interna.',
        request_id,
      });
    }

    if (err instanceof Anthropic.BadRequestError) {
      // Pode ser: JSON inválido pra API, modelo inválido, content
      // policy violation, max_tokens fora do range. Detalhes vão
      // pro logger estruturado via logError() acima.
      return jsonResponse(req, 400, {
        ok: false,
        error: 'invalid_input',
        message: 'Input rejeitado pela API. Tenta reformular ou ver detalhes no log.',
        request_id,
      });
    }

    if (err instanceof Anthropic.APIError) {
      // 5xx Anthropic ou outros erros HTTP do SDK
      const status = typeof err.status === 'number' ? err.status : 500;
      if (status >= 500 && status < 600) {
        return jsonResponse(req, 503, {
          ok: false,
          error: 'anthropic_unavailable',
          message: 'API da Anthropic temporariamente indisponível.',
          request_id,
        });
      }
    }

    return jsonResponse(req, 500, {
      ok: false,
      error: 'internal',
      message: 'Erro inesperado.',
      request_id,
    });
  }
});
