---
tipo: schema
tabela: sitio_categorias
fase: 2
tarefa: 2.7
criada_em: 2026-05-01
---

# Tabela `sitio_categorias`

[[Home]] > Banco de Dados > sitio_categorias

> Categorias do módulo financeiro do Sítio. **Hierarquia de 2 níveis** (raiz + subcategoria). 29 seeds = ponto de partida editável (REGRA 12 — Pedro pode criar/editar/arquivar via UI da Fase 4).

---

## Schema

```sql
CREATE TABLE public.sitio_categorias (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text NOT NULL,
  nome              text NOT NULL,
  categoria_pai_id  uuid REFERENCES public.sitio_categorias(id) ON DELETE RESTRICT,
  tipo              text NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  icone             text,
  cor_hex           text,
  descricao         text,
  ordem             integer NOT NULL DEFAULT 0,
  ativa             boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

### Colunas (12 no total)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK. |
| `slug` | `text` | Identificador legível (`'insumos-adubo'`). Único dentro do mesmo nível. |
| `nome` | `text` | Display (`'Adubo / Fertilizante'`). Editável pelo usuário. |
| `categoria_pai_id` | `uuid` | FK self-referencial. NULL = raiz. RESTRICT. |
| `tipo` | `text` | `'entrada'`/`'saida'`. CHECK fixo (vocabulário interno). |
| `icone` | `text` | Emoji opcional. |
| `cor_hex` | `text` | HEX **sem `#`**. |
| `descricao` | `text` | Markdown opcional. |
| `ordem` | `integer` | Manual entre irmãs. Convenção: `99` reservado pra "Outros". |
| `ativa` | `boolean` | Soft-delete REGRA 12. |
| `created_at` | `timestamptz` | Criação. |
| `updated_at` | `timestamptz` | Trigger. |

---

## Hierarquia de 2 níveis

Categorias têm **exatamente** 2 níveis:

- **Raiz** — categoria-pai (`categoria_pai_id IS NULL`). 8 raízes nos seeds.
- **Subcategoria** — `categoria_pai_id` aponta pra raiz. 21 subcategorias nos seeds.

Não há `nivel` calculado nem trigger de coerência (diferente de [[Tabela — pastas]]). Profundidade fixa via convenção, não via constraint — UI cria sempre como filha de uma raiz; nada impede tecnicamente de ter 3 níveis se Pedro inserir manualmente.

### Quando 3 níveis seria útil (futuro)

Se Pedro precisar separar, por exemplo, `Insumos > Adubo > Adubo orgânico / Adubo químico`. Hoje resolve com slugs (`adubo-organico`, `adubo-quimico` como subcategorias diretas de Insumos). Se virar dor, vira tarefa própria pra adicionar trigger de coerência (copia o `validar_pasta_coerencia` da 2.4 como molde).

---

## Por que `tipo` é redundante mas vale

Cada subcategoria já herda `tipo` semanticamente da raiz (Receita = entrada, Insumos = saída). Repetir em cada linha parece redundância — e é. Mantido por 2 motivos:

1. **Queries de fluxo de caixa sem JOIN.** Total do mês: `SELECT SUM(valor_centavos) FROM sitio_lancamentos WHERE tipo = 'saida' AND data_lancamento >= ...`. Sem o `tipo` em `sitio_lancamentos` e `sitio_categorias`, exigiria JOIN duplo (lançamento → subcategoria → raiz) só pra somar.
2. **Liberdade pra divergir.** Pedro pode criar uma subcategoria "Devolução" dentro de Insumos com `tipo = 'entrada'` (devolveu adubo, dinheiro voltou). Schema permite — REGRA 12.

Trade-off consciente: denormalização aumenta risco de inconsistência (pai e filha com tipos diferentes), mas o schema deixa o usuário responsável pela coerência semântica.

---

## Os 29 seeds — ponto de partida editável (REGRA 12)

### 8 raízes

| Slug | Nome | Tipo | Ícone | Ordem |
|---|---|---|---|---|
| `investimento` | Investimento | entrada | 💰 | 1 |
| `receita` | Receita | entrada | 🌱 | 2 |
| `insumos` | Insumos | saida | 🧪 | 3 |
| `mao-de-obra` | Mão de obra | saida | 👷 | 4 |
| `equipamento` | Equipamento e infra | saida | 🚜 | 5 |
| `operacional` | Operacional | saida | ⛽ | 6 |
| `tributos` | Tributos | saida | 📋 | 7 |
| `outros` | Outros | saida | 📌 | 99 |

### 21 subcategorias

Agrupadas por raiz: 2 em Investimento, 3 em Receita, 4 em Insumos, 3 em Mão de obra, 3 em Equipamento e infra, 4 em Operacional, 2 em Tributos. Categoria-raiz `outros` não tem subcategorias — é curinga.

> Pedro pode criar/editar/arquivar todas via UI (Fase 4). Os 29 seeds existem só pra Pedro não começar com banco vazio. **Nenhum seed é "protegido"** — REGRA 12 elimina paternalismo.

### Convenção `ordem = 99` pra "Outros"

Todas as categorias-curinga "Outros" usam `ordem = 99` pra ficarem no fim das listas. Mesmo padrão de [[Tabela — entidades]] (entidade `pessoal` com ordem 99).

### Os 4 "Outros" de subcategoria — quando usar cada um vs raiz

| Categoria | Quando usar |
|---|---|
| Receita > Outros | Receitas pontuais que não são café nem muda (ex.: aluguel de equipamento pra vizinho). |
| Operacional > Outros | Custo operacional que não cabe em combustível/transporte/energia. |
| Tributos > Outros tributos | Tributo que não é ITR (ex.: ISS de serviço, taxa estadual). |
| Raiz `Outros` | Lançamento que não cabe em **nenhuma** raiz semanticamente. Catch-all final. |

Convenção: tenta sempre achar a raiz certa primeiro. Cair na raiz `Outros` é último recurso.

---

## Índices únicos parciais (raízes vs filhas)

```sql
CREATE UNIQUE INDEX uniq_sitio_cat_raiz
  ON public.sitio_categorias (slug)
  WHERE categoria_pai_id IS NULL;

CREATE UNIQUE INDEX uniq_sitio_cat_filhas
  ON public.sitio_categorias (categoria_pai_id, slug)
  WHERE categoria_pai_id IS NOT NULL;
```

**Por que dois índices em vez de um UNIQUE composto?** Mesmo padrão de [[Tabela — pastas]] (Tarefa 2.4): PostgreSQL trata `NULL` como "qualquer coisa" em UNIQUE composta — `(NULL, 'foo')` não colide com outro `(NULL, 'foo')` porque `NULL = NULL` é `NULL` (não `TRUE`). Resultado: raízes duplicariam silenciosamente.

Os 2 índices parciais separam:
- **Raízes** (`categoria_pai_id IS NULL`): único por `slug`.
- **Filhas** (`categoria_pai_id IS NOT NULL`): único por `(pai, slug)`.

Cobre os 2 casos sem furo de NULL.

---

## Índices de performance

```sql
CREATE INDEX idx_sitio_cat_pai    ON public.sitio_categorias (categoria_pai_id) WHERE categoria_pai_id IS NOT NULL;
CREATE INDEX idx_sitio_cat_tipo   ON public.sitio_categorias (tipo);
CREATE INDEX idx_sitio_cat_ativa  ON public.sitio_categorias (ativa) WHERE ativa = true;
```

- `idx_sitio_cat_pai` — montar árvore (filhas de uma raiz).
- `idx_sitio_cat_tipo` — filtrar dropdown de categorias por tipo (UI mostra só `entrada` quando criando lançamento de receita).
- `idx_sitio_cat_ativa` — UI sempre filtra `ativa = true` na listagem. Parcial.

---

## Row Level Security

```sql
ALTER TABLE public.sitio_categorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_full_access
  ON public.sitio_categorias
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

Padrão do projeto.

---

## Exemplos de query no front (JS)

```js
import { supabase } from '../core/supabase.js';
```

### Carregar árvore de categorias ativas (raízes + filhas em uma query)

```js
async function arvoreCategorias() {
  const { data, error } = await supabase
    .from('sitio_categorias')
    .select('id, slug, nome, icone, tipo, ordem, categoria_pai_id')
    .eq('ativa', true)
    .order('ordem')
    .order('nome');
  if (error) throw error;

  const porId = new Map(data.map(c => [c.id, { ...c, filhas: [] }]));
  const raizes = [];
  porId.forEach(c => {
    if (c.categoria_pai_id) {
      porId.get(c.categoria_pai_id)?.filhas.push(c);
    } else {
      raizes.push(c);
    }
  });
  return raizes;
}
```

### Listar categorias de um tipo específico (dropdown de novo lançamento)

```js
const { data: subcategorias } = await supabase
  .from('sitio_categorias')
  .select('id, nome, icone, categoria_pai_id, sitio_categorias!categoria_pai_id(nome)')
  .eq('ativa', true)
  .eq('tipo', 'saida')
  .not('categoria_pai_id', 'is', null)   // só subcategorias (não raízes)
  .order('ordem');
```

### Tentar apagar categoria com filhas → erro RESTRICT

```js
const { error } = await supabase
  .from('sitio_categorias')
  .delete()
  .eq('id', insumosId);
// Erro 23503 (foreign_key_violation): apagar Insumos exige limpar
// Adubo/Defensivo/Sementes/Embalagem antes — ou arquivar (recomendado).
```

### Arquivar categoria (caminho recomendado de "remoção")

```js
await supabase
  .from('sitio_categorias')
  .update({ ativa: false })
  .eq('id', categoriaId);
// Categoria some das listas. Lançamentos antigos preservam a referência.
// Pedro pode "desarquivar" depois setando ativa = true.
```

### Renomear (REGRA 12 — usuário no controle)

```js
await supabase
  .from('sitio_categorias')
  .update({ nome: 'Adubo orgânico apenas', icone: '🌿' })
  .eq('slug', 'adubo');
// Slug fica intacto (chave estável); nome/icone mudam livremente.
```

---

## Conexões com outras tabelas

- **`sitio_lancamentos.categoria_id`** — FK obrigatória pra `sitio_categorias(id)` com `ON DELETE RESTRICT`. Apagar categoria com lançamentos exige migrar lançamentos primeiro (combina com soft-delete via `ativa = false`).

---

## Relacionado

- [[Tabela — sitio_lancamentos]] — usa `categoria_id`
- [[Tabela — pastas]] — mesmo padrão de índices únicos parciais
- [[CONVENÇÕES]] — fuso, idempotência, FKs, REGRA 12
- [[CLAUDE.md]] — REGRA 12 (customização total)
