---
tipo: planejamento
tags: [backlog, tarefas, roadmap]
atualizado: 2026-04-24
---

# Backlog — Tarefas Pequenas

[[Home]] > Roadmap > Backlog de Tarefas

> Substitui o antigo "Roteiro Completo — Prompts para o Claude Code". Cada item daqui é **uma tarefa pequena**, executável numa única sessão curta do Claude Code, testável no preview antes de ir pra produção.

---

## Como usar este backlog

1. Pedro abre o Claude Code.
2. Pega a **próxima tarefa aberta** (marcada com 🔴).
3. Cola o **prompt** da tarefa no Claude Code.
4. Claude Code executa seguindo o [[Workflow de Desenvolvimento]].
5. Pedro testa o preview, aprova, Claude Code sobe pra produção.
6. Pedro marca a tarefa como ✅ concluída aqui no backlog e parte pra próxima.

**Nunca fazer duas tarefas ao mesmo tempo.** Uma por sessão.

---

## Regras pra criar novas tarefas

Uma tarefa só é "pequena o suficiente" se:
- ✅ Altera idealmente 1 arquivo principal (pode encostar em `app.js` e `supabase.js` se necessário)
- ✅ Tem um critério claro de "funcionou" testável pelo Pedro no preview em < 2 minutos
- ✅ Pode ser revertida sem afetar outras partes do app
- ✅ Cabe numa descrição de 3-5 linhas

Se o escopo ficar maior que isso, **dividir em subtarefas antes de começar**.

---

## Fase 0 — Setup (fundação infra)

### ✅ Tarefa 0.1 — Criar repositório, branches e Vercel

**Status:** Concluída em 2026-04-24 (preview aprovado · merge pra `main` pendente pra próxima sessão).

**Objetivo:** Ter o ambiente `main` (produção) + `dev` (teste) funcionando com preview automático.

**Prompt pro Claude Code:** *ver [[PRIMEIRO PROMPT]]*

**Entregável:**
- Repo novo no GitHub (nome a decidir com Pedro) → `pedropertel/assistente-v4`
- Branches `main` e `dev` criadas ✅
- Projeto no Vercel apontando pro repo ✅
- Página "Hello World" rodando tanto em produção quanto no preview da dev ✅
- URLs preenchidas no [[CLAUDE.md]] ✅

**Critério de aprovação:** Pedro abre as 2 URLs no celular e ambas mostram "Hello World · Assistente". ✅

---

### ✅ Tarefa 0.2 — Criar projeto Supabase e tabela de teste

**Status:** Concluída em 2026-04-24 (preview aprovado e mergeada pra `main` na mesma sessão).

**Decisão tomada:** Reusar o projeto Supabase existente `msbwplsknncnxwsalumd`, com `DROP SCHEMA public CASCADE` + recriação. Schema `auth`, `storage`, Edge Functions e Secrets preservados.

**Objetivo:** Ter o banco novo conectado ao app, com uma tabela `teste` pra validar a conexão.

**Prompt pro Claude Code:**
> Na branch `dev`, crie um projeto Supabase novo (ou limpe o existente `msbwplsknncnxwsalumd` se Pedro preferir reaproveitar — perguntar a ele). Crie uma tabela `teste` com colunas `id` (uuid) e `msg` (text). Insira uma linha `msg = 'conectado'`. No `index.html`, adicione um script que busca essa linha e mostra o texto na tela. Atualize `CLAUDE.md` com as novas URLs e anon key. Faça push na dev e me mande o preview.

**Entregável:**
- `DROP SCHEMA public CASCADE` + recriação no projeto `msbwplsknncnxwsalumd` ✅
- Tabela `teste` (`id uuid`, `msg text`, `created_at timestamptz`) com RLS + policy `allow_all` ✅
- Linha `'conectado'` inserida ✅
- `index.html` com CDN do `supabase-js@2.39.3` e script que busca e exibe `Banco: conectado` ✅
- `CLAUDE.md` com URL do Supabase e Publishable Key (nomenclatura nova) ✅

**Critério de aprovação:** Pedro abre o preview e vê "conectado" na tela. ✅

---

## Fase 1 — Fundação

### ✅ Tarefa 1.1 — Estrutura de pastas e design system (CSS variables)

**Status:** Concluída em 2026-04-24 (preview aprovado e mergeada pra `main` na mesma sessão).

**Objetivo:** Ter o `index.html` com CSS variables do design system (cores, espaçamentos, tipografia) e o toggle dark/light funcionando. Ainda sem conteúdo real.

**Prompt pro Claude Code:**
> Na dev, crie no `index.html` todo o bloco `<style>` com as CSS variables do design system (cores primária, de fundo, de texto, bordas, espaçamentos, raios, sombras, transições) tanto pra tema escuro (default) quanto claro (`html.light`). Crie um botão flutuante que alterna o tema e persiste em `localStorage('assistente-theme')`. Nada mais. Sem sidebar, sem menu. Só um fundo com a cor certa e o botão de tema.

**Entregável:**
- CSS variables (bg/text 3 níveis, accent, border, success/warning/danger, raios, espaçamentos, sombras, transição) ✅
- Tema dark default no `:root`, light em `html.light` (sobrescreve só o que muda) ✅
- Botão `#theme-toggle` flutuante 44×44px, top-right ✅
- Bootstrap anti-FOUC inline no `<head>` ✅
- Persistência em `localStorage('assistente-theme')` ✅

**Critério de aprovação:** Pedro abre o preview, vê fundo escuro, clica no botão, vira claro, recarrega a página e o tema escolhido continua. ✅

---

### ✅ Tarefa 1.2 — Criar `js/core/supabase.js` (instância única)

**Status:** Concluída em 2026-04-24 (preview aprovado e mergeada pra `main` na mesma sessão).

**Objetivo:** Ter o arquivo que cria a instância única do Supabase, importável por qualquer módulo.

**Prompt pro Claude Code:**
> Crie `js/core/supabase.js` que cria a ÚNICA instância do cliente Supabase e exporta como `supabase`. Importe o SDK via CDN UMD no `<script>` do `index.html` ANTES do module. Em `app.js` (criar também), faça um teste mínimo: importa `supabase`, chama `supabase.from('teste').select()`, loga o resultado no console. Nada de auth ainda.

**Entregável:**
- `js/core/`, `js/modules/` criados (com `.gitkeep` em modules) ✅
- `js/core/supabase.js`: instância única, comentário sobre REGRA 5 ✅
- `js/app.js`: entry point que importa supabase e atualiza `#status` ✅
- `index.html`: script inline removido, substituído por UMD + `<script type="module">` ✅
- Visual idêntico ao da Tarefa 1.1 (Hello World + Banco: conectado + tema funcionando) ✅

**Critério de aprovação:** Pedro abre o preview, abre o console do browser no celular (ou pede pro Claude Code explicar como ver), e o Claude Code confirma que o log apareceu com os dados. ✅ (Pedro abriu console no Safari Mac, sem erros)

---

### ✅ Tarefa 1.3 — Tela de login (HTML + CSS, sem lógica)

**Status:** Concluída em 2026-04-24 (preview aprovado e mergeada pra `main` na mesma sessão).

**Objetivo:** Uma tela de login bonita e mobile-first, **sem funcionalidade ainda**.

**Prompt pro Claude Code:**
> Adicione no `index.html` a tela de login: div `#login-screen` visível por padrão, com logo (emoji ou texto por enquanto), campo email, campo senha, botão "Entrar". Design system aplicado. Funciona em 375px. Nenhum `onclick` ainda — só o HTML/CSS.

**Entregável:**
- Overlay full-viewport (`#login-screen`, z-index 1000) com card central (max-width 400px) ✅
- Logo 🧠 64px, título "Assistente" 32px/700, tagline "Seu sistema operacional pessoal" ✅
- Inputs email/senha (48px altura, 16px font anti-zoom iOS), botão "Entrar" `--accent`, link "Esqueci minha senha", `#login-error` reservado ✅
- Foco com borda `--accent` + glow sutil ✅
- Adapta cores em ambos os temas; botão de tema (z-index 1001) continua acessível por cima ✅
- Sem `onclick` no botão (escopo só visual) ✅

**Critério de aprovação:** Pedro vê a tela de login bonita no celular. ✅

---

### ✅ Tarefa 1.4 — Lógica de login com window bridge

**Status:** Concluída em 2026-04-24 (preview aprovado e mergeada pra `main` na mesma sessão).

**Objetivo:** Clicar em "Entrar" efetua login no Supabase.

**Prompt pro Claude Code:**
> Em `app.js`, crie a função `signIn()` que lê os campos email/senha e chama `supabase.auth.signInWithPassword`. Se der erro, mostre em um `<div>` de erro na tela. Exponha `window.signIn = signIn`. No botão "Entrar" do HTML, adicione `onclick="signIn()"`. NÃO implemente ainda a tela de app pós-login nem `onAuthStateChange`. Só isso.

**Entregável:**
- `signIn()` async em `app.js` com validação de vazio + chamada `signInWithPassword` + tradução de erros ✅
- `traduzErroLogin(error)` (3 mensagens conhecidas + fallback) ✅
- `window.signIn = signIn` exposto, seção Window Bridge inicializada ✅
- `onclick="signIn()"` no botão + `onkeydown` Enter nos 2 inputs ✅
- `CLAUDE.md` Window Bridge atualizado com primeiro bloco `// AUTH` ✅
- Login real validado: console mostrou `login ok` + `{user, session}` ✅

**Critério de aprovação:** Pedro digita email/senha errados e vê a mensagem de erro. Digita certo e não dá erro (ainda não tem tela depois, é esperado). ✅

---

### ✅ Tarefa 1.5 — `onAuthStateChange` + troca de tela

**Status:** Concluída em 2026-04-24 (preview aprovado, ciclo completo testado em aba normal e privada). **Marca o fim da fase de autenticação.**

**Objetivo:** Após login, a tela de login some e aparece uma tela vazia de "app".

**Prompt pro Claude Code:**
> Em `app.js`, implemente o `supabase.auth.onAuthStateChange` com a flag `appInitialized` exatamente como está documentado em `CLAUDE.md` (REGRA 6). Quando logado, esconda `#login-screen` e mostre `#app-screen` (crie esse div vazio no HTML com só o texto "App carregado. Logout"). Crie a função `signOut()` e exponha no window. Adicione um botão de logout no `#app-screen`.

**Entregável:**
- `onAuthStateChange` único no top-level com flag `appInitialized` (REGRA 6) ✅
- `showLogin()` / `showApp()` / `initApp(session)` / `signOut()` ✅
- `<div id="app-screen">` envolvendo `<h1>` + `<div id="status">` + botão `Sair` ✅
- CSS do `#app-screen` (full-viewport flex centralizado) e `#logout-btn` (estilo ghost) ✅
- Window Bridge atualizada com `window.signOut` ✅
- Sessão persistida (aba normal abre logado), logout volta pra tela de login ✅

**Critério de aprovação:** Pedro loga, vê "App carregado". Clica em logout, volta pra tela de login. Recarrega a página estando logado — continua logado. ✅

---

### ✅ Tarefa 1.6 — Sidebar/drawer mobile

**Status:** Concluída em 2026-04-24 (preview aprovado e mergeada pra `main` na mesma sessão).

**Objetivo:** Sidebar que em desktop fica fixa à esquerda e em mobile é um drawer aberto por botão.

**Prompt pro Claude Code:**
> No `#app-screen`, crie a sidebar com os 8 itens de menu (Dashboard, Tarefas, Agenda, Documentos, Chat, Sítio, CEDTEC, Config). Em desktop (>768px) fica fixa à esquerda com 260px. Em mobile, fica escondida e abre com um botão hamburger no header. Por enquanto os itens só mostram um `toast` com o nome ao clicar. Expor `toggleSidebar` no window.

**Entregável:**
- `#app-screen` reorganizado em layout 2-colunas (sidebar + main) ✅
- `<aside id="sidebar">` com header (logo "A" + título + X), nav (8 itens com ícones), footer (Sair) ✅
- Drawer mobile com `transform` + backdrop escuro; clique no item fecha drawer ✅
- Desktop (≥ 768px): sidebar sticky 260px, hamburger/X/backdrop escondidos ✅
- `#app-header` sticky com hamburger ☰ + `#page-title` ✅
- `toggleSidebar()`, `goToPage(page)` (placeholder com alert) em `app.js`; `window.toggleSidebar`, `window.goToPage` expostos ✅
- Botão de tema (z-index 1001) continua acima de tudo ✅

**Critério de aprovação:** Pedro testa no celular: abre o drawer, clica em "Tarefas", vê o toast "Tarefas", drawer fecha. Funciona também no desktop. ✅ *(Validado via Responsive Design Mode do Safari Mac — ainda não no celular físico; goToPage usa `alert()` em vez de toast, que entra na Tarefa 1.8)*

---

### ✅ Tarefa 1.6.5 — Safe-area e 100dvh para iPhone 15 Pro Max

**Status:** Concluída em 2026-04-24 (inserida fora da sequência original do backlog, entre 1.6 e 1.7). Preview aprovado e mergeada pra `main` na mesma sessão.

**Objetivo:** Eliminar três problemas antes que apareçam no iPhone real: (1) conteúdo atrás da Dynamic Island, (2) conteúdo atrás da barra de gestos iOS, (3) teclado virtual cobrindo inputs (trocar `100vh` por `100dvh`). Alvo único declarado: iPhone 15 Pro Max com Safari 17+ — sem fallback.

**Entregável:**
- `<meta viewport>` com `viewport-fit=cover` ✅
- `#login-screen` padding com `max(var(--space-6), env(safe-area-inset-*))` no topo e base ✅
- `#app-header` padding topo com `calc(var(--space-N) + env(safe-area-inset-top))` nos dois breakpoints ✅
- `.sidebar-footer` com `padding-bottom: env(safe-area-inset-bottom)` ✅
- `100vh → 100dvh` em `#app-screen` (mobile+desktop) e `#main-content` ✅
- `#sidebar` desktop mantido em `100vh` (decisão consciente registrada no Dev Log) ✅

**Critério de aprovação:** PC inalterado visualmente; simulador iPhone 15 Pro Max com hamburger abaixo da Dynamic Island, header com padding correto, botão Sair acima da barra de gestos quando drawer aberto. ✅

---

### ✅ Tarefa 1.7 — Sistema de rotas (router.js)

**Status:** Aprovada em preview em 2026-04-24; merge pra `main` feito em 2026-05-01 (ficou pendente entre sessões, sem impacto).

**Objetivo:** Navegar entre páginas vazias.

**Prompt pro Claude Code:**
> Crie `js/core/router.js` com `goPage(pageName)` que esconde todas as `<section class="page">` e mostra só a pedida. Crie uma section vazia pra cada uma das 8 páginas com só um título. Ligue os itens da sidebar no `goPage` via window bridge.

**Entregável:**
- `js/core/router.js` com `PAGES`, `goPage(pageId)`, `getCurrentPage()` ✅
- 8 `<section class="page" id="page-X">` no `#page-container` (Dashboard visível, demais com `hidden`) ✅
- `.nav-item[data-page]` em todos os 8 botões da sidebar; `onclick` chama `goPage` ✅
- Item ativo destacado na sidebar via `.active` aplicada pelo router ✅
- Drawer fecha sozinho ao navegar em mobile ✅
- `initApp` chama `goPage('dashboard')` na entrada; `#status` removido do DOM (vai só pro console) ✅
- `window.goPage` substitui `window.goToPage`; `CLAUDE.md` Window Bridge sincronizado ✅

**Critério de aprovação:** Pedro clica em cada item do menu e vê a página correspondente (vazia, só título). ✅

---

### ✅ Tarefa 1.7.5 — Ajustes visuais da sidebar (logo + ordem)

**Status:** Concluída em 2026-05-01 (inserida fora da sequência original do backlog, entre 1.7 e 1.8). Preview aprovado e mergeada pra `main` na mesma sessão.

**Objetivo:** Alinhar o logo da sidebar com a tela de login (🧠) e reordenar a navegação pra refletir o "interface primária = conversa" do `VISAO.md`.

**Entregável:**
- Logo `A` → `🧠` no `<span class="sidebar-logo">` ✅
- CSS `.sidebar-logo`: removido `background: var(--accent)` / `color: white` / `font-weight: 700`; adicionado `background: transparent`, `font-size: 24px`, `line-height: 1` ✅
- Ordem da `.sidebar-nav` invertida: Chat agora é #1, Dashboard #2 ✅
- Página default ao logar trocada de Dashboard pra Chat (`initApp` + `currentPage` no router) ✅
- `VISAO.md` ganhou seção "Ordem visual da navegação" registrando a decisão ✅

**Critério de aprovação:** Pedro loga e cai em Chat com Chat destacado na sidebar; logo 🧠 sem fundo colorido; clicar em Dashboard troca; logout/login mantém Chat como default. ✅

---

### ✅ Tarefa 1.8 — Sistema de toast

**Status:** Concluída em 2026-05-01 (preview aprovado e mergeada pra `main` na mesma sessão). Fecha também a pendência carryover da Tarefa 1.5.

**Objetivo:** Sistema reutilizável de notificações.

**Prompt pro Claude Code:**
> Crie `js/core/toast.js` com `show(msg, type)` onde type = 'success' | 'error' | 'info'. Limite a 3 toasts visíveis. Auto-remove em 3s. Expor `window.showToast`.

**Entregável:**
- `js/core/toast.js` com `show(msg, type, duration)`, 4 tipos (`success`/`error`/`info`/`warning`), `MAX_TOASTS=3`, default `3000ms` ✅
- `ensureContainer()` lazy cria `#toast-container` na primeira chamada ✅
- Animação enter/exit com `force reflow` + `transition` 200ms ✅
- Mobile: bottom centralizado com `env(safe-area-inset-bottom)`. Desktop (≥ 768px): canto inferior direito ✅
- `pointer-events: none` no container, `auto` em cada toast (não bloqueia cliques no app) ✅
- `signOut()` agora usa `showToast(..., 'error')` em vez de `alert()` (fecha pendência da 1.5) ✅
- `window.showToast` exposto; `CLAUDE.md` Window Bridge com seção `// FEEDBACK` ✅

**Critério de aprovação:** Pedro pede pro Claude Code disparar 3 toasts via console. Todos aparecem, desaparecem em 3s, têm cores diferentes. ✅

---

### ✅ Tarefa 1.9 — Sistema de modal

**Status:** Concluída em 2026-05-01 (preview aprovado e mergeada pra `main` na mesma sessão). Trouxe junto o sistema de botões genéricos do design system (`.btn` + variantes) e a variável `--shadow-lg`.

**Objetivo:** Sistema reutilizável de modais.

**Prompt pro Claude Code:**
> Crie `js/core/modal.js` com `open(title, bodyHTML, footerHTML)` e `close()`. Suporta empilhar modais. Expor `window.closeModal`.

**Entregável:**
- `js/core/modal.js` com `show(config)` / `close()` — `config = { title?, body, actions?, dismissible? }` ✅
- 4 tipos de fechamento: botão, X, Esc, clique no overlay (todos respeitam `dismissible`) ✅
- `actions` configurável com 3 variantes de botão (primary/secondary/danger) e `onClick` opcional ✅
- Body suporta texto puro ou HTML simples (heurística `includes('<')`) ✅
- Listeners limpos no `close()` (sem vazamento de Esc) ✅
- Animação fade + scale-up (overlay 200ms, modal scale 0.95→1) ✅
- `body.modal-open { overflow: hidden }` trava scroll do fundo ✅
- Sistema `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-danger` adicionado ao design system ✅
- `--shadow-lg` adicionado (dark: 30%, light: 15%) ✅
- `window.showModal` / `window.closeModal` expostos; `CLAUDE.md` Window Bridge atualizado ✅

**Critério de aprovação:** Claude Code abre um modal de teste. Pedro vê, fecha no X, fecha clicando fora, tenta empilhar 2 modais. ✅ *(Empilhamento real não suportado — abrir 2º modal fecha o 1º. Decisão registrada no Dev Log: vira tarefa própria se virar demanda.)*

---

### ✅ Tarefa 1.10 — Utils (`utils.js`)

**Status:** Concluída em 2026-05-01 (preview aprovado e mergeada pra `main` na mesma sessão). **Última tarefa da Fase 1.**

**Objetivo:** Helpers `fmtDate`, `fmtMoney`, `fmtRelative`, `debounce`, `slugify`.

**Prompt pro Claude Code:**
> Crie `js/core/utils.js` com as funções: `fmtDate(iso)` → "24/04/2026", `fmtMoney(cents)` → "R$ 1.234,56", `fmtRelative(iso)` → "há 2h", `debounce(fn, ms)`, `slugify(str)`. Exporte todas.

**Entregável:**
- `fmtDate(input, { includeTime })` — pt-BR via `Intl.DateTimeFormat`, parseDate defensivo (date-only não escorrega de dia em Brasília) ✅
- `fmtMoney(cents, { showSymbol, showSign })` — centavos → reais via `Intl.NumberFormat`, prefixo manual de sinal ✅
- `fmtRelative(input)` — "agora mesmo" / "há N min/h" / "ontem"/"amanhã" / "há N dias" / fmtDate como fallback após 7d ✅
- `debounce(fn, delay=300)` — clássico setTimeout/clearTimeout ✅
- `slugify(str)` — NFD + remove diacríticos + lowercase + hífens ✅
- `window.utils` exposto pra debug; `CLAUDE.md` Window Bridge com seção `// UTILS (debug/console)` ✅

**Critério de aprovação:** Claude Code roda os 5 testes no console e mostra o resultado ao Pedro. ✅ *(18 casos validados localmente com Node antes do push; Pedro confirmou os 4 restantes no console do preview)*

---

**🎯 ✅ FASE 1 — FUNDAÇÃO CONCLUÍDA em 2026-05-01.**

12 tarefas fechadas (10 do plano original + 2 inserções fora-de-sequência: 1.6.5 mobile-first iPhone e 1.7.5 ajustes visuais). App logável com navegação entre 8 páginas placeholder, design system completo, mobile-first iPhone 15 Pro Max, núcleo modular em `js/core/` (supabase, router, toast, modal, utils). Sem dívidas técnicas pendentes. Ver Dev Log de 2026-05-01 pro marco completo.

---

## Fase 2 — Banco de dados (feito em pedacinhos também)

### ✅ Tarefa 2.1 — Tabela `entidades`

**Status:** Concluída em 2026-05-01 (preview/SQL executado no Supabase Dashboard, 6 seeds inseridos — CEDTEC, Pincel Atômico, Sítio, Gráfica, Agência, Pessoal). Mergeada pra `main` em 2026-05-01 junto com a 2.2.

**Entregável:**
- Tabela raiz `entidades` com `id/slug/nome/tipo/descricao/icone/cor_hex/ordem/ativa/created_at/updated_at` ✅
- RLS habilitada + policy `auth_full_access` pra `authenticated` ✅
- Função `set_updated_at()` genérica (reaproveitada nas próximas tabelas) + trigger `BEFORE UPDATE` ✅
- 6 seeds idempotentes via `ON CONFLICT (slug) DO NOTHING` ✅
- Documentação completa em `050 - Banco de Dados/Tabela — entidades.md` ✅

### ✅ Tarefa 2.2 — Tabela `tarefas`

**Status:** Concluída em 2026-05-01 (SQL aprovado por Pedro após executar no Supabase, 3 seeds com JOIN funcionando). Mergeada pra `main` na mesma sessão.

**Entregável:**
- Tabela `tarefas` com 14 colunas, FK pra `entidades(id)` ON DELETE RESTRICT ✅
- 4 status (backlog/a_fazer/fazendo/feito), 4 prioridades, 4 origens — todos via CHECK ✅
- Coluna `agente_id` sem FK ainda (vira FK na Tarefa 2.5) ✅
- Trigger especial `set_concluida_em()` auto-preenche/zera `concluida_em` em mudanças de status ✅
- 4 índices: 2 normais + 2 parciais (`prazo WHERE NOT NULL`, `arquivada WHERE arquivada=false`) ✅
- RLS + policy `auth_full_access` (mesmo padrão da 2.1) ✅
- 3 seeds idempotentes via `WHERE NOT EXISTS` (convenção registrada na doc — pra tabelas sem unique constraint natural) ✅
- Documentação completa em `050 - Banco de Dados/Tabela — tarefas.md` ✅

### ✅ Tarefa 2.3 — Tabela `eventos`

**Status:** Concluída em 2026-05-01 (SQL aprovado por Pedro após executar no Supabase, 3 seeds com `AT TIME ZONE 'America/Sao_Paulo'` retornando horários corretos). Mergeada pra `main` na mesma sessão.

**Entregável:**
- Tabela `eventos` com 17 colunas, FK pra `entidades(id)` ON DELETE RESTRICT ✅
- 5 tipos de evento (`reuniao/tarefa/pessoal/lembrete/bloqueio`), 5 padrões de recorrência (`nenhuma/diaria/semanal/mensal/anual`), 5 origens (inclui `google_calendar`) ✅
- `lembretes_min integer[]` (array de minutos antes), default `'{}'` ✅
- `google_event_id text UNIQUE` preparada pra sync bidirecional Google Calendar ✅
- Constraint `chk_eventos_horario CHECK (fim > inicio)` ✅
- 5 índices: `entidade_id`, `inicio`, composto `(inicio, fim)` pra conflitos, `arquivado` parcial, `google_event_id` parcial ✅
- RLS + policy `auth_full_access` ✅
- 3 seeds idempotentes via `WHERE NOT EXISTS` (Bett Brasil, voo Punta Cana, bloqueio Meta) ✅
- Documentação completa em `050 - Banco de Dados/Tabela — eventos.md` ✅
- **Bônus:** `050 - Banco de Dados/CONVENÇÕES.md` criado com seção mãe sobre fuso horário (lição aprendida ao validar a 2.3) + idempotência + FKs + naming + RLS — referência única pras próximas tabelas ✅

### ✅ Tarefa 2.4 — Tabelas `pastas` + `documentos` + bucket Storage

**Status:** Concluída em 2026-05-01. **Maior tarefa da Fase 2 até agora** — 2 tabelas relacionadas + primeiro uso de Supabase Storage. Mergeada pra `main` na mesma sessão.

**Entregável:**
- Tabela `pastas` (12 colunas) — hierarquia self-referential, **máximo 3 níveis** (CHECK + trigger), 2 índices únicos parciais (raiz/filhas pra contornar NULL em UNIQUE composta), trigger `validar_pasta_coerencia` (auto-calcula nivel + valida entidade) ✅
- Tabela `documentos` (16 colunas) — metadados, `tags text[]` indexado via GIN, `storage_path UNIQUE`, `bigint` em `tamanho_bytes`, trigger `validar_documento_pasta` ✅
- 5 origens em `documentos`: `manual/chat/sistema/email/whatsapp` (sem `voz`, com `email`+`whatsapp` pra Marcela salvar anexos automaticamente na Fase 3) ✅
- Bucket Storage `documentos` (privado, 50 MB, MIME aberto) — **reutilizado de projeto antigo** após validação e ajuste (Public OFF, MIME types limpos) ✅
- 4 policies do Storage (upload/leitura/update/delete `_autenticado`) — já existiam corretas no bucket antigo, mantidas ✅
- Convenção de Storage adicionada a `CONVENÇÕES.md` (bucket privado, path plano `{id}.{extensao}`, 4 policies por bucket, `storage_path UNIQUE`, lição sobre reaproveitar bucket de projeto antigo) ✅
- Documentação completa em `Tabela — pastas.md` e `Tabela — documentos.md` (fluxo upload→INSERT→download, signed URL, busca por tag) ✅
- 3 seeds de pastas (Marketing/CEDTEC, Criativos Maio 2026 dentro dela, Documentos pessoais/Pessoal); `documentos` fica vazia (uploads reais começam na Fase 3) ✅

### ✅ Tarefa 2.5 — Tabelas `agentes` + `personas` + 6 ALTER TABLE

**Status:** Concluída em 2026-05-01. **Tarefa mais densa da Fase 2** — mudança arquitetural de plano (4 agentes → 1 agente + 4 personas), criação de 2 tabelas + 6 ALTER TABLE conectando o sistema. Mergeada pra `main` na mesma sessão.

**Decisão arquitetural:** o plano original era 4 agentes independentes. Mudou pra **1 agente único** ("Assistente") com visão completa + **4 personas** (Marcos/Bruno/Marcela/Alemão) como **modos de adaptação de tom**. Memória unificada, decisões cruzam entidades. Reversível — schema continua suportando multi-agente.

**Entregável:**
- Tabela `agentes` (13 colunas) — 1 seed (Assistente, Haiku 4.5, temp 0.7, max_tokens 4096, prompt_base de ~4.3 KB) ✅
- Tabela `personas` (12 colunas) — 4 seeds (Marcos→cedtec, Bruno→pincel-atomico, Marcela→transversal, Alemão→sitio), `entidades_alvo text[]` indexado via GIN, contextos detalhados de ~2.9 KB cada ✅
- Sem FK `personas → agentes` — decisão arquitetural reversível registrada em `Tabela — personas.md` ✅
- 6 ALTER TABLE: 3 colunas `persona_id` novas em `tarefas/eventos/documentos` + 6 FKs (`agente_id` e `persona_id` em cada uma das 3) ON DELETE SET NULL ✅
- 6 índices parciais nas FKs novas (`WHERE col IS NOT NULL`) ✅
- `CONVENÇÕES.md` ganhou 2 seções novas: **"FKs estruturais vs metadados"** (RESTRICT vs SET NULL com tabela de decisão) e **"Idempotência de ALTER TABLE"** (drop+add pra constraints/triggers, IF NOT EXISTS pra colunas/índices) ✅
- Bucket `agentes` antigo apagado (tech debt da 2.4 resolvido) ✅
- Capabilities deixadas pra Fase 3 (não vão no schema desta tarefa) ✅
- Documentação completa em `Tabela — agentes.md` e `Tabela — personas.md` (incluindo prompt_base do Assistente e os 4 contextos completos como referência, exemplos JS de inferência de persona por entidade) ✅

### ✅ Tarefa 2.5.1 — Router pattern (modelo_override + nivel_complexidade + persona Roteador)

**Status:** Concluída em 2026-05-01 (evolução da 2.5, inserida fora da sequência original do backlog entre 2.5 e 2.6). Mergeada pra `main` na mesma sessão.

**Motivação:** após o fechamento da 2.5, decisão arquitetural refinada — Haiku 4.5 (default do agente) é fraco em raciocínio complexo (proposta comercial, análise estratégica). Sonnet/Opus são caros. Solução: router pattern. Persona interna ("Roteador", sempre Haiku) classifica cada mensagem antes da resposta; Edge Function da Fase 3 escolhe Haiku/Sonnet/Opus pelo nível.

**Entregável:**
- `ALTER TABLE personas ADD COLUMN IF NOT EXISTS` × 3: `modelo_override text`, `interno boolean DEFAULT false`, `nivel_complexidade text` ✅
- CHECK constraint nomeada `chk_personas_nivel_complexidade` (idempotente via DROP+ADD) — aceita NULL ou (`simples`/`medio`/`complexo`) ✅
- COMMENT em todas as colunas novas ✅
- UPDATEs idempotentes (só preenche onde está NULL): Marcos=`medio`, Bruno=`complexo`, Marcela=`simples`, Alemão=`simples` ✅
- INSERT da persona Roteador (interno=true, modelo_override='claude-haiku-4-5-20251001', ordem=0, contexto de ~9.3 KB com regras de classificação e formato JSON estrito) ✅
- `Tabela — personas.md` ganhou seções "Router pattern (2.5.1)" + "A persona Roteador (interna)" com mapeamento, fluxo completo e contexto de referência ✅
- `Tabela — agentes.md` ganhou seção "Atualização 2.5.1" — `modelo` agora é fallback ✅
- `CONVENÇÕES.md` ganhou seção "Router pattern e escolha de modelo" (mapeamento, quando usar modelo_override, padrão pra adicionar personas internas) ✅
- `CLAUDE.md` Status atual: 4 → 5 personas (+ Roteador interno) + menção ao router pattern ✅

---

### ✅ Tarefa 2.6 — Tabelas `chat_mensagens` + `chat_anexos`

**Status:** Concluída em 2026-05-01. **Tarefa central** — coração do sistema (memória persistente do agente único). Mergeada pra `main` na mesma sessão.

**Decisão arquitetural:** lista plana, não threads. Coerente com "cérebro único" — o histórico é montado no cliente filtrando por `entidade_id` + `created_at` + (opcional) `persona_id`. Schema continua suportando `conversa_id` futuro se virar dor.

**Entregável:**
- Tabela `chat_mensagens` (18 colunas) — `papel` (user/assistant/system, mesmos termos da API Anthropic), `conteudo` markdown, FKs SET NULL pra entidades/agentes/personas (histórico sobrevive a deletes), métricas completas (`tokens_entrada`/`tokens_saida`/`custo_usd numeric(10,6)`/`custo_brl numeric(10,4)`/`latencia_ms`), `mensagem_pai_id` self-reference SET NULL pra rastreio de cadeias, `erro` text pra falhas de chamada, `favorita` boolean ✅
- Roteador grava em `chat_mensagens` com `papel='system'` + `persona_id=<roteador>` — debug e auditoria ✅
- 6 índices: `papel`, `entidade_id` parcial, `persona_id` parcial, `mensagem_pai_id` parcial, `created_at DESC`, `favorita` parcial ✅
- Tabela `chat_anexos` (11 colunas) — 4 tipos (imagem/audio/documento/video), `mensagem_id NOT NULL` com **ON DELETE CASCADE** (exceção consciente — anexo é filho biológico), `documento_id` opcional SET NULL (vínculo com biblioteca permanente), `duracao_segundos` pra audio/video, `transcricao` pra audio, `storage_path` UNIQUE com prefixo `chat_anexos/` (exceção consciente ao path plano) ✅
- 3 índices em `chat_anexos`: `mensagem_id`, `documento_id` parcial, `tipo` ✅
- 2 seeds em `chat_mensagens` (user "primeira mensagem" sem métricas + assistant Haiku com 250in/87out/$0.000343/R$0.0019/1240ms) ✅
- 1 seed em `chat_anexos` (imagem PNG 145 kB vinculada à mensagem do user) ✅
- `CONVENÇÕES.md` ganhou **2 exceções registradas**: CASCADE em `chat_anexos.mensagem_id` (com nota sobre Storage não ser apagado pelo CASCADE) e prefixo `chat_anexos/` no bucket compartilhado (com critérios pra reavaliar) ✅
- Documentação completa em `Tabela — chat_mensagens.md` (~340 linhas) e `Tabela — chat_anexos.md` (~290 linhas) — exemplos JS de "carregar últimas N", "reconstruir cadeia", "upload completo", "apagar mensagem com cleanup do Storage", "salvar anexo na biblioteca permanente" ✅

### ✅ Tarefa 2.6.1 — REGRA 12 (Princípio de Customização Total)

**Status:** Concluída em 2026-05-01 (inserida fora da sequência original do backlog, entre 2.6 e 2.7). Tarefa puramente de documentação — sem SQL, sem código. Mergeada pra `main` na mesma sessão.

**Motivação:** durante o início da Tarefa 2.7 (Sítio), Pedro questionou se as 25 categorias seriam editáveis. A resposta — SIM — virou regra inviolável que vale pra TUDO no sistema, e precisa dirigir todas as próximas tarefas.

**Princípio:** Pedro NUNCA mais usa Claude Code, Supabase Dashboard ou terminal pra mexer em dados depois que o sistema estiver pronto. Toda criação/edição/configuração/exclusão acontece nas telas do app. Claude Code volta apenas pra evoluir o sistema (features, bugs estruturais, arquitetura) — nunca pra dados.

**Entregável:**
- Nova **REGRA 12** no CLAUDE.md (após REGRA 10) com 5 consequências práticas pras tarefas seguintes ✅
- Nova seção **"Customização total (REGRA 12 do CLAUDE.md)"** no `CONVENÇÕES.md` com regras pra toda tabela nova (soft-delete, schema flexível, slug/nome editáveis, CRUD via UI), tabela de vocabulário interno (CHECK fixo) vs preferência do usuário (customizável via tabela `configuracoes` da Tarefa 2.9), e nota sobre seeds como ponto de partida ✅
- Esta entrada no Backlog ✅
- Entrada no Dev Log de 2026-05 com decisão arquitetural completa ✅

**Impacto pras próximas tarefas:**
- **2.7+ (todas):** seeds são ponto de partida, não imutáveis. Toda tabela com `ativa`/`arquivada` boolean. CHECK só em vocabulário estrutural do código.
- **2.9 (configuracoes):** será o lugar onde labels visuais de vocabulário interno ficam customizáveis (`status='fazendo'` no banco vira "Em Produção" na UI se Pedro quiser).
- **Fase 4 (módulos UI):** toda tabela do sistema PRECISA ter sua tela equivalente — listagem + criação + edição + arquivamento. Sem exceção.

---

### ✅ Tarefa 2.7 — Tabelas do Sítio (`sitio_categorias` + `sitio_lancamentos`)

**Status:** Concluída em 2026-05-01. Mergeada pra `main` na mesma sessão. **Primeira tarefa nascida sob a REGRA 12** (2.6.1) — desenho refletiu "seeds = ponto de partida editável".

**Entregável:**
- Tabela `sitio_categorias` (12 colunas) — hierarquia 2 níveis (raiz + subcategoria) sem trigger de coerência (UI controla profundidade), 2 índices únicos parciais (raízes vs filhas) contornando NULL em UNIQUE composta, `ativa boolean` pra soft-delete REGRA 12, `tipo` denormalizado consciente (entrada/saida) pra queries de fluxo de caixa sem JOIN ✅
- **29 seeds** (não 25 — contagem inicial errada, corrigida) — 8 categorias-raiz (Investimento/Receita/Insumos/Mão de obra/Equipamento/Operacional/Tributos/Outros) + 21 subcategorias cobrindo realidade rural de café. **Todas editáveis/arquiváveis pela UI** ✅
- Tabela `sitio_lancamentos` (22 colunas) — `valor_centavos bigint` (até R$ 92 quatri), `data_lancamento date` sem hora (created_at sequencia intra-dia), `quantidade numeric(10,3)` + `unidade text` + `valor_unitario_centavos bigint` opcionais (sem trigger validando `qtde × unit = total` — descontos/frete), 5 formas de pagamento via CHECK, `fornecedor text` livre não-normalizado ✅
- **Rastreio voz→lançamento:** `transcricao_original text` + `mensagem_origem_id uuid REFERENCES chat_mensagens(id) ON DELETE SET NULL` — Alemão estrutura, schema preserva o original pra debug/aprendizado ✅
- 7 índices: entidade, categoria, tipo, `data DESC`, composto `(entidade_id, data DESC)`, arquivado parcial, mensagem_origem_id parcial ✅
- 5 origens: `manual/chat/voz/sistema/importacao` (`importacao` reservado pra extrato bancário futuro) ✅
- 6 FKs: 2 estruturais RESTRICT (entidade_id, categoria_id) + 4 metadados SET NULL (comprovante_doc_id, mensagem_origem_id, agente_id, persona_id) ✅
- 3 seeds de lançamento (aporte R$ 50k transferência + adubo R$ 1.500 pix + diarista R$ 240 dinheiro) com JOIN duplo categoria→pai funcional ✅
- `CONVENÇÕES.md` ganhou 3 seções novas: **Soft-delete formalizado** (tabela com todas as colunas e defaults), **Denormalização consciente** (regra de exceção + tabela com casos no projeto), **Tabelas customizáveis** (lista que cresce a cada tarefa) ✅
- Documentação completa em `Tabela — sitio_categorias.md` (~250 linhas) e `Tabela — sitio_lancamentos.md` (~330 linhas) — fluxo voz documentado, exemplos JS de fluxo de caixa, criação manual e via voz, soft-archive ✅

### ✅ Tarefa 2.8 — Módulo Meta Ads (5 tabelas: credenciais + conexões + cache hierárquico)

**Status:** Concluída em 2026-05-01. **Maior tarefa de banco da Fase 2** — 5 tabelas, primeiro uso de Supabase Vault, 3 novas exceções CASCADE, hierarquia de cache em 3 níveis. Mergeada pra `main` na mesma sessão.

**Decisões arquiteturais:**
- **Vault pra tokens** (não pgcrypto, não RLS-only). Plano A confirmado — extension `supabase_vault 0.3.1` instalada no projeto.
- **3 tabelas separadas** (campanhas/adsets/ads) em vez de 1 achatada com `nivel ENUM` — schema enxuto, queries claras, índices otimizados por nível.
- **`raw_data jsonb`** em todas as 3 tabelas de cache — estratégia híbrida (colunas dedicadas pras métricas top + jsonb pro resto). Sem ALTER TABLE pra cada métrica nova da Meta.
- **`campanha_id_meta` denormalizado em ads** — evita JOIN duplo em queries comuns.
- **`targeting jsonb` em adsets** — 50+ campos possíveis, alta variabilidade, lógica AND/OR aninhada (`flexible_spec`) impossível em colunas planas.
- **`creative_*` dedicado em ads** — não tabela `meta_creatives` separada. Reuso raro no fluxo do Pedro.
- **Saldo cacheado ~5min** (não tempo real) — trade-off rate limit Meta vs UX.
- **Sem registro de recargas** — Pedro foi explícito. Saldo via Graph API, não via histórico.

**Entregável:**
- `meta_credenciais` (10 colunas) — `vault_secret_id uuid UNIQUE` referenciando `vault.secrets.id` (FK lógica, schema separado), 1 seed placeholder com secret no Vault ✅
- `meta_conexoes` (15 colunas) — multi-conta desde início, UNIQUE `(entidade_id, ad_account_id)`, saldo cacheado, gating de re-sync via `last_campanhas_sync_at`, 1 seed placeholder pra CEDTEC ✅
- `meta_campanhas_cache` (31 colunas) — métricas top + raw_data jsonb, UNIQUE `(conexao_id, id_meta)` pra UPSERT idempotente do sync ✅
- `meta_adsets_cache` (34 colunas) — `targeting jsonb`, `billing_event` + `optimization_goal`, FK lógica `campanha_id_meta` ✅
- `meta_ads_cache` (33 colunas) — `creative_*` dedicado, FK lógica dupla (`adset_id_meta` + `campanha_id_meta` denormalizado) ✅
- 4 ocorrências CASCADE consolidadas em CONVENÇÕES.md (era só 1 antes — chat_anexos) com 3 critérios formais ✅
- Nova seção "Integração com sistemas externos" no CONVENÇÕES.md (Vault + cache de APIs) ✅
- 5 docs de tabela em `050 - Banco de Dados/` ✅
- Status: 11 → 16 tabelas, Fase 2 a 89% (falta apenas 2.9) ✅

### ✅ Tarefa 2.9 — Tabela `configuracoes`

**Status:** Concluída em 2026-05-01. **Última tarefa da Fase 2.** Mergeada pra `main` na mesma sessão.

**Decisão arquitetural:** chave-valor genérico (não tabelas específicas) com chaves ponto-separadas (`ui_labels.tarefa.status.fazendo`). `jsonb` no valor cobre string/number/boolean/object/array. Hard-delete (3ª exceção justificada ao soft-delete padrão — configs são descartáveis com `valor_default` pra restaurar).

**Entregável:**
- Tabela `configuracoes` (9 colunas) — `chave text UNIQUE` ponto-separada, `valor jsonb` flexível, `categoria text` sem CHECK (REGRA 12), `editavel_por_usuario boolean` flag UI, `valor_default jsonb` pra botão "Restaurar padrão" ✅
- 16 seeds idempotentes via `ON CONFLICT (chave) DO NOTHING`: 13 `ui_labels` (4 status + 4 prioridades de tarefa + 5 tipos de evento) + 2 `ai_defaults` (modelo + temperatura) + 1 `sistema` (flag onboarding interna) ✅
- 2 índices: `categoria` (queries por grupo) + `editavel_por_usuario` parcial (UI da tela de configurações) ✅
- RLS + policy `auth_full_access` ✅
- `CONVENÇÕES.md` ganhou: 3ª linha de exceção ao soft-delete (configuracoes); nova seção **"Convenção de nomenclatura — chaves ponto-separadas"** com regras e categorias-raiz conhecidas; "Tabelas customizáveis" ganhou `configuracoes` ✅
- `CLAUDE.md` "Status atual": **Fase 2 marcada como COMPLETA (100%)**, próxima fase = Fase 3 ✅
- Documentação completa em `Tabela — configuracoes.md` (~280 linhas) com 5 exemplos JS (getLabel com fallback, carregar tudo de uma vez, atualizar via UI, restaurar padrão, listar editáveis) ✅

---

### ✅ Tarefa 2.10 (BÔNUS) — Módulo de Ideias

**Status:** Concluída em 2026-05-01. **Tarefa bônus pós-fechamento da Fase 2** — pedida pelo Pedro depois da 2.9 ao descrever uma necessidade real ("ideias aleatórias que acho boas e depois esqueço"). Mergeada pra `main` na mesma sessão.

**Decisão arquitetural:** Desenho A (tabela isolada) — simplicidade > flexibilidade pra MVP. Conversão pra tarefa/evento/doc fica pra Fase 4 ou tarefa futura via `status='convertida'` + `tags`/`entidade_id`/`proxima_acao_sugerida`. Schema permite evoluir pra Desenho C (FKs `convertida_em_tarefa_id` etc.) sem quebra.

**Persona dedicada:** Marina (Curadora de Ideias) — 6ª persona, transversal (`entidades_alvo='{}'` igual Marcela), Sonnet 4.6 via router pattern (`nivel_complexidade='medio'`), postura "escuta sem interromper, propõe sem pressionar — ideia precisa maturar antes de virar tarefa".

**Entregável:**
- Tabela `ideias` (17 colunas) — `transcricao_original` + `mensagem_origem_id` pra rastreio voz→ideia (mesmo padrão de `sitio_lancamentos`), `tags text[]` com GIN, `proxima_acao_sugerida` text + `proxima_acao_aceita` boolean (sem FK pra tarefa — schema aberto), workflow `status` (capturada → refinada → convertida/arquivada) ✅
- Persona Marina inserida em `public.personas` (slug `marina`, ícone 💡, cor `A855F7`, `nivel_complexidade='medio'`, contexto ~9.8 KB) ✅
- 8 labels customizáveis em `configuracoes` (`ui_labels.ideia.status.*` × 4 + `ui_labels.ideia.origem.*` × 4) — segunda aplicação da REGRA 12 ✅
- 7 índices: entidade parcial, status parcial (≠ arquivada), favorita parcial, tags GIN, persona parcial, created DESC, mensagem parcial ✅
- 3 seeds (CEDTEC voz, transversal chat, pessoal manual) ✅
- Doc completo em `050 - Banco de Dados/Tabela — ideias.md` (~280 linhas) com fluxo voz→Marina, workflow status, 6 exemplos JS ✅
- `Tabela — personas.md` atualizado com seção "Marina" + tabela de níveis (4 → 5 personas reais) ✅
- `CONVENÇÕES.md` "Tabelas customizáveis" ganhou `ideias` e nota sobre `personas` (Marina entrou) ✅
- `CLAUDE.md` "Status atual": 17 → **18 tabelas**, 5 → 6 personas ✅

---

## Fase 3 — IA backend (Edge Functions + Anthropic + chat real)

> **Reconciliação de nomenclatura (2026-05-02):** o plano original do roadmap chamava "Fase 3 = UI dos módulos" e "Fase 4 = Chat IA". Durante a maratona da Fase 2 (2026-05-01) ficou claro que a IA tem que vir antes da UI dos módulos — chat é a interface primária do sistema (`VISAO.md`). A nomenclatura foi oficializada como **Fase 3 = IA backend / Fase 4 = UI dos módulos**.

**Plano detalhado:** `.claude/plans/temporal-tinkering-castle.md` (Pedro abre via `/plan` no Claude Code).

**Triplo /plan validado** — Pedro pediu plano em 3 lados (Claude.ai, Claude Code, ele próprio) pra evitar erro arquitetural na fase mais crítica. Convergência total após 2 rodadas de revisão.

### Sub-fases (10 totais — 7 core + 3 opcionais)

| Sub-fase | Objetivo | Horas |
|---|---|---|
| **3.0** | Reconciliar Backlog (esta entrada) | **0.5h** |
| **3.A** | Fundação Edge Functions (Deno+TS, health-check, secrets) | **3h** |
| **3.B** | Echo Anthropic (Haiku puro, sem router) — primeira chamada real | **3h** |
| **3.C** | `prompt_base` real + placeholders + histórico de 20 mensagens | **2.5h** |
| **3.D** ✅ | Router pattern real (Roteador → JSON → modelo dinâmico, chips de persona) | **5h** (real: ~8h em 8 sub-tarefas) |
| **3.F** ⏸️ | **🎯 Marcos viajando pro Meta (PRIORIDADE #1)** — Vault + tools + confirmação humana pra writes. **Pausada 2026-07-06: bloqueio externo** (Meta Business em nome da esposa; retomar via conta dela). 3.F.0.5 ✅ feita | **9.5h** |
| **3.E** ✅ | Streaming SSE token-a-token — **feita 2026-07-06** (Edge v46 opt-in + front; eventos router/delta/tool antecipam chip em ~1.5s; histórico paralelo ao Roteador) | 3.5h |
| **3.G** ✅ | Polimento — **feita 2026-07-06** (3.G.1 cotação real er-api/CDN v48 · 3.G.2 comportamento da IA em configuracoes, 7 seeds · 3.G.3 rate limit 429 pré-Anthropic, v49) | 3.5h |
| **3.H** ✅ | Alemão (voz Web Speech → `sitio_lancamentos`) — **feita 2026-07-07** (tool lancar_custo_sitio com spec dinâmico + 🎤 ditado revisável + origem_voz/transcricao + regra rural no Roteador, v50-v51) | 5h |
| **3.I** ✅ | Marina (captura de ideias com tools) — **feita 2026-07-06, adiantada por causa da pausa da 3.F** | 2h |
| **3.J** | Marcela briefing matinal (cron) — opcional, adiável pra Fase 5 | 3h |

**🎯 Caminho curto até Marcos em produção (PRIORIDADE #1 do VISAO.md):** 3.0 → 3.A → 3.B → 3.C → 3.D → 3.F = **23.5h** em 6 sub-fases. **5/6 fechadas. Falta só 3.F (~9.5h).**

**Depois de Marcos em produção:** 3.E (streaming), 3.G (polimento), 3.H (Alemão voz), 3.I (Marina). Ordem flexível.

**Opcional/empurrável pra Fase 5:** 3.J (Marcela cron briefing).

**Total Fase 3 completa:** ~40.5h.

### Decisões críticas batidas no martelo (registradas no Dev Log)

- **Voz:** Web Speech API como default (custo zero, tempo real, Safari iOS processa local). Whisper fica como fallback futuro opcional (tarefa 3.K, fora da Fase 3).
- **Function calling:** Anthropic `tools` parameter nativo + observabilidade via `chat_mensagens.tool_calls/tool_results jsonb` (ALTER TABLE na 3.F.0.5 — primeira da Fase 3).
- **Bootstrap Meta:** SQL manual via Supabase Dashboard como dívida temporária. Primeira tela da Fase 4 é cadastro Meta credenciais.
- **Streaming:** SSE depois de Marcos. Marcos sem streaming já é vitória.
- **Mapeamento `nivel_complexidade → modelo`:** hardcoded no Edge primeiro, migra pra `configuracoes.ai_defaults.mapeamento_complexidade` na 3.G.2.
- **Roteador continua structured output JSON** (não tool use — não é "chamar ferramenta", é "classificar").
- **Tools são capacidades do SISTEMA, não da persona (decisão Pedro, 2026-07-06, na 3.I):** persona define o TOM, não o PODER. Tool presa a persona faz a persona sem ela "fingir" execução ("Anotado ✓" sem gravar — validado em teste). `TOOLS_TRANSVERSAIS` valem em todo turn; `TOOLS_POR_PERSONA` é exceção pra tools com credencial/risco (Meta na 3.F). Registro migra pra `configuracoes` na 3.G.

---

### ✅ Tarefa 3.0 — Reconciliar Backlog (2026-05-02)

Commit isolado de reconciliação documental. Sem código. Backlog passa a refletir Fase 3 = IA backend e Fase 4 = UI dos módulos. Primeira tarefa formal da Fase 3.

- Backlog reescrito (linhas 551-592): "Fase 3 — IA backend" com tabela das 10 sub-fases + decisões críticas; "Fase 4 — UI dos módulos" preserva conteúdo antigo da Fase 3 (kanban/drag-drop) com itens 4.1-4.8 ✅
- CLAUDE.md "Status atual" atualizado: caminho curto 23.5h, plan file path, decisões críticas resumidas ✅
- Dev Log — 2026-05.md ganhou entrada "Plano da Fase 3 oficializado" (oficialização) + esta entrada de fechamento da 3.0 ✅
- Sem mudança de código, sem preview pra testar — pura documentação ✅

**Próximo:** Tarefa 3.A.1 — estrutura `supabase/functions/_shared/`.

---

### ✅ Tarefa 3.A — Fundação Edge Functions (2026-05-02)

Primeira tarefa de código da Fase 3. Estrutura, deploy, secrets e CORS funcionando — validado end-to-end no Safari iPhone. **Sem chamada Anthropic ainda** — só infra, custo zero por request.

- **3.A.1 — Estrutura `supabase/functions/_shared/`** ✅
  - `cors.ts` — allowlist explícita (prod + previews via regex), `getCorsHeaders()` + `handleCorsPreflightRequest()`, `Vary: Origin`
  - `supabase-admin.ts` — `getSupabaseAdmin()` lazy-cached com service_role (import JSR)
  - `logger.ts` — JSON estruturado, `generateRequestId()` UUID v4, helpers `logInfo/Warn/Error/Debug`, `logDebug` silencioso por default
- **3.A.2 — Edge `health-check` + deploy** ✅
  - Função `health-check/index.ts`: smoke test de infra, valida env vars sem expor valores
  - Supabase CLI 2.95.4 instalada via Homebrew, login + link no projeto `msbwplsknncnxwsalumd`
  - Deploy ACTIVE versão 1, tree-shaking automático (não enviou `supabase-admin.ts` porque não é usado)
  - Smoke tests via curl: POST autenticado 200 + env_ok=true ✅; preflight CORS origem permitida 204 + Allow-Origin exato ✅; preflight CORS origem maliciosa sem Allow-Origin ✅
  - **Descoberta crítica:** `sb_publishable_*` retorna `UNAUTHORIZED_INVALID_JWT_FORMAT` no Edge Gateway. Front migrou pra anon JWT legacy
  - 5 Edge Functions de projetos antigos detectadas no projeto Supabase (`chat-claude` v28, `meta-sync`, `meta-balance`, `create-admin-user`, `portal`) — `chat-claude` será sobrescrita na 3.B.1
- **3.A.3 — Helper `invokeFunction()` + UI temporária `pingIA`** ✅
  - `js/core/supabase.js` — anon JWT legacy + função `invokeFunction(name, payload)` retornando `{ data, error }`, log defensivo sem payload, sem `signal` (YAGNI)
  - `js/app.js` — `window.invokeFunction` + `window.pingIA` no Window Bridge
  - `js/modules/chat.js` — `pingIA()` com `escapeHtml` defensivo, render do payload, toast por `env_ok`
  - `index.html` — `<section id="page-chat">` reescrita: subtitle, botão "🏓 Ping IA", `<div id="ping-status" aria-live="polite">`
  - CSS inline (11 regras novas) — `.ping-subtitle`, `.ping-status`, `.ping-result`, `.ping-success/.ping-error`, `.ping-env-table` — 100% via CSS variables existentes
- **3.A.4 — Documentação + ritual de fechamento** ✅
  - `CLAUDE.md` — Credenciais reescrito (gotcha JWT + rotação Anthropic); Window Bridge atualizado; "Status atual" reorganizado (Fase 2 → Fase 3 em andamento 2/9)
  - `050 - Banco de Dados/CONVENÇÕES.md` — nova seção "Edge Functions" (naming, estrutura, imports JSR, CORS, logger, retorno padrão, auth/secrets, deploy, .gitignore)
  - Esta entrada do Backlog
  - Entrada extensa no Dev Log
- **Validação end-to-end no Safari iPhone Pro Max:** botão renderiza, click → ~600ms → toast verde "Edge OK + secrets OK" + card com 3 secrets ✅, timestamp pt-BR, request_id truncado, border-left verde ✅

**Hash do commit de código (3.A.1+2+3):** `8fcbc02` (dev)

**Próximo:** Tarefa 3.B — Echo Anthropic (Haiku puro, sem router). Primeira chamada de IA real.

**Plano da 3.B aprovado em 2026-05-02** após segundo triplo /plan (Pedro + Code + outro Claude). Estrutura: 3.B.1 (Edge `chat-claude` v0.1 + helper Anthropic, ~1.5h) → 3.B.2 (INSERT user/assistant, ~30min) → 3.B.3 (UI mínima substitui Ping IA, ~1h) → 3.B.4 (docs + fechamento, ~30min). **Total: ~3.5h.** Decisões: SDK `npm:@anthropic-ai/sdk` pinado, `max_tokens=1024`, MODEL_PRICING só Haiku 4.5 (Sonnet/Opus na 3.D.1), `calcCustoUSD` fail-safe (zero + warning), sem transação atomica nos INSERTs, prompt fixo "responde curto", rate limiting fica em 3.G.3. Detalhamento ativo no topo de `.claude/plans/temporal-tinkering-castle.md`.

---

### ✅ Tarefa 3.B — Echo Anthropic + persistência + UI real (2026-05-02)

**Primeira chamada Anthropic real do projeto.** Pipeline completo `front → Edge Gateway → chat-claude → Anthropic SDK → Haiku 4.5 → INSERT user/assistant em chat_mensagens → response → bolhas na UI` validado end-to-end no Safari iPhone Pro Max. Custo real medido: ~R$ 0.001/chamada simples.

- **3.B.1 — Edge `chat-claude` v0.1** ✅
  - `_shared/anthropic.ts` (82 linhas): import pinado `npm:@anthropic-ai/sdk@0.92.0`, `getAnthropicClient()` lazy-cached com timeout 60s, `MODEL_PRICING` só Haiku 4.5, `calcCustoUSD()` com fail-safe (custo zero + warning se modelo não mapeado), re-export de `Anthropic` pra type-narrowing.
  - `chat-claude/index.ts` v1 (212 linhas): CORS preflight, validação payload (`texto` required, `entidade_id?` UUID opcional), call Haiku 4.5 com prompt fixo "responde curto", `max_tokens=1024`, `temperature=0.7`. Mapeamento de erro Anthropic → HTTP (429/503/500/400) via `instanceof`. `request_id` UUID v4 em todos os responses (sucesso e erro) pra rastreio.
  - Smoke test 3 cenários ✅: POST válido (200 + texto + métricas), texto vazio (400), JSON malformado (400). Latência 1070ms na 1ª chamada (cold-start).
- **3.B.2 — INSERT user/assistant + persistência** ✅
  - Helper `getAgenteAssistenteId()` cacheado em variável de módulo do isolate (mesmo padrão de cliente Anthropic).
  - INSERT user **antes** da chamada Anthropic → captura `userMsg.id` → INSERT assistant **depois** com `mensagem_pai_id = userMsg.id`. Sem transação (decisão #8).
  - Try/catch interno na chamada Anthropic: em erro, INSERT assistant com `erro` preenchido + `conteudo='[erro durante chamada]'` (preserva cadeia), depois re-throw pra catch externo mapear HTTP.
  - INSERT assistant após sucesso só faz log se falhar (Anthropic já respondeu, Pedro merece a resposta — persistência incompleta vira observabilidade).
  - Smoke test ✅: 200 + SELECT mostra 2 rows linkadas, métricas todas preenchidas (tokens 62/66, custo `0.000392`, latencia 1013ms), `agente_id` correto, `persona_id`/`entidade_id` NULL, ponto-flutuante JS `0.001029...` arredondou pra `0.0020` no banco (`numeric(10,4)`).
- **3.B.3 — UI real de chat** ✅
  - `<section id="page-chat">` reescrita: removido botão Ping IA + `<h1>Chat</h1>` (header já mostra). Estrutura nova: `.chat-historico` (scroll) + `.chat-input-wrapper` (textarea + botão Enviar).
  - 12 regras CSS `.ping-*` removidas, 14 regras `.chat-*` / `.page-chat` adicionadas (100% via CSS variables existentes; `--accent` em vez de `--primary` que não existe; `white` literal em vez de `--primary-fg`).
  - `js/modules/chat.js` reescrito (183 linhas): `enviarMensagem()` com bolha otimista (`.optimistic` → sólida ou `.failed`), `carregarHistorico()` query Supabase direto (mesmo client do front, JSDoc explícito sobre `entidadeId=null` na 3.B), `handleChatKeydown()` Enter envia / Shift+Enter quebra linha, helpers internos `appendBubbleOptimistic`/`renderHistorico`/`scrollToBottom`/`showEmptyState`/`hideEmptyState`. **`textContent` em vez de `innerHTML`** (defesa XSS automática, dispensa `escapeHtml`).
  - `js/app.js`: import multi-line de `enviarMensagem`/`handleChatKeydown`/`carregarHistorico`, chamada `carregarHistorico()` em `initApp` logo após `goPage('chat')` (Opção A — sem mexer no router), Window Bridge atualizado: `pingIA` OUT, `enviarMensagem` + `handleChatKeydown` IN.
  - Validação manual no Safari iPhone ✅: 3 mensagens enviadas, 3 respostas aparecem com texto + custo + latência. Reload preserva histórico. Bolha otimista visível por ~1s antes de virar sólida.
  - **Custo total das 3 trocas reais:** R$ 0.0039. Latências: 1013/1003/784ms (warmup do isolate visível).
- **3.B.4 — Documentação + ritual de fechamento** ✅
  - `CLAUDE.md` "Status atual" 2/9 → 3/9, Window Bridge atualizado.
  - `050 - Banco de Dados/CONVENÇÕES.md` ganhou 3 subseções dentro de "Edge Functions": "Anthropic SDK" (pin de versão, re-export, fail-safe pricing, mapping de erro), "Padrão de cache em isolate Deno" (template + quando usar/não usar), "Anthropic — pricing e cotação" (Haiku 4.5 $1/$5 por 1M tokens, COTACAO_USD_BRL=5.0 com TODO 3.G.1, arredondamento numeric(10,4) automático).
  - Esta entrada do Backlog.
  - Entrada extensa no Dev Log.
- **Bug encontrado:** nenhum. Pipeline funcionou na primeira tentativa de cada sub-tarefa.

**Hash do commit de código (3.B.1+2+3):** `d0c21f9` (dev). 5 arquivos: 3 modified (`index.html`, `js/app.js`, `js/modules/chat.js`) + 2 novos (`supabase/functions/_shared/anthropic.ts`, `supabase/functions/chat-claude/index.ts`). 671 inserts, 151 deletes.

**Próximo:** Tarefa 3.C — `prompt_base` real + placeholders + histórico de 20 mensagens. Edge passa a ler `agentes` em vez de hardcoded.

---

### ✅ Tarefa 3.C — `prompt_base` real + placeholders + histórico (2026-05-03)

Edge `chat-claude` passa a ler agente do banco e a IA ganha memória de curto prazo. Pipeline `INSERT user → SELECT últimas 20 mensagens (com exceto_id) → reverse → messages[] → Anthropic` validado end-to-end. **Bug encontrado: nenhum.** Pipeline funcionou na primeira tentativa de cada sub-tarefa.

- **3.C.0 — UPDATE SQL pra adicionar placeholders ao `prompt_base`** ✅ (via MCP)
  - UPDATE idempotente (`AND prompt_base NOT LIKE '%{usuario}%'`) — append do bloco "CONTEXTO ATUAL" com 4 placeholders.
  - prompt_base: 4333 → 4479 chars (+146).
- **3.C.1 — `getAgenteAssistente()` + remoção de constantes hardcoded** ✅
  - Cache de objeto inteiro (`{id, prompt_base, modelo, temperatura, max_tokens}`) com filtro `.eq('ativo', true)`. Throw com mensagem educativa se não encontrar.
  - Removidas: `HARDCODED_PROMPT`, `MODELO`, `MAX_TOKENS`, `TEMPERATURE`. Mantido: `COTACAO_USD_BRL` (TODO 3.G.1).
  - Smoke ✅: tokens_entrada 53 → 747 (saltou 14× — prompt do banco vs 1 frase). Modelo vindo do banco confirmado via SELECT.
  - Bonus fail-fast ✅: UPDATE temp `slug='assistente_test'` + redeploy → 500 educativo + log estruturado. Reverter funcionou.
- **3.C.2 — Helpers de placeholders + chamada Anthropic com prompt processado** ✅
  - `substituirPlaceholders(prompt, values, requestId)` com regex `/\{([a-zA-Z_]+)\}/g` + duplo passe (substituição + detecção de órfãos via `logWarn 'chat-claude.placeholder_orfao'`).
  - `formatarDataHoraBrasilia()` via `Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'long', timeStyle: 'short' })`.
  - Smoke ✅: 3 testes — IA respondeu corretamente data/hora atual, "Pedro Pertel", e "modo geral/pessoal" (vê `(geral)` substituído).
  - Bonus orfão ✅: UPDATE temp adiciona `{chave_inexistente_xyz}` → curl 200 + helper substituiu por vazio (+1 token apenas — vs ~5-8 se ficasse literal). Reverter funcionou.
- **3.C.3 — `buscarHistoricoMensagens` + `messages: [...historico, atual]`** ✅
  - Constante `MAX_HISTORICO = 20` (TODO 3.G.2 pra `configuracoes`).
  - Helper filtra `papel != 'system' AND erro IS NULL AND id != exceto_id`, mesma entidade. Reverse pra cronológico. Falha graciosa (array vazio + warning, não bloqueia chamada).
  - **Validação inequívoca de memória:** banco limpo (DELETE) → 3 curls em sequência:
    - Curl 1 ("oi! me chamo Pedro e gosto de café preto sem açúcar de manhã"): tokens_entrada 762, IA cumprimenta + anota preferência.
    - Curl 2 ("qual o meu nome?"): tokens_entrada 982 (+220, histórico de 2 msgs), IA responde "Pedro Pertel".
    - Curl 3 ("e do que falei que gosto?"): tokens_entrada 1064 (+82, histórico de 4 msgs), IA responde **"Café preto sem açúcar — você acabou de me contar isso na primeira mensagem!"** ← prova inequívoca (info exclusiva do histórico, não do prompt_base).
  - SELECT confirma 6 rows linkadas via `mensagem_pai_id`, tokens_entrada crescente, sem erros.
- **3.C.4 — Documentação + ritual de fechamento** ✅
  - JSDoc do topo do `chat-claude/index.ts` reescrito (estado consolidado da 3.C).
  - Nova subseção "Substituição de placeholders em prompt_base" em `CONVENÇÕES.md` (regex, comportamento, observabilidade, naming).
  - CLAUDE.md "Status atual" 3/9 → 4/9 + bloco da 3.C.
  - Esta entrada do Backlog.
  - Entrada extensa no Dev Log.

**Hash do commit de código (3.C.1+2+3):** `2590b1e` (dev). Único arquivo modificado: `supabase/functions/chat-claude/index.ts` (325 → 514 linhas, +189 net).

**Próximo:** Tarefa 3.D — Router pattern real (Roteador classifica → escolhe modelo → Anthropic com persona; chips de persona na UI). Bruno e Marcela conversando como bônus.

**Plano da 3.D aprovado em 2026-05-03** após /plan no Code (cruzado com outro Claude). Estrutura: **3.D.0** (adicionar Sonnet/Opus em MODEL_PRICING — pricing validado via WebFetch, ~15min) → **3.D.1** (helpers `escolherModelo`/`getRoteador`/`getPersonasReais` + `MAPA_COMPLEXIDADE_MODELO`, ~1h) → **3.D.2** (`chamarRoteador` + parse JSON + fail-soft + INSERT `papel='system'`, ~1.5h) → **3.D.3** (lookup persona + concat prompt + chamada Anthropic com modelo do Roteador, ~1h) → **3.D.4** (UI chip de persona, ~1h) → **3.D.5** (docs + fechamento, ~30min). **Total: ~5h.** Decisões críticas: **B3** mapeamento `simples→Haiku 4.5, medio→Sonnet 4.6, complexo→Opus 4.7` hardcoded até 3.G.2; **B4** pricing Sonnet $3/$15 + Opus $5/$25 (validado via doc oficial Anthropic — Opus 4.7 mais barato que histórico $15/$75); **B6** parse JSON fail-soft com default `persona=null/simples`; **B14** lista dinâmica de personas no user message do Roteador (resolve gap da Marina automaticamente); **B15** PULA UPDATE no prompt do Roteador (B14 é caminho único — UPDATE criaria dependência manual). 4 achados factuais REGRA 11 documentados (Roteador sem Marina, MODEL_PRICING incompleto, schema validado, contexto Roteador 9350 chars). Detalhamento ativo em `~/.claude/plans/temporal-tinkering-castle.md`.

---

### ✅ Tarefa 3.D — Router pattern real + 5 personas + UI chips (2026-05-03)

**Sub-fase fechada com 8 sub-tarefas executadas vs 6 planejadas** (5 adições não-planejadas durante execução, 3 delas via REGRA 11). Sistema ganhou voz própria: cada mensagem passa pelo Roteador (Haiku via `modelo_override`), que devolve JSON `{persona_slug, nivel_complexidade}`. Mapeamento `simples→Haiku 4.5 / medio→Sonnet 4.6 / complexo→Opus 4.7`. Persona escolhida tem seu `contexto` concatenado ao `prompt_base` do Assistente. UI mostra chip colorido (cor + ícone + nome) em cada bolha assistant — Pedro identifica visualmente quem respondeu. Bruno e Marcela conversando como bônus (sem tools — Marcos/Alemão/Marina ganham tools nas 3.F/3.H/3.I).

- **3.D.0** ✅ (~15min) — Sonnet 4.6 + Opus 4.7 em `MODEL_PRICING`. Pricing validado via WebFetch (Opus 4.7 = $5/$25, não $15/$75 do histórico). `_shared/anthropic.ts` +2 linhas, deploy v37.
- **3.D.0.5** ✅ (não-planejada) — `STATUS.md` criado como fonte única de verdade (atualizado a cada fechamento de sub-tarefa). CLAUDE.md emagreceu (status duplicado removido). `Workflow de Desenvolvimento.md` ganhou ritual formal de fechamento (passo X.Y.5).
- **3.D.1** ✅ (~1h) — Helpers `getRoteador`/`getPersonasReais` (cache em isolate) + `escolherModelo(persona, nivel)` + constante `MAPA_COMPLEXIDADE_MODELO`. `chat-claude/index.ts` +134 linhas (514→648), deploy v38.
- **3.D.2** ✅ (~1.5h) — `chamarRoteador` + `parsearJsonRoteador` (fail-soft com default `persona=null/simples/'fallback: parse falhou'`) + INSERT `papel='system'` com JSON cru auditável. `chat-claude/index.ts` +253 linhas (648→901), deploy v39. Pipeline validado: curls "saldo CEDTEC?"→marcos, "Pincel?"→bruno, "que dia?"→marcela. Custo médio R$ 0.008/chamada do Roteador.
- **3.D.3** ✅ (~1h) — Chamada principal usa `modeloEscolhido` + concat `prompt_base + persona.contexto`. `chat-claude` +25 linhas, deploy v40. TESTE A passou (Marcos respondendo Sonnet 4.6 em CEDTEC).
- **3.D.3.1** ✅ (REGRA 11 — não-planejada) — Dedup user/assistant consecutivos em `buscarHistoricoMensagens`. Defesa contra `WHERE erro IS NULL` quebrar invariante de protocolo Anthropic (alternância strict). +14 linhas. Cleanup do banco (9 rows órfãs em 2 ondas).
- **3.D.3.2** ✅ (REGRA 11 — não-planejada) — Opus 4.7 deprecou `temperature` por Adaptive Thinking. Helper `suportaTemperature` + Set `MODELOS_SEM_TEMPERATURE` em `_shared/anthropic.ts` (+26 linhas) + uso condicional na chamada principal (+10 linhas). Deploy v42. TESTE B passou pela primeira vez (Bruno escrevendo proposta comercial Pincel — voz própria + R$ 0.10/troca + 7s).
- **3.D.4** ✅ (~1h) — UI chip de persona ativa. Nested join `personas(slug, nome, icone, cor_hex)` em `carregarHistorico` (PostgREST relacionado por FK `persona_id`). Render condicional do chip no `renderHistorico` (só pra `papel='assistant'`). CSS `.chat-bubble-persona-chip` (cor de fundo dinâmica, ícone + nome capitalize). `chat.js` +30 linhas, `index.html` +25 linhas. Hash dev `4fdf860`.
- **3.D.4.1** ✅ (não-planejada) — Chip "Assistente" 🤖 cinza fallback pra mensagens sem persona (Roteador retornou `null` OU rows pré-3.D que não têm `persona_id`). Operador `??` no `renderHistorico` com objeto fallback `{icone: '🤖', nome: 'Assistente', cor_hex: '6B7280'}`. `chat.js` +6/-2 linhas. Hash dev `ea0b442`.
- **3.D.4.2** ✅ (REGRA 11 — não-planejada) — Scroll interno do chat corrigido. Diagnóstico via 2 rodadas de log (rAF + setTimeout) revelou `clientHeight === scrollHeight` → não era race condition, era ausência de overflow. Causa raiz: gotcha flexbox — `flex: 1 + overflow-y: auto` exige `min-height: 0` em CADA item flex da cadeia ancestral. Fix em cascata: `#main-content` (`min-height: 100dvh` → `height: 100dvh; min-height: 0`), `#page-container` + `.page-chat` + `.chat-historico` (cada um ganha `min-height: 0`). Bonus: `body { padding: 0 }` (era 16px, criava overflow no body) + `padding-bottom: max(var(--space-3), env(safe-area-inset-bottom))` no `.chat-input-wrapper` (compensa remoção do padding pra input não colar no home-indicator do iPhone). `index.html` +7/-3 linhas. Hash dev `6a322cc`.
- **3.D.5** ✅ (~30min) — Ritual de fechamento (esta entrada). 2 commits finais (`feat(3.D)` consolidando código + `docs(3.D)` consolidando documentação) + merge `--no-ff` dev → main.

**Achados REGRA 11 (4 totais):**

1. **Roteador NÃO conhecia Marina** (prompt do banco com 9350 chars mencionando só `marcos|bruno|marcela|alemao`) — resolvido por **B14** (lista dinâmica de personas no user message do Roteador), sem precisar UPDATE no prompt. **B15** rejeitou caminho alternativo de UPDATE manual (geraria dependência repetida a cada persona nova).
2. **Opus 4.7 deprecou `temperature`** por Adaptive Thinking. Erro `400 invalid_request_error: "temperature is deprecated for this model."` na primeira chamada. Helper `suportaTemperature` + Set `MODELOS_SEM_TEMPERATURE` em `_shared/anthropic.ts`. Lista vai crescer (Opus 4.8, 5).
3. **Filtro `WHERE erro IS NULL`** em `buscarHistoricoMensagens` quebrava cadeia messages alternada (Anthropic exige user→assistant→user strict). Quando assistant erro era filtrado mas user correspondente não, virava 2 user consecutivos. Dedup defensivo no helper (preserva alternância sem mexer na query SQL).
4. **CSS scroll interno** — `flex: 1 + overflow-y: auto` não funciona sem `min-height: 0` em CADA item flex da cadeia (gotcha flexbox). Diagnóstico via log estruturado (clientHeight === scrollHeight === 3386 → sem overflow real, scroll caía no `<html>`).

**Custo real validado em uso (sessão 3.D.3 testes):**

| Persona | Modelo | Custo/troca | Latência |
|---|---|---|---|
| Roteador (fixo) | Haiku 4.5 | R$ 0.008 | ~500-800ms |
| Marcos | Sonnet 4.6 | R$ 0.034 | ~3s |
| Marcela | Haiku 4.5 | R$ 0.013 | ~1s |
| Bruno | Opus 4.7 | R$ 0.10 | ~7s |

Bruno é caso premium (uso pontual). Marcela é cotidiano. Custo médio esperado: R$ 0.015-0.040/troca (Roteador + chamada principal).

**Aprendizados arquiteturais (replicar em próximas Edges):**

- **Validar API parameters do modelo via doc oficial antes de hardcodar payload** — lista `MODELOS_SEM_TEMPERATURE` vai crescer; padrão pra `briefing-matinal`, tools, streaming.
- **Filtros SQL podem quebrar invariantes de protocolo** (cadeia messages alternada) — dedup por role após filtros é defesa em profundidade barata.
- **Roteador classifica por mensagem, não por persona** — comportamento intencional, gera ganho de custo (perguntas curtas caem em Haiku mesmo quando persona default seria Sonnet/Opus).
- **Cascata `min-height: 0` em flex** — replicar em Fase 4 (kanban, listas, calendário com scroll interno).
- **Log estruturado em catches/error branches** mesmo quando função "tá funcionando" — defesa em profundidade pra erros não-reproduzidos (`carregarHistorico` ganhou log detalhado em `a2f41c4`).

**Hash do commit de código (3.D.0+0.5+1+2+3+3.1+3.2 consolidados):** `feat(3.D)` (será preenchido após PASSO 7). Plus commits isolados já em dev: `4fdf860` (3.D.4), `ea0b442` (3.D.4.1), `add73ce` (3.D.4.2 v1), `b259491` (debug logs scroll), `9ad5d15` (cleanup logs), `a2f41c4` (debug log carregarHistorico — mantido), `6a322cc` (3.D.4.2 final cascata). Total commits dev pra 3.D: ~10 (vs 1 esperado). Justificativa: muitas correções REGRA 11 ganharam commit isolado pra rastreabilidade.

**Próximo:** Tarefa 3.F — Marcos viajando pro Meta (PRIORIDADE #1 do VISAO.md, ~9.5h). Streaming SSE (3.E, ~3.5h) entra como terceira na ordem, depois de Marcos + polimento.

---

### ✅ Tarefa 3.I — Marina + tools (2026-07-06)

**Adiantada** (ordem original era depois de 3.F/3.E) porque a 3.F
pausou por bloqueio externo do Meta e a 3.I constrói exatamente a
infra de function calling que a 3.F vai reusar.

- **3.I.0** — Validação REGRA 11: schema `ideias` (17 colunas, CHECKs
  status/origem), Marina ativa no banco, `tool_calls`/`tool_results`
  presentes, leitura completa da chat-claude v42 ✅
- **3.I.1** — Loop genérico de tools na Edge (`ea713f0`, deploy v43):
  `ToolDef`/`ToolContext`, `tool_use`→executa→`tool_result`→nova
  chamada (máx 3 voltas), métricas acumuladas, observabilidade nas
  colunas da 3.F.0.5 inclusive em erro ✅
- **3.I.2** — Tool `salvar_ideia` (`6c3b9ec`, deploy v44): modelo passa
  titulo/conteudo/tags/proxima_acao; Edge força origem='chat',
  status='capturada', rastreio `mensagem_origem_id` ✅
- **Fix Roteador** (UPDATE em `personas` com OK do Pedro): Marina no
  enum de saída, regra 0 de captura de ideia (prioridade sobre
  entidade), null literal JSON ✅
- **3.I.2.1** — Tools transversais (`ec7bae5`, deploy v45), aplicando
  a decisão "persona define tom, não poder" ✅
- **3.I.3** — Validação fim-a-fim via curl: 2 ideias reais salvas com
  tags e rastreio; detecção de duplicata via histórico de graça ✅
  Teste mobile do Pedro + "aprovado" pendentes.
- Limitações conhecidas registradas no Dev Log 2026-07 (mensagem
  mista, personas sem tool ainda fingem, cache de isolate ~5min).

---

## Fase 3.5 — Fundação & Correções (inserida pós-revisão 2026-07-07)

> Sub-fase criada a partir da revisão multi-agente. Paga a dívida técnica
> antes de construir a UI da Fase 4 por cima. Relatório completo:
> `070 - Roadmap/REVISÃO — 2026-07-07 (multi-agente).md`. Ordem por payoff.

### ✅ 3.5.A — Blindar (parte autônoma feita 2026-07-07)
Feito por Claude: backup completo dos dados (`090 - Backups/`), migrations
versionadas + baseline (`supabase/migrations/`), snapshot dos prompts
(`040 - IA e Agentes/prompts/`).
**Falta (precisa do Pedro):**
- [x] **3.5.A.1** ✅ — `supabase login` no CLI (F1). **Resolvido 2026-07-07: CLI já estava autenticado; deploy manual aposentado.**
- [x] **3.5.A.2** ✅ — Dashboard → Auth → desabilitar "Enable Sign Up" (A1). **Pedro fechou em 2026-07-08; verificado via curl (`signup_disabled`, conta de teste recusada).**
- [ ] **3.5.A.3** — Console Anthropic → cap de custo/uso diário (A2: rede contra queima de créditos, já que a anon key é pública). Pedro segurou (não urgente); recomendado US$5-10/dia.
- [x] **3.5.A.4** ✅ — **Feito 2026-07-07:** tabela `teste` dropada + 5 Edge Functions legadas removidas; ping do login migrou pra `entidades`.
- [ ] **3.5.A.5** — Decisão: upgrade Supabase (~US$25/mês, elimina pausa semanal) OU cron de ping OU conviver (B4). Pedro segurou; usando semanalmente não pausa.

### ✅ 3.5.C — Correções da Edge (deployadas e validadas 2026-07-07)
C1 (caches não gravam falha/vazio), C2/C3 (waitUntil no SSE), C4 (lerConfig
valida tipo), C5 (conteúdo vazio), C7 (front recupera msg), D1 (guardrail
anti-fingir). Deploy via CLI + fumaça 🟢 + guardrail verificado.

### ✅ 3.5.D — Correções restantes (completa 2026-07-09)
- [x] **3.5.D.1 (C6)** ✅ — **Feita 2026-07-08** (`e393379`): histórico anexa registro textual das tools já executadas ao conteudo assistant (opção B — sem reconstruir blocos tool_use/tool_result; banco achata voltas numa row, reconstrução brigaria com dedup 3.D.3.1 + C5 + LIMIT). Testado em produção: modelo referencia ações passadas sem re-executar.
- [x] **3.5.D.2 (C8)** ✅ — Front: timeout/abort no stream (AbortController 45s, reinicia a cada chunk). `b449979`.
- [x] **3.5.D.3 (D4)** ✅ — **Feita 2026-07-08** (`6492d3d`, Edge v54): system em 2 blocos (estável com cache_control + data/hora no fim) e calcCustoUSD precificando cache write/read. Validado: custo 4× menor na 2ª mensagem (Sonnet). Mínimos: Sonnet 2048 tokens ✅, Haiku/Opus 4096 (prompts curtos não cacheiam — sem erro, sem custo extra).
- [x] **3.5.D.4 (C9)** ✅ — extract concatena todos os blocos text + aviso de truncamento (`b449979`). **Resto fechado 2026-07-09** (`490ffa3`): digitar no textarea com o mic ligado desliga o ditado e preserva a edição manual (input programático não dispara 'input' — evento durante o ditado = Pedro digitando).
- [x] **3.5.D.5 (F2)** ✅ — script de fumaça `supabase/functions/fumaca.sh` (JSON+SSE+400). **Resto fechado 2026-07-09** (`7cbad80`): deno 2.9.2 instalado + `checar.sh` (deno check pré-deploy, fluxo checar→deploy→fumaça no CLAUDE.md) + deno.json/deno.lock. Bônus: fix de tipo no ToolSpec (input_schema exige `type: 'object'`).
- [x] **3.5.D.6 (F3)** ✅ — **Feita 2026-07-08** (`68be064`, Edge v55): tools extraídas pra `_shared/tools/` (tipos.ts + salvar_ideia.ts + lancar_custo_sitio.ts + catalogo.ts); index.ts 2029→1568 linhas, só o loop. Tool nova (3.F) = arquivo novo + registro no catálogo. Validado: fumaça 🟢 + as 2 tools gravando no banco.
- [x] **3.5.D.7 (F4)** ✅ — **Decidido 2026-07-08 (Pedro):** Edge continua compartilhada; TODO deploy é obrigatoriamente seguido de `fumaca.sh` (ritual da D5). Racional: função dev separada isolaria só o código (banco continua o mesmo), usuário único e dados de teste não justificam o custo/drift. **Gatilho pra revisitar:** Fase 5 (Marcos + Meta agindo em campanha com dinheiro real) — aí avaliar projeto Supabase de dev inteiro, não só a função.

---

## Fase 4 — UI dos módulos (replanejada pós-revisão 2026-07-07)

> **Antes da reconciliação de 2026-05-02 esta era a Fase 3.** Telas dos
> módulos consumindo o banco (Fase 2) + a IA (Fase 3).
>
> **Replanejamento (revisão):** a 1ª tela NÃO é mais o cadastro Meta (a 3.F
> está pausada sem previsão). A prioridade é: (1) o chat, que é a interface
> PRIMÁRIA e hoje é cru; (2) as telas de correção dos registros que as tools
> já criam sem ter como consertar. Ordem por uso real, não por completude.

### Pré-requisito de arquitetura (antes de qualquer tela de edição)
- [x] **4.0 — Invalidação de cache (E4/E1 da revisão)** ✅ — **Feita 2026-07-09**
  (`b9ed0a1`, Edge v60): chave `cache_version` em `configuracoes` +
  `verificarVersaoCache` no início de cada request → versão mudou → zera os
  5 caches de isolate (configs, agente, Roteador, personas, nomes de
  entidades). Convenção do bump no CONVENÇÕES.md. Validada por comportamento
  (rate limit 10→1 + bump → 429 imediato; restauro + bump → 200 imediato).
  **Telas de personas/configs desbloqueadas** — devem incrementar
  cache_version ao salvar.

### 4.A — Chat utilizável (interface primária primeiro)
- [x] **4.A.1** ✅ — **Feita 2026-07-08** (`f12a978`): parser próprio em `js/core/markdown.js` (escapa HTML antes de transformar — XSS impossível; negrito/itálico/código/fences/listas/títulos/quebras). Só bolha assistant renderiza; user fica literal; streaming cru até o done. Testada pelo Pedro no preview.
- [x] **4.A.2** ✅ — **Feita 2026-07-08** (`1a138f6` + fixes `8e7dd29`/`5486eeb`): chips de entidade (Geral + ativas do banco, localStorage), entidade_id no body, nome REAL no {entidade_atual} do Roteador/prompt (cache isolate). Fixes do teste mobile do Pedro: min-width:0 no #main-content (chips estouravam largura) e stream preso à entidade de origem (sem scroll puxado/bolha vazada ao trocar chip) + ditado iOS sem onresult tardio (msg repetida). E2E validado via Playwright.
- [x] **4.A.3** ✅ — **Feita 2026-07-08:** arquivar (soft-delete, migration `arquivada`, some da UI e da memória da IA) + favoritar (coluna já existia; badge ⭐) via menu no toque da bolha + 🧹 limpar conversa com modal. EDITAR CORTADO (decisão Pedro: corrigir = reenviar). E2E Playwright validado. Pendente futuro: toggle 'mostrar arquivadas' + desarquivar (hoje recuperação só via banco).

### 4.B — Telas de correção (as tools já criam dados sem conserto — D2)
- [x] **4.B.1** ✅ — Tela de Ideias (Marina), completa 2026-07-13. **a** (`e6b4a85`): aba 💡 com listar/editar/favoritar/arquivar + Nova manual (espelho da notas.js; labels do banco — REGRA 12). **b** (`023bea4`): converter em tarefa — modal com empresa obrigatória (tarefas.entidade_id NOT NULL vs ideia transversal), tarefa a_fazer origem='sistema', ideia vira 'convertida'; re-converter bloqueado.
- [x] **4.B.2** ✅ — Tela de Lançamentos do Sítio (Alemão). **Feita e promovida 2026-07-13** (`e8e2d5a`). **a** (`824c990`): "Outros" desduplicada por RENAME das filhas (padrão "Outros tributos": outros-operacional→"Outros operacionais", outros-receita→"Outras receitas"; zero DELETE, migration aplicada). **b** (`ad7b1ab`): página Sítio com lista (valor/data/categoria/🎤 transcrição original), filtros categoria+mês, corrigir (descrição/valor/data/categoria, tipo segue a categoria), arquivar. Sem + Novo (entrada é pelo chat/voz).

### ✅ 4.B.3 — Dash de gestão do Sítio (plano aprovado E COMPLETO 2026-07-13, promovido `e8e2d5a`)
> Contas a pagar/receber = lançamentos `status='previsto'` na MESMA tabela (sem tabela nova). Números do dash usam só `realizado`. Gráficos CSS/SVG puro (donut conic-gradient + barras + colunas), cores de sitio_categorias.cor_hex. Agregação no front. Tool do Alemão inalterada. Melhoria anotada: tool lançar previsto por voz + registrar caches das tools no reset do cache_version (4.0).
- [x] **4.B.3a** ✅ (`4bad818`) — migration `status` previsto/realizado (backfill explícito) + doc tabela + tela filtra realizado
- [x] **4.B.3b** ✅ (`589a2b5`) — chips Resumo/Lançamentos/Contas + seletor de período (Este mês default · Mês passado · Este ano · Ano-safra jul–jun · Tudo)
- [x] **4.B.3c** ✅ (`995857a`) — Resumo: KPIs com ▲▼% vs período anterior (Entradas/Saídas/Saldo) + Investimento acumulado + Burn médio mensal + donuts de gastos/receitas por grupo raiz (toque expande subcategorias em barras)
- [x] **4.B.3d** ✅ (`cd39c53`) — aba Contas: previstos por vencimento (vencidas em destaque), + Nova com repetir N meses, ✓ Pago/Recebido (vira realizado), editar, arquivar
- [x] **4.B.3e** ✅ (`aaa802b`) — Resumo: evolução 12 meses (colunas entrada×saída) + a pagar/receber 30 dias + projeção (saldo ± previstos 90 dias)

### 4.C — Módulos CRUD (ordem por uso real — triagem, NÃO fazer todos; E5)
Cada módulo = 3-5 sub-tarefas (listar → criar → editar → arquivar → [kanban/extras]).
Priorizar pelo que o Pedro usa; deixar o resto pra quando pedir.
- [x] **4.C.1** ✅ — Tarefas, completa 2026-07-13 (`dff5a04`): kanban 4 colunas + filtro empresa + CRUD + drag&drop (long-press touch, auto-scroll borda). Lembrete FICOU DE FORA (depende de decidir push/agenda/Marcela — anotado no STATUS).
- [ ] **4.C.2** — Agenda/Eventos (lista + criação; recorrência depois)
- [ ] **4.C.3** — Config: personas, entidades, configs de IA, labels (REGRA 12; depende de 4.0)
- [ ] **4.C.4** — Documentos (biblioteca + upload Storage)
- [ ] **4.C.5** — Dashboard (visão geral; por último, consome os outros)
- [ ] **4.C.6** — Sítio (relatórios além dos lançamentos), CEDTEC (quando a 3.F voltar)

### 4.E — Bloco de Notas (pedido do Pedro, 2026-07-08)
> "Uma aba que seja um bloco de notas tipo o Notes do iPhone — mando
> 'transforme essa resposta em uma anotação com título X' e salvo coisas
> importantes. Poderia fazer listas lá e outras coisas."
- [x] **4.E.1** ✅ — **Feita 2026-07-08** (`3caa2fa`): tabela `anotacoes` espelhada na ideias (soft-delete, RLS, trigger updated_at), migration versionada.
- [x] **4.E.2** ✅ — **Feita 2026-07-08** (`3caa2fa` + fix `789a147`): tool transversal via convenção da 3.5.D.6. Fix crítico (achado Pedro): Haiku RESUMIA a resposta — flag `copiar_resposta_anterior` faz o executor buscar o texto do banco (fidelidade por código; validado: 2349 chars = 2349 chars, idênticas).
- [x] **4.E.3** ✅ — **Feita 2026-07-08** (`ec5991f`): aba 📝 Notas (cards expansíveis com markdown, ✏️/⭐/🗑, + Nova manual). Router ganhou evento `page:change` (padrão pros módulos da Fase 4); modal aceita Node e onClick=false segura aberto.

### 4.D — PWA de verdade (F5 — hoje é documentado mas inexistente)
- [ ] **4.D.1** — `manifest.json` + ícones (192/512) + `sw.js` com cache versionado (cuidado: SW que serve JS velho após deploy é armadilha — usar versão no nome do cache + skipWaiting). Só então "instalável/offline" é verdade.

**Nunca pular direto pra "fazer o módulo X" — sempre dividir em sub-tarefas antes.**

---

## Fase 5 — Ampliação (depois da Fase 4)

- **3.F — Marcos + Meta Ads** (PAUSADA por bloqueio externo: Meta Business
  em nome da esposa). Quando o acesso existir: reconstruir o plano detalhado
  (o arquivo `.claude/plans/temporal-tinkering-castle.md` com as 16 decisões
  C1-C16 **se perdeu** — achado E6), Vault pro token, `_shared/meta-graph.ts`,
  tools com confirmação humana inline pra writes. A infra de tools/spec
  dinâmico (3.I/3.H) já está pronta pra receber.
- **3.J — Briefing matinal da Marcela** (cron). Opcional.
- **Proativo/observabilidade:** sugestões automáticas, dashboard de custo por
  persona/dia (dados já em `chat_mensagens`), retenção de `chat_mensagens`
  (rows `system` são ~30%; achado baixo).
- Definir o resto conforme o uso real revelar prioridades.

---

## Tarefas concluídas

*(nenhuma ainda — mover tarefas pra cá conforme forem aprovadas em produção, com data)*

---

## Tech Debt — herdado de projetos antigos

> Coisas que apareceram no Supabase reutilizado e ainda precisam ser tratadas. Não bloqueiam o trabalho atual, mas viram tarefa antes do tema relacionado avançar.

- [ ] **Bucket `agentes` no Storage** está com `Public = ON` e 4 policies aplicadas à role `public` (não `authenticated`). Precisa ser resolvido **antes da Tarefa 2.5** (agentes): ou apagar (se vamos refazer do zero junto com a tabela `agentes`) ou ajustar `Public → OFF` + recriar policies pra `authenticated`. Decisão a tomar no início da 2.5.

---

## Relacionado

- [[CLAUDE.md]] — regras imutáveis
- [[Workflow de Desenvolvimento]] — como cada tarefa é executada
- [[PRIMEIRO PROMPT]] — setup inicial
