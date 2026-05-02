---
tipo: schema
tabela: meta_campanhas_cache
fase: 2
tarefa: 2.8
criada_em: 2026-05-01
---

# Tabela `meta_campanhas_cache`

[[Home]] > Banco de Dados > meta_campanhas_cache

> Cache de snapshots de **campanhas** Meta. Marcos consulta aqui (rápido) em vez de bater na Graph API a cada interação. Nível 1 da hierarquia de cache (`campanha → adset → ad`).

---

## Schema

```sql
CREATE TABLE public.meta_campanhas_cache (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conexao_id                      uuid NOT NULL REFERENCES public.meta_conexoes(id) ON DELETE CASCADE,
  id_meta                         text NOT NULL,
  nome                            text NOT NULL,
  objetivo                        text,
  status                          text NOT NULL,
  effective_status                text,
  daily_budget_centavos           bigint,
  lifetime_budget_centavos        bigint,
  bid_strategy                    text,
  start_time                      timestamptz,
  stop_time                       timestamptz,
  created_time_meta               timestamptz,

  impressions                     bigint DEFAULT 0,
  clicks                          bigint DEFAULT 0,
  spend_centavos                  bigint DEFAULT 0,
  reach                           bigint DEFAULT 0,
  frequency                       numeric(10,4),
  ctr                             numeric(10,4),
  cpc_centavos                    bigint,
  cpm_centavos                    bigint,
  conversions                     bigint DEFAULT 0,
  cost_per_conversion_centavos    bigint,
  leads                           bigint DEFAULT 0,
  cost_per_lead_centavos          bigint,

  sync_at                         timestamptz NOT NULL DEFAULT now(),
  sync_periodo_inicio             date,
  sync_periodo_fim                date,
  raw_data                        jsonb,

  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uniq_meta_camp_conn_id_meta UNIQUE (conexao_id, id_meta)
);
```

**31 colunas no total.** Detalhes coluna a coluna em `COMMENT ON COLUMN` no banco.

---

## Por que 3 níveis de cache (campanha → adset → ad)

Estrutural do Meta Ads. Cada nível tem campos próprios e métricas próprias:

- **Campanha** = objetivo macro + budget + status
- **Adset** = público-alvo + posicionamento + bid + budget (pode estar aqui ou na campanha)
- **Ad** = criativo individual (imagem/vídeo + texto + CTA)

Marcos analisa em todos os níveis:
- "Como tá a CEDTEC esse mês?" → agregação de campanhas
- "Qual conjunto tá pior?" → drill em adsets de uma campanha
- "Qual criativo tá chumbando?" → drill em ads de um adset

Cache em 3 tabelas separadas (em vez de 1 achatada com `nivel ENUM`) — decisão arquitetural registrada na 2.8 (ver Dev Log 2026-05-01).

---

## `ON DELETE CASCADE` em `conexao_id` — exceção consciente

Padrão do projeto é `RESTRICT`. CASCADE só pra exceções conscientes registradas em `CONVENÇÕES.md`. Esta é uma delas.

Justificativa:

- **Cache não tem valor sem a conexão.** Apagar `meta_conexao` da CEDTEC sem cascatear deixa centenas de campanhas órfãs apontando pra `conexao_id` inválido.
- **`conexao_id` é `NOT NULL`** — `SET NULL` nem é opção (estado inválido).
- **Cache é "filho biológico" da conexão.** Não é metadado.
- **Re-sync é trivial.** Apagou conexão por engano e recriou? Roda sync, cache reconstrói da Graph API.

Mesmo padrão se repete em `meta_adsets_cache.conexao_id` e `meta_ads_cache.conexao_id` (3ª e 4ª ocorrências do CASCADE no projeto). Lista completa em [[CONVENÇÕES]].

---

## `raw_data jsonb` — estratégia híbrida

A Meta API retorna **dezenas de métricas** por campanha. Cachear todas em colunas dedicadas seria:

1. Schema gigante (50+ colunas), maior parte usada raramente.
2. ALTER TABLE pra cada métrica nova — ciclo lento.
3. Acoplamento ao schema atual da Graph API.

**Estratégia híbrida** (escolha):

- **Colunas dedicadas** pras métricas que Marcos consulta toda hora: `ctr`, `cpc_centavos`, `cpm_centavos`, `cost_per_lead_centavos`, `leads`, `spend_centavos`. Performance onde importa.
- **`raw_data jsonb`** com a resposta completa da Graph API. Marcos pega métrica obscura via `raw_data->'video_view_rate'` sem ALTER TABLE.

Custo: jsonb ocupa ~2-5 KB por campanha. Pra 100 campanhas, ~500 KB. Insignificante.

Bonus: auditoria total. Pra debug "esse CPL veio de onde?", consulta o `raw_data` da linha.

---

## Métricas top — o que Marcos olha

| Métrica | Coluna | Quando usa |
|---|---|---|
| **CPL** | `cost_per_lead_centavos` | Métrica principal pra CEDTEC. Marcos pausa quando excede alvo (~R$ 80). |
| **Leads** | `leads` | Volume — "quantos leads gerou". |
| **Spend** | `spend_centavos` | "Quanto torrei no período". |
| **CTR** | `ctr` | Saúde do criativo — abaixo de 1% pra search/feed = problema. |
| **CPC** | `cpc_centavos` | Custo por clique — comparação entre conjuntos. |
| **CPM** | `cpm_centavos` | Custo por mil impressões — saúde do leilão. |
| **Frequência** | `frequency` | >3-5 = saturação, ad fadigando. |

Outras (conversions, cost_per_conversion, reach, impressions) ficam pra análise mais profunda.

---

## `sync_periodo_inicio` / `sync_periodo_fim`

Métricas Meta agregam por **período**. CPL "do mês" é diferente de CPL "dos últimos 7 dias". Sem registrar o período da agregação, comparações ficam ambíguas.

A Edge Function de sync escolhe o período (geralmente últimos 30 dias ou mês corrente) e grava em `sync_periodo_inicio` + `sync_periodo_fim`. Marcos sabe interpretar.

Se virar dor (Marcos quer CPL hoje + CPL semana + CPL mês ao mesmo tempo), evolução é tabela `meta_metricas_diarias` com snapshot por dia. Hoje desnecessário.

---

## UPSERT do sync usa UNIQUE composto

```sql
CONSTRAINT uniq_meta_camp_conn_id_meta UNIQUE (conexao_id, id_meta)
```

Edge Function de sync faz:

```sql
INSERT INTO meta_campanhas_cache (conexao_id, id_meta, nome, status, ...)
VALUES (...)
ON CONFLICT (conexao_id, id_meta) DO UPDATE SET
  nome = EXCLUDED.nome,
  status = EXCLUDED.status,
  effective_status = EXCLUDED.effective_status,
  -- ... todas as colunas mutáveis
  sync_at = now();
```

Re-sync atualiza linhas existentes em vez de duplicar.

---

## Row Level Security

```sql
ALTER TABLE public.meta_campanhas_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_full_access
  ON public.meta_campanhas_cache
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

Padrão do projeto.

---

## Índices

```sql
CREATE INDEX idx_meta_camp_conexao ON public.meta_campanhas_cache (conexao_id);
CREATE INDEX idx_meta_camp_status  ON public.meta_campanhas_cache (status) WHERE status = 'ACTIVE';
CREATE INDEX idx_meta_camp_id_meta ON public.meta_campanhas_cache (id_meta);
CREATE INDEX idx_meta_camp_sync    ON public.meta_campanhas_cache (sync_at DESC);
CREATE INDEX idx_meta_camp_periodo ON public.meta_campanhas_cache (sync_periodo_inicio, sync_periodo_fim) WHERE sync_periodo_inicio IS NOT NULL;
```

- `idx_meta_camp_status` parcial — query mais comum é "campanhas ativas". Maioria está PAUSED/DELETED — índice parcial é mais enxuto.
- `idx_meta_camp_sync DESC` — "últimos sincs" / "qual campanha foi sincada por último".

---

## Exemplos JS

```js
import { supabase } from '../core/supabase.js';
```

### Campanhas ativas da CEDTEC

```js
const { data } = await supabase
  .from('meta_campanhas_cache')
  .select('id, id_meta, nome, objetivo, daily_budget_centavos, leads, cost_per_lead_centavos, ctr, sync_at')
  .eq('conexao_id', conexaoCedtecId)
  .eq('status', 'ACTIVE')
  .order('cost_per_lead_centavos', { ascending: true, nullsFirst: false });
```

### Campanhas com CPL acima do alvo (R$ 80)

```js
const ALVO_CPL_CENTAVOS = 8000;

const { data: ruins } = await supabase
  .from('meta_campanhas_cache')
  .select('id_meta, nome, cost_per_lead_centavos, leads, spend_centavos')
  .eq('conexao_id', conexaoCedtecId)
  .eq('status', 'ACTIVE')
  .gt('cost_per_lead_centavos', ALVO_CPL_CENTAVOS)
  .order('cost_per_lead_centavos', { ascending: false });

// Marcos pode propor pausar essas
```

### Métrica obscura via `raw_data`

```js
// "Qual o video_view_rate dessa campanha?"
const { data } = await supabase
  .from('meta_campanhas_cache')
  .select('id_meta, nome, raw_data')
  .eq('id', campanhaId)
  .single();

const videoViewRate = data.raw_data?.video_view_rate ?? null;
const outboundClicks = data.raw_data?.actions?.find(a => a.action_type === 'outbound_click')?.value ?? 0;
```

### Total gasto da conta no período sincado

```js
const { data } = await supabase
  .from('meta_campanhas_cache')
  .select('spend_centavos')
  .eq('conexao_id', conexaoId);

const total = data.reduce((sum, c) => sum + (c.spend_centavos || 0), 0);
```

---

## Conexões com outras tabelas

- `meta_conexoes.id` (CASCADE — exceção registrada).
- `meta_adsets_cache.campanha_id_meta` (FK lógica via `id_meta`, não formal).
- `meta_ads_cache.campanha_id_meta` (FK lógica via `id_meta`, denormalizado pra evitar JOIN duplo).

---

## Relacionado

- [[Tabela — meta_conexoes]] — pai estrutural
- [[Tabela — meta_adsets_cache]] — nível 2 da hierarquia
- [[Tabela — meta_ads_cache]] — nível 3 (mais granular)
- [[CONVENÇÕES]] — Exceções CASCADE consolidadas
