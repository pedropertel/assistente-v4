---
tipo: prompt
tags: [setup, primeiro-prompt, claude-code]
atualizado: 2026-04-24
---

# PRIMEIRO PROMPT pro Claude Code

[[Home]] > PRIMEIRO PROMPT

> Este é o texto que Pedro cola no Claude Code na **primeira sessão**, depois de recomeçar do zero. Ele configura toda a infraestrutura (GitHub, Vercel, Supabase) e deixa o projeto pronto pra receber a Tarefa 1.1.

---

## Antes de colar o prompt

Pedro precisa ter:
- [ ] Conta no GitHub (já tem: `pedropertel`)
- [ ] Conta no Vercel (já tem)
- [ ] Conta no Supabase (já tem)
- [ ] Claude Code instalado e rodando em uma pasta vazia (ou na pasta do projeto antigo, o Claude Code vai criar tudo novo)
- [ ] Este arquivo, o `CLAUDE.md`, o `Workflow de Desenvolvimento.md` e o `Backlog — Tarefas Pequenas.md` salvos na mesma pasta onde o Claude Code está rodando

> [!tip] Importante
> Se quiser **preservar o repositório antigo** por precaução (caso queira consultar algo), não precisa apagar agora. O Claude Code vai criar um repositório NOVO.

---

## O prompt (copiar e colar inteiro abaixo)

```
Olá Claude Code. Este é o primeiro prompt de um projeto recomeçado do zero.

Antes de qualquer coisa:
1. Leia o arquivo CLAUDE.md nesta pasta. Ele contém TODAS as regras que você não pode violar.
2. Leia "Workflow de Desenvolvimento.md". Ele descreve o fluxo dev/preview/main.
3. Leia "Backlog — Tarefas Pequenas.md". Ele lista as tarefas que virão depois desta.

Se você NÃO leu os três arquivos acima, pare agora e leia. Não prossiga sem ler.

---

TAREFA 0.1 — SETUP DA INFRAESTRUTURA COMPLETA

Objetivo: deixar o projeto configurado com GitHub (repo novo), Vercel (preview automático por branch), e uma página "Hello World" rodando tanto em produção (branch main) quanto em ambiente de teste (branch dev).

Passos que você vai executar (sem me pedir pra digitar comandos — faça tudo você):

1. VERIFICAR FERRAMENTAS
   - Checar se `git`, `gh` (GitHub CLI) e `vercel` (Vercel CLI) estão instalados.
   - Se algum faltar, instalar (usar npm global pra Vercel CLI: `npm i -g vercel`).
   - Rodar `gh auth status` e me informar se estou autenticado. Se não estiver, me mostre o comando exato que devo rodar (`gh auth login --web --git-protocol https`).

2. CRIAR O REPOSITÓRIO NO GITHUB
   - Me pergunte qual nome eu quero pro repo novo. Sugestões: `assistente-v2`, `pedro-assistente`, `assistente-pessoal`. Espere minha resposta.
   - Quando eu responder, crie o repo usando `gh repo create <nome> --public --source=. --remote=origin --push`.
   - Se já existe um repo na pasta com commits antigos, me avise antes de fazer qualquer coisa destrutiva.

3. CRIAR ESTRUTURA INICIAL DE ARQUIVOS
   - Crie um `index.html` mínimo com <html>, <head>, <body> e o texto "Hello World · Assistente" dentro de um <h1>.
   - Crie um `.gitignore` básico (node_modules, .env, .DS_Store, .vercel).
   - Crie um `README.md` com o nome do projeto e uma frase explicando que é o sistema pessoal do Pedro.
   - Mova os arquivos do vault (CLAUDE.md, Workflow de Desenvolvimento.md, Backlog — Tarefas Pequenas.md, PRIMEIRO PROMPT.md, LEIA-ME.md) pra raiz do projeto se eles ainda não estiverem lá. O CLAUDE.md PRECISA estar na raiz — é a primeira coisa que você lê a cada sessão.

4. PRIMEIRO COMMIT NA MAIN
   - `git add . && git commit -m "chore: setup inicial do projeto"`
   - `git push origin main`

5. CRIAR A BRANCH DEV
   - `git checkout -b dev`
   - `git push origin dev`
   - Volte pra dev como branch ativa (o trabalho sempre acontece na dev, regra de ouro).

6. CONFIGURAR O VERCEL
   - Rode `vercel login` se necessário e me avise se precisar eu fazer algo.
   - Rode `vercel link` (ou `vercel` pra deploy inicial) pra conectar a pasta ao Vercel como projeto novo.
   - Configuração: Build Command = nenhum (HTML puro). Output Directory = `.` (raiz). Framework = Other.
   - Aceite o padrão do Vercel que faz preview automático de todas as branches que não são main.
   - Faça um `git push origin dev` vazio se precisar pra forçar o Vercel a gerar o primeiro preview.

7. VALIDAR
   - Pegue a URL de produção (da main) e a URL de preview (da dev).
   - Me responda no seguinte formato EXATO:

   ```
   ✅ Setup concluído.
   
   📦 Repositório: https://github.com/pedropertel/<nome-do-repo>
   🟢 Produção (main): https://<url-producao>
   🟡 Preview (dev):   https://<url-preview-dev>
   
   TESTA AÍ: abra as duas URLs no celular. Ambas devem mostrar "Hello World · Assistente".
   
   Se funcionou, responde "aprovado" que eu atualizo o CLAUDE.md com as URLs reais e tô pronto pra próxima tarefa do backlog (Tarefa 0.2 — Supabase).
   
   Se não funcionou, me conta o que você viu.
   ```

8. ATUALIZAR CLAUDE.md
   - Quando eu aprovar, edite o CLAUDE.md preenchendo as URLs reais na seção "URLs do projeto".
   - Commite essa mudança direto na dev: `git add CLAUDE.md && git commit -m "docs: preenche URLs reais do projeto" && git push origin dev`.
   - Depois faça o merge pra main como de costume.

REGRAS QUE VOCÊ JÁ DEVE SEGUIR DESDE AGORA:
- Nunca fazer push direto na main sem minha aprovação.
- Sempre trabalhar em dev.
- Se alguma coisa desse prompt falhar, PARE e me conte. Não improvise soluções sem me consultar.
- Se você identificar algo pra refatorar ou "melhorar" fora do escopo que pedi, NÃO FAÇA. Anote no arquivo "Ideias para Revisitar.md" (crie se não existir) e siga em frente.

Vai.
```

---

## O que esperar depois

Depois desse prompt, o Claude Code vai te perguntar o nome do repo e (talvez) pedir pra você rodar um `gh auth login` se for a primeira vez. Você responde e ele toca o barco.

No fim, ele vai te mandar duas URLs. Você abre as duas no celular, confere se aparece "Hello World · Assistente" nas duas, e responde "aprovado".

Aí ele está pronto pra Tarefa 0.2 (Supabase) — ver [[Backlog — Tarefas Pequenas]].

---

## Se algo der errado no setup

Não entre em pânico. Responda pro Claude Code exatamente o que ele mostrou de erro, copiando e colando. Ele vai te guiar.

Se der a sensação de que ele está fazendo mais coisa do que devia (criando arquivos que você não pediu, refatorando algo), interrompa com: *"pare e liste o que você fez até agora antes de continuar"*. Ele vai parar e mostrar, e aí você decide se segue ou reverte.

---

## Relacionado

- [[CLAUDE.md]] — regras que o Claude Code obedece
- [[Workflow de Desenvolvimento]] — como funcionam as branches dev e main
- [[Backlog — Tarefas Pequenas]] — próximos passos
- [[LEIA-ME — Como Usar Isso]] — visão geral dos arquivos do vault
