---
tipo: schema
tabela: eventos
fase: 2
tarefa: 2.3
criada_em: 2026-05-01
---

# Tabela `eventos`

[[Home]] > Banco de Dados > eventos

> **Agenda do Pedro.** Compromissos com data/hora de início e fim, opcionalmente recorrentes, com lembretes, localização e preparada pra sincronização bidirecional com Google Calendar.

---

## Schema

```sql
CREATE TABLE public.eventos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_id       uuid NOT NULL REFERENCES public.entidades(id) ON DELETE RESTRICT,
  titulo            text NOT NULL,
  descricao         text,
  tipo              text NOT NULL DEFAULT 'reuniao'
                    CHECK (tipo IN ('reuniao', 'tarefa', 'pessoal', 'lembrete', 'bloqueio')),
  inicio            timestamptz NOT NULL,
  fim               timestamptz NOT NULL,
  dia_inteiro       boolean NOT NULL DEFAULT false,
  local             text,
  url               text,
  recorrencia       text NOT NULL DEFAULT 'nenhuma'
                    CHECK (recorrencia IN ('nenhuma', 'diaria', 'semanal', 'mensal', 'anual')),
  recorrencia_ate   date,
  lembretes_min     integer[] NOT NULL DEFAULT '{}',
  agente_id         uuid,                 -- FK adicionada na Tarefa 2.5
  origem            text NOT NULL DEFAULT 'manual'
                    CHECK (origem IN ('manual', 'chat', 'voz', 'sistema', 'google_calendar')),
  google_event_id   text UNIQUE,
  arquivado         boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_eventos_horario CHECK (fim > inicio)
);
```

### Colunas (17 no total)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()`. |
| `entidade_id` | `uuid` | FK pra `entidades(id)`. **NOT NULL**. `ON DELETE RESTRICT`. |
| `titulo` | `text` | Título curto. |
| `descricao` | `text` | Markdown opcional. |
| `tipo` | `text` | Categoria visual via CHECK (5 valores — ver abaixo). |
| `inicio` | `timestamptz` | Início. **Armazenado em UTC** (ver [[CONVENÇÕES]]). |
| `fim` | `timestamptz` | Fim. CHECK garante `fim > inicio`. |
| `dia_inteiro` | `boolean` | `true` ignora hora — usa só data. Útil pra "Bett dia 5" sem hora específica. |
| `local` | `text` | Local físico/virtual (opcional). |
| `url` | `text` | Link Zoom/Meet/Teams (opcional). |
| `recorrencia` | `text` | 5 padrões fixos. MVP — ver nota abaixo. |
| `recorrencia_ate` | `date` | Limite da recorrência. NULL = sem fim. |
| `lembretes_min` | `integer[]` | Array de minutos antes. `{15, 60}` = lembrar 15min e 1h antes. Default `'{}'` (sem lembrete). |
| `agente_id` | `uuid` | Sem FK até a Tarefa 2.5. |
| `origem` | `text` | Como foi criado. **Inclui `google_calendar`** (diferente de `tarefas`). |
| `google_event_id` | `text` | UNIQUE. ID no Google Calendar pra sync bidirecional. |
| `arquivado` | `boolean` | Soft-archive. |
| `created_at` | `timestamptz` | Criação. |
| `updated_at` | `timestamptz` | Atualizado via trigger. |

---

## Os 5 tipos de evento

| Tipo | Significado | Cor sugerida |
|---|---|---|
| `reuniao` | Compromisso com outras pessoas. Default. | Cor da entidade |
| `tarefa` | Task com hora marcada (ex.: "Pagar boleto às 14h"). Diferente da tabela `tarefas` — aqui é tempo, não kanban. | `--accent` |
| `pessoal` | Vida pessoal (médico, viagem, família). | `--text-secondary` |
| `lembrete` | Apenas notifica, não bloqueia tempo. | `--warning` |
| `bloqueio` | Tempo reservado sem agenda externa (foco profundo, revisão semanal). | `--text-tertiary` |

A escolha do tipo é semântica — o app pode renderizar diferente na agenda (ex.: bloqueios com listras, lembretes só no dia, etc.) e usar pra filtros.

---

## Recorrência — MVP simples

5 padrões fixos: `nenhuma | diaria | semanal | mensal | anual`. Combinado com `recorrencia_ate` (data limite opcional, NULL = sem fim).

**Limitação consciente:** se algum dia precisar de regras complexas tipo "terça e quinta", "primeira segunda do mês", "a cada 2 semanas", a expansão correta é **uma tabela `eventos_recorrencia` separada** (com schema RFC 5545 / RRULE simplificado), não esticar esse CHECK. Hoje os casos de uso do Pedro são todos simples — postergamos.

A **expansão de instâncias recorrentes** (ex.: "evento semanal de 1/jan a 31/dez = 52 ocorrências") é problema da query/UI, não do schema. Nada de pré-popular linhas duplicadas.

---

## `lembretes_min` — array de inteiros

Array PostgreSQL de minutos **antes** do início.

```
'{}'        → sem lembrete
'{15}'      → 15 min antes
'{15, 60}'  → 15 min antes E 1h antes
'{180, 1440}' → 3h antes E 1 dia antes (caso típico de viagem)
```

**Por que array em vez de tabela separada?** Volume baixo (1-3 valores por evento), sempre lidos junto com o evento. Um JOIN pra cada evento seria desperdício. Pode evoluir pra tabela se virar dor.

Default `'{}'` (não NULL) — simplifica queries: `array_length(lembretes_min, 1)` ou `unnest(lembretes_min)` sempre funcionam, sem `IS NULL` pelo caminho.

---

## Índices (5 ao todo)

```sql
CREATE INDEX idx_eventos_entidade  ON public.eventos (entidade_id);
CREATE INDEX idx_eventos_inicio    ON public.eventos (inicio);
CREATE INDEX idx_eventos_periodo   ON public.eventos (inicio, fim);
CREATE INDEX idx_eventos_arquivado ON public.eventos (arquivado)       WHERE arquivado = false;
CREATE INDEX idx_eventos_google    ON public.eventos (google_event_id) WHERE google_event_id IS NOT NULL;
```

- **`idx_eventos_inicio`**: pro caso comum "eventos do dia/semana" (`WHERE inicio BETWEEN X AND Y`).
- **`idx_eventos_periodo (inicio, fim)`**: índice composto pra detectar conflitos de horário (`WHERE inicio < $fim AND fim > $inicio`).
- **`idx_eventos_arquivado`**: parcial — 95% das queries da agenda filtram `arquivado = false`. Igual ao padrão de `tarefas`.
- **`idx_eventos_google`**: parcial — só os eventos sincronizados terão valor. Sync rápido sem indexar a maioria que é NULL.

---

## Preparação pra Google Calendar

A tabela já está pronta pra sync bidirecional na Fase 4 (ou quando virar prioridade):

- **`google_event_id text UNIQUE`** evita duplicação se o sync rodar 2x. Quando o app criar um evento e empurrar pro Google, recebe o ID de volta e armazena. Quando o Google entrega um evento via webhook, o app procura por `google_event_id` antes de inserir.
- **`origem='google_calendar'`** marca eventos importados — UI pode renderizar com ícone do Google ou com flag "vem de fora".
- Operações fora-de-banda (delete no Google) podem ser detectadas via cron + diff.

Como a sync ainda não existe, a coluna fica NULL pra todos os 3 seeds atuais.

---

## Row Level Security

```sql
ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_full_access
  ON public.eventos
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
```

Mesmo padrão das tabelas anteriores ([[Tabela — entidades]], [[Tabela — tarefas]]). Single-user, policy permissiva pra `authenticated`.

---

## ⚠️ Convenção de fuso horário (vale pra TODAS as tabelas com `timestamptz`)

> **Lição aprendida ao validar a 2.3:** o SQL Editor do Supabase Dashboard mostra timestamps em UTC por padrão, o que confunde quem espera ver "como o usuário vai ver". Os dados estão certos no banco, mas a renderização precisa de cuidado.

### Regras

- **Banco:** PostgreSQL armazena `timestamptz` internamente **em UTC**. Sempre. Não muda.
- **Inserts (seeds, INSERTs do app):** SEMPRE usar fuso explícito.
  ```sql
  '2026-05-04 08:00:00-03'::timestamptz   -- 8h Brasília
  ```
  Sem o sufixo `-03`, o valor é interpretado como UTC pelo PostgreSQL e o evento desloca 3h ao ser exibido em horário local.
- **Verificações via SQL Editor do Supabase:** o Dashboard usa UTC por padrão. Pra ver "como o usuário vai ver", SEMPRE usar `AT TIME ZONE`:
  ```sql
  SELECT
    titulo,
    to_char(inicio AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') AS quando
  FROM eventos;
  ```
  Ou pra extrair só a data:
  ```sql
  (inicio AT TIME ZONE 'America/Sao_Paulo')::date AS dia
  ```
- **Frontend (JavaScript):** `Date` e `Intl.DateTimeFormat` usam automaticamente o fuso do navegador (que pro Pedro é Brasília). Conversão é automática — não precisa fazer nada manual no JS.

### Resumo

> **Armazena em UTC, converte na borda.** Insert com fuso explícito. Leitura com `AT TIME ZONE` no SQL OU deixa o JS converter.

A versão completa dessa convenção (e outras) vive em [[CONVENÇÕES]] como referência única pra todas as próximas tarefas da Fase 2.

---

## Exemplos de query no front (JS)

```js
import { supabase } from '../core/supabase.js';
```

### Eventos da semana atual

```js
const hoje = new Date();
const inicioSemana = new Date(hoje); inicioSemana.setDate(hoje.getDate() - hoje.getDay());
const fimSemana    = new Date(inicioSemana); fimSemana.setDate(inicioSemana.getDate() + 7);

const { data } = await supabase
  .from('eventos')
  .select('*, entidades(nome, icone)')
  .eq('arquivado', false)
  .gte('inicio', inicioSemana.toISOString())
  .lt('inicio', fimSemana.toISOString())
  .order('inicio');
```

### Detectar conflito de horário ao agendar evento novo

```js
async function temConflito(inicio, fim) {
  const { data, error } = await supabase
    .from('eventos')
    .select('id, titulo')
    .eq('arquivado', false)
    .lt('inicio', fim)         // evento existente começa antes do novo terminar
    .gt('fim', inicio);        // evento existente termina depois do novo começar
  if (error) throw error;
  return data;                 // array vazio = sem conflito
}
```

### Próximos eventos com lembrete

```js
const { data } = await supabase
  .from('eventos')
  .select('id, titulo, inicio, lembretes_min')
  .gt('inicio', new Date().toISOString())
  .not('lembretes_min', 'eq', '{}')
  .order('inicio')
  .limit(20);
```

---

## Pendência de schema

### `agente_id` ainda não tem FK

Igual à `tarefas`. Vai virar FK na **Tarefa 2.5** via:

```sql
ALTER TABLE public.eventos
  ADD CONSTRAINT fk_eventos_agente
  FOREIGN KEY (agente_id) REFERENCES public.agentes(id)
  ON DELETE SET NULL;
```

---

## Seeds (3 eventos)

| Entidade | Título | Tipo | Quando | Local |
|---|---|---|---|---|
| Pincel Atômico | Bett Brasil 2026 — montagem do estande | reuniao | 04/05 08:00–18:00 | Expo Center Norte — booth D140 |
| CEDTEC | Bloqueio: revisão semanal de campanhas Meta | bloqueio | 05/05 09:00–10:00 | Online |
| Pessoal | Punta Cana — voo de saída | pessoal | 16/05 06:00–14:00 | Aeroporto de Vitória |

Inseridos com `WHERE NOT EXISTS` baseado em `(entidade_id, titulo, inicio)` — convenção de seed pra tabelas sem unique constraint natural.

---

## Relacionado

- [[CONVENÇÕES]] — fuso horário, idempotência, FKs, triggers
- [[Tabela — entidades]] — FK obrigatória
- [[Tabela — tarefas]] — irmã (kanban) com convenções similares
- [[Backlog — Tarefas Pequenas]] — Tarefa 2.3 (✅), 2.5 (vai adicionar a FK do `agente_id`)
