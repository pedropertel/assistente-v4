---
tipo: convenções
escopo: banco de dados
atualizado: 2026-05-01
---

# Convenções — Banco de Dados

[[Home]] > Banco de Dados > Convenções

> Referência única pra todas as tabelas da Fase 2 e além. Cada nova tabela DEVE seguir essas regras — divergências precisam de justificativa registrada na própria documentação da tabela.

---

## ⚠️ Fuso horário (`timestamptz`)

**Regra mãe:** _armazena em UTC, converte na borda._

### Banco

PostgreSQL armazena `timestamptz` internamente **em UTC**. Sempre. Não muda.

### Inserts (seeds, INSERTs do app)

SEMPRE usar fuso explícito:

```sql
'2026-05-04 08:00:00-03'::timestamptz   -- 8h Brasília
```

Sem o sufixo `-03`, o PostgreSQL interpreta como UTC e o valor desloca 3h ao ser exibido em horário local. Bug silencioso clássico.

### Verificações via SQL Editor do Supabase

O Dashboard usa **UTC por padrão**. Pra ver "como o usuário vai ver", SEMPRE usar `AT TIME ZONE`:

```sql
SELECT
  titulo,
  to_char(inicio AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') AS quando,
  (inicio AT TIME ZONE 'America/Sao_Paulo')::date AS dia
FROM eventos;
```

### Frontend (JavaScript)

`Date` e `Intl.DateTimeFormat` usam automaticamente o fuso do navegador (Brasília pro Pedro). **Conversão é automática** — não precisa fazer nada manual no JS.

A função `fmtDate()` em `js/core/utils.js` cuida do caso de date-only (`'2026-04-24'`) injetando `T00:00:00` pra evitar interpretação UTC, mas timestamptz completo (`2026-04-24T08:00:00-03:00`) é sempre interpretado corretamente.

---

## Idempotência de seeds

Tabelas de schema rodam o `CREATE TABLE IF NOT EXISTS` + `DROP/CREATE` de triggers/policies — todas idempotentes. **O SEED é o ponto de risco** se não for tratado.

### Tabelas com unique constraint natural

Usa `ON CONFLICT (...) DO NOTHING`:

```sql
INSERT INTO entidades (slug, nome, ...) VALUES
  ('cedtec', 'CEDTEC', ...),
  ...
ON CONFLICT (slug) DO NOTHING;
```

Exemplo: `entidades.slug`, `agentes.slug` (futura).

### Tabelas sem unique constraint natural

Usa `WHERE NOT EXISTS` com a chave de deduplicação **só pra seed inicial**:

```sql
INSERT INTO tarefas (entidade_id, titulo, ...)
SELECT * FROM (VALUES
  (..., 'Revisar campanhas Meta da semana', ...),
  ...
) AS novos(entidade_id, titulo, ...)
WHERE NOT EXISTS (
  SELECT 1 FROM tarefas t
  WHERE t.entidade_id = novos.entidade_id
    AND t.titulo = novos.titulo
);
```

⚠️ A chave de deduplicação (ex.: `entidade_id + titulo`) é só pra **seed inicial**. Em produção o usuário pode ter 5 tarefas com mesmo título na mesma entidade sem problema — esse é caso de uso real, não erro.

---

## Cor em hex sem `#`

Sempre armazenar HEX **sem o `#`** (ex.: `'5B6AF0'`, não `'#5B6AF0'`).

A UI prefixa o `#` ao renderizar. Convenção: armazena dado, não formatação.

---

## FKs — `ON DELETE RESTRICT` por padrão

```sql
entidade_id uuid NOT NULL REFERENCES entidades(id) ON DELETE RESTRICT
```

**Nunca CASCADE por default.** Apagar uma entidade que ainda tem dados (tarefas, eventos, etc.) deve falhar — força o usuário a arquivar/transferir antes. Combina com soft-delete (`ativa = false` em entidades, `arquivada = true` em tarefas).

**Exceção:** FKs "associativas" não-essenciais usam `ON DELETE SET NULL`. Ex.: `agente_id` em tarefas/eventos — apagar um agente desliga das linhas mas não impede o delete.

---

## Trigger genérico de `updated_at`

A função `public.set_updated_at()` foi criada na Tarefa 2.1 e é **reaproveitada por todas as tabelas** com a coluna `updated_at`:

```sql
DROP TRIGGER IF EXISTS trg_<tabela>_updated_at ON public.<tabela>;
CREATE TRIGGER trg_<tabela>_updated_at
  BEFORE UPDATE ON public.<tabela>
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
```

Não redefinir a função em cada tabela. Convenção do nome do trigger: `trg_<tabela>_updated_at`.

---

## Row Level Security

Todas as tabelas têm:

```sql
ALTER TABLE public.<tabela> ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_full_access ON public.<tabela>;
CREATE POLICY auth_full_access
  ON public.<tabela>
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
```

Sistema é **single-user**. Usuário autenticado (`authenticated`) pode tudo. Anônimo (`anon`) não vê nada. Quando virar multi-user (não está no roadmap), policy ganha filtro por `auth.uid()`.

---

## Índices parciais quando faz sentido

Quando 80%+ das queries filtram um valor específico de uma coluna booleana ou um range comum, usa índice **parcial**:

```sql
CREATE INDEX idx_tarefas_arquivada
  ON public.tarefas (arquivada)
  WHERE arquivado = false;          -- só indexa as ativas

CREATE INDEX idx_eventos_google
  ON public.eventos (google_event_id)
  WHERE google_event_id IS NOT NULL; -- só indexa as sincronizadas
```

Índices parciais ficam 5–20× menores que cheios em distribuições enviesadas. Ganho real em SELECT/INSERT/UPDATE.

---

## Comentários em tudo

`COMMENT ON TABLE` + `COMMENT ON COLUMN` em **todas** as tabelas e colunas, em português.

Aparecem no Supabase Dashboard, em ferramentas de visualização, e ajudam quando alguém (Pedro futuro, Claude futuro) volta no schema sem o contexto da tarefa que criou.

---

## Naming

- **Tabelas:** plural, snake_case, sem prefixo de domínio (ex.: `tarefas`, não `tb_tarefas` nem `tarefa`).
- **Colunas:** snake_case, sem o nome da tabela embutido (ex.: `tarefas.titulo`, não `tarefas.titulo_tarefa`).
- **FKs:** `<referenciada>_id` (ex.: `entidade_id`, `agente_id`).
- **Triggers:** `trg_<tabela>_<o_que_faz>` (ex.: `trg_tarefas_updated_at`).
- **Funções:** verbo + sujeito (ex.: `set_updated_at`, `set_concluida_em`).
- **Índices:** `idx_<tabela>_<colunas>` (ex.: `idx_eventos_periodo`).
- **Constraints CHECK:** `chk_<tabela>_<o_que_valida>` (ex.: `chk_eventos_horario`).
- **Constraints UNIQUE:** geralmente declaradas inline na coluna; quando composta, `uq_<tabela>_<colunas>`.
- **Slug:** kebab-case quando há mais de uma palavra (ex.: `pincel-atomico`).

---

## Relacionado

- [[Tabela — entidades]]
- [[Tabela — tarefas]]
- [[Tabela — eventos]]
- [[CLAUDE.md]] — REGRA 5 (instância única Supabase)
