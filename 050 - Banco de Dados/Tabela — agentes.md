---
tipo: schema
tabela: agentes
fase: 2
tarefa: 2.5
criada_em: 2026-05-01
---

# Tabela `agentes`

[[Home]] > Banco de Dados > agentes

> **1 agente único** ("Assistente") com visão completa de todas as entidades. Adapta tom via [[Tabela — personas|personas]]. A tabela é genérica — voltar pra multi-agente é só inserir mais linhas.

---

## Schema

```sql
CREATE TABLE public.agentes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  nome          text NOT NULL,
  descricao     text NOT NULL,
  icone         text,
  cor_hex       text,
  prompt_base   text NOT NULL,
  modelo        text NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  temperatura   numeric(3,2) NOT NULL DEFAULT 0.7
                CHECK (temperatura >= 0 AND temperatura <= 2),
  max_tokens    integer NOT NULL DEFAULT 4096
                CHECK (max_tokens > 0 AND max_tokens <= 8192),
  ativo         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

### Colunas (13 no total)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK. |
| `slug` | `text` | Identificador estável. UNIQUE. Ex.: `assistente`. |
| `nome` | `text` | Nome de exibição. |
| `descricao` | `text` | Curta — aparece em UI/tooltips. |
| `icone` | `text` | Emoji. |
| `cor_hex` | `text` | HEX **sem `#`**. |
| `prompt_base` | `text` | System prompt enviado pro modelo a cada chamada. Pode usar placeholders `{entidade_atual}` substituídos em runtime. |
| `modelo` | `text` | String exata do parâmetro `model` da API Anthropic. Default `claude-haiku-4-5-20251001`. |
| `temperatura` | `numeric(3,2)` | Criatividade. CHECK 0–2. Default 0.7. |
| `max_tokens` | `integer` | Limite por resposta. CHECK 1–8192. Default 4096. |
| `ativo` | `boolean` | Soft-disable. False não responde mais a novas mensagens. |
| `created_at` | `timestamptz` | Criação. |
| `updated_at` | `timestamptz` | Trigger. |

---

## Conceito — por que 1 agente único

A versão original do roadmap previa 4 agentes independentes (Marcos, Bruno, Marcela, Alemão), cada um com persona, contexto e memórias separadas. Na Tarefa 2.5 a decisão mudou:

- **Um agente único** que sempre tem visão completa de tudo (CEDTEC, Pincel Atômico, Sítio, Gráfica, Agência, Pessoal).
- **4 personas** ([[Tabela — personas]]) viraram **modos opcionais** de adaptação de tom — não pessoas distintas com memórias próprias.

### Por que mudou

- **Memória unificada.** Pedro não quer ter que repetir contexto pra cada agente nem se preocupar com qual agente lembra o quê.
- **Decisões cruzam entidades.** "Tenho dinheiro pra investir em mídia da CEDTEC esse mês?" exige saber das entradas/saídas pessoais e do sítio também. Agente único tem contexto inteiro.
- **Manutenção menor.** Atualizar prompt base = 1 linha mudada, não 4.
- **Reversível.** Schema continua suportando multi-agente — basta inserir mais linhas em `agentes` e ajustar a Edge Function pra escolher qual usar. Nenhuma decisão pintada de tinta.

A persona ativa apenas **adapta o tom e foco** — o cérebro continua sendo o mesmo.

---

## Como o `prompt_base` é usado em runtime

O Edge Function `chat-claude` (Fase 4) faz mais ou menos isso a cada mensagem:

```js
// Pseudo-código
const agente = await supabase
  .from('agentes')
  .select('*')
  .eq('slug', 'assistente')
  .eq('ativo', true)
  .single();

let systemPrompt = agente.prompt_base;

// Se há persona ativa, concatena o `contexto` dela
if (personaAtivaId) {
  const persona = await supabase
    .from('personas')
    .select('contexto')
    .eq('id', personaAtivaId)
    .single();
  systemPrompt += '\n\n---\n\n' + persona.contexto;
}

// Substitui placeholders (futuros)
systemPrompt = systemPrompt.replace('{entidade_atual}', entidadeNome);

// Chama Anthropic
const response = await anthropic.messages.create({
  model: agente.modelo,
  max_tokens: agente.max_tokens,
  temperature: parseFloat(agente.temperatura),
  system: systemPrompt,
  messages: historicoConversa,
});
```

Tudo configurável via banco — mudar modelo, temperatura, max_tokens não exige redeploy.

### Placeholders previstos

Hoje o `prompt_base` é texto puro. A partir da Fase 3, vamos suportar substituições simples em runtime:

| Placeholder | Substituído por |
|---|---|
| `{entidade_atual}` | Nome da entidade onde o Pedro está conversando agora. |
| `{persona_ativa}` | Nome da persona ativa (se houver). |
| `{usuario}` | "Pedro Pertel". |
| `{data_hora}` | Data/hora atual em Brasília, formatada. |

A lista exata será trancada quando a Edge Function existir.

---

## Defesa em profundidade

### CHECK em `temperatura` e `max_tokens`

```sql
CHECK (temperatura >= 0 AND temperatura <= 2)
CHECK (max_tokens > 0 AND max_tokens <= 8192)
```

A UI valida antes do salvar. O banco rejeita lixo (ex.: `temperatura = 99`, `max_tokens = -1`) caso algum bug passe pela borda. Custo zero, robustez extra.

`max_tokens <= 8192` como teto duro: Haiku 4.5 tecnicamente suporta mais (200k de janela), mas 8192 cobre qualquer resposta razoável e protege contra `max_tokens` esquecido alto que escala custo silenciosamente.

### `numeric(3,2)` em `temperatura` (não `real`/`double`)

`real`/`double precision` sofrem de ponto flutuante: `0.7` pode virar `0.7000000001` em comparações. `numeric(3,2)` (3 dígitos totais, 2 depois da vírgula — faixa `-9.99` a `9.99`) é exato.

---

## Por que dollar-quoting no seed (`$prompt$...$prompt$`)

Postgres aceita strings literais entre tags `$tag$...$tag$` (a tag pode ser vazia: `$$...$$`). Tudo entre as tags do mesmo nome é tratado como string crua, sem interpretação de aspas/apóstrofos.

```sql
INSERT INTO agentes (prompt_base) VALUES (
  $prompt$Você é o Assistente. Pedro disse "olá" e perguntou: vamos?$prompt$
);
```

Comparado com escape manual (`'Você é o Assistente. Pedro disse ''olá'' e perguntou: vamos?'`), dollar-quoting é mais legível e à prova de erro. Padrão pra qualquer texto multi-linha não-trivial.

---

## ⚠️ Atualização (Tarefa 2.5.1) — `modelo` agora é fallback, não escolha final

A partir da **Tarefa 2.5.1**, o sistema usa **router pattern** pra escolher o modelo correto por mensagem (ver [[Tabela — personas]] → "Router pattern"). O fluxo passou a ser:

1. Persona interna **Roteador** (Haiku) classifica a mensagem → devolve `persona_slug` + `nivel_complexidade`.
2. Edge Function (Fase 3) escolhe o modelo final assim:
   - Se a persona escolhida tem `modelo_override` preenchido → usa esse.
   - Senão, mapeia `nivel_complexidade` pro modelo padrão (Haiku/Sonnet/Opus — ver [[CONVENÇÕES]] → "Router pattern e escolha de modelo").
3. **`agente.modelo` (esta coluna) só é usado como fallback** — quando não há persona ativa e o roteador não decidiu nada (caso raro).

Em prática, com o router em produção, o `modelo` da tabela `agentes` raramente é consultado. A configuração de modelo passa a viver mais em `personas` (`modelo_override` e `nivel_complexidade`).

A coluna `modelo` continua aqui porque (a) o agente único pode existir antes de qualquer persona estar ativa (ex.: primeira mensagem de uma sessão), (b) abre porta pra agentes futuros que não usem router. Não vou removê-la.

---

## Row Level Security

```sql
ALTER TABLE public.agentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_full_access
  ON public.agentes
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

Padrão do projeto. Single-user.

---

## Índice

```sql
CREATE INDEX idx_agentes_ativo
  ON public.agentes (ativo)
  WHERE ativo = true;
```

Parcial — quase toda query da Edge Function vai filtrar `ativo = true`. `slug` já tem índice automático pela UNIQUE constraint.

---

## Seed (1 agente)

| slug | nome | ícone | cor_hex | modelo | temperatura | max_tokens | tamanho_prompt |
|---|---|---|---|---|---|---|---|
| `assistente` | Assistente | 🧠 | `5B6AF0` | claude-haiku-4-5-20251001 | 0.70 | 4096 | ~4333 |

---

## `prompt_base` completo do Assistente

> Mantido aqui como referência. A fonte de verdade é o banco — alterações futuras são via `UPDATE agentes SET prompt_base = ... WHERE slug = 'assistente'`.

```
Você é o Assistente pessoal do Pedro Pertel, empresário em Vitória/Espírito Santo.

CONTEXTO DO USUÁRIO:
Pedro gerencia 5 empresas + sua vida pessoal:
- CEDTEC: escola técnica em Vila Velha. Pedro é dono e único marketing. Foco em campanhas Meta Ads.
- Pincel Atômico: sistema de gestão escolar. Pedro é diretor comercial/marketing.
- Sítio Monte da Vitória: produção de café arábica nas montanhas capixabas. Fase de investimento.
- Gráfica: gráfica de apostilas. Pedro é sócio.
- Agência: agência de marketing. Pedro é gestor.
- Pessoal: família, saúde, finanças pessoais, lazer.

SEU PAPEL:
- Manter visão unificada de tudo (uma única "memória")
- Adaptar tom e foco ao contexto da entidade ativa
- Ser direto, prático e respeitar o tempo do Pedro
- Quando útil, ativar uma persona específica (Marcos, Bruno, Marcela, Alemão) pra dar identidade à resposta
- Nunca inventar dados — se não souber algo, pergunta

DIRETRIZES:
- Português brasileiro, tom natural, sem corporativês
- Foco em ação e decisão, não em conversa por conversa
- Pedro detesta perguntas óbvias — antes de perguntar, tenta inferir do contexto
- Se a tarefa é simples, executa. Se é ambígua, pergunta UMA vez e segue.

Você tem acesso aos dados das tabelas: entidades, tarefas, eventos, pastas, documentos, personas, chat_mensagens.
```

---

## Exemplos de query no front (JS)

```js
import { supabase } from '../core/supabase.js';
```

### Buscar agente ativo

```js
const { data: agente, error } = await supabase
  .from('agentes')
  .select('id, slug, nome, prompt_base, modelo, temperatura, max_tokens')
  .eq('slug', 'assistente')
  .eq('ativo', true)
  .single();
```

### Atualizar configuração (sem redeploy)

```js
await supabase
  .from('agentes')
  .update({ temperatura: 0.5, max_tokens: 6000 })
  .eq('slug', 'assistente');
// Próxima chamada do Edge Function lê os valores atualizados.
```

### Soft-disable

```js
await supabase
  .from('agentes')
  .update({ ativo: false })
  .eq('slug', 'assistente');
```

---

## Conexões com outras tabelas

A coluna `agente_id` em `tarefas`, `eventos` e `documentos` referencia `agentes(id)` via FK adicionada na Tarefa 2.5:

```sql
ALTER TABLE public.tarefas ADD CONSTRAINT fk_tarefas_agente
  FOREIGN KEY (agente_id) REFERENCES public.agentes(id) ON DELETE SET NULL;
-- Equivalente em eventos e documentos.
```

`ON DELETE SET NULL` (não RESTRICT) — apagar/desativar agente não destrói tarefas/eventos/documentos, só zera a referência. Detalhes em [[CONVENÇÕES]] → "FKs estruturais vs FKs de metadados".

---

## Relacionado

- [[Tabela — personas]] — modos de adaptação de tom do agente
- [[CONVENÇÕES]] — convenções aplicadas
- [[VISAO.md]] — decisão "interface primária = conversa"
- [[Backlog — Tarefas Pequenas]] — Tarefa 2.5 (✅)
