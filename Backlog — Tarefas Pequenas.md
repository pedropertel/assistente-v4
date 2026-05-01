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

### 🔴 Tarefa 1.8 — Sistema de toast

**Objetivo:** Sistema reutilizável de notificações.

**Prompt pro Claude Code:**
> Crie `js/core/toast.js` com `show(msg, type)` onde type = 'success' | 'error' | 'info'. Limite a 3 toasts visíveis. Auto-remove em 3s. Expor `window.showToast`.

**Critério de aprovação:** Pedro pede pro Claude Code disparar 3 toasts via console. Todos aparecem, desaparecem em 3s, têm cores diferentes.

---

### 🔴 Tarefa 1.9 — Sistema de modal

**Objetivo:** Sistema reutilizável de modais.

**Prompt pro Claude Code:**
> Crie `js/core/modal.js` com `open(title, bodyHTML, footerHTML)` e `close()`. Suporta empilhar modais. Expor `window.closeModal`.

**Critério de aprovação:** Claude Code abre um modal de teste. Pedro vê, fecha no X, fecha clicando fora, tenta empilhar 2 modais.

---

### 🔴 Tarefa 1.10 — Utils (`utils.js`)

**Objetivo:** Helpers `fmtDate`, `fmtMoney`, `fmtRelative`, `debounce`, `slugify`.

**Prompt pro Claude Code:**
> Crie `js/core/utils.js` com as funções: `fmtDate(iso)` → "24/04/2026", `fmtMoney(cents)` → "R$ 1.234,56", `fmtRelative(iso)` → "há 2h", `debounce(fn, ms)`, `slugify(str)`. Exporte todas.

**Critério de aprovação:** Claude Code roda os 5 testes no console e mostra o resultado ao Pedro.

---

**🎯 Fim da Fase 1 — Fundação pronta. App logável, com navegação, modais, toasts.**

---

## Fase 2 — Banco de dados (feito em pedacinhos também)

### 🔴 Tarefa 2.1 — Tabela `entidades`
Criar a tabela + RLS + inserir as 6 entidades (CEDTEC, Pincel Atômico, Sítio, Gráfica, Agência, Pessoal).

### 🔴 Tarefa 2.2 — Tabela `tarefas`
Schema + RLS + uma tarefa de teste.

### 🔴 Tarefa 2.3 — Tabela `eventos`
Schema + RLS.

### 🔴 Tarefa 2.4 — Tabelas `pastas` + `documentos`
Schema + RLS + bucket `documentos` no Storage.

### 🔴 Tarefa 2.5 — Tabela `agentes`
Schema + RLS + inserir 4 agentes (Marcos, Bruno, Marcela, Alemão).

### 🔴 Tarefa 2.6 — Tabela `chat_mensagens`
Schema + RLS.

### 🔴 Tarefa 2.7 — Tabelas do Sítio
`sitio_categorias` + `sitio_lancamentos` + inserir 6 centros de custo.

### 🔴 Tarefa 2.8 — Tabelas do CEDTEC
`cedtec_conta_meta` + `cedtec_recargas` + `meta_conexoes` + `meta_campanhas_cache`.

### 🔴 Tarefa 2.9 — Tabela `configuracoes`
Chave/valor genérico.

---

## Fase 3 — Módulos (cada módulo em 3-5 tarefas)

Ao chegar aqui, planejar cada módulo junto com o Claude Code, uma sub-tarefa de cada vez. Exemplo pro módulo Tarefas:

- 3.1 — Listar tarefas existentes numa tela simples
- 3.2 — Botão "nova tarefa" que abre modal com formulário
- 3.3 — Salvar nova tarefa no banco
- 3.4 — Editar tarefa existente (clicar na tarefa abre modal de edição)
- 3.5 — Deletar tarefa (com confirmação)
- 3.6 — Transformar lista em kanban (3 colunas)
- 3.7 — Drag & drop entre colunas
- 3.8 — Lembretes (notificações)

**Nunca pular direto pra "fazer o módulo Tarefas" — sempre dividir em sub-tarefas antes.**

---

## Fase 4 — Chat com IA (Edge Function + UI)

A ser detalhado quando chegar a hora. Previsão de 8-10 sub-tarefas pequenas.

---

## Fase 5 — Polimento e fase final

A ser definida conforme o uso real for revelando prioridades.

---

## Tarefas concluídas

*(nenhuma ainda — mover tarefas pra cá conforme forem aprovadas em produção, com data)*

---

## Relacionado

- [[CLAUDE.md]] — regras imutáveis
- [[Workflow de Desenvolvimento]] — como cada tarefa é executada
- [[PRIMEIRO PROMPT]] — setup inicial
