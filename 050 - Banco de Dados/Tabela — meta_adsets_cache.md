---
tipo: schema
tabela: meta_adsets_cache
fase: 2
tarefa: 2.8
criada_em: 2026-05-01
---

# Tabela `meta_adsets_cache`

[[Home]] > Banco de Dados > meta_adsets_cache

> Cache de **adsets** Meta. Nível 2 da hierarquia (`campanha → adset → ad`). Adset = público-alvo + posicionamento + bid + (opcional) budget.

---

## Schema (34 colunas)

```sql
CREATE TABLE public.meta_adsets_cache (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conexao_id                      uuid NOT NULL REFERENCES public.meta_conexoes(id) ON DELETE CASCADE,
  campanha_id_meta                text NOT NULL,
  id_meta                         text NOT NULL,
  nome                            text NOT NULL,
  status                          text NOT NULL,
  effective_status                text,
  daily_budget_centavos           bigint,
  lifetime_budget_centavos        bigint,
  bid_strategy                    text,
  billing_event                   text,
  optimization_goal               text,
  targeting                       jsonb,
  start_time                      timestamptz,
  end_time                        timestamptz,
  created_time_meta               timestamptz,

  -- 12 colunas de métrica (idênticas a meta_campanhas_cache)
  -- 4 metadados de sync (sync_at, sync_periodo_inicio/fim, raw_data)
  -- 2 timestamps padrão

  CONSTRAINT uniq_meta_adset_conn_id_meta UNIQUE (conexao_id, id_meta)
);
```

Métricas (`impressions`, `clicks`, `spend_centavos`, `ctr`, `cpc`, `cpl`, etc.) **idênticas** às de [[Tabela — meta_campanhas_cache]] — repetição intencional pra agregação por nível sem JOIN.

---

## `targeting` jsonb — 50+ campos possíveis

Targeting da Meta tem alta dimensionalidade e variabilidade:

- `age_min`, `age_max`, `genders`, `geo_locations` (com nested `cities`/`regions`/`countries`/`zips`/`places`/`custom_locations`)
- `interests`, `behaviors`, `custom_audiences`, `excluded_custom_audiences`, `lookalike_audiences`
- `relationship_statuses`, `education_statuses`, `work_employers`, `industries`
- `device_platforms`, `publisher_platforms`, `facebook_positions`, `instagram_positions`, `audience_network_positions`, `messenger_positions`
- `flexible_spec` (lógica AND/OR aninhada), `exclusions`, `family_statuses`, `connections`

Cada adset usa um **subconjunto diferente**. Maioria fica NULL na maioria. Colunar daria:

- Schema absurdamente largo (50+ colunas, 90%+ NULL).
- ALTER TABLE toda vez que a Meta adicionar opção (acontece anualmente).
- Sem maneira boa de armazenar `flexible_spec` (AND/OR aninhado) em colunas planas.

`jsonb` resolve. Marcos consulta:

```sql
-- Adsets focados em SP capital
SELECT id_meta, nome, raw_data
FROM meta_adsets_cache
WHERE targeting->'geo_locations'->'cities' @> '[{"key": "1004351"}]'::jsonb;
```

PG tem GIN index pra jsonb se virar dor. Hoje raw é suficiente — Marcos consulta adset-by-adset, não filtra "todos com interesse Y".

---

## `billing_event` vs `optimization_goal` — dois conceitos importantes

A Meta separa **quando cobra** (billing_event) de **o que otimiza** (optimization_goal):

| Conceito | Coluna | Exemplos | Significado |
|---|---|---|---|
| **Billing event** | `billing_event` | `IMPRESSIONS`, `LINK_CLICKS` | Quando a Meta debita do saldo. |
| **Optimization goal** | `optimization_goal` | `LINK_CLICKS`, `OFFSITE_CONVERSIONS`, `REACH`, `LANDING_PAGE_VIEWS` | O que o algoritmo Meta tenta maximizar. |

Marcos analisa combinação:

- `billing_event=IMPRESSIONS` + `optimization_goal=OFFSITE_CONVERSIONS` = paga por impressão, otimiza por conversão. Bom em volume alto, métricas estáveis.
- `billing_event=LINK_CLICKS` + `optimization_goal=LINK_CLICKS` = paga só quando clica. Comum em "tráfego" mas pode prejudicar otimização.

Mostrar essas duas colunas lado a lado na UI ajuda Marcos a explicar pro Pedro decisões de configuração.

---

## FK lógica — `campanha_id_meta`

`campanha_id_meta` aponta pra `meta_campanhas_cache.id_meta` da mesma `conexao_id`. **Não é FK formal.** Razão: sync pode chegar adset antes da campanha em corner cases (paginação inconsistente da Graph API, race em sync paralelo). FK formal travaria INSERT em ordem errada.

Edge Function de sync é responsável pela **consistência eventual** — ao final do sync, todas as campanhas existem.

Padrão registrado em [[CONVENÇÕES]] → "Integração com sistemas externos".

---

## ON DELETE CASCADE em `conexao_id`

Mesma justificativa de [[Tabela — meta_campanhas_cache]] — cache é filho biológico da conexão, NOT NULL impede SET NULL, re-sync trivial. Exceção consolidada em [[CONVENÇÕES]].

---

## Row Level Security

```sql
ALTER TABLE public.meta_adsets_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_full_access
  ON public.meta_adsets_cache
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

Padrão.

---

## Índices

```sql
CREATE INDEX idx_meta_adset_conexao  ON public.meta_adsets_cache (conexao_id);
CREATE INDEX idx_meta_adset_campanha ON public.meta_adsets_cache (campanha_id_meta);
CREATE INDEX idx_meta_adset_status   ON public.meta_adsets_cache (status) WHERE status = 'ACTIVE';
CREATE INDEX idx_meta_adset_id_meta  ON public.meta_adsets_cache (id_meta);
CREATE INDEX idx_meta_adset_sync     ON public.meta_adsets_cache (sync_at DESC);
```

- `idx_meta_adset_campanha` — query mais comum no drill: "todos adsets da campanha X" (`WHERE campanha_id_meta = '...'`).

---

## Exemplos JS

```js
import { supabase } from '../core/supabase.js';
```

### Adsets de uma campanha

```js
const { data } = await supabase
  .from('meta_adsets_cache')
  .select('id, id_meta, nome, status, daily_budget_centavos, leads, cost_per_lead_centavos, ctr')
  .eq('conexao_id', conexaoId)
  .eq('campanha_id_meta', campanhaIdMeta)
  .order('cost_per_lead_centavos', { ascending: true, nullsFirst: false });
```

### Adsets focados em SP capital

```js
const { data } = await supabase
  .from('meta_adsets_cache')
  .select('id_meta, nome, targeting')
  .eq('conexao_id', conexaoId)
  .eq('status', 'ACTIVE')
  .filter('targeting->geo_locations->cities', 'cs', '[{"key":"1004351"}]');
// Nota: filtros jsonb via PostgREST exigem sintaxe específica;
// se virar comum, encapsula em RPC.
```

### Comparar performance entre adsets da mesma campanha

```js
const { data } = await supabase
  .from('meta_adsets_cache')
  .select('id_meta, nome, leads, cost_per_lead_centavos, spend_centavos, optimization_goal, billing_event')
  .eq('campanha_id_meta', campanhaIdMeta)
  .eq('status', 'ACTIVE')
  .order('leads', { ascending: false });
```

---

## Conexões com outras tabelas

- `meta_conexoes.id` (CASCADE)
- `meta_campanhas_cache.id_meta` (FK lógica via `campanha_id_meta`)
- `meta_ads_cache.adset_id_meta` (FK lógica — ads aponta pra cá)

---

## Relacionado

- [[Tabela — meta_conexoes]] — pai estrutural
- [[Tabela — meta_campanhas_cache]] — nível 1 (pai lógico)
- [[Tabela — meta_ads_cache]] — nível 3 (filhos lógicos)
- [[CONVENÇÕES]] — FKs lógicas, jsonb pra alta variabilidade
