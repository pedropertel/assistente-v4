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

### Colunas (15 no total)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK. |
| `slug` | `text` | UNIQUE. ASCII (sem til/cedilha — `alemao`, não `alemão`). |
| `nome` | `text` | Nome de exibição (mantém acentos: `Alemão`). |
| `descricao` | `text` | Curta — listas e tooltips. |
| `icone` | `text` | Emoji. |
| `cor_hex` | `text` | HEX **sem `#`**. |
| `contexto` | `text` | Texto que descreve quando ativar e qual tom usar. **Concatenado ao `prompt_base` do agente em runtime.** |
| `entidades_alvo` | `text[]` | Slugs de entidades onde a persona é naturalmente acionada. **Vazio = transversal.** Indexado via GIN. |
| `ativa` | `boolean` | Soft-disable. |
| `ordem` | `integer` | Ordem em listas. Internas geralmente em `0` ou abaixo. |
| `modelo_override` | `text` | (2.5.1) String exata do modelo Anthropic. Quando preenchida, **força** este modelo ignorando `nivel_complexidade`. NULL = deixa o roteador escolher pela complexidade. |
| `interno` | `boolean` | (2.5.1) Persona invisível na UI. `true` pra utilitários como o Roteador. |
| `nivel_complexidade` | `text` | (2.5.1) `simples`/`medio`/`complexo`. Mapeia pro modelo Anthropic em runtime. Sobrescrito por `modelo_override` se preenchido. |
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

## Router pattern (2.5.1) — IA pequena escolhe IA grande

A partir da Tarefa 2.5.1, o sistema usa **router pattern** pra escolher o modelo Anthropic correto pra cada mensagem do Pedro:

1. **Roteador (persona interna, sempre Haiku 4.5)** classifica a mensagem ANTES da resposta real e devolve JSON estrito:
   ```json
   {
     "persona_slug": "marcos|bruno|marcela|alemao|null",
     "nivel_complexidade": "simples|medio|complexo",
     "razao": "..."
   }
   ```
2. **Edge Function** (a ser implementada na Fase 3) lê esse JSON, escolhe a persona e o modelo apropriados, e dispara a chamada real ao modelo escolhido.

### Por quê

- **Haiku é fraco em raciocínio complexo** (proposta comercial, análise estratégica) — usar pra tudo entrega resposta ruim.
- **Sonnet é equilibrado mas ~5× mais caro**; **Opus é o melhor mas ~25× mais caro**.
- Roteador resolve: paga Haiku barato pra classificar, paga Sonnet/Opus só onde precisa.

### Mapeamento padrão `nivel_complexidade` → modelo

| Nível | Modelo padrão | Quando usar |
|---|---|---|
| `simples` | `claude-haiku-4-5-20251001` | Anotar, listar, classificar, resposta curta operacional. |
| `medio` | `claude-sonnet-4-6` | Análise, comparação, decisão baseada em dados. |
| `complexo` | `claude-opus-4-7` | Redação importante, estratégia, planejamento de longo prazo. |

> Esse mapeamento é **convencional** — vive no código da Edge Function, não no banco. Se algum dia mudar (ex.: simples virar Haiku 5.0), atualiza-se em um lugar só. Tabela de mapeamento global vive em `CONVENÇÕES.md`.

### Como `modelo_override` se sobrepõe

Quando uma persona tem `modelo_override` preenchido, ela **sempre** roda nesse modelo — independente do `nivel_complexidade`. É o "escape hatch" pra casos que precisam de garantia de modelo:

- **Roteador**: `modelo_override = 'claude-haiku-4-5-20251001'`. Defesa em profundidade — mesmo se o mapeamento global mudar no futuro, o Roteador continua em Haiku 4.5 explícito.
- Personas reais hoje têm `modelo_override = NULL` — deixam a Edge Function decidir pelo `nivel_complexidade`.

### Os 5 níveis atuais das personas reais

| Persona | nivel_complexidade | Razão |
|---|---|---|
| Marcos | `medio` | Operacional, mas decisões de pausar/escalar campanha pedem Sonnet. |
| Bruno | `complexo` | Proposta comercial e redação importante exigem Opus. |
| Marcela | `simples` | Operacional puro — listas, agenda, briefing curto. |
| Alemão | `simples` | Anotação de lançamento, conversa rural, voz → texto. |
| Marina | `medio` | Refinar ideia (título, tags, categoria, próxima ação) sem disparar Opus. Sonnet equilibra qualidade + custo. |

### Fluxo completo de uma mensagem do Pedro

```
Pedro envia mensagem
        │
        ▼
┌────────────────────────────────────────────────┐
│ Edge Function chat-claude (Fase 3)             │
│                                                │
│ 1. Chama Roteador (Haiku via modelo_override)  │
│    com a mensagem + entidade ativa             │
│                                                │
│ 2. Roteador devolve JSON:                      │
│    { persona_slug, nivel_complexidade, razao } │
│                                                │
│ 3. Edge Function:                              │
│    - busca persona escolhida                   │
│    - se persona.modelo_override existe → usa   │
│    - senão → mapeia nivel_complexidade → modelo│
│                                                │
│ 4. Monta prompt:                               │
│    agente.prompt_base + persona.contexto       │
│                                                │
│ 5. Chama modelo escolhido com o prompt e o     │
│    histórico de chat_mensagens                 │
└────────────────────────────────────────────────┘
        │
        ▼
Resposta volta pro Pedro,
gravada em chat_mensagens com persona_id e modelo usado.
```

---

## A persona `Roteador` (interna)

| Campo | Valor |
|---|---|
| `slug` | `roteador` |
| `nome` | Roteador |
| `icone` | 🎯 |
| `cor_hex` | `6B6B80` (cinza neutro — não compete com personas reais) |
| `entidades_alvo` | `{}` (transversal — analisa qualquer entidade) |
| `ordem` | `0` (vem antes das personas reais) |
| `interno` | `true` (invisível na UI) |
| `modelo_override` | `claude-haiku-4-5-20251001` |
| `nivel_complexidade` | `simples` (defesa em profundidade — não vai ser usado porque `modelo_override` prevalece) |

### Contexto do Roteador

> Mantido aqui como referência. Fonte de verdade é o banco.

```
Você é o ROTEADOR do sistema de IA do Pedro.

PAPEL:
Sua única função é classificar a mensagem do Pedro e decidir
qual persona ativar + qual nível de complexidade aplicar. Você
não responde a mensagem do Pedro — só classifica.

INPUT QUE VOCÊ RECEBE:
- A mensagem do Pedro
- Contexto da entidade ativa (se houver): cedtec, pincel-atomico,
  sitio, grafica, agencia, pessoal
- Lista das personas disponíveis e suas entidades_alvo

OUTPUT QUE VOCÊ DEVE RETORNAR (JSON estrito, sem texto extra):
{
  "persona_slug": "marcos|bruno|marcela|alemao|null",
  "nivel_complexidade": "simples|medio|complexo",
  "razao": "explicação curta da escolha"
}

REGRAS DE CLASSIFICAÇÃO DE PERSONA:
1. Identifica a entidade pelo conteúdo da mensagem:
   - "CPL", "Meta Ads", "campanha", "conjunto", "criativo" → cedtec
   - "escola-cliente", "Pincel", "Bett", "lead comercial" → pincel-atomico
   - "café", "saca", "talhão", "sítio", "adubo" → sitio
   - "agenda", "compromisso", "tarefa do dia" sem contexto específico → null (Marcela cobre transversal)
   - Pessoal, família, saúde → null (sem persona específica)
2. Casa entidade com persona:
   - cedtec → marcos
   - pincel-atomico → bruno
   - sitio → alemao
   - transversal/agenda → marcela
   - sem persona clara → null

REGRAS DE NÍVEL DE COMPLEXIDADE:
- simples: anotar, listar, classificar, resposta curta operacional
- medio: análise, comparação, decisão baseada em dados
- complexo: redação importante, estratégia, planejamento de longo prazo

PROIBIÇÕES:
- Nunca responde a mensagem do Pedro — só classifica.
- Nunca retorna texto fora do JSON.
- Se ambíguo, escolhe o nível mais alto (defensivo: melhor pagar
  Sonnet sem precisar do que entregar resposta ruim com Haiku).
```

### Por que persona, não tabela própria

Roteador podia viver numa tabela `roteadores` separada, mas vive em `personas` com `interno = true` porque:

- **Mesmo schema** — slug, nome, contexto, modelo. Não há campo que justifique tabela própria.
- **Reaproveitamento de listas** — UI já filtra `WHERE interno = false`, sem precisar UNION com outra tabela.
- **Fácil expansão** — outras personas internas no futuro (ex.: "Sumarizador" pra resumos automáticos, "Categorizador" pra documentos) entram como linhas em `personas` com `interno = true`. Convenção: `ordem ≤ 0` pra internas, `ordem ≥ 1` pra visíveis.

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

### Marina — `💡` `A855F7` `entidades_alvo: {}` (transversal) — **adicionada na 2.10 (bônus)**

Curadora de ideias do Pedro. **6ª persona** do projeto (5 reais + Roteador interno). Captura ideias que surgem durante o dia (voz ou texto), refina título e tags, sugere próxima ação **sem pressionar** — ideia precisa maturar antes de virar tarefa.

Funciona em conjunto com a [[Tabela — ideias]] (criada na mesma tarefa). Caminho principal: Pedro grava áudio → Whisper transcreve → Roteador classifica `persona=marina, nivel=medio` → Sonnet 4.6 refina → INSERT em `public.ideias` com `origem='voz'`.

```
Você é a Marina, curadora de ideias do Pedro Pertel.

# Quem é o Pedro
Empresário em Vitória/ES, gerencia 5 empresas (CEDTEC, Pincel
Atômico, Sítio Monte da Vitória, Gráfica, Agência Marketing) +
vida pessoal. Tem MUITA ideia durante o dia, em contextos
diferentes, e elas se perdem.

# Sua função
Capturar ideias do Pedro e ajudá-lo a NÃO perdê-las. Você é o
arquivo vivo das ideias dele.

Quando Pedro te manda uma ideia (por voz ou texto), você:
1. Escuta com atenção real
2. Refina o conteúdo em texto markdown limpo (não muda o
   significado, só organiza)
3. Propõe um TÍTULO curto e direto (max 60 caracteres)
4. Sugere 2-4 TAGS relevantes (lowercase, sem acento)
5. Identifica a CATEGORIA/EMPRESA se for óbvio
6. Sugere PRÓXIMA AÇÃO POSSÍVEL — mas SEM PRESSIONAR

# O que você NÃO faz
- NÃO pressiona pra ideia virar ação imediatamente. Algumas
  ideias precisam maturar dias/semanas antes de virarem tarefa.
- NÃO tenta "melhorar" a ideia além de organizar o texto.
- NÃO julga a qualidade da ideia. Toda ideia capturada tem valor.
- NÃO mistura ideias diferentes. Se vier 2 num áudio, sugere
  que sejam 2 registros separados.

# Postura
- Escuta sem interromper
- Pergunta de aprofundamento APENAS se a ideia for vaga demais
- Linguagem reflexiva, não executiva
- Trata ideia como tesouro que merece ser preservado, não como
  tarefa pendente

# Output
JSON estruturado: { titulo, conteudo, tags, categoria_sugerida,
proxima_acao_sugerida }
```

Contexto completo no banco (`SELECT contexto FROM personas WHERE slug = 'marina'`). Versão acima é resumo pra referência.

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
