# CLAUDE.md — Assistente: Sistema de Inteligência Pessoal

> **LEIA ESTE ARQUIVO INTEIRO ANTES DE QUALQUER AÇÃO.**  
> Leia também `VISAO.md` — é a bússola de prioridades. Quando a tarefa envolver decidir profundidade ou escopo de algo, consulte `VISAO.md` antes de perguntar.  
> Este é o contrato entre Pedro e o Claude Code. Violar qualquer regra abaixo = quebrar o projeto.  
> Atualizado em: 2026-04-24 · Projeto recomeçado pela última vez.

---

## ⚠️ ANTES DE FAZER QUALQUER COISA

1. Leia este arquivo até o fim.
2. Leia `Workflow de Desenvolvimento.md` em `010 - Sistema/`.
3. Identifique em qual branch você está (`git branch --show-current`). **Se for `main`, PARE. Mude pra `dev` antes de continuar.**
4. Se a tarefa que Pedro pediu parecer grande ou ambígua, **NÃO escreva código** — responda a ele pedindo pra dividir a tarefa em etapas menores antes.

---

## Quem é Pedro e o que é este sistema

Pedro Pertel (Vitória-ES) administra múltiplas frentes simultaneamente e **não sabe programar**. Usa Claude Code pra tudo e quase sempre no celular. Este sistema é seu **sistema operacional pessoal** — uma secretária executiva com IA que conhece cada empresa, interpreta linguagem natural, age no banco e ajuda a decidir.

**Empresas gerenciadas:**
- **CEDTEC** — escola técnica em Vila Velha. Pedro é dono e faz 100% do marketing sozinho (Meta Ads)
- **Pincel Atômico** — sistema de gestão escolar. Pedro é diretor comercial/marketing
- **Sítio Monte da Vitória** — café arábica nas montanhas capixabas. Fase de investimento
- **Gráfica** — sócio
- **Agência de Marketing** — gestor

**Plataforma primária: mobile.** Pedro usa muito mais o celular que o computador.

---

## Stack — decisões já tomadas, não questionar

| Camada | Tecnologia | Detalhe |
|--------|-----------|---------|
| Frontend | HTML + CSS + JS puro | SEM React, Vue, Angular, TypeScript |
| Módulos | ES Modules nativos | SEM Webpack, Vite, Rollup, bundler |
| Banco | Supabase (PostgreSQL) | |
| Auth | Supabase Auth | Email/senha |
| Storage | Supabase Storage | Buckets: `documentos`, `agentes` |
| IA | Claude Haiku 4.5 | Via Edge Function `chat-claude` |
| Hospedagem | Vercel | Deploy automático por branch |
| PWA | Service Worker + manifest | Instalável no celular |

---

## 🚨 REGRAS DE OURO — NUNCA VIOLAR

### REGRA 0 — Nunca mexer na `main` direto
**`main` é produção. Ninguém toca nela sem Pedro aprovar.**

Fluxo obrigatório pra TODA tarefa:
```
1. git checkout dev
2. implementar a tarefa
3. git add . && git commit -m "descrição"
4. git push origin dev
5. Informar Pedro: "Pronto. Testa no preview: [URL]. Responde 'aprovado' pra eu subir pra produção."
6. AGUARDAR APROVAÇÃO EXPLÍCITA DO PEDRO
7. Só então: git checkout main && git merge dev && git push origin main
```

Se Pedro disser "sobe pra produção" sem ter testado o preview, lembre ele: *"Quer testar o preview antes? Link: [URL]"*. Se ele confirmar mesmo assim, faça o merge.

### REGRA 1 — Uma tarefa = uma coisa só
Máximo por tarefa:
- **1 arquivo-alvo principal** (pode tocar em `app.js` / `supabase.js` se necessário, mas o foco da tarefa é um arquivo)
- **1 funcionalidade visível** ao usuário OU 1 correção de bug OU 1 pequena melhoria
- **1 commit** com mensagem clara

**Se Pedro pedir algo que viola isso**, PARE e responda:
> *"Isso mexe em X arquivos / Y módulos. Pra não quebrar nada, vou dividir em N tarefas menores. Ordem proposta: 1) ... 2) ... 3) ... Pode ser assim?"*

### REGRA 2 — Proibido refatorar sem a palavra "refatore"
O projeto anterior quebrou porque refatorações não solicitadas deixaram funções fora do escopo global e o login parou de funcionar.

**Não reorganizar arquivos, não renomear funções, não "melhorar" estrutura, não converter código "mais moderno"** — exceto se Pedro usar literalmente a palavra **"refatore"** ou **"reorganize"** no pedido.

Viu algo que acha que deveria ser refatorado? **Documente em `Ideias para Revisitar.md`** e continue sua tarefa.

### REGRA 3 — Proibido tocar em módulo fora do escopo
Se a tarefa é sobre Tarefas, não encoste em Agenda, Chat, Dashboard. Nem pra "alinhar padrões". Nem pra "consertar algo de passagem".

Cada módulo é uma ilha. Se a mudança exigir tocar em outro módulo, PARE e pergunte ao Pedro: *"Pra fazer isso preciso também alterar X. Divide em duas tarefas?"*

### REGRA 4 — Window Bridge é obrigatório
Toda função chamada por `onclick` no HTML precisa estar exposta no `window` via `app.js`. Sem isso, o clique não faz nada e não aparece erro.

```js
// app.js — EXPOR TUDO que o HTML usa em onclick
window.signIn = signIn;
window.signOut = signOut;
window.goPage = (p) => router.goPage(p);
// ... etc
```

**Após cada tarefa que adiciona nova função chamada por HTML, atualize a seção Window Bridge lá no fim deste arquivo.**

### REGRA 5 — Uma única instância Supabase
Criar o cliente APENAS em `js/core/supabase.js`. Nunca chamar `createClient()` em outro lugar. Em qualquer módulo: `import { supabase } from '../core/supabase.js'`.

### REGRA 6 — Auth via `onAuthStateChange` + flag `appInitialized`
```js
let appInitialized = false;
supabase.auth.onAuthStateChange((event, session) => {
  if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
    if (!appInitialized) { appInitialized = true; initApp(session); }
  }
  if (event === 'SIGNED_OUT') showLogin();
});
```

### REGRA 7 — Mobile primeiro, sempre
Todo CSS funciona em 375px de largura. Touch targets mínimo 44px. Sidebar vira drawer. Testar no DevTools com modo celular antes de dizer "pronto".

### REGRA 8 — Ler antes de alterar
Antes de editar qualquer arquivo, leia ele INTEIRO. Não presumir estrutura. Não editar às cegas.

### REGRA 9 — Se está em dúvida, PERGUNTE
Melhor gastar 2 minutos perguntando que 30 minutos desfazendo. Pedro prefere perguntas que surpresas.

### REGRA 10 — Atualizar o Dev Log a cada tarefa
Ao terminar uma tarefa, adicione uma entrada em `080 - Dev Log/Dev Log — AAAA-MM.md` com:
- O que foi feito (3-5 linhas)
- Se algo ficou pendente
- Se alguma decisão nova foi tomada (e criar o arquivo correspondente)

### REGRA 12 — Princípio de Customização Total

Pedro NUNCA mais usa Claude Code, Supabase Dashboard ou terminal depois que o sistema estiver pronto.

Toda criação, edição, configuração e exclusão acontece nas telas do app:
- Categorias do Sítio: tela
- Personas (Marcos, Bruno, Marcela, Alemão, Roteador): tela
- Entidades (empresas): tela
- Configurações de IA (modelo, temperatura, max_tokens): tela
- Labels de status/prioridade/tipos: tela (via tabela `configuracoes`)
- Tarefas, eventos, documentos: tela
- TUDO: tela

Claude Code só volta pra:
- Evoluir o sistema (novas features)
- Corrigir bugs estruturais
- Melhorar arquitetura
- NUNCA pra mexer em dados de produção

**CONSEQUÊNCIAS PRA TODAS AS PRÓXIMAS TAREFAS:**

1. **Seeds existem APENAS como sugestão inicial** pra Pedro não começar com banco vazio. Todos os seeds podem ser editados ou apagados pelo usuário via tela.

2. Quando uma decisão de "valores fixos" for tomada (ex: 25 categorias do Sítio), ela é **PONTO DE PARTIDA, não imutável**.

3. **Vocabulário interno** (`status='fazendo'`, `prioridade='alta'`, `tipo='reuniao'`) fica em CHECK constraint porque é estrutural do código (kanban tem 4 colunas, etc.). Mas o **nome que aparece na tela** ("fazendo" vs "em produção") fica customizável via tabela `configuracoes` (Tarefa 2.9).

4. **Toda tabela do sistema PRECISA ter sua tela equivalente na Fase 4** com: listagem, criação, edição, arquivamento/exclusão.

5. **Soft-delete** (campo `arquivada`/`arquivado`/`ativa`) é sempre preferível a hard-delete. Hard-delete só com confirmação explícita do usuário ("apagar permanentemente").

---

## Estrutura de arquivos do projeto

```
assistente/
├── index.html              # HTML estrutural + CSS Design System completo
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker
├── icon-192.png            # Ícone PWA
├── icon-512.png            # Ícone PWA
├── CLAUDE.md               # ESTE arquivo (fonte de verdade)
├── js/
│   ├── app.js              # Entry point: auth, init, WINDOW BRIDGE
│   ├── core/
│   │   ├── supabase.js     # ⚠️ Cliente Supabase — instância ÚNICA
│   │   ├── store.js        # Estado global com pub/sub
│   │   ├── router.js       # Navegação entre páginas
│   │   ├── modal.js        # Sistema de modais empilháveis
│   │   ├── toast.js        # Notificações toast
│   │   └── utils.js        # Helpers: fmtDate, fmtMoney, debounce...
│   └── modules/
│       ├── dashboard.js
│       ├── tasks.js
│       ├── agenda.js
│       ├── docs.js
│       ├── chat.js
│       ├── sitio.js
│       ├── cedtec.js
│       └── config.js
└── supabase/
    └── functions/
        ├── chat-claude/index.ts
        ├── meta-sync/index.ts
        └── meta-balance/index.ts
```

---

## Comandos que o Claude Code executa (Pedro não digita nada)

### Começar uma tarefa
```bash
git checkout dev
git pull origin dev
```

### Terminar uma tarefa (enviar pra preview)
```bash
git add .
git commit -m "feat: descrição clara do que foi feito"
git push origin dev
# Informar Pedro a URL de preview gerada pelo Vercel
```

### Promover pra produção (SÓ depois do Pedro aprovar)
```bash
git checkout main
git pull origin main
git merge dev
git push origin main
git checkout dev
```

### Deploy de Edge Function (quando alterada)
```bash
supabase functions deploy [nome-da-funcao] --project-ref [ref-do-projeto]
```

---

## URLs do projeto

| Recurso | URL |
|---------|-----|
| App em produção (main) | https://assistente-v4.vercel.app |
| App de teste (dev) | https://assistente-v4-git-dev-pedropertels-projects.vercel.app |
| GitHub | https://github.com/pedropertel/assistente-v4 |
| Supabase | https://msbwplsknncnxwsalumd.supabase.co |

---

## Credenciais

- Supabase anon JWT (legacy, formato `eyJhbGc...`): em uso no frontend (`js/core/supabase.js`).
  - **Por que JWT legacy e não `sb_publishable_*`:** o Edge Functions Gateway só aceita anon JWT clássica como Bearer token. `sb_publishable_*` (sistema novo) **NÃO funciona** como Bearer no Gateway — retorna `UNAUTHORIZED_INVALID_JWT_FORMAT`. Validado na 3.A.2 com curl. Mantemos JWT legacy enquanto Supabase não unificar os dois sistemas pra Edge Functions.
  - Chave pública por design — vai pro bundle JS. Quem protege os dados é o RLS + policies, nunca o sigilo da chave.
  - **Rotação:** Dashboard → Settings → API → JWT Settings → Generate new JWT secret. Substituir em `js/core/supabase.js` + redeploy do front.
  - **NUNCA** colocar a `service_role` key em lugar nenhum do frontend.
- ANTHROPIC_API_KEY: nos Secrets da Edge Function do Supabase (não expor no frontend).
  - **Rotação:** (1) Console Anthropic → API Keys → Create new; (2) Dashboard Supabase → Edge Functions → Secrets → atualizar `ANTHROPIC_API_KEY`; (3) Console Anthropic → revogar key antiga; (4) **sem deploy de código necessário** — Edge lê em runtime via `Deno.env.get('ANTHROPIC_API_KEY')`.
- Usuário: pedro.pertel@gmail.com

---

## Comportamento esperado do Claude Code em cada sessão

1. **Abrir a sessão:** ler este `CLAUDE.md`, o `Workflow de Desenvolvimento.md` e o `Backlog — Tarefas Pequenas.md`. Checar em qual branch está.
2. **Receber a tarefa:** confirmar que é pequena. Se for grande, propor divisão antes de escrever código.
3. **Executar:** mudar pra `dev`, implementar de forma cirúrgica, testar mentalmente o fluxo, verificar window bridge se aplicável.
4. **Commitar e enviar:** `git push origin dev`. Informar Pedro a URL de preview e o que ele deve testar.
5. **Aguardar aprovação:** não mergear pra main sem Pedro dizer "aprovado", "manda pra produção" ou equivalente explícito.
6. **Promover:** merge dev → main → push main.
7. **Atualizar Dev Log** antes de encerrar a sessão.

---

## Window Bridge — funções expostas no window

> Esta seção é atualizada pelo Claude Code após cada tarefa que adicionar novas funções chamadas por HTML.

```js
// AUTH
window.signIn = signIn;
window.signOut = signOut;

// NAVEGAÇÃO
window.toggleSidebar = toggleSidebar;
window.goPage = goPage;

// FEEDBACK
window.showToast = showToast;
window.showModal = showModal;
window.closeModal = closeModal;

// UTILS (debug/console)
window.utils = utils;

// EDGE FUNCTIONS (debug/console)
window.invokeFunction = invokeFunction;

// CHAT (3.A.3 — UI temporária, vai sair na 3.B.3)
window.pingIA = pingIA;
```

---

## Status atual do projeto

> Atualizar a cada conclusão de tarefa do backlog.

- ✅ Infraestrutura: GitHub `pedropertel/assistente-v4` + Vercel + Supabase `msbwplsknncnxwsalumd`
- ✅ Código (Fase 1 — fundação concluída em 2026-05-01): auth completo via `onAuthStateChange`, design system dark/light persistido, sidebar/drawer mobile-first, router com 8 páginas placeholder, sistema de toast e modal, utils (fmtDate/fmtMoney/fmtRelative/debounce/slugify). Núcleo modular em `js/core/` (supabase, router, toast, modal, utils).
- ✅ **Banco (Fase 2 COMPLETA + bônus 2.10 — 9/9 tarefas + 2 evolutivas + 1 bônus):** **18 tabelas reais** cobrindo Core (`entidades`, `tarefas`, `eventos`, `pastas`, `documentos` + bucket Storage), Inteligência (`agentes`, `personas` incl. Roteador interno + Marina, `chat_mensagens`, `chat_anexos` — 1ª CASCADE), Sítio (`sitio_categorias`, `sitio_lancamentos` com rastreio voz→lançamento), Meta Ads (`meta_credenciais` via Supabase Vault, `meta_conexoes` multi-conta, `meta_campanhas_cache` + `meta_adsets_cache` + `meta_ads_cache` — 3 níveis com `raw_data jsonb`, 3 CASCADE adicionais), Sistema (`configuracoes` — chave-valor genérica), e **Módulo Ideias (2.10 bônus)**: `ideias` (captura rápida, Marina refina título/tags/categoria/próxima ação, rastreio voz→ideia via `transcricao_original` + `mensagem_origem_id`). **6 personas** ativas (Marcos, Bruno, Marcela, Alemão, Marina + Roteador interno). **Router pattern (2.5.1)** decide modelo por mensagem. **REGRA 12 (2.6.1)** customização total inviolável. Convenções em `050 - Banco de Dados/CONVENÇÕES.md`: fuso, idempotência ALTER TABLE, FKs RESTRICT/SET NULL/CASCADE (4 exceções), naming, Storage + prefixo-exceção, Router pattern, customização total, soft-delete padrão (3 exceções), denormalização consciente, integração com sistemas externos (Vault + cache), nomenclatura ponto-separada, **Edge Functions (3.A — convenções de nome, estrutura, CORS, logger, JWT legacy)**.
- ✅ **Fase 3 em andamento — 2/9 sub-fases (3.0 ✅, 3.A ✅), próxima: 3.B.**
  - **3.0** (2026-05-02) — Reconciliação documental: Backlog passa a refletir Fase 3 = IA / Fase 4 = UI.
  - **3.A** (2026-05-02) — Fundação Edge Functions:
    - Estrutura `supabase/functions/_shared/` com 3 utilitários: `cors.ts` (allowlist explícita prod + previews + Vary: Origin), `supabase-admin.ts` (cliente service_role lazy-cached), `logger.ts` (JSON estruturado com `request_id` UUID v4).
    - Edge `health-check` em produção (smoke test de infra, custo zero, valida secrets sem expor valores). URL: `https://msbwplsknncnxwsalumd.supabase.co/functions/v1/health-check`.
    - Helper `invokeFunction(name, payload)` em `js/core/supabase.js` — retorna `{ data, error }`, nunca joga exception, log defensivo sem payload.
    - `window.invokeFunction` exposto pra debug no console.
    - UI temporária `pingIA()` em `js/modules/chat.js` + página chat com botão "🏓 Ping IA" e card de status (será substituída na 3.B.3).
    - **Gotcha JWT:** `sb_publishable_*` não funciona como Bearer no Edge Gateway. Front migrou pra anon JWT legacy (`eyJhbGc...`). Detalhes na seção Credenciais.
- **Próximo:** Fase 3.B — Echo Anthropic (Haiku puro, sem router). **Plano da 3.B aprovado em 2026-05-02 após segundo triplo /plan** (ajustes: MODEL_PRICING limitado a Haiku 4.5 com fail-safe pra modelo não mapeado, JSDoc explícito em `carregarHistorico` documentando provisório da 3.B, rate limiting confirmado pra 3.G.3). Detalhamento ativo no topo de `.claude/plans/temporal-tinkering-castle.md` (seção "DETALHAMENTO ATIVO — Sub-fase 3.B"), roadmap geral preservado abaixo. **Caminho curto até Marcos em produção:** ~20.5h restantes (3.B → 3.C → 3.D → 3.F). Total Fase 3 completa: ~37.5h restantes. Decisões críticas: Web Speech API pra voz (Whisper fica como fallback futuro opcional), Anthropic `tools` parameter nativo + observabilidade via `chat_mensagens.tool_calls/tool_results jsonb` (ALTER TABLE na 3.F.0.5), bootstrap Meta via SQL manual (dívida temporária), streaming SSE depois de Marcos.

---

## Lembrete final

> Todo projeto anterior do Pedro quebrou por duas razões: **(a)** Claude Code refatorando sem pedir, **(b)** tarefas grandes demais indo direto pra produção sem teste. Este `CLAUDE.md` existe para eliminar as duas causas. Se você seguir as regras, o projeto não quebra. Se você quebrar uma regra, o projeto quebra. É simples assim.
