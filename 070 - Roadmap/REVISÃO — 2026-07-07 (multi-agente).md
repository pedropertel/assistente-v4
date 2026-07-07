---
tipo: revisão
data: 2026-07-07
método: workflow multi-agente (8 revisores por dimensão + verificação adversarial de cada achado)
escopo: código, dados, prompts, segurança, resiliência, processo de execução e planos futuros
---

# Revisão profunda do Assistente v4 — 2026-07-07

> Pedido do Pedro ao fechar a Fase 3: "revisar o que foi feito e principalmente o que vai ser feito, otimizar tudo, melhorias estruturais, rever a forma de execução — prefiro perder tempo agora do que com retrabalho."
>
> **Método:** 8 agentes revisaram em paralelo (Edge, Front/PWA, Segurança, Dados, IA/Prompts, Resiliência/Custos, Processo, Planos). Cada achado passou por um verificador adversarial (é real? vale a pena num sistema pessoal?). De 59 achados brutos, 50 sobreviveram; 9 foram descartados como falso-positivo ou over-engineering. Claude conferiu pessoalmente os achados graves e os que contradiziam fatos conhecidos (REGRA 11).
>
> **Nada aqui foi aplicado.** É documento de decisão. O Pedro escolhe o que entra.

## Nota de processo da própria revisão
- O agente de segurança leu `auth.users` (e-mails) durante a auditoria — dado do próprio Pedro, sistema single-user, sem vazamento externo, mas registrado por transparência.
- O classificador de segurança dos verificadores ficou indisponível em parte das checagens; por isso Claude reverificou manualmente os itens de segurança e os contraditórios.
- Correção ao pacote de contexto: ele afirmava que o PWA (`sw.js`/`manifest.json`/ícones) existia — **não existe** (achado #F3 confirmado por `ls`).

---

## TL;DR — o que realmente importa agora

Ordenado por "dói se ignorar", não por quantidade:

1. **Não existe backup dos seus dados.** O banco free tier é a única cópia de tudo (ideias, lançamentos, histórico). Se o projeto for deletado/corrompido, acabou. — *crítico, fix pequeno*
2. **A porta está destrancada.** A policy de acesso libera tudo pra qualquer conta logada, e o cadastro do Supabase provavelmente está aberto. Hoje só você tem conta, mas o endpoint é público. — *segurança, fix pequeno*
3. **O schema e os prompts só existem no banco.** Nenhuma migration versionada, prompts editados por SQL sem histórico. Junto com #1, é a receita pra perder trabalho. — *estrutural, fix médio*
4. **A Fase 4, como está planejada, começa no lugar errado.** As tools já criam ideias e lançamentos que **não têm nenhuma tela pra corrigir/arquivar**, e o chat (interface primária!) não tem workstream. A 1ª tela planejada (cadastro Meta) perdeu o sentido com a 3.F pausada. — *replanejamento*
5. **Um punhado de bugs pequenos na Edge** que só aparecem em situações reais suas (celular suspende no meio da resposta, Supabase volta de pausa, você reenvia após timeout) e podem **duplicar lançamento financeiro** ou travar o chat. — *vários fixes pequenos*

**Recomendação central:** inserir uma **Fase 3.5 — Fundação & Correções** (curta) antes da Fase 4. Detalhe no fim.

---

## BLOCO A — Segurança (endpoint é público na internet)

| # | Achado | Sev | Esf |
|---|--------|-----|-----|
| A1 | **RLS `auth_full_access` = `ALL: true`** — qualquer conta autenticada lê/escreve TODAS as tabelas. Se o signup do Supabase estiver aberto (padrão), alguém cria conta e vê tudo. Hoje 1 usuário, mas a porta está aberta. | alta | S |
| A2 | **anon key pública no bundle JS** chama a `chat-claude` — qualquer um com a key (está no front) queima seus créditos Anthropic. O rate limit por-minuto atrasa, não impede. | alta | M |
| A3 | **4 Edge Functions legadas ativas** (`create-admin-user`, `portal`, `meta-sync`, `meta-balance`) — código nem está no repo atual, 2 com `verify_jwt=false`. Superfície de ataque morta em produção. | media | S |
| A4 | **Tabela `teste` órfã** (sobra da Fase 0) aberta pela anon key, e ainda é usada como "ping" no login (`app.js:57`). | media | S |

**Recomendações:** fechar signup no Dashboard (Auth → Providers → Email → desabilitar "Enable Sign Up"); trocar a policy `true` por `auth.uid() = '<seu-id>'` (ou manter, aceitando o risco consciente, já que signup fechado tranca a porta); **cap de custo diário** na Anthropic (console) como rede de proteção real contra A2; deletar as 4 functions legadas e a tabela `teste` (o ping do login vira `select 1` ou a própria sessão).

---

## BLOCO B — Perda de dados / versionamento (o mais estrutural)

| # | Achado | Sev | Esf |
|---|--------|-----|-----|
| B1 | **Zero backup/export.** Free tier é a única cópia. Sem pg_dump agendado, sem export. | **crítica** | M |
| B2 | **Nenhuma migration versionada** no repo — schema real só existe no banco + docs manuais em `050`. Se o banco sumir, reconstruir é arqueologia. | alta | M |
| B3 | **Prompts de personas/Roteador editados via `UPDATE` SQL** sem histórico nem rollback. É o "código" mais sensível do sistema (define todo o comportamento) e não está versionado. | media | M |
| B4 | **Pausa semanal do free tier** derruba produção inteira se você ficar 7 dias sem usar (já aconteceu mai→jul). Mitigação registrada é "considerar" — nada concreto. | alta | S |

**Recomendações:** (B1) cron semanal de `pg_dump` pra Storage/e-mail, ou export manual como hábito; (B2) criar `supabase/migrations/` e daqui pra frente todo ALTER/seed vira arquivo versionado — o schema atual vira a migration inicial; (B3) snapshot dos prompts em arquivos no repo (`040 - IA e Agentes/prompts/`) como fonte da verdade → seed aplica no banco; (B4) **decisão sua:** upgrade Supabase (~US$25/mês) elimina o risco de vez, OU cron de ping mantém acordado, OU aceitar e conviver. Recomendo o upgrade quando entrar em uso diário real — é a base de tudo.

---

## BLOCO C — Bugs reais da Edge (pequenos, aparecem no seu uso real)

| # | Achado | Sev | Esf |
|---|--------|-----|-----|
| C1 | **Cache de isolate grava falha/vazio.** Se a query de categorias/personas falhar (ex: janela de restore da pausa), o cache guarda lista VAZIA até o isolate reciclar → tool do sítio e roteamento quebram. Já existe o padrão certo em `config.ts` ("não cacheia falha"). | media | S |
| C2 | **Desconexão no meio do stream mata os INSERTs finais.** Falta `EdgeRuntime.waitUntil()`. Seu celular suspende o Safari mid-resposta → a resposta some do histórico; se uma tool já gravou, você reenvia e **duplica**. | media | S |
| C3 | **Reenvio após timeout duplica lançamento financeiro** — sem idempotência. Relacionado a C2. | media | S |
| C4 | **`lerConfig` faz cast cego do jsonb** — quando você editar configs pela tela da Fase 4, um tipo errado desliga o rate limit ou o histórico **em silêncio**. Contradiz o "NUNCA 500 por config". | media | M |
| C5 | **Assistant com conteúdo vazio envenena o histórico** — se a resposta vier vazia (max_tokens no lugar errado), as próximas ~20 mensagens dão 400 e o chat trava sem pista. | media | S |
| C6 | **Histórico carrega só papel+conteúdo** (sem `tool_calls`) → o modelo esquece que já executou uma tool → risco de re-lançar. Relacionado a C3. | media | M |
| C7 | **Front: mensagem perdida quando o envio falha** (textarea já foi limpo antes da resposta). | media | S |
| C8 | **Front: stream sem timeout/abort** — Edge pendurada trava o chat até recarregar a página. | media | S |
| C9 | Extract usa só o 1º bloco text; `max_tokens` tratado como fim normal (resposta truncada sem aviso); ditado sobrescreve edição manual. | baixa | S |

---

## BLOCO D — IA / Prompts

| # | Achado | Sev | Esf |
|---|--------|-----|-----|
| D1 | **Personas sem tool afirmam ações que não executaram** — Marcela "marca reunião" que não existe (tools de tarefa/evento só na Fase 4). Sem guardrail nenhum no prompt. Mitigação registrada é insuficiente. | alta | S |
| D2 | **Registros criados por tool não têm tela de correção.** Marina salva ideia, Alemão lança custo — se a transcrição de voz errar, não há NENHUMA forma de corrigir/arquivar hoje. O "eco por extenso" avisa, mas não conserta. | alta | S→L |
| D3 | **Roteador decide sem contexto de conversa** — follow-up curto ("e a segunda?") troca persona e modelo no meio do assunto. | media | M |
| D4 | **Prompt caching não usado** — system (4-14KB) + tool definitions reenviados integralmente em toda mensagem. Mover o `{data_hora}` pro fim do prompt habilita cache e corta custo de input significativamente. | baixa | S |

---

## BLOCO E — Planos futuros (o que o Pedro mais pediu pra revisar)

| # | Achado | Sev | Esf |
|---|--------|-----|-----|
| E1 | **Fase 4 não tem workstream do chat** — sendo o chat a interface primária do sistema. O chat de hoje é funcional mas cru (markdown literal, sem editar/apagar mensagem, sem seletor de entidade). | media | L |
| E2 | **`entidade_id` é sempre null no chat** — conversas de TODAS as empresas se misturam num histórico só. Sem seletor de entidade, o Marcos vê contexto do sítio e vice-versa. | media | M |
| E3 | **1ª tela da Fase 4 (cadastro Meta) perdeu o sentido** com a 3.F pausada. A 1ª tela deveria ser a correção de ideias/lançamentos (D2). | media | S |
| E4 | **Cache de isolate (5min) vai sabotar as telas de edição da Fase 4** — você edita uma persona/config pela tela e não vê efeito por 5min. Precisa de invalidação ativa ANTES da Fase 4. | media | M |
| E5 | **Escopo da Fase 4 ao pé da letra = 60-95 sub-tarefas** (REGRA 12: toda tabela precisa de tela CRUD). Precisa de triagem explícita por uso real, não fazer tudo. | media | S |
| E6 | **Plano detalhado da 3.F (16 decisões C1-C16 + 11 riscos) está PERDIDO** — o arquivo `.claude/plans/temporal-tinkering-castle.md` referenciado não existe mais. Quando a 3.F voltar, o plano terá que ser refeito. | media | S |
| E7 | **Markdown renderiza literal no chat** — pré-requisito pra Fase 4 do chat ficar utilizável. | media | S |

---

## BLOCO F — Processo de execução (o Pedro pediu explicitamente)

| # | Achado | Sev | Esf |
|---|--------|-----|-----|
| F1 | **Deploy da Edge via payload manual de ~50KB** montado à mão (6+ vezes nesta sessão), com risco de drift entre repo e deployado (aconteceu 1x). O CLI já está instalado — falta só `supabase login`. | media | S |
| F2 | **Zero typecheck e zero teste antes de deploy** que vai direto pra produção. `deno check` + um script de fumaça curl cobririam o essencial. | media | M |
| F3 | **`index.ts` com ~1300 linhas** vira ~1800+ na 3.F — extrair as tools pra `_shared/tools/` antes disso. | media | M |
| F4 | **Edge é compartilhada entre dev e prod** — todo deploy do `chat-claude` afeta produção, mesmo com o front só no dev. Foi assim a sessão inteira. | media | S |
| F5 | **PWA documentado mas inexistente** — `manifest.json`, `sw.js` e ícones não existem; "instalável no celular / offline" não é verdade hoje. | media | M |

**O que está funcionando e NÃO deve mudar:** o ritual `/assistente` → `/proxima` → `/fechar` → `/aprovar`, o STATUS.md como fonte de verdade, a disciplina de tarefa pequena + branch dev + preview + aprovação explícita, a REGRA 11 (validação cruzada) e a REGRA 12 (customização total). Esse esqueleto segurou a retomada de 2 meses e as 4 sub-fases desta maratona sem quebrar nada.

---

## Descartados na verificação (não são problema / over-engineering)
- Timeout de 60s do SDK abortar Opus longo — improvável no uso real.
- Regex de CORS "ampla" — o código não envia credenciais via CORS; sem risco explorável.
- Query de histórico sem índice — os 6 índices existentes já cobrem.
- create-admin-user "aberta" — na verdade exige header; ainda assim é código morto (vale deletar, entra em A3).
- "Confirmação humana da 3.F não tem mecanismo" — a arquitetura está documentada, só não implementada (é a 3.F, pausada).

---

## Plano recomendado: Fase 3.5 — Fundação & Correções (antes da Fase 4)

Uma sub-fase curta que paga a dívida antes de construir por cima. Ordem por payoff:

**3.5.A — Blindar (1 sessão):** backup/export (B1) + fechar signup + cap de custo diário Anthropic (A1/A2) + deletar functions legadas e tabela `teste` (A3/A4). *Elimina os riscos de perder tudo e de queimar créditos.*

**3.5.B — Versionar (1 sessão):** `supabase/migrations/` com o schema atual como baseline + prompts em arquivos no repo (B2/B3). *A partir daqui nada se perde.*

**3.5.C — Corrigir a Edge (1 sessão):** C1, C2/C3 (waitUntil + idempotência de lançamento), C4, C5, C6, D1 (guardrail anti-fingir). *Fixes pequenos, todos verificados, alto payoff.*

**3.5.D — Processo (1 sessão):** `supabase login` + deploy via CLI (F1), `deno check` + script de fumaça (F2), extrair tools pra módulos (F3), decidir Edge dev/prod (F4). *Torna as próximas fases mais rápidas e seguras.*

**Depois, replanejar a Fase 4** começando por: (1) markdown + editar/arquivar no chat (E7), (2) telas de correção de ideias/lançamentos (D2/E3), (3) seletor de entidade (E2), (4) invalidação de cache (E4) — e só então o resto dos módulos, com triagem por uso real (E5). Upgrade do Supabase (B4) quando o uso virar diário.

**Fora desta janela:** 3.F (Meta, bloqueada) e Fase 5 (proativo/cron).
