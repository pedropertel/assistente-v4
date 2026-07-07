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
 * Function calling (3.I.1):
 *   - Loop genérico de tools: o payload ganha `tools` conforme o que
 *     está ativo em configuracoes.ai_tools.* (resolvido contra o
 *     CATALOGO_TOOLS da Edge), e a Edge executa blocos tool_use
 *     devolvendo tool_result, até MAX_VOLTAS_TOOLS. Blocos executados
 *     vão pra observabilidade em chat_mensagens.tool_calls /
 *     tool_results (colunas da 3.F.0.5).
 *   - Erro de executor NÃO derruba o request — vira tool_result com
 *     is_error, modelo responde explicando.
 *   - 3.I.2: tool `salvar_ideia` (INSERT em `ideias`).
 *   - 3.I.2.1: tools TRANSVERSAIS — salvar_ideia disponível pra toda
 *     persona (e fallback sem persona). Persona define tom, não poder.
 *
 * Streaming SSE (3.E.1):
 *   - `stream: true` no body → resposta `text/event-stream` com eventos:
 *       router — persona/ícone/cor/modelo assim que o Roteador decide
 *                (front mostra chip + "digitando" ~2s antes do 1º token)
 *       delta  — { texto } token-a-token da resposta
 *       tool   — { name, status: executando|ok|erro } durante tools
 *       done   — payload final IDÊNTICO ao JSON do modo sem stream
 *       error  — corpo de erro (mesmo shape do JSON de erro)
 *   - SEM a flag → JSON idêntico à v45 (opt-in; rollback = flag off no
 *     front; curls de teste continuam funcionando).
 *   - Erros de input/setup respondem JSON normal mesmo com stream: true
 *     (acontecem antes do stream abrir). Depois do stream aberto, erro
 *     vira evento `error` — INSERTs de erro no banco continuam iguais.
 *   - Desconexão do cliente NO MEIO do stream não aborta o pipeline:
 *     INSERTs finais rodam até o fim (só paramos de emitir eventos).
 *   - Bônus aprovado: histórico busca em PARALELO com o Roteador
 *     (~300-500ms a menos por mensagem, nos dois modos).
 *   - Nota: texto de voltas intermediárias de tool também streama; o
 *     `conteudo` persistido é só o texto da resposta final (divergência
 *     cosmética aceita — reload do histórico reconcilia).
 *
 * Fora de escopo desta Edge:
 *   - Roteador / personas (3.D)
 *   - Tools do Meta / confirmação humana inline (3.F)
 *   - Resolução de nome real da entidade no placeholder (3.D)
 *
 * Cotação USD→BRL (3.G.1): real via `_shared/cotacao.ts` (cadeia
 * er-api → currency-api CDN; awesomeapi devolve 429 pro IP do
 * Supabase). Cache 1h por isolate, fallback cache velho → 5.0.
 *
 * Configs no banco (3.G.2): mapeamento complexidade→modelo, pricing,
 * modelos sem temperature, janela de histórico e tools ativas vêm de
 * `configuracoes` (REGRA 12 — editável por tela na Fase 4, sem
 * redeploy). Fallbacks hardcoded pra cada chave; NUNCA 500 por config.
 * Cache por isolate via `_shared/config.ts`.
 *
 * Rate limit (3.G.3): máx `ai_limites.msgs_por_minuto` mensagens
 * user/minuto → 429 ANTES de gastar Anthropic (proteção de custo).
 * Fail-open se a contagem falhar.
 *
 * Voz + sítio (3.H.1): flag `origem_voz` no body → tools de write
 * gravam origem='voz' + transcricao_original. Tool `lancar_custo_sitio`
 * (INSERT em sitio_lancamentos) com spec dinâmico: enum de categorias
 * vem do banco (cache isolate). Retorno instrui eco por extenso pro
 * Pedro conferir o que a transcrição de voz virou.
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
  MODEL_PRICING,
  type PrecoModelo,
} from '../_shared/anthropic.ts';
import { getSupabaseAdmin } from '../_shared/supabase-admin.ts';
import { getCotacaoUSDBRL } from '../_shared/cotacao.ts';
import { getConfigs, lerConfig } from '../_shared/config.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// ══════ Valores de comportamento: banco primeiro, hardcode como fallback ══════
// 3.G.2: a fonte da verdade é `configuracoes` (REGRA 12 — Pedro edita
// por tela na Fase 4, sem redeploy). As constantes abaixo são FALLBACK
// fail-safe: chave deletada/ausente → Edge segue de pé + warning no log.

// Fallback de configuracoes.ai_defaults.historico_max_mensagens.
const MAX_HISTORICO = 20;

// Fallback de configuracoes.ai_defaults.modelos_sem_temperature
// (Adaptive Thinking rejeita temperature — validado 3.D.3.2).
const MODELOS_SEM_TEMPERATURE_FALLBACK = ['claude-opus-4-7'];

/**
 * Fallback de configuracoes.ai_defaults.mapeamento_complexidade.
 *
 * - simples:  tarefas curtas, factuais (Marcela, Alemão, fallback sem persona)
 * - medio:    raciocínio moderado (Marcos, Marina)
 * - complexo: análise estratégica e redação importante (Bruno)
 *
 * Conforme `Tabela — personas.md` linhas 112-118.
 */
const MAPA_COMPLEXIDADE_MODELO = {
  simples:  'claude-haiku-4-5-20251001',
  medio:    'claude-sonnet-4-6',
  complexo: 'claude-opus-4-7',
} as const;

type NivelComplexidade = keyof typeof MAPA_COMPLEXIDADE_MODELO;

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

// Linha do banco da tabela `personas` (campos que a Edge usa pro router).
// `entidades_alvo` é `text[]` no PG — vira `string[]` no JS (vazio = transversal,
// conforme convenção `Tabela — personas.md` linhas 259-280).
// `modelo_override` quando preenchido força o modelo, ignorando `nivel_complexidade`.
interface PersonaRow {
  id: string;
  slug: string;
  nome: string;
  contexto: string;
  nivel_complexidade: NivelComplexidade;
  modelo_override: string | null;
  entidades_alvo: string[] | null;
  icone: string | null;
  cor_hex: string | null;
}

// Cache da persona interna 'roteador' (modelo_override='claude-haiku-4-5-20251001').
// Mesmo padrão de cache de isolate. TODO 4.x: invalidação ativa.
let cachedRoteador: PersonaRow | null = null;

// Cache das 5 personas reais (interno=false, ativa=true) indexadas por slug.
// Lookup O(1) por slug em chamarRoteador (lista dinâmica de personas) e na
// fase de aplicar persona escolhida (3.D.3).
let cachedPersonasReais: Map<string, PersonaRow> | null = null;

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
  maxHistorico: number = MAX_HISTORICO,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  let q = supabase
    .from('chat_mensagens')
    .select('papel, conteudo')
    .neq('papel', 'system')
    .is('erro', null)
    .neq('id', exceto_id)
    .order('created_at', { ascending: false })
    .limit(maxHistorico);

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

  const mapped = (data || [])
    .reverse()
    .map((m) => ({
      role: m.papel as 'user' | 'assistant',
      content: m.conteudo,
    }));

  // Defesa contra cadeia user/assistant inválida (3.D.3.1).
  // Quando Anthropic falha, row assistant fica com `erro` preenchido e é
  // filtrada pelo `WHERE erro IS NULL` acima. Sem dedup, isso cria
  // "user órfão" no array → próxima chamada Anthropic rejeita
  // (`messages must alternate between user and assistant`).
  // Dedup mantém o mais novo de roles consecutivas (decisão B do
  // Risco #8 do plan da 3.D — ver Dev Log 3.D.5 pro retrospecto).
  const dedup: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of mapped) {
    if (dedup.length === 0 || dedup[dedup.length - 1].role !== m.role) {
      dedup.push(m);
    } else {
      // Mesma role consecutiva — substitui pela mais nova (m).
      dedup[dedup.length - 1] = m;
    }
  }
  return dedup;
}

/**
 * Busca persona interna 'roteador' do banco (cacheada por isolate).
 * Mesmo padrão de `getAgenteAssistente`.
 *
 * Throw fail-fast se não encontrar — Roteador é peça obrigatória do
 * fluxo da 3.D. REGRA 12: se Pedro deletou ou desativou o seed,
 * mensagem educativa no log (sem fallback hardcoded silencioso).
 */
async function getRoteador(supabase: SupabaseClient): Promise<PersonaRow> {
  if (cachedRoteador) return cachedRoteador;

  const { data, error } = await supabase
    .from('personas')
    .select('id, slug, nome, contexto, nivel_complexidade, modelo_override, entidades_alvo, icone, cor_hex')
    .eq('slug', 'roteador')
    .eq('ativa', true)
    .single();

  if (error || !data) {
    throw new Error(
      `Persona 'roteador' não encontrada ou inativa. ` +
      `Verifique a tabela personas (slug='roteador', ativa=true).`,
    );
  }

  cachedRoteador = data as PersonaRow;
  return cachedRoteador;
}

/**
 * Busca as 5 personas reais (interno=false, ativa=true) e devolve Map
 * indexado por slug. Cacheada por isolate.
 *
 * Lookup O(1) por slug em chamarRoteador (lista dinâmica de personas no
 * user message do Roteador) e na fase de aplicar persona escolhida (3.D.3).
 *
 * Falha graciosa: se query falhar OU retornar 0 rows, retorna Map vazio
 * (cacheado) + log warning. Roteador continua funcionando, só sem opções
 * de persona real (vai chutar persona_slug=null sempre — degradação
 * aceitável vs erro 500).
 */
async function getPersonasReais(
  supabase: SupabaseClient,
  requestId: string,
): Promise<Map<string, PersonaRow>> {
  if (cachedPersonasReais) return cachedPersonasReais;

  const { data, error } = await supabase
    .from('personas')
    .select('id, slug, nome, contexto, nivel_complexidade, modelo_override, entidades_alvo, icone, cor_hex')
    .eq('ativa', true)
    .eq('interno', false)
    .order('slug');

  if (error) {
    logWarn('chat-claude.personas_reais_fail', { request_id: requestId });
    cachedPersonasReais = new Map();
    return cachedPersonasReais;
  }

  const map = new Map<string, PersonaRow>();
  for (const p of (data || [])) {
    map.set(p.slug, p as PersonaRow);
  }
  cachedPersonasReais = map;
  return cachedPersonasReais;
}

/**
 * Decide qual modelo Anthropic usar pra chamada principal:
 *   1. Persona null (Roteador não escolheu ou retornou slug inválido) →
 *      `modeloAgente` (fallback gracioso, IA vira "Assistente genérico"
 *      como na 3.C).
 *   2. Persona com `modelo_override` → usa esse (caso Roteador interno
 *      hoje, mas pode haver outras personas com override no futuro).
 *   3. Senão → mapeia `persona.nivel_complexidade` via `MAPA_COMPLEXIDADE_MODELO`.
 *
 * Função pura — sem I/O, sem cache, sem async. Receber `modeloAgente`
 * em vez de chamar getAgenteAssistente preserva separação de
 * responsabilidades.
 */
function escolherModelo(
  persona: PersonaRow | null,
  modeloAgente: string,
  // 3.G.2: mapa vindo de configuracoes; nível ausente no mapa do banco
  // cai no fallback hardcoded (defesa contra edição incompleta).
  mapa: Record<string, string> = MAPA_COMPLEXIDADE_MODELO,
): string {
  if (!persona) return modeloAgente;
  if (persona.modelo_override) return persona.modelo_override;
  return mapa[persona.nivel_complexidade] ??
    MAPA_COMPLEXIDADE_MODELO[persona.nivel_complexidade];
}

// ══════════════════ Function calling — infra genérica (3.I.1) ══════════════════

/**
 * Contexto que a Edge injeta em todo executor de tool. O modelo NUNCA
 * controla esses valores — entidade_id vem do request, ids vêm do fluxo.
 * Defesa contra o modelo "inventar" entidade ou mensagem de origem.
 */
interface ToolContext {
  supabase: SupabaseClient;
  entidade_id: string | null;
  userMsgId: string;
  agenteId: string;
  // null quando o turn roda sem persona (fallback Assistente) — tools
  // transversais funcionam mesmo assim.
  persona: PersonaRow | null;
  requestId: string;
  // 3.H.1: true quando a mensagem veio de ditado por voz no front
  // (flag `origem_voz` no body). Tools de write usam pra preencher
  // origem='voz' + transcricao_original (rastreio do que foi ditado).
  origemVoz: boolean;
  textoOriginal: string;
}

interface ToolSpec {
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
interface ToolDef {
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

/**
 * Emissor de eventos SSE (3.E.1). null = modo JSON (sem stream).
 */
type EmitSSE = (evento: string, dados: unknown) => void;

/**
 * Tool `salvar_ideia` (3.I.2) — Marina captura ideias do Pedro na tabela
 * `ideias`.
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
const TOOL_SALVAR_IDEIA: ToolDef = {
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

// ──────────── Tool `lancar_custo_sitio` (3.H.1) ────────────

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
  cachedEntidadeSitioId = (data?.id as string) ?? null;
  return cachedEntidadeSitioId;
}

async function getCategoriasSitio(
  supabase: SupabaseClient,
): Promise<Array<{ id: string; nome: string; tipo: string }>> {
  if (cachedCategoriasSitio) return cachedCategoriasSitio;
  const { data } = await supabase
    .from('sitio_categorias')
    .select('id, nome, tipo')
    .neq('ativa', false)
    .order('nome');
  cachedCategoriasSitio = (data ?? []) as Array<
    { id: string; nome: string; tipo: string }
  >;
  return cachedCategoriasSitio;
}

/** Data de hoje em Brasília no formato YYYY-MM-DD (coluna é date). */
function hojeBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
}

const FORMAS_PAGAMENTO = ['pix', 'dinheiro', 'transferencia', 'cartao', 'boleto'];

/**
 * Tool `lancar_custo_sitio` (3.H.1) — Alemão registra entradas/saídas
 * do Sítio Monte da Vitória em `sitio_lancamentos`, tipicamente por voz.
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
const TOOL_LANCAR_CUSTO_SITIO: ToolDef = {
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
          categoria: {
            type: 'string',
            enum: nomes,
            description: 'Categoria do lançamento (lista oficial do sítio).',
          },
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

/**
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
 * O CATÁLOGO abaixo é o que a Edge sabe EXECUTAR (código não vai pro
 * banco). Config referencia por nome; nome desconhecido na config →
 * warning + ignora (fail-safe).
 */
const CATALOGO_TOOLS: Record<string, ToolDef> = {
  salvar_ideia: TOOL_SALVAR_IDEIA,
  lancar_custo_sitio: TOOL_LANCAR_CUSTO_SITIO,
};

// Fallbacks de ai_tools.* (3.I.2.1 + 3.H.1).
const TOOLS_TRANSVERSAIS_FALLBACK = ['salvar_ideia', 'lancar_custo_sitio'];
const TOOLS_POR_PERSONA_FALLBACK: Record<string, string[]> = {};

/**
 * Teto de voltas do loop de tools numa mesma mensagem. Guarda contra
 * modelo que encadeia tool_use sem parar (custo e latência crescem
 * a cada volta). 3 cobre o caso real (1 tool + resposta) com folga.
 */
const MAX_VOLTAS_TOOLS = 3;

/**
 * Decisão do Roteador — JSON estrito esperado da chamada Anthropic Haiku.
 *
 * - persona_slug: 'marcos' | 'bruno' | 'marcela' | 'alemao' | 'marina' | null
 *   (null quando a mensagem não casa com nenhuma persona específica).
 * - nivel_complexidade: mapeia pro modelo via MAPA_COMPLEXIDADE_MODELO.
 * - razao: explicação curta da escolha (debug post-mortem do INSERT system).
 */
interface RoteadorDecisao {
  persona_slug: string | null;
  nivel_complexidade: NivelComplexidade;
  razao: string;
}

const NIVEIS_VALIDOS: ReadonlySet<NivelComplexidade> = new Set([
  'simples',
  'medio',
  'complexo',
]);

/**
 * Parse fail-soft do JSON retornado pelo Roteador.
 *
 * Estratégia em 3 camadas:
 *   1. JSON.parse direto (caso ideal — Roteador respeitou "JSON estrito").
 *   2. Regex extrai primeiro bloco `{...}` da string e tenta parse de novo
 *      (cobre caso "Aqui está o JSON: {...}" — Haiku às vezes adiciona
 *      preâmbulo apesar do prompt explícito).
 *   3. Fallback: `{persona_slug: null, nivel_complexidade: 'simples',
 *      razao: 'fallback: parse falhou'}`. Edge prossegue sem persona.
 *
 * Observabilidade: loga `chat-claude.roteador_parse_fallback` com raw
 * truncado em 200 chars quando cai no fallback. Pedro vê no Dashboard
 * Logs Explorer quando o Roteador estiver retornando JSON sujo
 * consistentemente — sinaliza necessidade de refinar prompt.
 *
 * Função pura — sem I/O, sem cache, sem async.
 */
function parsearJsonRoteador(
  raw: string,
  requestId: string,
): RoteadorDecisao {
  const tentativas = [raw];
  const matchBloco = raw.match(/\{[\s\S]*\}/);
  if (matchBloco) tentativas.push(matchBloco[0]);

  for (const candidato of tentativas) {
    try {
      const parsed = JSON.parse(candidato) as Partial<RoteadorDecisao>;
      const personaSlug = typeof parsed.persona_slug === 'string'
        ? parsed.persona_slug
        : null;
      const nivel = parsed.nivel_complexidade;
      if (typeof nivel === 'string' && NIVEIS_VALIDOS.has(nivel as NivelComplexidade)) {
        return {
          persona_slug: personaSlug,
          nivel_complexidade: nivel as NivelComplexidade,
          razao: typeof parsed.razao === 'string' ? parsed.razao : '(sem razão)',
        };
      }
    } catch {
      // tenta próxima estratégia
    }
  }

  logWarn('chat-claude.roteador_parse_fallback', {
    request_id: requestId,
    raw_truncado: raw.slice(0, 200),
  });
  return {
    persona_slug: null,
    nivel_complexidade: 'simples',
    razao: 'fallback: parse falhou',
  };
}

/**
 * Orquestra a chamada do Roteador (1ª chamada Anthropic, Haiku via
 * `modelo_override`):
 *   1. Carrega Roteador + 5 personas reais (ambos cached por isolate).
 *   2. Constrói lista dinâmica de personas no user message
 *      (`B14` da decisão — resolve gap da Marina sem UPDATE no prompt).
 *   3. Substitui placeholders em `roteador.contexto` (mesmos valores
 *      do prompt principal — `{usuario}`, `{data_hora}`,
 *      `{entidade_atual}`, `{persona_ativa}=''`).
 *   4. Chama Anthropic Haiku 4.5 (`max_tokens=200`, `temperature=0`,
 *      sem histórico — decisão B7).
 *   5. Parse JSON via `parsearJsonRoteador` (fail-soft).
 *   6. INSERT papel='system' com conteúdo=JSON da decisão. Persiste
 *      MESMO em caso de falha da Anthropic ou parse (auditoria).
 *   7. Retorna `{ decisao, systemMsgId, latenciaRouterMs }`.
 *
 * Custo esperado: ~R$ 0.001 por chamada (Haiku ~150 tok in + ~30 tok out).
 * Latência: ~500-800ms warm. Decisão GRAVADA mas não APLICADA na 3.D.2 —
 * chamada principal continua usando agente.modelo. Aplicação na 3.D.3.
 */
async function chamarRoteador(
  client: Anthropic,
  supabase: SupabaseClient,
  texto: string,
  entidade_id: string | null,
  requestId: string,
  userMsgId: string,
  agenteId: string,
  precosModelos: Record<string, PrecoModelo>,
): Promise<{
  decisao: RoteadorDecisao;
  systemMsgId: string | null;
  latenciaRouterMs: number;
}> {
  const roteador = await getRoteador(supabase);
  const personasMap = await getPersonasReais(supabase, requestId);

  // Lista dinâmica (B14) — formato simples: nome + entidades_alvo
  // (transversal quando vazio). Roteador já tem regras detalhadas de
  // QUANDO ativar cada persona no próprio contexto.
  const linhasPersonas: string[] = [];
  for (const persona of personasMap.values()) {
    const ents = persona.entidades_alvo ?? [];
    const sufixo = ents.length === 0
      ? '(transversal)'
      : `(entidades: ${ents.join(', ')})`;
    linhasPersonas.push(`- ${persona.slug} ${sufixo}`);
  }
  const listaDinamica = linhasPersonas.length > 0
    ? `\n\nPERSONAS DISPONÍVEIS:\n${linhasPersonas.join('\n')}`
    : '';

  // System: contexto do Roteador com placeholders substituídos.
  // {persona_ativa}='' porque Roteador é meta — não opera sob outra persona.
  const systemRoteador = substituirPlaceholders(
    roteador.contexto,
    {
      usuario: 'Pedro Pertel',
      data_hora: formatarDataHoraBrasilia(),
      entidade_atual: entidade_id ? '(entidade ativa)' : '(geral)',
      persona_ativa: '',
    },
    requestId,
  );

  // Modelo: override do Roteador (sempre Haiku 4.5). Defesa contra
  // modelo_override NULL no banco (improvável — schema permite mas seed
  // sempre preenche pra Roteador).
  const modeloRoteador = roteador.modelo_override
    ?? 'claude-haiku-4-5-20251001';

  let decisao: RoteadorDecisao;
  let tokens_entrada = 0;
  let tokens_saida = 0;
  let custo_usd = 0;
  let custo_brl = 0;
  let erroRouter: string | null = null;

  const t0 = Date.now();
  try {
    const response = await client.messages.create({
      model: modeloRoteador,
      max_tokens: 200,
      temperature: 0,
      system: systemRoteador,
      messages: [{ role: 'user', content: texto + listaDinamica }],
    });
    const raw = response.content[0]?.type === 'text'
      ? response.content[0].text
      : '';
    decisao = parsearJsonRoteador(raw, requestId);
    tokens_entrada = response.usage.input_tokens;
    tokens_saida = response.usage.output_tokens;
    custo_usd = calcCustoUSD(modeloRoteador, tokens_entrada, tokens_saida, precosModelos);
    custo_brl = custo_usd * (await getCotacaoUSDBRL(requestId));
  } catch (err) {
    erroRouter = err instanceof Error
      ? err.message.slice(0, 500)
      : 'Erro desconhecido na chamada do Roteador';
    logWarn('chat-claude.roteador_call_fail', {
      request_id: requestId,
      erro: erroRouter,
    });
    decisao = {
      persona_slug: null,
      nivel_complexidade: 'simples',
      razao: 'fallback: chamada do Roteador falhou',
    };
  }
  const latenciaRouterMs = Date.now() - t0;

  // INSERT system — mesmo na falha (auditoria). Métricas viram null
  // quando Anthropic call falhou (response não chegou).
  const { data: systemMsg, error: errSystem } = await supabase
    .from('chat_mensagens')
    .insert({
      papel: 'system',
      conteudo: JSON.stringify(decisao, null, 2),
      entidade_id,
      agente_id: agenteId,
      persona_id: roteador.id,
      modelo_usado: modeloRoteador,
      tokens_entrada: tokens_entrada || null,
      tokens_saida: tokens_saida || null,
      custo_usd: custo_usd || null,
      custo_brl: custo_brl || null,
      latencia_ms: latenciaRouterMs,
      mensagem_pai_id: userMsgId,
      erro: erroRouter,
    })
    .select('id')
    .single();

  if (errSystem) {
    // Persistência do system falhou — log mas não bloqueia. Edge segue
    // com a decisão em memória; só perde rastreabilidade dessa row.
    logError('chat-claude.insert_system_fail', { request_id: requestId, userMsgId }, errSystem);
  }

  logInfo('chat-claude.roteador_decision', {
    request_id: requestId,
    persona_slug: decisao.persona_slug,
    nivel_complexidade: decisao.nivel_complexidade,
    latencia_router_ms: latenciaRouterMs,
    tokens_entrada,
    tokens_saida,
    custo_brl,
  });

  return {
    decisao,
    systemMsgId: (systemMsg?.id as string) ?? null,
    latenciaRouterMs,
  };
}

/**
 * Mapeia erro pro corpo/status HTTP (3.E.1 — fatorado do catch antigo
 * pra ser reusado nos dois modos: JSON responde com o status; SSE envia
 * o body como evento `error`, já que o HTTP 200 do stream já foi).
 */
function corpoErro(
  err: unknown,
  request_id: string,
): { status: number; body: Record<string, unknown> } {
  if (err instanceof Anthropic.RateLimitError) {
    return {
      status: 429,
      body: {
        ok: false,
        error: 'rate_limit',
        message: 'Muitas requisições. Tenta de novo em alguns segundos.',
        request_id,
      },
    };
  }

  if (err instanceof Anthropic.AuthenticationError) {
    // CRÍTICO: key inválida. Não expõe ao front.
    return {
      status: 500,
      body: {
        ok: false,
        error: 'auth_failure',
        message: 'Erro de configuração interna.',
        request_id,
      },
    };
  }

  if (err instanceof Anthropic.BadRequestError) {
    // Pode ser: JSON inválido pra API, modelo inválido, content
    // policy violation, max_tokens fora do range. Detalhes vão
    // pro logger estruturado via logError() no caller.
    return {
      status: 400,
      body: {
        ok: false,
        error: 'invalid_input',
        message: 'Input rejeitado pela API. Tenta reformular ou ver detalhes no log.',
        request_id,
      },
    };
  }

  if (err instanceof Anthropic.APIError) {
    // 5xx Anthropic ou outros erros HTTP do SDK
    const status = typeof err.status === 'number' ? err.status : 500;
    if (status >= 500 && status < 600) {
      return {
        status: 503,
        body: {
          ok: false,
          error: 'anthropic_unavailable',
          message: 'API da Anthropic temporariamente indisponível.',
          request_id,
        },
      };
    }
  }

  return {
    status: 500,
    body: {
      ok: false,
      error: 'internal',
      message: 'Erro inesperado.',
      request_id,
    },
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const request_id = generateRequestId();

  // ───────────────────────── parse + validate ─────────────────────────
  // Erros de input respondem JSON normal SEMPRE (mesmo com stream: true) —
  // acontecem antes do stream abrir; o front checa Content-Type do response.
  let body: {
    texto?: unknown;
    entidade_id?: unknown;
    stream?: unknown;
    origem_voz?: unknown;
  };
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

  // 3.E.1: flag opt-in. Ausente/false = JSON idêntico à v45.
  const streamMode = body?.stream === true;

  // 3.H.1: mensagem ditada por voz no front — tools de write gravam
  // origem='voz' + transcricao_original pra rastreio.
  const origemVoz = body?.origem_voz === true;

  logInfo('chat-claude.start', {
    request_id,
    has_entidade: entidade_id !== null,
    stream: streamMode,
    voz: origemVoz,
  });
  // NOTA: NÃO loga texto — pode conter dados sensíveis.

  // ──────────── Setup + INSERT user (pré-stream nos 2 modos) ────────────
  // Falha aqui é JSON de erro mesmo com stream: true — o stream ainda
  // não abriu, então o front recebe status HTTP de verdade.
  let supabase: SupabaseClient;
  let agente: AgenteRow;
  let userMsgId: string;
  try {
    supabase = getSupabaseAdmin();
    agente = await getAgenteAssistente(supabase);

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
    userMsgId = userMsg.id as string;
  } catch (err) {
    logError('chat-claude.fail', { request_id }, err);
    const mapped = corpoErro(err, request_id);
    return jsonResponse(req, mapped.status, mapped.body);
  }

  // ──────────── Configs do banco + rate limit (3.G.2/3.G.3) ────────────
  // Configs: 1 SELECT por isolate (cache). Rate limit: conta mensagens
  // user do último minuto ANTES de gastar Anthropic — proteção de custo
  // contra loop/bug de front. Roda pré-stream: 429 é JSON nos 2 modos.
  // Falha na contagem NÃO bloqueia (fail-open: melhor responder do que
  // travar o Pedro por bug na query).
  const configs = await getConfigs(supabase, request_id);

  const limitePorMinuto = lerConfig<number>(
    configs,
    'ai_limites.msgs_por_minuto',
    10,
    request_id,
  );
  const { count: msgsUltimoMinuto, error: errRate } = await supabase
    .from('chat_mensagens')
    .select('id', { count: 'exact', head: true })
    .eq('papel', 'user')
    .gte('created_at', new Date(Date.now() - 60_000).toISOString());

  if (errRate) {
    logWarn('chat-claude.rate_limit_check_fail', { request_id });
  } else if ((msgsUltimoMinuto ?? 0) > limitePorMinuto) {
    // A mensagem atual já foi contada (INSERT user acima) — ela fica
    // persistida mas sem resposta; o front mostra o toast de 429.
    logWarn('chat-claude.rate_limit_hit', {
      request_id,
      msgs_ultimo_minuto: msgsUltimoMinuto,
      limite: limitePorMinuto,
    });
    return jsonResponse(req, 429, {
      ok: false,
      error: 'rate_limit',
      message:
        `Limite de ${limitePorMinuto} mensagens por minuto atingido. ` +
        'Espera alguns segundos.',
      request_id,
    });
  }

  // ──────────── Pipeline compartilhado (JSON e SSE) ────────────
  // `emit` null = modo JSON (comportamento v45). Com emit, dispara
  // eventos router/delta/tool ao longo do caminho; o retorno vira o
  // evento `done` (mesmo shape do JSON).
  const pipeline = async (
    emit: EmitSSE | null,
  ): Promise<Record<string, unknown>> => {
    const client = getAnthropicClient();

    // Valores de comportamento vindos de configuracoes (3.G.2), com
    // fallback hardcoded se a chave sumir. `configs` carregada acima
    // (mesmo objeto usado no rate limit).
    const precosModelos = lerConfig<Record<string, PrecoModelo>>(
      configs,
      'ai_defaults.precos_modelos',
      MODEL_PRICING as unknown as Record<string, PrecoModelo>,
      request_id,
    );
    const mapaComplexidade = lerConfig<Record<string, string>>(
      configs,
      'ai_defaults.mapeamento_complexidade',
      MAPA_COMPLEXIDADE_MODELO as unknown as Record<string, string>,
      request_id,
    );
    const modelosSemTemperature = lerConfig<string[]>(
      configs,
      'ai_defaults.modelos_sem_temperature',
      MODELOS_SEM_TEMPERATURE_FALLBACK,
      request_id,
    );
    const maxHistorico = lerConfig<number>(
      configs,
      'ai_defaults.historico_max_mensagens',
      MAX_HISTORICO,
      request_id,
    );

    // Aquece a cotação em paralelo (3.G.1) — quando o cálculo de custo
    // chegar, o valor já está em cache (nunca bloqueia: cache velho ou
    // fallback se as fontes não responderem em 2s cada).
    getCotacaoUSDBRL(request_id);

    // ──────────── Roteador + histórico EM PARALELO (3.E.1 bônus) ────────────
    // Antes o histórico esperava o Roteador terminar (~1.2-2.2s) pra só
    // então rodar. As duas dependem apenas do userMsgId — paralelizar
    // corta ~300-500ms de TODA mensagem, com e sem stream.
    const historicoPromise = buscarHistoricoMensagens(
      supabase,
      entidade_id,
      userMsgId,
      request_id,
      maxHistorico,
    );
    const router = await chamarRoteador(
      client,
      supabase,
      texto,
      entidade_id,
      request_id,
      userMsgId,
      agente.id,
      precosModelos,
    );

    // ──────────── Aplica decisão do Roteador (3.D.3) ────────────
    // Lookup persona escolhida no Map cacheado. Se Roteador alucinou slug
    // que não existe, fail-soft pra persona=null + log warning.
    const personasMap = await getPersonasReais(supabase, request_id);
    let persona: PersonaRow | null = null;
    if (router.decisao.persona_slug) {
      const candidata = personasMap.get(router.decisao.persona_slug);
      if (candidata) {
        persona = candidata;
      } else {
        logWarn('chat-claude.persona_invalida', {
          request_id,
          slug_retornado: router.decisao.persona_slug,
        });
      }
    }

    // Concat prompt do agente + contexto da persona (separador `---`
    // conforme convenção `Tabela — personas.md` linha 67). Substitui
    // placeholders APÓS concat (decisão B13 — `{persona_ativa}` aparece
    // no `prompt_base` mas valores futuros podem aparecer em `persona.contexto`).
    // TODO 3.G ou Fase 4: resolver entidade_atual pra nome real (SELECT em
    // entidades pelo entidade_id) quando seletor de entidade entrar na UI.
    // TODO multi-user (fora do roadmap): lookup do nome do user via session.
    const promptCru = persona
      ? `${agente.prompt_base}\n\n---\n\n${persona.contexto}`
      : agente.prompt_base;
    const promptProcessadoComPersona = substituirPlaceholders(
      promptCru,
      {
        usuario: 'Pedro Pertel',
        data_hora: formatarDataHoraBrasilia(),
        entidade_atual: entidade_id ? '(entidade ativa)' : '(geral)',
        persona_ativa: persona?.nome ?? '',
      },
      request_id,
    );

    // Modelo: Roteador via persona.modelo_override ou mapa[nivel_complexidade]
    // (mapa de configuracoes, 3.G.2). Persona null → agente.modelo.
    const modeloEscolhido = escolherModelo(persona, agente.modelo, mapaComplexidade);

    // Evento `router` (3.E.1): o front mostra chip da persona + indicador
    // "digitando" AGORA — ~2s antes do primeiro token da resposta.
    emit?.('router', {
      persona_slug: persona?.slug ?? null,
      nome: persona?.nome ?? 'Assistente',
      icone: persona?.icone ?? '🤖',
      cor_hex: persona?.cor_hex ?? '6B7280',
      nivel_complexidade: router.decisao.nivel_complexidade,
      modelo: modeloEscolhido,
    });

    const historico = await historicoPromise;

    // ──────────── Chamada Anthropic + loop de tools (try interno) ────────────
    // Sem tools na persona: 1 chamada. Com tools: loop tool_use →
    // executar → tool_result → nova chamada, até resposta final ou
    // MAX_VOLTAS_TOOLS. Em stream, cada volta streama texto via `delta`.
    const t0 = Date.now();

    // Tools ativas vêm de configuracoes (3.G.2): nomes → catálogo.
    // Nome desconhecido na config → warning + ignora (fail-safe).
    const resolverTools = (nomes: string[]): ToolDef[] => {
      const defs: ToolDef[] = [];
      for (const nome of nomes) {
        const def = CATALOGO_TOOLS[nome];
        if (def) defs.push(def);
        else {
          logWarn('chat-claude.tool_config_desconhecida', {
            request_id,
            nome,
          });
        }
      }
      return defs;
    };
    const nomesTransversais = lerConfig<string[]>(
      configs,
      'ai_tools.transversais',
      TOOLS_TRANSVERSAIS_FALLBACK,
      request_id,
    );
    const nomesPorPersona = lerConfig<Record<string, string[]>>(
      configs,
      'ai_tools.por_persona',
      TOOLS_POR_PERSONA_FALLBACK,
      request_id,
    );
    // Transversais sempre + exclusivas da persona (quando houver).
    const toolsDaPersona = [
      ...resolverTools(nomesTransversais),
      ...(persona ? resolverTools(nomesPorPersona[persona.slug] ?? []) : []),
    ];

    // 3.H.1: specs dinâmicos (ex: enum de categorias do sítio) são
    // resolvidos aqui — cacheados por isolate dentro de cada tool, então
    // depois do primeiro request custa zero.
    const specsResolvidos = await Promise.all(
      toolsDaPersona.map((t) =>
        t.prepararSpec ? t.prepararSpec(supabase, request_id) : t.spec
      ),
    );

    // Observabilidade acumulada do loop (vai pro INSERT assistant).
    const toolCallsAcumulados: Array<Record<string, unknown>> = [];
    const toolResultsAcumulados: Array<Record<string, unknown>> = [];
    let tokensEntradaTotal = 0;
    let tokensSaidaTotal = 0;
    let custoUsdTotal = 0;

    let response;
    try {
      // deno-lint-ignore no-explicit-any -- blocos mistos (texto/tool) do SDK
      const messages: any[] = [
        ...historico,
        { role: 'user', content: texto },
      ];

      for (let volta = 0; ; volta++) {
        // Modelos com Adaptive Thinking não aceitam `temperature` —
        // lista vem de configuracoes.ai_defaults.modelos_sem_temperature
        // (3.G.2; validado em runtime na 3.D.3.2 com Opus 4.7).
        const baseParams = {
          model: modeloEscolhido,
          max_tokens: agente.max_tokens,
          system: promptProcessadoComPersona,
          messages,
          ...(specsResolvidos.length > 0 ? { tools: specsResolvidos } : {}),
        };
        const params = modelosSemTemperature.includes(modeloEscolhido)
          ? baseParams
          : { ...baseParams, temperature: Number(agente.temperatura) };

        if (emit) {
          // Modo SSE: helper MessageStream do SDK — 'text' dispara por
          // delta; finalMessage() devolve a Message completa (mesmo shape
          // do create()), então o resto do loop não muda.
          const streamAnthropic = client.messages.stream(params);
          streamAnthropic.on('text', (delta: string) => {
            emit('delta', { texto: delta });
          });
          response = await streamAnthropic.finalMessage();
        } else {
          response = await client.messages.create(params);
        }

        tokensEntradaTotal += response.usage.input_tokens;
        tokensSaidaTotal += response.usage.output_tokens;
        custoUsdTotal += calcCustoUSD(
          response.model,
          response.usage.input_tokens,
          response.usage.output_tokens,
          precosModelos,
        );

        if (response.stop_reason !== 'tool_use') break;

        if (volta >= MAX_VOLTAS_TOOLS - 1) {
          // Modelo ainda quer tools depois do teto — para sem executar.
          // Resposta final vira o que houver de texto (fallback no extract).
          logWarn('chat-claude.tool_loop_teto', {
            request_id,
            voltas: volta + 1,
            persona_slug: persona?.slug ?? null,
          });
          break;
        }

        // Executa cada bloco tool_use da resposta. Erro de executor vira
        // tool_result com is_error — modelo explica em vez de 500.
        const blocosToolUse = response.content.filter(
          (b) => b.type === 'tool_use',
        );
        if (blocosToolUse.length === 0) break; // defesa: user vazio = 400 na API
        // deno-lint-ignore no-explicit-any
        const blocosResult: any[] = [];
        for (const bloco of blocosToolUse) {
          toolCallsAcumulados.push({
            id: bloco.id,
            name: bloco.name,
            input: bloco.input,
          });

          // Evento `tool` (3.E.1): Pedro vê "salvando ideia..." no front.
          emit?.('tool', { name: bloco.name, status: 'executando' });

          const def = toolsDaPersona.find((t) => t.spec.name === bloco.name);
          let resultado: Record<string, unknown>;
          let isError = false;
          if (!def) {
            // Modelo alucinou nome de tool fora do payload (improvável).
            resultado = { erro: `Tool desconhecida: ${bloco.name}` };
            isError = true;
          } else {
            try {
              resultado = await def.executar(
                bloco.input as Record<string, unknown>,
                {
                  supabase,
                  entidade_id,
                  userMsgId,
                  agenteId: agente.id,
                  persona,
                  requestId: request_id,
                  origemVoz,
                  textoOriginal: texto,
                },
              );
            } catch (toolErr) {
              resultado = {
                erro: toolErr instanceof Error
                  ? toolErr.message.slice(0, 300)
                  : 'Erro desconhecido na tool',
              };
              isError = true;
              logWarn('chat-claude.tool_exec_fail', {
                request_id,
                tool: bloco.name,
                erro: resultado.erro,
              });
            }
          }

          emit?.('tool', {
            name: bloco.name,
            status: isError ? 'erro' : 'ok',
          });

          toolResultsAcumulados.push({
            tool_use_id: bloco.id,
            name: bloco.name,
            resultado,
            is_error: isError,
          });
          blocosResult.push({
            type: 'tool_result',
            tool_use_id: bloco.id,
            content: JSON.stringify(resultado),
            ...(isError ? { is_error: true } : {}),
          });
        }

        // Continua a conversa: assistant com os blocos originais +
        // user com os tool_results (formato exigido pela API).
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: blocosResult });
      }

      if (toolCallsAcumulados.length > 0) {
        logInfo('chat-claude.tool_loop_done', {
          request_id,
          persona_slug: persona?.slug ?? null,
          tool_calls: toolCallsAcumulados.length,
          com_erro: toolResultsAcumulados.filter((r) => r.is_error).length,
        });
      }
    } catch (anthropicErr) {
      // INSERT assistant com erro preenchido (preserva cadeia)
      const erroMsg = anthropicErr instanceof Error
        ? anthropicErr.message.slice(0, 500)
        : 'Erro desconhecido na chamada Anthropic';

      // tool_calls/tool_results preservados mesmo no erro: se a Anthropic
      // caiu DEPOIS de uma tool ter executado (ex: ideia já salva), o
      // rastro do write não pode sumir (3.I.1).
      const { error: errAssistantErr } = await supabase
        .from('chat_mensagens')
        .insert({
          papel: 'assistant',
          conteudo: '[erro durante chamada]',
          entidade_id,
          agente_id: agente.id,
          persona_id: persona?.id ?? null,
          modelo_usado: modeloEscolhido,
          erro: erroMsg,
          mensagem_pai_id: userMsgId,
          tool_calls: toolCallsAcumulados.length > 0 ? toolCallsAcumulados : null,
          tool_results: toolResultsAcumulados.length > 0 ? toolResultsAcumulados : null,
        });
      if (errAssistantErr) {
        logError('chat-claude.insert_assistant_err_fail', { request_id, userMsgId }, errAssistantErr);
      }

      // re-throw pro caller mapear (JSON: status HTTP; SSE: evento error)
      throw anthropicErr;
    }

    const latencia_ms = Date.now() - t0;

    // ──────────────────────────── extract ───────────────────────────────
    // Com tools, o texto final pode não ser o primeiro bloco — busca o
    // primeiro bloco text. Métricas usam os TOTAIS acumulados do loop
    // (sem tools = 1 volta, idêntico à v42).
    const blocoTexto = response.content.find((b) => b.type === 'text');
    const conteudo = blocoTexto?.type === 'text'
      ? blocoTexto.text
      : (toolCallsAcumulados.length > 0
        ? '[tools executadas, sem resposta final do modelo]'
        : '');
    const tokens_entrada = tokensEntradaTotal;
    const tokens_saida = tokensSaidaTotal;
    const modelo_usado = response.model;
    const custo_usd = custoUsdTotal;
    const custo_brl = custo_usd * (await getCotacaoUSDBRL(request_id));

    // ──────────── INSERT assistant (sucesso) ────────────
    // tool_calls/tool_results (3.F.0.5): NULL quando turn não usou tools.
    const { error: errAssistant } = await supabase
      .from('chat_mensagens')
      .insert({
        papel: 'assistant',
        conteudo,
        entidade_id,
        agente_id: agente.id,
        persona_id: persona?.id ?? null,
        modelo_usado,
        tokens_entrada,
        tokens_saida,
        custo_usd,
        custo_brl,
        latencia_ms,
        mensagem_pai_id: userMsgId,
        tool_calls: toolCallsAcumulados.length > 0 ? toolCallsAcumulados : null,
        tool_results: toolResultsAcumulados.length > 0 ? toolResultsAcumulados : null,
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
      stream: emit !== null,
    });

    return {
      ok: true,
      conteudo,
      modelo_usado,
      tokens_entrada,
      tokens_saida,
      custo_usd,
      custo_brl,
      latencia_ms,
      request_id,
      persona_escolhida: router.decisao.persona_slug,
      nivel_complexidade: router.decisao.nivel_complexidade,
      razao_router: router.decisao.razao,
      latencia_router_ms: router.latenciaRouterMs,
    };
  };

  // ──────────── Modo JSON (default — idêntico à v45) ────────────
  if (!streamMode) {
    try {
      const payload = await pipeline(null);
      return jsonResponse(req, 200, payload);
    } catch (err) {
      logError('chat-claude.fail', { request_id }, err);
      const mapped = corpoErro(err, request_id);
      return jsonResponse(req, mapped.status, mapped.body);
    }
  }

  // ──────────── Modo SSE (3.E.1) ────────────
  // Response sai imediatamente; o pipeline roda dentro do stream.
  // Desconexão do cliente NÃO aborta o pipeline (INSERTs precisam
  // terminar) — só silencia os eventos.
  const te = new TextEncoder();
  let clienteDesconectou = false;

  const sse = new ReadableStream({
    start(controller) {
      const emit: EmitSSE = (evento, dados) => {
        if (clienteDesconectou) return;
        try {
          controller.enqueue(
            te.encode(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`),
          );
        } catch {
          clienteDesconectou = true;
        }
      };

      (async () => {
        try {
          const payload = await pipeline(emit);
          emit('done', payload);
        } catch (err) {
          logError('chat-claude.fail', { request_id }, err);
          emit('error', corpoErro(err, request_id).body);
        } finally {
          if (!clienteDesconectou) {
            try {
              controller.close();
            } catch {
              // stream já fechado pelo runtime
            }
          }
        }
      })();
    },
    cancel() {
      clienteDesconectou = true;
    },
  });

  return new Response(sse, {
    status: 200,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
});
