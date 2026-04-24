---
tipo: guia
tags: [leia-me, onboarding, pedro]
atualizado: 2026-04-24
---

# LEIA-ME — Como Usar Isso

> Guia pro Pedro. Lê este arquivo primeiro.

---

## O que aconteceu

Você já começou esse projeto várias vezes e ele sempre quebra. Sempre pelas mesmas duas razões:

1. **Claude Code refatora sem pedir** e derruba coisas que estavam funcionando (documentado no seu próprio vault, arquivo `Decisão — Arquivo único vs módulos ES`).
2. **Tarefas grandes demais** vão direto pra produção sem você testar, e quando algo quebra não dá pra descobrir o quê.

Esses 5 arquivos que você recebeu resolvem essas duas coisas.

---

## Os 5 arquivos

| Arquivo | Pra que serve | Quando usar |
|---------|--------------|-------------|
| **`CLAUDE.md`** | As regras imutáveis que o Claude Code tem que obedecer | Sempre. Fica na raiz do projeto. O Claude Code lê isso a cada sessão. |
| **`Workflow de Desenvolvimento.md`** | Explica o fluxo `dev` → preview → aprovação → `main` | Leia uma vez pra entender. Depois o Claude Code segue sozinho. |
| **`Backlog — Tarefas Pequenas.md`** | A lista de tarefas pequenas em ordem. Substitui o antigo "Roteiro Completo" gigante | Toda vez que for começar uma nova tarefa, você pega a próxima daqui. |
| **`PRIMEIRO PROMPT.md`** | O texto que você cola no Claude Code na PRIMEIRA sessão pra configurar tudo | Só uma vez, no começo. |
| **`LEIA-ME — Como Usar Isso.md`** | Este arquivo | Agora 🙂 |

---

## O que mudou em relação ao projeto anterior

### Antes
```
Pedro pede algo grande → Claude Code faz muita coisa →
git push direto na main → Produção quebra → Pedro descobre tarde demais
```

### Agora
```
Pedro pede algo pequeno → Claude Code confirma que é pequeno (divide se não for) →
Implementa na branch dev → Vercel gera URL de preview →
Pedro testa no celular → Pedro aprova explicitamente →
Só aí Claude Code sobe pra main → Produção atualiza
```

A diferença: **você controla quando produção é atualizada.** Nada chega lá sem você dizer "aprovado".

---

## O que você faz na prática (num dia normal)

1. Abre o Claude Code.
2. Abre o `Backlog — Tarefas Pequenas.md`.
3. Copia o prompt da próxima tarefa 🔴.
4. Cola no Claude Code e espera ele terminar.
5. Abre a URL de preview no celular que ele te mandou.
6. Testa os passos que ele listou.
7. Responde "aprovado" ou descreve o que deu errado.
8. Se aprovou, ele sobe pra produção sozinho. Você vai pra próxima tarefa.

**É isso. Você nunca digita um comando no terminal.**

---

## O que você NUNCA deve fazer

- ❌ Pedir "faz o módulo de tarefas inteiro" → Claude Code vai dividir, mas é sua responsabilidade pedir em pedaços
- ❌ Pedir "arruma tudo que está estranho" → seja específico
- ❌ Aprovar sem testar o preview
- ❌ Pedir "refatora isso" sem ter um motivo claro (refatoração foi o que matou o projeto anterior — só peça se realmente precisar)
- ❌ Trabalhar em duas tarefas ao mesmo tempo na mesma sessão

## O que você SEMPRE deve fazer

- ✅ Testar o preview no **celular** (é onde você mais usa)
- ✅ Se algo parecer estranho, reportar com detalhes ("cliquei em X e aconteceu Y")
- ✅ Marcar a tarefa como ✅ concluída no backlog depois de aprovar
- ✅ Parar se o Claude Code começar a fazer coisas que você não pediu (interrompe e pede pra ele listar o que fez antes de continuar)

---

## Primeiros passos agora

1. Abra todos os 5 arquivos no seu Obsidian (coloca eles num vault novo, ou substitui o antigo).
2. Lê (só lendo mesmo, sem fazer nada) o **`CLAUDE.md`** inteiro — pra você entender as regras que o Claude Code vai obedecer.
3. Lê o **`Workflow de Desenvolvimento.md`** — pra você entender o fluxo dev/preview/main.
4. Dá uma passada rápida no **`Backlog — Tarefas Pequenas.md`** pra ver o quanto ficou granular em comparação com o antigo Roteiro.
5. Abre o **`PRIMEIRO PROMPT.md`**, copia o bloco de código grande que está ali, cola no Claude Code.
6. Segue o que ele pedir.

---

## Dúvidas

Se alguma coisa parecer confusa, me chama aqui no chat do Claude (não o Claude Code — o chat normal mesmo) e a gente ajusta os arquivos antes de começar. Melhor gastar 10 minutos ajustando agora do que começar errado.

---

## Uma última coisa

O vault antigo (o que você me mandou no zip) tem MUITO material bom: toda a documentação das empresas, agentes, módulos, banco de dados. Tudo isso ainda é útil. Quando o Claude Code for implementar cada módulo, ele vai consultar essa documentação.

**Recomendação:** copia o vault antigo inteiro pra uma pasta `docs/` dentro do novo projeto, pra o Claude Code ter acesso. Ele vai consultar quando precisar.

Ou, alternativa: mantém o vault antigo como vault de referência no Obsidian (separado do vault do projeto) e, quando precisar passar uma doc específica pro Claude Code, copia o arquivo `.md` correspondente pra pasta do projeto.

Ambos funcionam. Escolhe o que for mais confortável.

Boa sorte. Dessa vez não quebra.
