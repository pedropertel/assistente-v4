# Status atual — Assistente v4

> Fonte única de verdade pra fase/sub-fase ativa. Atualizado
> no ritual de fechamento de cada sub-tarefa (passo X.Y.5).
>
> Toda sessão nova LÊ ESTE ARQUIVO PRIMEIRO. Ignora status
> mencionado em prompts iniciais — confere aqui.

**Última atualização:** 2026-07-13

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
- ✅ **A4 legado limpo:** tabela `teste` + 5 functions legadas removidas.
- ✅ **Signup fechado** (Pedro, 2026-07-08 — verificado via curl:
  `signup_disabled`). Risco A1 encerrado.
- ⏸️ **Decisões do Pedro:** cap Anthropic (A.3) e upgrade Supabase (A.5)
  segurados por ora — são o ÚNICO resto da Fase 3.5.
- ✅ **3.5.D COMPLETA em 2026-07-09:** D4 (digitar durante o ditado desliga
  o mic e preserva a edição) + D5 (deno instalado + `checar.sh` typecheck
  pré-deploy; fluxo: checar → deploy → fumaça). Bônus: fix de tipo no
  ToolSpec achado pelo próprio check (só tipo, sem deploy).
- ✅ **4.0 (invalidação de cache) COMPLETA em 2026-07-09** (`b9ed0a1`,
  Edge v60): `cache_version` em configuracoes + checagem no início de
  cada request → bump zera os 5 caches de isolate na hora. Convenção:
  editou agentes/personas/configuracoes/entidades → incrementa a versão
  (SQL no CONVENÇÕES.md). Validada por comportamento (rate limit).
  **Desbloqueia 4.C.3 e as telas de edição.**
- ✅ **Sincronizado:** última promoção 2026-07-13 (`d0b11e2`) — 4.B.1a.
  main = dev (só docs de fechamento à frente).
- ✅ **4.E Bloco de Notas COMPLETO** em 2026-07-08 (mesmo dia do pedido):
  tabela `anotacoes` (19ª de app) + tool `salvar_anotacao` (com
  fidelidade por código — flag copia a resposta do banco, sem resumo do
  modelo) + aba 📝 Notas (markdown, editar/favoritar/arquivar, + Nova).
  Testado pelo Pedro no celular ("funciona muito bem").
- ✅ **4.A.3** feita 2026-07-08: arquivar/favoritar mensagem (menu no
  toque) + 🧹 limpar conversa. Bloco 4.A (chat utilizável) COMPLETO.
- 📝 **4.E Bloco de Notas** registrado no Backlog (pedido Pedro): tabela
  anotacoes + tool salvar_anotacao + aba Notas.
- ✅ **4.A.2 (seletor de entidade)** feita 2026-07-08: chips por empresa,
  histórico separado, nome real da entidade no Roteador/prompt. Inclui 3
  fixes do teste mobile (largura dos chips, stream preso à entidade,
  ditado iOS). Testada pelo Pedro no celular, aprovada.
- 🔴 **Próxima (4.A):** 4.A.3 (editar/arquivar/favoritar msg, limpar
  conversa) OU pular pra 4.0+4.B.1 (invalidação de cache + tela Ideias).
- 🎉 **Fase 4 aberta.** 4.A.1 (markdown no chat) feita 2026-07-08
  (`f12a978`): parser próprio seguro em js/core/markdown.js, render só
  na bolha assistant. Testada e aprovada pelo Pedro.

- ✅ **3.5.D.1 (C6)** feita 2026-07-08 (`e393379`, Edge v53): histórico anexa
  registro textual de tools já executadas — modelo não re-executa. Testada
  pelo Pedro no celular, aprovada e em produção.
- ✅ **3.5.D.3 (prompt caching)** feita 2026-07-08 (`6492d3d`, Edge v54):
  system em 2 blocos (estável cacheado + data/hora no fim) + custo com
  cache write/read. Validado: custo 4× menor na 2ª msg (Sonnet). Aprovada.
- ✅ **3.5.D.7 decidida** (2026-07-08): Edge segue compartilhada + fumaça
  obrigatória pós-deploy. Revisitar na Fase 5 (Meta com dinheiro real).
- ✅ **3.5.D.6 (extrair tools)** feita 2026-07-08 (`68be064`, Edge v55):
  tools em `_shared/tools/`, index.ts 2029→1568 linhas. Aprovada, em produção.
- ✅ **4.B.1a (aba Ideias)** feita 2026-07-13 (`e6b4a85`): listar/editar/
  favoritar/arquivar + Nova manual, espelho da notas.js, labels de
  status do banco (REGRA 12). Testada no celular, em produção.
- 🟡 **Em andamento (4.B.1):** falta 4.B.1b — converter ideia em tarefa
  (INSERT em `tarefas` + status='convertida').
- 🔴 **Depois:** 4.B.2 (tela Lançamentos do Sítio + limpar categoria
  "Outros" duplicada).
- 🧹 **Dados de teste zerados em 2026-07-08** a pedido do Pedro (chat,
  ideias, lançamentos, tarefas, eventos). Seeds intactos. Até o fim do
  desenvolvimento, dado no banco é teste — sem cerimônia pra limpar.

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

- **Branch ativa:** dev (main sincronizada até `d0b11e2`, promoção de
  2026-07-13 — 4.B.1a)
- **Última versão Edge `chat-claude`:** v60 ACTIVE (4.0 — Edge é
  compartilhada, já em produção). Fluxo de deploy: `checar.sh` →
  deploy → `fumaca.sh` (3.5.D.5/D.7).
- **Supabase:** 19 tabelas public (18 da Fase 2 − `teste` + `anotacoes`
  da 4.E), 1 usuário, seeds íntegros; dados transacionais zerados em
  2026-07-08 (eram teste). Signup desabilitado. ⚠️ Free tier pausa após
  ~7 dias sem uso — backup em `090 - Backups/`.
- **Último commit em dev:** `7cbad80` (3.5.D.5) + docs de fechamento

═══════════════════════════════════════════════════════════════

## Histórico de sub-tarefas (mais recentes primeiro)

- 2026-07-13 — 4.B.1a ✅ Aba 💡 Ideias (listar/editar/favoritar/
  arquivar + Nova; espelho da notas.js; labels do banco). Promovida
  no mesmo dia (`d0b11e2`). Falta 4.B.1b (converter em tarefa).
- 2026-07-09 — 4.0 ✅ Invalidação ativa de cache (`cache_version` +
  `verificarVersaoCache` a cada request, Edge v60). Validada por
  comportamento nos dois sentidos. Desbloqueia as telas de edição.
  Promovida em produção no mesmo dia (`05d296b`).
- 2026-07-09 — 3.5.D.4 + 3.5.D.5 ✅ Restos da 3.5.D (ditado preserva
  edição manual; deno check pré-deploy via `checar.sh` + fix de tipo
  no ToolSpec). 3.5.D completa; da 3.5 sobram só decisões A.3/A.5.
  Promovido pra produção no mesmo dia (`d6601a8`).
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
