---
tipo: schema
tabela: tarefas
fase: 2
tarefa: 2.2
criada_em: 2026-05-01
---

# Tabela `tarefas`

[[Home]] > Banco de Dados > tarefas

> **Kanban-style.** Cada tarefa pertence a uma entidade. Status em 4 colunas, prioridade em 4 níveis, prazo opcional, soft-archive, e campos preparados pra integração com agentes (Fase 3).

---

## Schema

```sql
CREATE TABLE public.tarefas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_id   uuid NOT NULL REFERENCES public.entidades(id) ON DELETE RESTRICT,
  titulo        text NOT NULL,
  descricao     text,
  status        text NOT NULL DEFAULT 'a_fazer'
                CHECK (status IN ('backlog', 'a_fazer', 'fazendo', 'feito')),
  prioridade    text NOT NULL DEFAULT 'media'
                CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
  prazo         timestamptz,
  arquivada     boolean NOT NULL DEFAULT false,
  agente_id     uuid,                         -- FK adicionada na Tarefa 2.5
  origem        text NOT NULL DEFAULT 'manual'
                CHECK (origem IN ('manual', 'chat', 'voz', 'sistema')),
  ordem         integer NOT NULL DEFAULT 0,
  concluida_em  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

### Colunas (14 no total)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()`. |
| `entidade_id` | `uuid` | FK pra `entidades(id)`. **NOT NULL** — toda tarefa pertence a alguém. `ON DELETE RESTRICT` (ver abaixo). |
| `titulo` | `text` | Título curto. Aparece no card. |
| `descricao` | `text` | Detalhes longos em markdown (opcional). |
| `status` | `text` | Coluna do kanban. Valores fixos via CHECK. Default `'a_fazer'`. |
| `prioridade` | `text` | 4 níveis. Default `'media'`. |
| `prazo` | `timestamptz` | Deadline opcional. Tarefas sem prazo não geram lembrete. |
| `arquivada` | `boolean` | Soft-archive — esconde do kanban sem apagar. Diferente de `status='feito'`. |
| `agente_id` | `uuid` | Sem FK ainda — vai virar FK na Tarefa 2.5 quando a tabela `agentes` existir. |
| `origem` | `text` | Como foi criada: manual, chat, voz, sistema. |
| `ordem` | `integer` | Ordem manual dentro da coluna do kanban. Drag-and-drop atualiza. |
| `concluida_em` | `timestamptz` | Carimbo automático via trigger. |
| `created_at` | `timestamptz` | Carimbo de criação. |
| `updated_at` | `timestamptz` | Atualizado via trigger. |

---

## Os 4 status (kanban)

| Status | Significado | Convenção visual |
|---|---|---|
| `backlog` | Ideias / pendências sem urgência. Não entra no fluxo ativo. | Cinza |
| `a_fazer` | Próxima ação clara. Default ao criar. | Cor da entidade |
| `fazendo` | Em execução agora. Limita-se a poucas. | `--accent` |
| `feito` | Concluída. Trigger preenche `concluida_em`. | `--success` |

**Distinção importante:** `arquivada = true` é diferente de `status = 'feito'`. "Feito" mantém a tarefa visível na coluna concluído (útil pra revisão da semana). "Arquivada" tira do kanban inteiro — pra tarefas que viraram irrelevantes mas a gente quer preservar histórico.

---

## As 4 prioridades

| Prioridade | Quando usar | Cor sugerida |
|---|---|---|
| `baixa` | Pode esperar. Sem dor se atrasar. | `--text-tertiary` |
| `media` | Default. Importância normal. | `--text-secondary` |
| `alta` | Importante. Foco do dia/semana. | `--warning` |
| `urgente` | Atrasa se não for hoje. Geralmente com prazo iminente. | `--danger` |

A UI vai usar essas cores como `border-left` ou ícone de chama, alinhado com o padrão dos toasts.

---

## Trigger especial — `concluida_em` automático

```sql
CREATE OR REPLACE FUNCTION public.set_concluida_em()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'feito' AND OLD.status IS DISTINCT FROM 'feito' THEN
    NEW.concluida_em = now();
  ELSIF NEW.status <> 'feito' AND OLD.status = 'feito' THEN
    NEW.concluida_em = NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tarefas_concluida_em
  BEFORE UPDATE ON public.tarefas
  FOR EACH ROW
  EXECUTE FUNCTION public.set_concluida_em();
```

- Quando `status` **entra** em `'feito'`: preenche `concluida_em = now()`.
- Quando `status` **sai** de `'feito'` (usuário desmarcou): zera pra `NULL`.
- Caso contrário, mantém o valor existente (nem mexe).
- Usa `IS DISTINCT FROM` em vez de `<>` pra ser robusto a `NULL` (defesa em profundidade — `status` é `NOT NULL`, mas custa zero).

Por que automático em trigger e não no front: garante consistência se a mudança vier de qualquer lugar (UI, chat, agente, SQL direto).

Trigger genérico de `updated_at` também aplicado, reusando `public.set_updated_at()` criada na Tarefa 2.1.

---

## Índices

```sql
CREATE INDEX idx_tarefas_entidade  ON public.tarefas (entidade_id);
CREATE INDEX idx_tarefas_status    ON public.tarefas (status);
CREATE INDEX idx_tarefas_prazo     ON public.tarefas (prazo)     WHERE prazo IS NOT NULL;
CREATE INDEX idx_tarefas_arquivada ON public.tarefas (arquivada) WHERE arquivada = false;
```

Os 2 últimos são **índices parciais** — só indexam o subconjunto relevante:

- `idx_tarefas_prazo` indexa só tarefas que têm prazo. 95%+ das queries de "tarefas com prazo" filtram `WHERE prazo IS NOT NULL` ou `WHERE prazo BETWEEN ...`. Índice fica menor e mais rápido.
- `idx_tarefas_arquivada` indexa só tarefas ativas. Quase toda query da UI filtra `arquivada = false`. As arquivadas raramente são consultadas. Índice parcial otimiza o caminho quente.

Ganho típico: índices parciais ficam 5–20× menores que cheios em tabelas com distribuição enviesada.

---

## Row Level Security

```sql
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_full_access
  ON public.tarefas
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
```

Mesmo padrão da `entidades` — sistema single-user, policy permissiva pra `authenticated`. Anon não vê. Quando virar multi-user, ganha filtro por `user_id`.

---

## Convenção de seed (idempotência)

Tabelas **com** unique constraint natural (ex.: `entidades.slug`) usam `ON CONFLICT (...) DO NOTHING`.

Tabelas **sem** unique constraint natural (ex.: `tarefas` — não faz sentido um par `(entidade_id, titulo)` ser único na vida real) usam `WHERE NOT EXISTS`:

```sql
INSERT INTO public.tarefas (entidade_id, titulo, descricao, status, prioridade, prazo)
SELECT * FROM (VALUES
  ((SELECT id FROM public.entidades WHERE slug = 'cedtec'),
   'Revisar campanhas Meta da semana',
   'Olhar CPL de cada conjunto e pausar os que estão acima de R$ 80.',
   'a_fazer'::text, 'alta'::text, NULL::timestamptz)
) AS novos(entidade_id, titulo, descricao, status, prioridade, prazo)
WHERE NOT EXISTS (
  SELECT 1 FROM public.tarefas t
  WHERE t.entidade_id = novos.entidade_id
    AND t.titulo = novos.titulo
);
```

A chave de deduplicação é só pra **seed inicial**, não pra produção. Em produção, Pedro pode criar 5 tarefas com o mesmo título na mesma entidade sem problema (e isso é correto — repetir tarefa similar é caso de uso real, não erro).

---

## Seeds (3 tarefas iniciais)

| Entidade | Título | Status | Prioridade |
|---|---|---|---|
| CEDTEC | Revisar campanhas Meta da semana | a_fazer | alta |
| Sítio Monte da Vitória | Pagar fornecedor de adubo | fazendo | urgente |
| Pessoal | Marcar consulta com pediatra | backlog | media |

Todas com `origem = 'manual'`, sem prazo.

---

## Pendências de schema

### `agente_id` ainda não tem FK

A coluna existe (`uuid` nulável), mas a FK pra `agentes(id)` será adicionada na **Tarefa 2.5** via:

```sql
ALTER TABLE public.tarefas
  ADD CONSTRAINT fk_tarefas_agente
  FOREIGN KEY (agente_id) REFERENCES public.agentes(id)
  ON DELETE SET NULL;
```

`ON DELETE SET NULL` (não RESTRICT): apagar um agente desliga ele das tarefas mas não impede o delete — diferente de `entidade_id`, que é estrutural e não pode ser perdido.

Até a 2.5 chegar, **inserir valor em `agente_id` é livre** (não há validação de FK). UI deve evitar oferecer essa coluna até lá.

---

## Exemplos de query no front (JS)

```js
import { supabase } from '../core/supabase.js';
```

### Listar tarefas ativas de uma entidade, ordenadas por status e ordem manual

```js
const { data, error } = await supabase
  .from('tarefas')
  .select('id, titulo, status, prioridade, prazo, ordem')
  .eq('entidade_id', entidadeId)
  .eq('arquivada', false)
  .order('status')
  .order('ordem');
```

### Tarefas urgentes ou com prazo nos próximos 3 dias

```js
const limite = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

const { data } = await supabase
  .from('tarefas')
  .select('*, entidades(nome, icone)')
  .eq('arquivada', false)
  .or(`prioridade.eq.urgente,prazo.lte.${limite}`)
  .order('prazo', { nullsFirst: false });
```

### Marcar como feita (trigger preenche `concluida_em`)

```js
const { error } = await supabase
  .from('tarefas')
  .update({ status: 'feito' })
  .eq('id', tarefaId);
```

### Mover de coluna no kanban

```js
await supabase
  .from('tarefas')
  .update({ status: novoStatus, ordem: novaOrdem })
  .eq('id', tarefaId);
```

---

## Relacionado

- [[Tabela — entidades]] — FK obrigatória `entidade_id`
- [[CLAUDE.md]] — REGRA 5 (instância única Supabase)
- [[Backlog — Tarefas Pequenas]] — Tarefa 2.2 (✅), 2.5 (vai adicionar a FK do `agente_id`)
