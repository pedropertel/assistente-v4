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
| **3.D** | Router pattern real (Roteador → JSON → modelo dinâmico, chips de persona) | **5h** |
| **3.F** | **🎯 Marcos viajando pro Meta (PRIORIDADE #1)** — Vault + tools + confirmação humana pra writes | **9.5h** |
| **3.E** | Streaming SSE token-a-token (depois de Marcos) | 3.5h |
| **3.G** | Polimento: cotação real, mapeamento via configuracoes, rate limit, logger | 3.5h |
| **3.H** | Alemão (voz Web Speech → `sitio_lancamentos`) | 5h |
| **3.I** | Marina (captura de ideias com tools) | 2h |
| **3.J** | Marcela briefing matinal (cron) — opcional, adiável pra Fase 5 | 3h |

**🎯 Caminho curto até Marcos em produção (PRIORIDADE #1 do VISAO.md):** 3.0 → 3.A → 3.B → 3.C → 3.D → 3.F = **23.5h** em 6 sub-fases.

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

---

### ✅ Tarefa 3.0 — Reconciliar Backlog (2026-05-02)

Commit isolado de reconciliação documental. Sem código. Backlog passa a refletir Fase 3 = IA backend e Fase 4 = UI dos módulos. Primeira tarefa formal da Fase 3.

- Backlog reescrito (linhas 551-592): "Fase 3 — IA backend" com tabela das 10 sub-fases + decisões críticas; "Fase 4 — UI dos módulos" preserva conteúdo antigo da Fase 3 (kanban/drag-drop) com itens 4.1-4.8 ✅
- CLAUDE.md "Status atual" atualizado: caminho curto 23.5h, plan file path, decisões críticas resumidas ✅
- Dev Log — 2026-05.md ganhou entrada "Plano da Fase 3 oficializado" (oficialização) + esta entrada de fechamento da 3.0 ✅
- Sem mudança de código, sem preview pra testar — pura documentação ✅

**Próximo:** Tarefa 3.A.1 — estrutura `supabase/functions/_shared/`.

---

## Fase 4 — UI dos módulos (cada módulo em 3-5 tarefas)

> **Antes da reconciliação de 2026-05-02 esta era a Fase 3.** Continua o mesmo conteúdo: telas dos módulos visuais consumindo o banco da Fase 2 + a IA backend da Fase 3.

Ao chegar aqui, planejar cada módulo junto com o Claude Code, uma sub-tarefa de cada vez. Exemplo pro módulo Tarefas:

- 4.1 — Listar tarefas existentes numa tela simples
- 4.2 — Botão "nova tarefa" que abre modal com formulário
- 4.3 — Salvar nova tarefa no banco
- 4.4 — Editar tarefa existente (clicar na tarefa abre modal de edição)
- 4.5 — Deletar tarefa (com confirmação)
- 4.6 — Transformar lista em kanban (3 colunas)
- 4.7 — Drag & drop entre colunas
- 4.8 — Lembretes (notificações)

**Nunca pular direto pra "fazer o módulo Tarefas" — sempre dividir em sub-tarefas antes.**

**Primeira tela obrigatória da Fase 4:** cadastro Meta credenciais (paga a dívida temporária do bootstrap manual da 3.F.0). Depois disso, telas dos outros módulos em ordem de uso real do Pedro.

---

## Fase 5 — Polimento e fase final

A ser definida conforme o uso real for revelando prioridades.

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
