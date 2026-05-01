---
tipo: schema
tabela: pastas
fase: 2
tarefa: 2.4
criada_em: 2026-05-01
---

# Tabela `pastas`

[[Home]] > Banco de Dados > pastas

> **Hierarquia self-referential** pra organizar `documentos`. Máximo **3 níveis** (raiz / subpasta / sub-subpasta). Cada pasta pertence a uma entidade — pasta-filha **deve** estar na mesma entidade da pasta-pai (validado por trigger).

---

## Schema

```sql
CREATE TABLE public.pastas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_id   uuid NOT NULL REFERENCES public.entidades(id) ON DELETE RESTRICT,
  pasta_pai_id  uuid REFERENCES public.pastas(id) ON DELETE RESTRICT,
  nome          text NOT NULL,
  descricao     text,
  icone         text,
  cor_hex       text,
  nivel         integer NOT NULL DEFAULT 0
                CHECK (nivel >= 0 AND nivel <= 2),
  ordem         integer NOT NULL DEFAULT 0,
  arquivada     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

### Colunas (12 no total)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()`. |
| `entidade_id` | `uuid` | FK pra `entidades(id)`. **NOT NULL**. `ON DELETE RESTRICT`. |
| `pasta_pai_id` | `uuid` | FK self-referential. **NULL = pasta raiz**. `ON DELETE RESTRICT`. |
| `nome` | `text` | Nome de exibição. Único dentro do mesmo `(entidade, nível)` — ver índices únicos parciais. |
| `descricao` | `text` | Markdown opcional. |
| `icone` | `text` | Emoji opcional. |
| `cor_hex` | `text` | HEX **sem `#`** (convenção em [[CONVENÇÕES]]). |
| `nivel` | `integer` | 0=raiz, 1=subpasta, 2=sub-subpasta. **Calculado automaticamente pelo trigger** — não confiar em input do usuário. |
| `ordem` | `integer` | Ordem manual entre pastas-irmãs (drag-and-drop atualiza). |
| `arquivada` | `boolean` | Soft-archive — esconde da árvore sem apagar. |
| `created_at` | `timestamptz` | Carimbo de criação. |
| `updated_at` | `timestamptz` | Atualizado via trigger. |

---

## Limite de 3 níveis

Aplicado em **2 camadas** (defesa em profundidade):

1. **CHECK constraint** na coluna `nivel`:
   ```sql
   CHECK (nivel >= 0 AND nivel <= 2)
   ```
2. **Trigger `validar_pasta_coerencia`** rejeita INSERT se `pasta_pai.nivel >= 2`:
   ```sql
   IF pai_nivel >= 2 THEN
     RAISE EXCEPTION 'Limite de 3 níveis hierárquicos atingido (pasta-pai já está no nível %)', pai_nivel;
   END IF;
   ```

A camada CHECK protege contra alguém desabilitar o trigger temporariamente pra debug e esquecer. O trigger é o gate principal.

**Por que só 3 níveis?** Hierarquias profundas viram labirinto na UI mobile. 3 níveis cobrem 95% dos casos reais (`Marketing > Criativos > Maio 2026`). Se algum dia precisar mais, vira tarefa própria pra subir o limite — não vai acontecer cedo.

---

## Trigger `validar_pasta_coerencia()`

```sql
CREATE OR REPLACE FUNCTION public.validar_pasta_coerencia()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  pai_entidade uuid;
  pai_nivel    integer;
BEGIN
  IF NEW.pasta_pai_id IS NULL THEN
    NEW.nivel = 0;
    RETURN NEW;
  END IF;

  SELECT entidade_id, nivel INTO pai_entidade, pai_nivel
  FROM public.pastas
  WHERE id = NEW.pasta_pai_id;

  IF pai_entidade IS NULL THEN
    RAISE EXCEPTION 'Pasta-pai % não encontrada', NEW.pasta_pai_id;
  END IF;

  IF pai_entidade <> NEW.entidade_id THEN
    RAISE EXCEPTION 'Pasta-filha deve estar na mesma entidade da pasta-pai (esperado %, recebido %)',
      pai_entidade, NEW.entidade_id;
  END IF;

  IF pai_nivel >= 2 THEN
    RAISE EXCEPTION 'Limite de 3 níveis hierárquicos atingido (pasta-pai já está no nível %)', pai_nivel;
  END IF;

  NEW.nivel = pai_nivel + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pastas_validar
  BEFORE INSERT OR UPDATE OF pasta_pai_id, entidade_id ON public.pastas
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_pasta_coerencia();
```

O que faz:

1. **Auto-calcula `nivel`** = `pai.nivel + 1` (ou `0` se for raiz). Sobrescreve o que o usuário tentou passar.
2. **Rejeita pasta-filha em entidade diferente** do pai. Evita uma subpasta da CEDTEC parar em baixo de uma pasta da Pessoal.
3. **Rejeita 4º nível e além**.
4. Roda só `BEFORE INSERT OR UPDATE OF (pasta_pai_id, entidade_id)` — update de `nome`/`icone`/`ordem`/etc. **não** dispara a validação. Otimização correta porque essas mudanças não afetam coerência hierárquica.

---

## Constraints UNIQUE — duas, parciais

```sql
CREATE UNIQUE INDEX uniq_pastas_raiz
  ON public.pastas (entidade_id, nome)
  WHERE pasta_pai_id IS NULL;

CREATE UNIQUE INDEX uniq_pastas_filhas
  ON public.pastas (entidade_id, pasta_pai_id, nome)
  WHERE pasta_pai_id IS NOT NULL;
```

**Por que dois índices em vez de um `UNIQUE (entidade_id, pasta_pai_id, nome)` direto?**

PostgreSQL trata `NULL` como "qualquer coisa" em UNIQUE composta — `(ent_X, NULL, 'foo')` não colide com outro `(ent_X, NULL, 'foo')` porque `NULL = NULL` é `NULL` (não `TRUE`). Resultado: pastas-raiz duplicariam silenciosamente.

Os 2 índices parciais separam:

- **Pastas-raiz** (`pasta_pai_id IS NULL`): único por `(entidade, nome)`.
- **Pastas-filhas** (`pasta_pai_id IS NOT NULL`): único por `(entidade, pai, nome)`.

Cobre os 2 casos sem furo de NULL.

---

## Por que `ON DELETE RESTRICT`

Tanto em `entidade_id` quanto em `pasta_pai_id`. Apagar entidade ou pasta-pai que **ainda tem filhas/conteúdo** falha — força o usuário a:

1. Mover/arquivar as filhas explicitamente.
2. Depois apagar a pasta.

Comportamento alternativo (`CASCADE`) seria perigoso — apagar uma pasta de marketing arrastando 200 documentos sem aviso. RESTRICT obriga operação consciente, alinhado com o padrão do `CONVENÇÕES.md`.

---

## Índices

```sql
CREATE INDEX idx_pastas_entidade  ON public.pastas (entidade_id);
CREATE INDEX idx_pastas_pai       ON public.pastas (pasta_pai_id);
CREATE INDEX idx_pastas_arquivada ON public.pastas (arquivada) WHERE arquivada = false;
```

- `idx_pastas_entidade`: lookup por dono.
- `idx_pastas_pai`: pra construir árvore (selecionar todas as filhas de uma pasta).
- `idx_pastas_arquivada`: parcial — quase toda query da UI filtra `arquivada = false`.

---

## Row Level Security

```sql
ALTER TABLE public.pastas ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_full_access
  ON public.pastas
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

Padrão do projeto. Single-user.

---

## Seeds (3 pastas iniciais)

| Entidade | Pai | Nome | Nível | Ícone |
|---|---|---|---|---|
| CEDTEC | (raiz) | Marketing | 0 | 📣 |
| CEDTEC | Marketing | Criativos Maio 2026 | 1 | 🖼️ |
| Pessoal | (raiz) | Documentos pessoais | 0 | 🪪 |

Inseridos com `WHERE NOT EXISTS` baseado em `(entidade_id, nome, pasta_pai_id IS NOT DISTINCT FROM pai)` — a chave de dedup precisa de `IS NOT DISTINCT FROM` pra `NULL = NULL` funcionar como `TRUE` (essa é a convenção pra seeds idempotentes em colunas nuláveis).

---

## Exemplos de query no front (JS)

```js
import { supabase } from '../core/supabase.js';
```

### Listar pastas de uma entidade em árvore

```js
async function arvoreDePastas(entidadeId) {
  const { data, error } = await supabase
    .from('pastas')
    .select('id, nome, icone, nivel, pasta_pai_id, ordem')
    .eq('entidade_id', entidadeId)
    .eq('arquivada', false)
    .order('nivel')
    .order('ordem')
    .order('nome');
  if (error) throw error;

  // Constrói índice por id e plugins as filhas no campo `filhas`
  const porId = new Map(data.map(p => [p.id, { ...p, filhas: [] }]));
  const raizes = [];
  porId.forEach(p => {
    if (p.pasta_pai_id) {
      porId.get(p.pasta_pai_id)?.filhas.push(p);
    } else {
      raizes.push(p);
    }
  });
  return raizes;
}
```

### Criar subpasta

```js
const { data, error } = await supabase
  .from('pastas')
  .insert({
    entidade_id: cedtecId,
    pasta_pai_id: pastaMarketingId,
    nome: 'Relatórios Q2',
    icone: '📊'
  })
  .select()
  .single();

// Trigger calcula `nivel` automaticamente. Se a entidade do pai
// for diferente da informada, ou se pai já estiver no nível 2,
// o INSERT falha com mensagem clara em português.
```

### Soft-archive

```js
await supabase
  .from('pastas')
  .update({ arquivada: true })
  .eq('id', pastaId);
```

---

## Relacionado

- [[CONVENÇÕES]] — fuso, idempotência, FKs, RLS, naming
- [[Tabela — entidades]] — FK obrigatória
- [[Tabela — documentos]] — irmã que referencia pastas
