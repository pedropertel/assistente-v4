---
tipo: schema
tabela: entidades
fase: 2
tarefa: 2.1
criada_em: 2026-05-01
---

# Tabela `entidades`

[[Home]] > Banco de Dados > entidades

> **Tabela RAIZ do sistema.** Armazena as 6 entidades do Pedro (5 empresas + Pessoal). Todas as outras tabelas de domínio (tarefas, eventos, lançamentos do sítio, campanhas Meta, etc.) referenciam uma entidade via FK em `entidade_id`.

---

## Schema

```sql
CREATE TABLE public.entidades (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  nome        text NOT NULL,
  tipo        text NOT NULL CHECK (tipo IN ('empresa', 'pessoal')),
  descricao   text,
  icone       text,
  cor_hex     text,
  ordem       integer NOT NULL DEFAULT 0,
  ativa       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

### Colunas

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK, gerado automaticamente via `gen_random_uuid()` (extensão `pgcrypto`). |
| `slug` | `text` | Identificador estável e legível. **Único.** Usado em URLs, queries e referências cruzadas. Ex.: `cedtec`, `sitio`. |
| `nome` | `text` | Nome de exibição na UI. Ex.: `Sítio Monte da Vitória`. |
| `tipo` | `text` | `'empresa'` ou `'pessoal'` (CHECK constraint). |
| `descricao` | `text` | Descrição curta — contexto pra IA e tooltip na UI. |
| `icone` | `text` | Emoji da entidade. Renderizado em cards, sidebar, gráficos. |
| `cor_hex` | `text` | Cor de marca em HEX **sem `#`** (ex.: `5B6AF0`). UI prefixa o `#` ao renderizar. Convenção: armazena dado, não formatação. |
| `ordem` | `integer` | Ordem em listas. Menor = mais alto. **`99` reservado pra Pessoal** (sempre último). |
| `ativa` | `boolean` | Soft-delete. `false` oculta nas listas mas preserva histórico. |
| `created_at` | `timestamptz` | Carimbo de criação (UTC). |
| `updated_at` | `timestamptz` | Atualizado automaticamente via trigger em cada UPDATE. |

---

## Trigger de `updated_at`

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_entidades_updated_at
  BEFORE UPDATE ON public.entidades
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
```

A função `public.set_updated_at()` é **genérica** — vai ser reaproveitada nas próximas tabelas da Fase 2 (`tarefas`, `eventos`, `documentos`, etc.) sem redefinição.

---

## Row Level Security

```sql
ALTER TABLE public.entidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_full_access
  ON public.entidades
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
```

- RLS **habilitado**.
- Policy **`auth_full_access`** permite tudo (SELECT/INSERT/UPDATE/DELETE) pra qualquer usuário autenticado. Anon (sem login) não vê a tabela.
- Sistema é **single-user** — Pedro é o único usuário autenticado. Permissivo é seguro nesse contexto.
- Se o sistema virar multi-user no futuro, esta policy precisa ganhar filtro por `auth.uid()` (provavelmente via coluna `user_id` ou tabela de membership).

---

## Seeds (6 registros iniciais)

| slug | nome | tipo | ícone | cor_hex | ordem | descrição |
|---|---|---|---|---|---|---|
| `cedtec` | CEDTEC | empresa | 🎓 | `5B6AF0` | 1 | Escola técnica em Vila Velha. Pedro é dono e único marketing. |
| `pincel-atomico` | Pincel Atômico | empresa | 📐 | `F59E0B` | 2 | Sistema de gestão escolar. Pedro é diretor comercial/marketing. |
| `sitio` | Sítio Monte da Vitória | empresa | 🌱 | `22C55E` | 3 | Café arábica nas montanhas capixabas. Fase de investimento. |
| `grafica` | Gráfica | empresa | 📄 | `8B5CF6` | 4 | Gráfica de apostilas. Pedro é sócio. |
| `agencia` | Agência | empresa | 📣 | `EC4899` | 5 | Agência de marketing. Pedro é gestor. |
| `pessoal` | Pessoal | pessoal | 👤 | `6B6B80` | 99 | Coisas pessoais — família, saúde, finanças pessoais, lazer. |

Inseridas com `ON CONFLICT (slug) DO NOTHING` — script é idempotente, pode rodar de novo sem erro.

---

## Exemplos de query no front (JS)

Importa a instância única (REGRA 5 do CLAUDE.md):

```js
import { supabase } from '../core/supabase.js';
```

### Listar todas as entidades ativas, em ordem

```js
const { data: entidades, error } = await supabase
  .from('entidades')
  .select('*')
  .eq('ativa', true)
  .order('ordem', { ascending: true });
```

### Buscar uma entidade por slug

```js
const { data: cedtec, error } = await supabase
  .from('entidades')
  .select('*')
  .eq('slug', 'cedtec')
  .single();
```

### Listar só empresas (sem Pessoal)

```js
const { data: empresas, error } = await supabase
  .from('entidades')
  .select('id, slug, nome, icone, cor_hex')
  .eq('tipo', 'empresa')
  .order('ordem');
```

### Atualizar descrição (trigger garante `updated_at`)

```js
const { error } = await supabase
  .from('entidades')
  .update({ descricao: 'Nova descrição' })
  .eq('slug', 'cedtec');
```

---

## Referências FK previstas (Fase 2)

Todas as tabelas de domínio que vão entrar nas próximas tarefas terão:

```sql
entidade_id uuid REFERENCES public.entidades(id) ON DELETE RESTRICT
```

`ON DELETE RESTRICT` garante que ninguém apague uma entidade que ainda tem dados (tarefas, lançamentos, etc.). Pra "remover" uma entidade, usa o soft-delete via `ativa = false`.

---

## Relacionado

- [[CLAUDE.md]] — REGRA 5 (instância única Supabase)
- [[VISAO.md]] — descrição das empresas e prioridades
- [[Backlog — Tarefas Pequenas]] — Tarefa 2.1 (✅), próximas tabelas em 2.2–2.9
