# Status atual — Assistente v4

> Fonte única de verdade pra fase/sub-fase ativa. Atualizado
> no ritual de fechamento de cada sub-tarefa (passo X.Y.5).
>
> Toda sessão nova LÊ ESTE ARQUIVO PRIMEIRO. Ignora status
> mencionado em prompts iniciais — confere aqui.

**Última atualização:** 2026-07-06

═══════════════════════════════════════════════════════════════

## Onde paramos

**Fase 3 ✅ COMPLETA** (9/9 implementáveis, em produção). Fecha o backend de IA.

**Agora: Fase 3.5 — Fundação & Correções** (criada pela revisão multi-agente
de 2026-07-07; relatório em `070 - Roadmap/`).
- ✅ **3.5.A/B autônomo:** backup dos dados, migrations+baseline versionados,
  snapshot dos prompts, fixes da Edge C1/C2/C3/C4/C5/C7 + guardrail D1
  (commitados na `dev`, deploy pendente).
- ✅ **3.5.A.1 + 3.5.C deploy:** CLI já autenticado; fixes da Edge deployados
  via CLI e validados (fumaça passou, guardrail verificado). Deploy manual
  aposentado.
- 🔴 **Ainda precisa do Pedro:** fechar signup (A2); cap de custo Anthropic
  (A3); OK pra dropar legado (A4); decidir upgrade Supabase (A5).
- 🔴 **3.5.D:** correções restantes (C6/C8, prompt caching, extrair tools,
  deno check + fumaça). Detalhe no Backlog.

**Depois: Fase 4 replanejada** — chat utilizável (markdown, seletor de
entidade) → telas de correção (ideias/lançamentos) → módulos CRUD por uso
real → PWA. Pré-requisito 4.0: invalidação de cache. Detalhe no Backlog.

**Pausada:** 3.F (Meta, bloqueio externo) → Fase 5.

═══════════════════════════════════════════════════════════════

## Progresso da Fase 3

✅ 3.0 — Reconciliar Backlog (Fase 3=IA, Fase 4=UI)
✅ 3.A — Fundação Edge Functions (health-check + `_shared/`)
✅ 3.B — Echo Anthropic (Haiku puro + INSERTs + UI mínima)
✅ 3.C — `prompt_base` + placeholders + histórico (chat-claude v36)
✅ 3.D — Router + 5 personas + UI chips (chat-claude v42 + UI)
⏸️ 3.F — Marcos + Meta Ads (pausada — bloqueio externo Meta Business; 3.F.0.5 ✅ feita)
✅ 3.I — Marina + tools (loop genérico + salvar_ideia transversal, v45 — em produção)
✅ 3.E — Streaming SSE (v46 + front, testado — aguarda aprovado)
✅ 3.G — Polimento (cotação real + configs no banco + rate limit, v49 — em produção)
✅ 3.H — Alemão + voz (tool sítio + 🎤 ditado, v51 — em produção)
⏳ 3.J — Marcela briefing matinal (cron, opcional)

**Total:** 9/9 sub-fases implementáveis fechadas. 🏁 3.F pausada não conta —
retoma quando o acesso ao Meta Business existir.

**Nota:** 3.D executou 8 sub-tarefas vs 6 planejadas — 3.D.0.5,
3.D.3.1, 3.D.3.2, 3.D.4.1, 3.D.4.2 entraram durante execução
por necessidade real (STATUS.md formal, dedup messages, fix
Opus temperature, chip Assistente fallback, scroll cascata).
3 das 5 vieram de achados REGRA 11.

═══════════════════════════════════════════════════════════════

## Estado do repo

- **Branch ativa:** dev (sincronizada com origin/dev)
- **Working tree:** limpo (após fechamento da 3.I, 2026-07-06)
- **Última versão Edge `chat-claude`:** v45 ACTIVE (3.I completa)
- **Supabase:** projeto restaurado em 2026-07-06 (estava
  INACTIVE por inatividade do free tier). Dados íntegros:
  19 tabelas public, 1 usuário, 1 secret Vault, 29 mensagens,
  6 personas. ⚠️ Free tier pausa de novo após ~7 dias sem uso.
- **Último commit em dev:** `ec7bae5` (3.I.2.1) + docs de
  fechamento na sequência

═══════════════════════════════════════════════════════════════

## Histórico de sub-tarefas (mais recentes primeiro)

- 2026-07-06 — 3.E ✅ Streaming SSE. 3.E.0 análise (achado:
  Roteador come ~2s não-streamáveis → evento `router` antecipa
  o chip; front precisa de fetch+ReadableStream porque
  EventSource não faz POST). 3.E.1 Edge v46 (`47f6f11`):
  pipeline compartilhado JSON/SSE, flag `stream` opt-in
  (sem flag = idêntico à v45), eventos router/delta/tool/done/
  error, `corpoErro` fatorado, histórico em paralelo com
  Roteador (bônus aprovado pelo Pedro). 3.E.2 front (`abcd6fc`):
  `invokeFunctionStream` em core/supabase.js + bolha streaming
  com chip antecipado no chat.js. 3.E.3 testado por Pedro no
  preview: "funcionou, ficou rápido e mostra parcial".
- 2026-07-06 — 3.I ✅ Marina + tools, executada inteira na
  sessão de retomada. 3.I.1 loop genérico de function calling
  (`ea713f0`, v43) → 3.I.2 tool `salvar_ideia` (`6c3b9ec`,
  v44) → fix prompt Roteador via UPDATE com OK do Pedro
  (Marina no enum + regra captura-de-ideia prioridade máxima
  + null literal) → 3.I.2.1 tools transversais (`ec7bae5`,
  v45). Decisão de filosofia (Pedro): **tools são capacidades
  do sistema, não da persona — persona define tom, não poder.**
  Achado grave corrigido: personas sem tool "fingiam" executar
  ("Anotado ✓" sem gravar). Limitação conhecida: mensagem
  mista (pergunta + ideia) roteia pra captura e a pergunta
  fica sem resposta. Pendente: teste mobile + aprovado.
- 2026-07-06 — Retomada após ~2 meses parado. Reconciliação
  REGRA 11: STATUS estava atrás do git (3.F.0.5 commitada em
  `9730fc2` mas STATUS dizia "aguardando OK"; mudança de
  2026-05-03 no STATUS nunca foi commitada; Dev Log sem entrada
  da 3.F.0.5). 3.F pausada por bloqueio externo (Meta Business
  em nome da esposa — auth como dono falhou). Achado: projeto
  Supabase INACTIVE (pausado por inatividade do free tier),
  produção fora do ar até restore.
- 2026-05-03 — 3.F.0.5 ✅ (fechamento retroativo em 2026-07-06).
  Docs `Tabela — chat_mensagens.md` +93 linhas + CONVENÇÕES.md
  +32 linhas pra `tool_calls`/`tool_results jsonb`. Commit
  `9730fc2`. Dev Log não foi atualizado na época; entrada
  retroativa criada em 2026-07.
- 2026-05-03 — 3.F plano oficializado. 16 decisões técnicas
  (C1-C16, incluindo C16 REGRA 11 pré-emptiva sobre cadeia
  messages com tool_use pendente), 11 riscos com mitigação,
  9 sub-tarefas reordenadas (3.F.0.5 antes de 3.F.0 pra
  paralelismo com side quest Pedro). 10 achados REGRA 11
  pré-implementação validados via SQL direto no banco
  (Vault habilitado, 5 tabelas Meta prontas, seed placeholder
  já existente em meta_credenciais/conexoes/vault.secrets,
  Marcos persona ['cedtec'], chat_mensagens sem tool_calls).
- 2026-05-03 — 3.D.5 ✅ Sub-fase 3.D fechada. Marco real
  atingido: sistema com voz própria, 3 modelos dinâmicos,
  5 personas + fallback Assistente, UI com chips, scroll
  funcional. 8 sub-tarefas executadas vs 6 planejadas (5
  correções/adições não-planejadas durante execução, 3 delas
  via REGRA 11).
- 2026-05-03 — 3.D.4.2 ✅ Scroll interno do chat corrigido.
  Cascata `min-height: 0` + body sem padding + safe-area no
  input. `index.html` +7/-3 linhas. Hash dev `6a322cc`.
- 2026-05-03 — 3.D.4.1 ✅ Chip "Assistente" 🤖 cinza fallback.
  `chat.js` +6/-2 linhas. Hash dev `ea0b442`.
- 2026-05-03 — 3.D.4 ✅ UI chip de persona ativa. Nested join
  + render condicional + CSS. `chat.js` +30 linhas, `index.html`
  +25 linhas. Hash dev `4fdf860`.
- 2026-05-03 — 3.D.3.2 ✅ Opus 4.7 sem temperature.
  `_shared/anthropic.ts` +26 linhas, `chat-claude` +10 linhas,
  deploy v42. TESTE B com Opus 4.7 PASSOU (Bruno escrevendo
  proposta comercial — voz própria + ~R$ 0.10/troca + 7s).
- 2026-05-03 — 3.D.3.1 ✅ dedup messages alternada.
  `buscarHistoricoMensagens` +14 linhas. Defesa contra user
  órfão por filtro `WHERE erro IS NULL`. Cleanup do banco
  (9 rows órfãs em 2 ondas).
- 2026-05-03 — 3.D.3 ✅ chamada principal usa modelo do
  Roteador. `chat-claude` +25 linhas, deploy v40. TESTE A
  PASSOU (Marcos respondendo Sonnet 4.6 em CEDTEC).
- 2026-05-03 — 3.D.2 ✅ Roteador ativo. `chat-claude/index.ts`
  +253 linhas (648→901), deploy v39. Pipeline validado: curls
  "saldo CEDTEC?"→marcos, "Pincel?"→bruno, "que dia?"→marcela.
  INSERT system gravado com JSON da decisão, custo médio
  R$ 0.008/chamada do Roteador.
- 2026-05-03 — 3.D.1 ✅ helpers + MAPA. `chat-claude/index.ts`
  +134 linhas (514→648), deploy v38.
- 2026-05-03 — 3.D.0.5 ✅ `STATUS.md` criado, ritual formalizado.
  CLAUDE.md emagreceu (status duplicado removido).
- 2026-05-03 — 3.D.0 ✅ Sonnet/Opus em `MODEL_PRICING`.
  `_shared/anthropic.ts` +2 linhas, deploy v37.
- 2026-05-03 — 3.D plano oficializado (dev `e642561`, main `43e02ea`).
  4 achados REGRA 11, 15 decisões B1-B15, 6 sub-tarefas (3.D.0 a
  3.D.5), pricing Opus 4.7 corrigido pra $5/$25.
- 2026-05-03 — Reorganização de pastas. `~/Documents/Assistente Pessoal/` → `~/Code/assistente-v4/`. 3 projetos antigos pra
  `~/Code/_arquivo/`. CLAUDE.md global criado (`~/.claude/CLAUDE.md`).
- 2026-05-03 — 3.C ✅ placeholders + histórico (merge main `679dfc3`,
  Edge v36).
- 2026-05-03 — 3.C plano oficializado (merge main `3419377`).
- 2026-05-02 — REGRA 11 criada (merge main `72de7f3`).
- 2026-05-02 — 3.B ✅ echo Haiku (merge main `9da09a8`).
- 2026-05-02 — 3.A ✅ fundação Edge (merge main `10c1d21`).
- 2026-05-02 — 3.0 ✅ Backlog reconciliado (merge main `a6b41b2`).
- 2026-05-01 — Fase 2 ✅ banco completo (18 tabelas, 6 personas,
  Vault, Storage).
- (anterior) — Fase 1 ✅ frontend + auth.

═══════════════════════════════════════════════════════════════

## Observações arquiteturais

**Roteador (validado 3.D.2):** classifica `nivel_complexidade`
POR MENSAGEM, não por persona. `nivel_complexidade` da persona
é metadata semântica (default), mas Roteador decide caso a caso
baseado no conteúdo da mensagem. Maioria de perguntas curtas
("como tá?", "qual saldo?") cai em `simples` (Haiku). Apenas
pedidos de análise/redação densa caem em `complexo` (Opus).
Comportamento correto — não confundir com bug.

**Custo esperado em uso real:** ~R$ 0.008 (Roteador, fixo) +
R$ 0.005-0.030 (chamada principal, varia por modelo). Total
médio: R$ 0.015-0.040 por troca Pedro-IA.

**Modelos Anthropic têm parâmetros API divergentes (validado
3.D.3.2):** Opus 4.7 deprecou `temperature` por Adaptive
Thinking. Helper `suportaTemperature` em `_shared/anthropic.ts`
filtra antes de adicionar parâmetros ao payload. Lista
`MODELOS_SEM_TEMPERATURE` vai crescer. Padrão pra próximas
Edges (briefing-matinal, tools, streaming): validar API
parameters do modelo via doc oficial antes de hardcodar
payload.

**Cadeia messages alternada (validado 3.D.3.1):** Anthropic
exige strict alternância user→assistant→user. Filtro SQL
`WHERE erro IS NULL` em `buscarHistoricoMensagens` quebra
invariante quando assistant erro é filtrado mas user
correspondente não — resulta em 2 user consecutivos. Dedup
defensivo no helper preserva alternância sem mexer na query
SQL. Padrão pra próximas Edges com histórico: dedup por role
após filtros.

**Cascata flexbox `min-height: 0` (validado 3.D.4.2):**
`flex: 1 + overflow-y: auto` NÃO funciona sem `min-height: 0`
em CADA item flex da cadeia. Sem isso, item flex ignora
overflow e cresce pra acomodar conteúdo (clientHeight ===
scrollHeight, scroll real cai no `<html>`). Padrão pra Fase 4
(módulos com kanban/listas/calendário com scroll interno):
declarar `min-height: 0` em cada item flex que deveria respeitar
overflow.

**Custo real validado (sessão 3.D.3 testes):**
- Bruno + Opus 4.7: R$ 0.10/troca (~7s)
- Marcos + Sonnet 4.6: R$ 0.034/troca (~3s)
- Marcela + Haiku 4.5: R$ 0.013/troca (~1s)
- Roteador fixo: R$ 0.008/chamada
Bruno é caso premium (uso pontual). Marcela é cotidiano.

═══════════════════════════════════════════════════════════════

## Como manter este arquivo

A cada fechamento de sub-tarefa (passo X.Y.5 do ritual):

1. Atualiza "Última atualização" pra data de hoje.
2. Move sub-tarefa fechada de "em andamento" pra "última fechada".
3. Atualiza "próxima sub-tarefa".
4. Adiciona linha em "Histórico" no topo.
5. Atualiza "Estado do repo" se branch/versão mudou.
6. Atualiza "Progresso da Fase 3" se sub-fase fechou inteira.
