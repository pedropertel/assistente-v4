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

- Supabase Publishable Key: `sb_publishable_0C7x7G3Za4i4OpReOLErow_LEP1D-sc`
  - Formato novo do Supabase (substituiu "anon key"). Chave pública, pode ficar no frontend. Quem protege os dados é o RLS + policies — nunca o sigilo da chave.
  - **NUNCA** colocar a `service_role` key em lugar nenhum do projeto.
- ANTHROPIC_API_KEY: nos Secrets da Edge Function do Supabase (não expor no frontend)
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
```

---

## Status atual do projeto

> Atualizar a cada conclusão de tarefa do backlog.

- ✅ Infraestrutura: GitHub `pedropertel/assistente-v4` + Vercel + Supabase `msbwplsknncnxwsalumd`
- 🟡 Código: Fase 1 em andamento (auth completo via `onAuthStateChange`, design system com tema dark/light persistido, cliente Supabase isolado em `js/core/`). Faltam sidebar, router, modais, toast, utils.
- 🟡 Banco: schema `public` recriado, só a tabela `teste` existe. As tabelas reais (entidades, tarefas, eventos, etc.) entram na Fase 2 do backlog.

---

## Lembrete final

> Todo projeto anterior do Pedro quebrou por duas razões: **(a)** Claude Code refatorando sem pedir, **(b)** tarefas grandes demais indo direto pra produção sem teste. Este `CLAUDE.md` existe para eliminar as duas causas. Se você seguir as regras, o projeto não quebra. Se você quebrar uma regra, o projeto quebra. É simples assim.
