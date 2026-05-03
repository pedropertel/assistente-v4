/**
 * chat-claude — chamada Anthropic (Haiku 4.5) com persistência em chat_mensagens.
 *
 * Escopo da 3.B.2:
 *   - Recebe { texto: string, entidade_id?: uuid } no body.
 *   - INSERT user antes da chamada Anthropic.
 *   - Chama Haiku 4.5 com prompt fixo "responde curto" e max_tokens 1024.
 *   - INSERT assistant depois (com métricas + mensagem_pai_id).
 *   - Em erro Anthropic: INSERT assistant com `erro` preenchido (preserva cadeia).
 *   - Devolve texto + métricas (modelo, tokens, custo USD/BRL, latência).
 *   - SEM persona, SEM router, SEM streaming.
 *
 * Custo estimado por chamada: ~R$ 0.001 (Haiku 4.5: $1/M input, $5/M output).
 *
 * Tratamento de erro:
 *   - 400 input inválido (texto vazio, payload mal formado).
 *   - 429 rate limit Anthropic.
 *   - 503 Anthropic 5xx (degradado).
 *   - 500 auth fail (key inválida — crítico, log com detalhes).
 *   - 500 persistence_failure (INSERT user falhou — não chama Anthropic).
 *   - 500 genérico (catch-all).
 *   - Detalhes vão pro logger estruturado, NUNCA pro response body.
 *
 * Atomicidade:
 *   - SEM transação (decisão #8 do plan file). INSERT user vai antes;
 *     se Anthropic explodir entre INSERTs, mensagem do user vira "órfã"
 *     (sem assistant). Aceitável: Pedro vê sua mensagem, manda de novo.
 *     Cadeia preservada via mensagem_pai_id.
 */

import {
  getCorsHeaders,
  handleCorsPreflightRequest,
} from '../_shared/cors.ts';
import {
  generateRequestId,
  logError,
  logInfo,
} from '../_shared/logger.ts';
import {
  Anthropic,
  calcCustoUSD,
  getAnthropicClient,
} from '../_shared/anthropic.ts';
import { getSupabaseAdmin } from '../_shared/supabase-admin.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const HARDCODED_PROMPT =
  'Você é o Assistente do Pedro Pertel. Responda de forma curta e direta — esta é uma versão de teste do sistema (Tarefa 3.B).';

const MODELO = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;
const TEMPERATURE = 0.7;

// Cotação fixa pra cálculo de custo BRL.
// TODO 3.G.1: substituir por cotação real via awesomeapi.com.br/json/USD-BRL.
const COTACAO_USD_BRL = 5.0;

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

// Cache do agente assistente — primeiro request por isolate faz lookup,
// próximos reusam. Custo: 1 query extra a cada cold-start.
let cachedAgenteId: string | null = null;

async function getAgenteAssistenteId(supabase: SupabaseClient): Promise<string> {
  if (cachedAgenteId) return cachedAgenteId;

  const { data, error } = await supabase
    .from('agentes')
    .select('id')
    .eq('slug', 'assistente')
    .single();

  if (error || !data) {
    throw new Error(
      `Agente 'assistente' não encontrado em agentes table: ${error?.message ?? 'no row'}`,
    );
  }

  cachedAgenteId = data.id as string;
  return cachedAgenteId;
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
    const agenteId = await getAgenteAssistenteId(supabase);

    // ──────────── INSERT user ANTES da Anthropic ────────────
    const { data: userMsg, error: errUser } = await supabase
      .from('chat_mensagens')
      .insert({
        papel: 'user',
        conteudo: texto,
        entidade_id,
        agente_id: agenteId,
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

    // ──────────── Chamada Anthropic (try interno) ────────────
    const client = getAnthropicClient();
    const t0 = Date.now();

    let response;
    try {
      response = await client.messages.create({
        model: MODELO,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: HARDCODED_PROMPT,
        messages: [{ role: 'user', content: texto }],
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
          agente_id: agenteId,
          modelo_usado: MODELO,
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
        agente_id: agenteId,
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
