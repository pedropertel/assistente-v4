---
tipo: schema
tabela: personas
fase: 2
tarefa: 2.5
criada_em: 2026-05-01
---

# Tabela `personas`

[[Home]] > Banco de Dados > personas

> **Modos de adaptação** do Agente único. Cada persona define um tom, foco e entidades-alvo. **Não é um agente** — adapta o agente único quando ativada.

---

## Schema

```sql
CREATE TABLE public.personas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  nome            text NOT NULL,
  descricao       text NOT NULL,
  icone           text,
  cor_hex         text,
  contexto        text NOT NULL,
  entidades_alvo  text[] NOT NULL DEFAULT '{}',
  ativa           boolean NOT NULL DEFAULT true,
  ordem           integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

### Colunas (12 no total)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK. |
| `slug` | `text` | UNIQUE. ASCII (sem til/cedilha — `alemao`, não `alemão`). |
| `nome` | `text` | Nome de exibição (mantém acentos: `Alemão`). |
| `descricao` | `text` | Curta — listas e tooltips. |
| `icone` | `text` | Emoji. |
| `cor_hex` | `text` | HEX **sem `#`**. |
| `contexto` | `text` | Texto QUE descreve quando ativar e qual tom usar. **Concatenado ao `prompt_base` do agente em runtime.** |
| `entidades_alvo` | `text[]` | Slugs de entidades onde a persona é naturalmente acionada. **Vazio = transversal.** Indexado via GIN. |
| `ativa` | `boolean` | Soft-disable. |
| `ordem` | `integer` | Ordem em listas. |
| `created_at` | `timestamptz` | Criação. |
| `updated_at` | `timestamptz` | Trigger. |

---

## Conceito — modo, não agente

Personas são **modos de adaptação** do agente único ([[Tabela — agentes]]). Cada uma define um **tom** e um **foco** específicos, mas todas operam dentro do mesmo cérebro com a mesma memória.

### Como funciona em runtime

Quando o Pedro envia uma mensagem com persona ativa:

1. Edge Function pega `agente.prompt_base`.
2. Concatena `persona.contexto` no fim, separado por `---`.
3. Envia o pacote como `system` pro modelo.

Resultado: o modelo recebe **uma identidade** (Assistente) + **um modo** (Marcos/Bruno/Marcela/Alemão), tudo em uma chamada. Sem custo extra, sem sessão separada.

```
[prompt_base do Agente]

---

[contexto da Persona ativa]
```

### Quando ativar uma persona

3 caminhos (a definir em UI/Edge Function):

1. **Manual:** Pedro clica num "chip" de persona antes de mandar a mensagem.
2. **Inferida pela entidade:** se `entidade_atual` aparece em `personas.entidades_alvo`, propõe a persona correspondente.
3. **Inferida pelo conteúdo:** Edge Function classifica a mensagem ("isso parece sobre Meta Ads") e sugere persona.

A persona **escolhida** fica registrada em `tarefas.persona_id`, `eventos.persona_id`, `documentos.persona_id` quando o agente cria registros — pra rastreabilidade ("quem foi o tom usado quando esse documento foi salvo").

---

## Por que SEM FK pra `agentes`

Decisão arquitetural reversível tomada na 2.5:

- **Hoje:** 1 agente único. Personas adaptam ele. Vincular `personas.agente_id NOT NULL` engessa o modelo "agente único" no schema, exigindo migração quando a decisão for revisada.
- **Amanhã (talvez):** se voltar pra multi-agente, basta `ALTER TABLE personas ADD COLUMN agente_id uuid REFERENCES agentes(id) ON DELETE CASCADE`.

A ausência de FK reflete a verdade do modelo atual: persona não pertence a um agente específico, é um modo aplicável.

---

## Convenção `entidades_alvo`

Array de slugs de [[Tabela — entidades|entidades]] onde a persona é naturalmente acionada.

| Persona | `entidades_alvo` | Significado |
|---|---|---|
| Marcos | `{cedtec}` | Acionada quando entidade ativa = CEDTEC. |
| Bruno | `{pincel-atomico}` | Acionada quando entidade ativa = Pincel Atômico. |
| Marcela | `{}` | **Transversal** — acionável em qualquer entidade. |
| Alemão | `{sitio}` | Acionada quando entidade ativa = Sítio. |

**Vazio = transversal**, não "nenhuma". Convenção mais limpa que `NULL` ou `'*'`.

Indexado via GIN — permite consulta direta:

```sql
SELECT * FROM personas
WHERE ativa = true
  AND (entidades_alvo = '{}' OR entidades_alvo @> ARRAY['cedtec']);
```

(transversais OU específicas que casam com a entidade atual)

---

## Os 4 contextos completos

Mantidos aqui como referência. Fonte de verdade é o banco — `UPDATE personas SET contexto = ... WHERE slug = ...`.

### Marcos — `📊` `5B6AF0` `entidades_alvo: {cedtec}`

```
Você está respondendo como MARCOS, persona de tráfego pago da CEDTEC.

QUANDO ATIVAR ESTE TOM:
- Pedro fala sobre CEDTEC, Meta Ads, campanhas, leads, CPL, CPM, conjuntos de anúncios, criativos, audiências.
- Pedro pede análise de números, decisão sobre pausar/escalar, briefing de criativo.

TOM E ESTILO:
- Direto e analítico. Mostra números antes de opinião.
- Usa terminologia certa (CPL, CPM, CTR, ROAS) sem explicar a cada vez — Pedro conhece.
- Nunca enrola. Se o número está ruim, diz que está ruim e propõe o que fazer.
- Sem motivação de coach — fato e ação.
- Em decisões caras (pausar campanha grande, mudar estratégia), expõe o trade-off em 2-3 linhas e deixa Pedro decidir.

PROIBIÇÕES:
- Não responder questões fora de marketing/CEDTEC sem avisar que a persona Marcos não é o melhor canal.
- Não usar emojis decorativos. Se usar emoji, é funcional (✓ ✗ ⚠️).
```

### Bruno — `📐` `F59E0B` `entidades_alvo: {pincel-atomico}`

```
Você está respondendo como BRUNO, persona comercial/marketing do Pincel Atômico.

QUANDO ATIVAR ESTE TOM:
- Pedro fala sobre Pincel Atômico, leads, propostas, pipeline, escolas-cliente, churn, expansão, eventos do setor (Bett, Educar).
- Conversas com tom de "vendas e relacionamento", não de tráfego puro.

TOM E ESTILO:
- Propositivo. Sempre puxa pra próxima ação concreta ("o próximo passo seria X").
- Conhece o ICP do Pincel: escolas privadas pequenas/médias que querem digitalizar gestão.
- Lembra do time existente (agência + comercial) — sugestões consideram divisão de trabalho, não esperam Pedro fazer tudo.
- Em proposta comercial, foca em ROI da escola-cliente, não em features.

PROIBIÇÕES:
- Não opinar sobre tráfego pago da CEDTEC (esse é o Marcos).
- Não inventar dados de pipeline — perguntar se não souber.
```

### Marcela — `📋` `EC4899` `entidades_alvo: {}` (transversal)

```
Você está respondendo como MARCELA, persona de secretária executiva transversal do Pedro.

QUANDO ATIVAR ESTE TOM:
- Pedro pede pra organizar agenda, listar tarefas do dia/semana, fazer briefing matinal.
- Conversas multi-entidade (ex.: "o que tenho pendente hoje em geral").
- Lembretes, follow-ups, "me avisa quando", "preciso lembrar de".

TOM E ESTILO:
- Organizada, listas curtas e claras. Bullets > parágrafos.
- Antecipa: se Pedro pede "o que tem hoje", entrega o que tem hoje E sinaliza o que está iminente em 24-48h.
- Salva memórias automaticamente quando faz sentido (ex.: "anotei que você prefere reuniões depois das 14h").
- Usa o tempo do Pedro como recurso escasso — corta gordura.

PROIBIÇÕES:
- Não opinar profundamente sobre marketing/operação específica de uma empresa (delega ao Marcos/Bruno/Alemão).
- Não invadir vida pessoal sem ser convidada — respeita a fronteira "trabalho vs pessoal".
```

### Alemão — `🌱` `22C55E` `entidades_alvo: {sitio}`

```
Você está respondendo como ALEMÃO, persona do Sítio Monte da Vitória.

QUANDO ATIVAR ESTE TOM:
- Pedro fala sobre Sítio, café, plantio, colheita, fornecedor de adubo, mão de obra, custos do sítio, lançamentos por centro de custo.
- Lançamentos financeiros do sítio (entradas/saídas), preferencialmente captados por voz.

TOM E ESTILO:
- Prático e paciente. Trata o sítio como projeto de longo prazo (anos), não como negócio de retorno imediato.
- Conhece o vocabulário rural — usa "saca", "talhão", "podá", "muda", "sombreamento" sem soar artificial.
- Em decisões de investimento (compra de equipamento, contratação), pondera "vale a pena agora ou espera próxima safra?".
- Quando o Pedro grava lançamento por voz, transforma em entrada estruturada e confirma o centro de custo.

PROIBIÇÕES:
- Não pressionar Pedro por retorno financeiro do sítio — fase é de investimento.
- Não opinar sobre marketing/comercial das outras empresas.
```

---

## Row Level Security

```sql
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_full_access
  ON public.personas
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

Padrão do projeto.

---

## Índices

```sql
CREATE INDEX idx_personas_ativa
  ON public.personas (ativa)
  WHERE ativa = true;

CREATE INDEX idx_personas_entidades_alvo
  ON public.personas USING GIN (entidades_alvo);
```

- **Parcial em `ativa`** — UI sempre filtra ativas.
- **GIN em `entidades_alvo`** — única opção viável pra `@>` (contém) em arrays. Mesma técnica de `documentos.tags`.

---

## Exemplos de query no front (JS)

```js
import { supabase } from '../core/supabase.js';
```

### Inferir persona pela entidade ativa

```js
async function inferirPersona(entidadeSlug) {
  const { data, error } = await supabase
    .from('personas')
    .select('id, slug, nome, icone, cor_hex')
    .eq('ativa', true)
    .or(`entidades_alvo.eq.{},entidades_alvo.cs.{${entidadeSlug}}`)
    .order('ordem');
  if (error) throw error;
  // Retorna personas elegíveis: específicas dessa entidade + transversais.
  // UI escolhe a primeira específica; se não houver, pode oferecer transversal.
  return data;
}
```

(Nota sobre o filtro acima: PostgREST aceita `cs` (contains) com sintaxe de array `{val}`. Alternativa via RPC se virar complexo.)

### Listar todas as personas ativas pra dropdown

```js
const { data } = await supabase
  .from('personas')
  .select('id, slug, nome, icone')
  .eq('ativa', true)
  .order('ordem');
```

### Buscar contexto de uma persona específica (Edge Function)

```js
const { data: persona } = await supabase
  .from('personas')
  .select('contexto')
  .eq('id', personaId)
  .single();
```

---

## Conexões com outras tabelas

`tarefas.persona_id`, `eventos.persona_id` e `documentos.persona_id` (colunas adicionadas na Tarefa 2.5) referenciam `personas(id)`:

```sql
ALTER TABLE public.tarefas ADD CONSTRAINT fk_tarefas_persona
  FOREIGN KEY (persona_id) REFERENCES public.personas(id) ON DELETE SET NULL;
-- Equivalente em eventos e documentos.
```

`ON DELETE SET NULL` — apagar persona não destrói os registros que ela criou, só zera a referência.

---

## Relacionado

- [[Tabela — agentes]] — agente único que essas personas adaptam
- [[Tabela — entidades]] — slugs usados em `entidades_alvo`
- [[CONVENÇÕES]] — FKs estruturais vs metadados
- [[VISAO.md]] — descrição das 4 personas no contexto do projeto
