---
tipo: schema
tabela: sitio_lancamentos
fase: 2
tarefa: 2.7
criada_em: 2026-05-01
---

# Tabela `sitio_lancamentos`

[[Home]] > Banco de Dados > sitio_lancamentos

> Lançamentos financeiros do Sítio Monte da Vitória (entradas e saídas). **Caminho principal de input: voz** — Alemão (persona) transforma áudio em lançamento estruturado. Valores em centavos (bigint), datas sem hora (date).

---

## Schema

```sql
CREATE TABLE public.sitio_lancamentos (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_id              uuid NOT NULL REFERENCES public.entidades(id)         ON DELETE RESTRICT,
  categoria_id             uuid NOT NULL REFERENCES public.sitio_categorias(id)  ON DELETE RESTRICT,
  tipo                     text NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  data_lancamento          date NOT NULL,
  descricao                text NOT NULL,
  valor_centavos           bigint NOT NULL CHECK (valor_centavos > 0),
  quantidade               numeric(10,3),
  unidade                  text,
  valor_unitario_centavos  bigint CHECK (valor_unitario_centavos IS NULL OR valor_unitario_centavos > 0),
  forma_pagamento          text NOT NULL CHECK (forma_pagamento IN ('pix', 'dinheiro', 'transferencia', 'cartao', 'boleto')),
  fornecedor               text,
  documento_fiscal         text,
  comprovante_doc_id       uuid REFERENCES public.documentos(id)      ON DELETE SET NULL,
  transcricao_original     text,
  mensagem_origem_id       uuid REFERENCES public.chat_mensagens(id)  ON DELETE SET NULL,
  agente_id                uuid REFERENCES public.agentes(id)         ON DELETE SET NULL,
  persona_id               uuid REFERENCES public.personas(id)        ON DELETE SET NULL,
  origem                   text NOT NULL DEFAULT 'manual'
                           CHECK (origem IN ('manual', 'chat', 'voz', 'sistema', 'importacao')),
  arquivado                boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
```

### Colunas (22 no total)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK. |
| `entidade_id` | `uuid` | FK pra entidades. **NOT NULL**. RESTRICT. Sempre `sitio` nesta versão. |
| `categoria_id` | `uuid` | FK pra `sitio_categorias`. **NOT NULL**. RESTRICT. |
| `tipo` | `text` | `entrada`/`saida`. CHECK fixo. **Denormalizado** com a categoria — ver razão abaixo. |
| `data_lancamento` | `date` | Sem hora. Sequenciamento intra-dia usa `created_at`. |
| `descricao` | `text` | Markdown livre. |
| `valor_centavos` | `bigint` | **Sempre positivo**. Sinal de fluxo vem de `tipo`. CHECK > 0. |
| `quantidade` | `numeric(10,3)` | Opcional. Fracionário (ex.: `5.000` sacas, `0.500` saca). |
| `unidade` | `text` | Opcional. Texto livre (`'sacas'`, `'kg'`, `'diárias'`...). REGRA 12. |
| `valor_unitario_centavos` | `bigint` | Opcional. CHECK aceita NULL ou > 0. Não validamos `qtde × unit = total` (descontos/frete). |
| `forma_pagamento` | `text` | 5 valores via CHECK. Vocabulário interno. |
| `fornecedor` | `text` | Texto livre. Sem normalização (over-engineering). |
| `documento_fiscal` | `text` | NFe/recibo/contrato (texto livre). |
| `comprovante_doc_id` | `uuid` | FK opcional pra `documentos`. SET NULL. |
| `transcricao_original` | `text` | Texto bruto antes de estruturar — debug de parsing. |
| `mensagem_origem_id` | `uuid` | FK opcional pra `chat_mensagens`. SET NULL. Rastreia voz→lançamento. |
| `agente_id` | `uuid` | FK opcional. SET NULL. NULL pra criação manual via UI. |
| `persona_id` | `uuid` | FK opcional. SET NULL. Geralmente Alemão. |
| `origem` | `text` | 5 valores via CHECK. `'importacao'` reservado pra extrato bancário futuro. |
| `arquivado` | `boolean` | Soft-delete REGRA 12. |
| `created_at` | `timestamptz` | Criação. |
| `updated_at` | `timestamptz` | Trigger. |

---

## Caminho principal de input: voz → Alemão estrutura → lançamento

O fluxo previsto pra Fase 3:

```
Pedro grava áudio
        │
        ▼ (chat com persona Alemão ativa)
┌──────────────────────────────────────────────────┐
│ Edge Function chat-claude:                       │
│ 1. Recebe audio + cria chat_anexos (tipo=audio)  │
│ 2. Whisper transcreve → grava transcricao        │
│ 3. Roteador classifica: persona=alemao,           │
│    nivel=simples → modelo Haiku                  │
│ 4. Alemão (Haiku) recebe a transcrição e         │
│    extrai estrutura: categoria, valor, data,     │
│    quantidade, unidade, fornecedor               │
│ 5. Cria sitio_lancamentos com:                   │
│    - origem = 'voz'                              │
│    - persona_id = <alemao>                       │
│    - mensagem_origem_id = <chat_mensagens.id>    │
│    - transcricao_original = <texto bruto>        │
│ 6. Confirma com Pedro: "Anotei: 5 sacas de       │
│    adubo, R$ 1.500, Saron. OK?"                  │
└──────────────────────────────────────────────────┘
```

### Por que rastreio voz → lançamento

`transcricao_original` + `mensagem_origem_id` permitem:

- **Debug de parsing.** Se Alemão entendeu "adubo" quando Pedro disse "defensivo", o `transcricao_original` mostra exatamente o que foi falado e a `mensagem_origem_id` aponta pra mensagem do chat com o áudio anexado.
- **Aprendizado futuro.** Cruzar `transcricao_original` com correções manuais de Pedro pra melhorar o prompt do Alemão.
- **Auditoria.** Pedro pode voltar à mensagem original 6 meses depois pra entender contexto da decisão.

---

## Decisões de design

### `data_lancamento` é `date` (sem hora)

Lançamentos são eventos "do dia". Hora não é relevante (`'comprou adubo'` não importa se foi 9h ou 16h). Se precisar sequenciar lançamentos do mesmo dia, usa `created_at` (timestamptz UTC).

`date` no PostgreSQL **não tem timezone** — `'2026-04-20'::date` é literal, sem tradução. Sem armadilha de fuso aqui.

### `quantidade × valor_unitario` opcional, sem trigger validando igualdade

Pedro pode comprar 5 sacas a R$ 300 e pagar R$ 1.450 (desconto). Ou pagar R$ 1.520 (frete embutido). Forçar `qtde × unit = total` via trigger engessaria casos reais.

UI pode ter um botão "calcular total" que sugere mas não obriga. Banco confia.

### `tipo` denormalizado com `categoria.tipo`

Cada lançamento já herda `tipo` semanticamente da categoria. Repetir aqui parece redundância — e é. Justificativa:

- **Queries de fluxo de caixa sem JOIN.** `SELECT SUM(valor_centavos) FROM sitio_lancamentos WHERE tipo = 'saida' AND data_lancamento >= ...` é instantâneo. Sem o `tipo` aqui, exigiria JOIN com `sitio_categorias`.
- **Liberdade pra divergir.** Pedro pode lançar uma 'entrada' numa categoria 'saida' (ex.: devolução) sem alterar a categoria.

Trade-off: aceita risco de desalinhamento entre `tipo` do lançamento e da categoria. Schema confia no usuário (REGRA 12).

### `valor_centavos > 0` (estritamente positivo)

Zero é ruído (não é lançamento), negativo é estado inválido (sinal vem de `tipo`). Ambos seriam lixo no fluxo de caixa.

### `bigint` em `valor_centavos` e `valor_unitario_centavos`

`integer` (32-bit) limita a ~R$ 21 milhões. `bigint` cobre até ~R$ 92 quatrilhões. Custo zero, evita teto futuro improvável mas possível.

### Idempotência por `(entidade, data, descricao, valor)` — só pra seed

Chave composta funciona pra seed inicial. **Em produção, lançamentos duplicados são caso de uso real** (2 diárias no mesmo dia, mesmo fornecedor com 2 boletos do mesmo valor). UI não bloqueia inserção duplicada.

---

## Os 7 índices

```sql
CREATE INDEX idx_lanc_entidade         ON public.sitio_lancamentos (entidade_id);
CREATE INDEX idx_lanc_categoria        ON public.sitio_lancamentos (categoria_id);
CREATE INDEX idx_lanc_tipo             ON public.sitio_lancamentos (tipo);
CREATE INDEX idx_lanc_data             ON public.sitio_lancamentos (data_lancamento DESC);
CREATE INDEX idx_lanc_data_entidade    ON public.sitio_lancamentos (entidade_id, data_lancamento DESC);
CREATE INDEX idx_lanc_arquivado        ON public.sitio_lancamentos (arquivado)          WHERE arquivado = false;
CREATE INDEX idx_lanc_mensagem_origem  ON public.sitio_lancamentos (mensagem_origem_id) WHERE mensagem_origem_id IS NOT NULL;
```

| Índice | Pra quê |
|---|---|
| `idx_lanc_entidade` | Lookup por entidade (ainda só Sítio, mas estruturado). |
| `idx_lanc_categoria` | "Lançamentos da categoria X". |
| `idx_lanc_tipo` | Filtragem rápida entrada vs saída pra fluxo de caixa. |
| `idx_lanc_data DESC` | "Últimos N lançamentos" (`ORDER BY data_lancamento DESC LIMIT 50`). DESC evita scan reverso. |
| `idx_lanc_data_entidade` | Composto. Query típica: "fluxo de caixa do Sítio nos últimos 30 dias" (filtro entidade + ordenação data). |
| `idx_lanc_arquivado` | Parcial. UI sempre filtra `arquivado = false`. |
| `idx_lanc_mensagem_origem` | Parcial. Rastreio voz→lançamento — só os criados via voz têm valor. |

---

## `origem = 'importacao'` reservado

Hoje sem uso. Reservado pra **futura importação de extrato bancário** (CSV/OFX). Edge Function vai parsear o extrato e criar `sitio_lancamentos` com:

- `origem = 'importacao'`
- `transcricao_original` = linha original do extrato
- `agente_id`/`persona_id` = NULL (sistema, não agente)
- Categoria sugerida pela Edge Function via heurística + ML; Pedro confirma via UI.

---

## Row Level Security

```sql
ALTER TABLE public.sitio_lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_full_access
  ON public.sitio_lancamentos
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

Padrão do projeto.

---

## 3 seeds de exemplo

| Data | Categoria | Tipo | Quantidade | Valor | Forma | Fornecedor |
|---|---|---|---|---|---|---|
| 15/01/2026 | Investimento > Aporte do sócio | entrada | — | R$ 50.000,00 | transferência | — |
| 20/04/2026 | Insumos > Adubo | saída | 5 sacas | R$ 1.500,00 | pix | Agropecuária Saron |
| 22/04/2026 | Mão de obra > Diarista | saída | 2 diárias | R$ 240,00 | dinheiro | João Silva |

---

## Exemplos de query no front (JS)

```js
import { supabase } from '../core/supabase.js';
```

### Fluxo de caixa do mês

```js
async function fluxoMes(entidadeId, ano, mes) {
  const inicio = `${ano}-${String(mes).padStart(2,'0')}-01`;
  const fim    = new Date(ano, mes, 0).toISOString().slice(0,10); // último dia

  const { data, error } = await supabase
    .from('sitio_lancamentos')
    .select('tipo, valor_centavos')
    .eq('entidade_id', entidadeId)
    .eq('arquivado', false)
    .gte('data_lancamento', inicio)
    .lte('data_lancamento', fim);
  if (error) throw error;

  const entradas = data.filter(l => l.tipo === 'entrada')
                       .reduce((s, l) => s + Number(l.valor_centavos), 0);
  const saidas   = data.filter(l => l.tipo === 'saida')
                       .reduce((s, l) => s + Number(l.valor_centavos), 0);
  return { entradas_centavos: entradas, saidas_centavos: saidas, saldo: entradas - saidas };
}
```

### Lançamentos de uma categoria

```js
const { data } = await supabase
  .from('sitio_lancamentos')
  .select(`
    id, data_lancamento, descricao, valor_centavos, fornecedor, forma_pagamento,
    sitio_categorias(slug, nome, sitio_categorias!categoria_pai_id(slug, nome))
  `)
  .eq('categoria_id', categoriaId)
  .eq('arquivado', false)
  .order('data_lancamento', { ascending: false });
```

### Criar lançamento manual

```js
await supabase
  .from('sitio_lancamentos')
  .insert({
    entidade_id: sitioId,
    categoria_id: categoriaAduboId,
    tipo: 'saida',
    data_lancamento: '2026-05-01',
    descricao: 'Adubo orgânico — primeiro lote do trimestre',
    valor_centavos: 180000,         // R$ 1.800,00
    quantidade: 6.000,
    unidade: 'sacas',
    valor_unitario_centavos: 30000, // R$ 300,00 / saca
    forma_pagamento: 'pix',
    fornecedor: 'Agropecuária Saron',
  });
```

### Lançamento via voz (com mensagem-origem)

```js
async function criarLancamentoDeVoz({ chatMensagemId, transcricao, parsed }) {
  return supabase
    .from('sitio_lancamentos')
    .insert({
      entidade_id: sitioId,
      categoria_id: parsed.categoriaId,
      tipo: parsed.tipo,
      data_lancamento: parsed.data ?? new Date().toISOString().slice(0,10),
      descricao: parsed.descricao,
      valor_centavos: parsed.valorCentavos,
      quantidade: parsed.quantidade ?? null,
      unidade: parsed.unidade ?? null,
      forma_pagamento: parsed.formaPagamento ?? 'pix',
      fornecedor: parsed.fornecedor ?? null,
      origem: 'voz',
      transcricao_original: transcricao,
      mensagem_origem_id: chatMensagemId,
      persona_id: alemaoId,
      agente_id: assistenteId,
    })
    .select()
    .single();
}
```

### Soft-archive

```js
await supabase
  .from('sitio_lancamentos')
  .update({ arquivado: true })
  .eq('id', lancamentoId);
// Some do fluxo de caixa, mas histórico preserva.
```

---

## Conexões com outras tabelas

- `entidades.id` (RESTRICT)
- `sitio_categorias.id` (RESTRICT — apagar categoria com lançamentos exige migrar antes)
- `documentos.id` (SET NULL — comprovante opcional)
- `chat_mensagens.id` (SET NULL — origem da voz)
- `agentes.id` (SET NULL)
- `personas.id` (SET NULL)

---

## Relacionado

- [[Tabela — sitio_categorias]] — categorias
- [[Tabela — chat_mensagens]] — origem de voz/chat
- [[Tabela — documentos]] — comprovantes
- [[Tabela — personas]] — Alemão é a persona deste módulo
- [[CONVENÇÕES]] — fuso, idempotência, FKs, REGRA 12
