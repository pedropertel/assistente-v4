---
tipo: schema
tabela: meta_ads_cache
fase: 2
tarefa: 2.8
criada_em: 2026-05-01
---

# Tabela `meta_ads_cache`

[[Home]] > Banco de Dados > meta_ads_cache

> Cache de **ads** Meta. Nível 3 (mais granular) da hierarquia. Cada ad = criativo individual (imagem/vídeo + texto + CTA).

---

## Schema (33 colunas)

```sql
CREATE TABLE public.meta_ads_cache (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conexao_id                      uuid NOT NULL REFERENCES public.meta_conexoes(id) ON DELETE CASCADE,
  adset_id_meta                   text NOT NULL,
  campanha_id_meta                text NOT NULL,
  id_meta                         text NOT NULL,
  nome                            text NOT NULL,
  status                          text NOT NULL,
  effective_status                text,
  creative_id                     text,
  creative_thumbnail_url          text,
  creative_body                   text,
  creative_title                  text,
  creative_link_url               text,
  creative_call_to_action         text,
  created_time_meta               timestamptz,

  -- 12 colunas de métrica (idênticas a meta_campanhas_cache)
  -- 4 metadados de sync (sync_at, sync_periodo_inicio/fim, raw_data)
  -- 2 timestamps padrão

  CONSTRAINT uniq_meta_ad_conn_id_meta UNIQUE (conexao_id, id_meta)
);
```

---

## `creative_*` dedicado em `meta_ads_cache` (não tabela `meta_creatives` separada)

Caminho normalizado seria: `meta_ads_cache.creative_id REFERENCES meta_creatives(id)`. Razões pra **não fazer**:

1. **Granularidade do sync.** A Graph API retorna o creative junto com o ad no mesmo payload (`fields=creative{...}`). Sincar pra tabelas separadas exigiria split + lookup. Mais complexo, sem ganho.
2. **Reuso de creative entre ads é raro na prática do Pedro.** Marcos cria 1 ad com 1 creative. Mesmo que a Meta permita reusar `creative_id`, no fluxo do Pedro cada ad tem o seu. Tabela separada otimizaria caso que não acontece.
3. **Queries do Marcos pegam ad + creative juntos sempre.** "Mostra preview desse ad" → precisa de `nome + creative_*` na mesma linha. JOIN seria desperdício.
4. **Trade-off espacial mínimo.** ~6 colunas text por ad ≈ alguns KB. Insignificante.

Se algum dia o Pedro reusar muito creative, vira tarefa de extração — `creative_id` já tá lá pra usar como chave.

---

## `campanha_id_meta` DENORMALIZADO

Caminho normalizado seria: `ad → adset → campanha` (JOIN duplo). Pra responder "todos os ads da campanha X" exigiria:

```sql
-- Caminho normalizado (ruim)
SELECT a.* FROM meta_ads_cache a
JOIN meta_adsets_cache s
  ON s.id_meta = a.adset_id_meta AND s.conexao_id = a.conexao_id
WHERE s.campanha_id_meta = '23847562834' AND s.conexao_id = $1;

-- Caminho denormalizado (bom)
SELECT * FROM meta_ads_cache
WHERE campanha_id_meta = '23847562834' AND conexao_id = $1;
```

Marcos faz essa query **constantemente** (Dashboard de campanha mostra ads dela; análise por campanha agrupa ads). JOIN duplo é caro em tabela grande (centenas de ads por conta) e cada chamada do Marcos faz N consultas.

Trade-off (registrado em [[CONVENÇÕES]] → "Denormalização consciente" da 2.7):
- ✅ Query rápida sem JOIN.
- ❌ Risco de divergência: se um ad mudar de adset (improvável mas possível na Meta), pode haver janela com `adset_id_meta` novo e `campanha_id_meta` velho — até o próximo sync.
- ❌ Espaço extra: 1 coluna text por ad. Insignificante.

Edge Function de sync popula `campanha_id_meta` consultando o adset-pai do mesmo sync — coerência garantida ao final.

---

## FK lógica dupla (`adset_id_meta` + `campanha_id_meta`)

Ambas FKs são lógicas, não formais:

- `adset_id_meta` — sync pode chegar ad antes do adset.
- `campanha_id_meta` — denormalizado.

Edge Function garante consistência eventual ao final do sync.

---

## ON DELETE CASCADE em `conexao_id`

Mesma justificativa das outras 2 tabelas de cache. 4ª ocorrência da exceção CASCADE no projeto. Lista completa em [[CONVENÇÕES]].

---

## Row Level Security

```sql
ALTER TABLE public.meta_ads_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_full_access
  ON public.meta_ads_cache
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

Padrão.

---

## Índices

```sql
CREATE INDEX idx_meta_ad_conexao  ON public.meta_ads_cache (conexao_id);
CREATE INDEX idx_meta_ad_adset    ON public.meta_ads_cache (adset_id_meta);
CREATE INDEX idx_meta_ad_campanha ON public.meta_ads_cache (campanha_id_meta);
CREATE INDEX idx_meta_ad_status   ON public.meta_ads_cache (status) WHERE status = 'ACTIVE';
CREATE INDEX idx_meta_ad_id_meta  ON public.meta_ads_cache (id_meta);
CREATE INDEX idx_meta_ad_sync     ON public.meta_ads_cache (sync_at DESC);
```

`idx_meta_ad_campanha` torna a query denormalizada eficiente.

---

## Exemplos JS

```js
import { supabase } from '../core/supabase.js';
```

### Ads ativos com pior CPL

```js
const { data: piores } = await supabase
  .from('meta_ads_cache')
  .select('id_meta, nome, creative_thumbnail_url, leads, cost_per_lead_centavos, ctr, spend_centavos')
  .eq('conexao_id', conexaoId)
  .eq('status', 'ACTIVE')
  .gt('leads', 5)                  // só ads com volume mínimo (CPL com poucos leads é ruído)
  .order('cost_per_lead_centavos', { ascending: false })
  .limit(10);
// Marcos pode propor pausar
```

### Preview de ad com creative_thumbnail_url

```js
const { data: ad } = await supabase
  .from('meta_ads_cache')
  .select('nome, creative_title, creative_body, creative_link_url, creative_call_to_action, creative_thumbnail_url')
  .eq('id', adId)
  .single();

// UI renderiza:
// <img src={ad.creative_thumbnail_url} />
// <h3>{ad.creative_title}</h3>
// <p>{ad.creative_body}</p>
// <button>{ad.creative_call_to_action}</button>
// → {ad.creative_link_url}
```

### Ads de uma campanha (usa `campanha_id_meta` direto — sem JOIN)

```js
const { data } = await supabase
  .from('meta_ads_cache')
  .select('id_meta, nome, status, leads, cost_per_lead_centavos, creative_thumbnail_url')
  .eq('conexao_id', conexaoId)
  .eq('campanha_id_meta', campanhaIdMeta)
  .order('leads', { ascending: false });
```

### Top criativos por CTR

```js
const { data } = await supabase
  .from('meta_ads_cache')
  .select('id_meta, nome, ctr, leads, creative_thumbnail_url, creative_title')
  .eq('conexao_id', conexaoId)
  .eq('status', 'ACTIVE')
  .gt('impressions', 1000)         // exclui ads novos sem volume
  .order('ctr', { ascending: false, nullsFirst: false })
  .limit(20);
```

---

## Conexões com outras tabelas

- `meta_conexoes.id` (CASCADE)
- `meta_adsets_cache.id_meta` (FK lógica via `adset_id_meta`)
- `meta_campanhas_cache.id_meta` (FK lógica via `campanha_id_meta`, denormalizado)

---

## Relacionado

- [[Tabela — meta_conexoes]] — pai estrutural
- [[Tabela — meta_adsets_cache]] — nível 2 (pai lógico direto)
- [[Tabela — meta_campanhas_cache]] — nível 1 (avó lógica, denormalizada)
- [[CONVENÇÕES]] — denormalização consciente, FKs lógicas
