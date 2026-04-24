---
tipo: referencia
tags: [workflow, processo, git, vercel, deploy]
atualizado: 2026-04-24
---

# Workflow de Desenvolvimento

[[Home]] > Sistema > Workflow de Desenvolvimento

> O fluxo que protege o projeto contra quebras. Pedro não digita nenhum comando — Claude Code faz tudo. Pedro só testa e aprova.

---

## O problema que este workflow resolve

Nos projetos anteriores, qualquer bug do Claude Code ia direto pra produção porque:
1. Não havia um ambiente de teste
2. As tarefas eram grandes demais, então quando algo quebrava era difícil achar o quê
3. Pedro só descobria que tinha quebrado quando tentava usar o app

Este workflow resolve as três coisas.

---

## As duas branches

Toda linha de código vive numa de duas "linhas do tempo" do projeto:

| Branch | O que é | URL | Quem mexe |
|--------|---------|-----|-----------|
| `main` | **Produção.** O app real. | `assistente.vercel.app` *(exemplo)* | Ninguém direto. Só recebe código da `dev` depois que Pedro aprova. |
| `dev` | **Laboratório.** Onde tudo é testado. | Vercel gera uma URL de preview a cada push | Claude Code trabalha sempre aqui. |

> [!important] Regra única e absoluta
> **Ninguém faz push direto na `main`.** Nem Pedro, nem Claude Code. A `main` só recebe código que veio da `dev` e foi aprovado por Pedro.

---

## O fluxo de uma tarefa, passo a passo

```
┌─────────────────────────────────────────────────────────────┐
│  1. Pedro abre o Claude Code e pede uma tarefa pequena      │
│     Ex: "adiciona um campo de prioridade no formulário      │
│          de nova tarefa"                                     │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  2. Claude Code avalia o tamanho                             │
│     - Se for pequena: segue em frente                        │
│     - Se for grande: responde "vou dividir em N tarefas.     │
│       Ordem: 1)... 2)... 3)... Pode ser?"                    │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  3. Claude Code muda pra branch `dev`, implementa,           │
│     dá commit e push                                         │
│     → Vercel detecta o push e gera uma URL de preview        │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  4. Claude Code responde pro Pedro:                          │
│     "Pronto. Testa aqui: [URL do preview]                    │
│      O que testar: abrir tarefas, clicar em nova tarefa,     │
│      ver se aparece o campo prioridade, criar uma e ver      │
│      se salvou. Responde 'aprovado' pra subir pra produção." │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  5. Pedro abre a URL no celular, testa os passos listados    │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
                 ┌─────────┴─────────┐
                 ↓                   ↓
         ┌──────────────┐    ┌──────────────┐
         │ Funcionou?   │    │ Quebrou algo?│
         └──────┬───────┘    └──────┬───────┘
                ↓                    ↓
         Pedro responde:     Pedro responde:
         "aprovado"          "não funciona:
                              [o que aconteceu]"
                ↓                    ↓
         Claude Code faz     Claude Code
         merge dev → main    corrige na MESMA
         → push main         branch dev, push,
         → produção          novo preview gerado,
         atualizada          Pedro testa de novo
                ↓                    ↓
         Dev Log              (volta ao passo 4)
         atualizado
```

---

## O que o Pedro faz na prática

### Iniciar uma tarefa
Abre o Claude Code e escreve em linguagem natural o que quer. Exemplos bons:

- ✅ *"Troca a cor do botão de salvar tarefa pra verde"*
- ✅ *"Adiciona um campo 'observações' no formulário de lançamento do sítio"*
- ✅ *"No módulo de agenda, o botão 'novo evento' não aparece no celular. Arruma."*
- ✅ *"Cria a estrutura básica do módulo de tarefas — só a tela em branco com o título"*

Exemplos ruins (são grandes demais):
- ❌ *"Faz o módulo de tarefas completo"* → Claude Code vai pedir pra dividir
- ❌ *"Refatora o app pra ficar mais organizado"* → Claude Code vai recusar (REGRA 2)
- ❌ *"Arruma tudo que está estranho"* → Claude Code vai pedir pra ser específico

### Testar o preview
Quando o Claude Code mandar a URL, abre ela no celular (melhor) ou no computador. **Testa os passos que o Claude Code listou pra testar**, não só "abre e olha". Se ele mandou testar 3 coisas, testa as 3.

### Aprovar ou rejeitar
- **Funcionou:** `aprovado` (ou qualquer frase clara tipo "tá bom, manda pra produção")
- **Não funcionou:** descreve o que aconteceu com detalhes:
  - *"cliquei em salvar e não fez nada"*
  - *"o campo aparece cortado no celular"*
  - *"dá erro 'supabase is not defined' no console"*

Nunca dizer só "não funciona" — Claude Code não vai saber o que corrigir.

---

## O que o Claude Code faz na prática

### No começo de cada sessão
1. Lê `CLAUDE.md` inteiro
2. Lê este arquivo
3. Confirma em qual branch está: `git branch --show-current`
4. Se estiver em `main`, muda pra `dev` antes de qualquer coisa
5. Puxa as últimas alterações: `git pull origin dev`

### Ao receber a tarefa
1. Avalia o tamanho. Se passa de "uma coisinha específica", propõe dividir.
2. Lê os arquivos que vai alterar (INTEIROS, não só trechos).
3. Implementa a mudança da forma mais cirúrgica possível.
4. Atualiza o Window Bridge em `app.js` se adicionou função chamada por HTML.

### Ao terminar
1. Commita com mensagem clara: `git commit -m "feat: adiciona campo prioridade em tarefas"`
2. Push: `git push origin dev`
3. Aguarda uns segundos e confirma a URL de preview do Vercel
4. Responde pro Pedro com a URL + o que testar
5. **Não faz merge pra main sem aprovação explícita**

### Na aprovação
1. `git checkout main`
2. `git pull origin main`
3. `git merge dev`
4. `git push origin main` → Vercel publica em produção
5. `git checkout dev` (volta pra dev pra próxima tarefa)
6. Atualiza `Dev Log — AAAA-MM.md`

---

## Como o preview do Vercel funciona

O Vercel já vem configurado pra gerar **um preview automático toda vez que você faz push em qualquer branch que não é a main.**

- Push na `dev` → URL tipo `assistente-git-dev-pedropertel.vercel.app` (sempre a mesma)
- Push na `main` → URL de produção (sempre a mesma)

Não precisa fazer nada — o Claude Code configura isso na Tarefa 0 e depois é automático pra sempre.

> [!tip] Se esquecer a URL do preview
> Entra em vercel.com → seu projeto → aba "Deployments" → filtrar por branch "dev" → pega o link do deploy mais recente.

---

## E se eu quiser ver o que mudou antes de aprovar?

Pergunta pro Claude Code: *"me explica em português o que mudou nessa tarefa"*. Ele vai te mostrar um resumo sem jargão técnico.

---

## E se eu aprovar e quebrar produção?

Acontece. Nesse caso, pede pro Claude Code: *"reverte a última mudança da produção"*. Ele vai desfazer o último merge e a `main` volta ao estado anterior.

Como a tarefa é pequena, a reversão também é pequena — não é o fim do mundo.

---

## Relacionado

- [[CLAUDE.md]] — regras que o Claude Code não pode violar
- [[Backlog — Tarefas Pequenas]] — fila de tarefas pra executar, uma a uma
- [[PRIMEIRO PROMPT]] — o primeiro prompt a colar no Claude Code pra configurar tudo
