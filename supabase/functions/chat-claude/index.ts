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
 *   - Loop genérico de tools: quando a persona escolhida tem tools
 *     registradas em TOOLS_POR_PERSONA, o payload ganha `tools` e a
 *     Edge executa blocos tool_use devolvendo tool_result, até
 *     MAX_VOLTAS_TOOLS. Blocos executados vão pra observabilidade em
 *     chat_mensagens.tool_calls / tool_results (colunas da 3.F.0.5).
 *   - Erro de executor NÃO derruba o request — vira tool_result com
 *     is_error, modelo responde explicando.
 *
 * Fora de escopo desta Edge:
 *   - Roteador / personas (3.D)
 *   - Tools do Meta / confirmação humana inline (3.F)
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
  suportaTemperature,
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

/**
 * Mapeamento `nivel_complexidade` → modelo Anthropic.
 * Hardcoded até 3.G.2 migrar pra `configuracoes.ai_defaults.mapeamento_complexidade`.
 *
 * - simples:  tarefas curtas, factuais (Marcela, Alemão, fallback sem persona)
 * - medio:    raciocínio moderado (Marcos, Marina)
 * - complexo: análise estratégica e redação importante (Bruno)
 *
 * Conforme `Tabela — personas.md` linhas 112-118.
 * Pricing dos 3 modelos em `_shared/anthropic.ts` MODEL_PRICING (validado 2026-05-03).
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
): string {
  if (!persona) return modeloAgente;
  if (persona.modelo_override) return persona.modelo_override;
  return MAPA_COMPLEXIDADE_MODELO[persona.nivel_complexidade];
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
  persona: PersonaRow;
  requestId: string;
}

/**
 * Uma tool registrável: spec no formato Anthropic `tools` + executor.
 * O retorno do executor é serializado como JSON no bloco tool_result.
 */
interface ToolDef {
  spec: {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  };
  executar: (
    input: Record<string, unknown>,
    ctx: ToolContext,
  ) => Promise<Record<string, unknown>>;
}

/**
 * Registro de tools por persona (slug → tools). Personas fora do mapa
 * não pagam tokens de tool definitions no payload.
 *
 * Hardcoded até a 3.G migrar pra `configuracoes` (mesmo padrão do
 * MAPA_COMPLEXIDADE_MODELO). 3.I.2 registra as tools da Marina;
 * 3.F registra as do Marcos (Meta) quando o bloqueio externo resolver.
 */
const TOOLS_POR_PERSONA: Record<string, ToolDef[]> = {};

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
    custo_usd = calcCustoUSD(modeloRoteador, tokens_entrada, tokens_saida);
    custo_brl = custo_usd * COTACAO_USD_BRL;
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

    // ──────────── Roteador classifica (3.D.2) ────────────
    // 1ª chamada Anthropic — decide persona + nível de complexidade.
    // NOTA 3.D.2: decisão é GRAVADA (papel='system') mas NÃO APLICADA na
    // chamada principal abaixo (continua usando agente.modelo + prompt sem
    // persona, igual à 3.C). Aplicação efetiva na 3.D.3.
    const client = getAnthropicClient();
    const router = await chamarRoteador(
      client,
      supabase,
      texto,
      entidade_id,
      request_id,
      userMsgId,
      agente.id,
    );

    // ──────────── Aplica decisão do Roteador (3.D.3) ────────────
    // Lookup persona escolhida no Map cacheado (já populado por
    // chamarRoteador na 3.D.2). Se Roteador alucinou slug que não existe,
    // fail-soft pra persona=null + log warning. Custo zero — Map em memória.
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

    // Modelo: Roteador via persona.modelo_override ou MAPA[nivel_complexidade].
    // Persona null → fallback pra agente.modelo (Haiku, comportamento 3.C).
    const modeloEscolhido = escolherModelo(persona, agente.modelo);

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

    // ──────────── Chamada Anthropic + loop de tools (try interno) ────────────
    // Sem tools na persona: comporta idêntico à v42 (1 chamada, sem
    // parâmetro `tools`). Com tools: loop tool_use → executar →
    // tool_result → nova chamada, até resposta final ou MAX_VOLTAS_TOOLS.
    const t0 = Date.now();

    const toolsDaPersona = persona
      ? (TOOLS_POR_PERSONA[persona.slug] ?? [])
      : [];

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
        // Opus 4.7 (e modelos com Adaptive Thinking) não aceitam `temperature`.
        // Helper `suportaTemperature` filtra — ver `_shared/anthropic.ts`.
        const baseParams = {
          model: modeloEscolhido,
          max_tokens: agente.max_tokens,
          system: promptProcessadoComPersona,
          messages,
          ...(toolsDaPersona.length > 0
            ? { tools: toolsDaPersona.map((t) => t.spec) }
            : {}),
        };
        const params = suportaTemperature(modeloEscolhido)
          ? { ...baseParams, temperature: Number(agente.temperatura) }
          : baseParams;
        response = await client.messages.create(params);

        tokensEntradaTotal += response.usage.input_tokens;
        tokensSaidaTotal += response.usage.output_tokens;
        custoUsdTotal += calcCustoUSD(
          response.model,
          response.usage.input_tokens,
          response.usage.output_tokens,
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
                  persona: persona!,
                  requestId: request_id,
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

      // re-throw pra cair no catch externo que mapeia HTTP
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
    const custo_brl = custo_usd * COTACAO_USD_BRL;

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
      // Decisão do Roteador (3.D.2) — gravada como papel='system' no banco.
      // Não afeta `modelo_usado` ainda (chamada principal usa agente.modelo
      // até 3.D.3 entrar). Útil pra debug + UI futura.
      persona_escolhida: router.decisao.persona_slug,
      nivel_complexidade: router.decisao.nivel_complexidade,
      razao_router: router.decisao.razao,
      latencia_router_ms: router.latenciaRouterMs,
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
