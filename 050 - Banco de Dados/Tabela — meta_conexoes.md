---
tipo: schema
tabela: meta_conexoes
fase: 2
tarefa: 2.8
criada_em: 2026-05-01
---

# Tabela `meta_conexoes`

[[Home]] > Banco de Dados > meta_conexoes

> Liga **entidade** (CEDTEC/Pincel/etc.) a uma **ad_account** Meta usando uma **credencial**. Multi-conta desde o início. Saldo cacheado é atualizado a cada chamada do Marcos via Edge Function (cache de ~5min).

---

## Schema

```sql
CREATE TABLE public.meta_conexoes (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_id                 uuid NOT NULL REFERENCES public.entidades(id)        ON DELETE RESTRICT,
  credencial_id               uuid NOT NULL REFERENCES public.meta_credenciais(id) ON DELETE RESTRICT,
  ad_account_id               text NOT NULL,
  ad_account_nome             text,
  moeda                       text DEFAULT 'BRL',
  fuso_horario                text,
  saldo_centavos              bigint,
  saldo_sync_at               timestamptz,
  gasto_mes_atual_centavos    bigint,
  limite_diario_centavos      bigint,
  ativa                       boolean NOT NULL DEFAULT true,
  last_campanhas_sync_at      timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_meta_conn_entidade_account UNIQUE (entidade_id, ad_account_id)
);
```

### Colunas (15 no total)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK. |
| `entidade_id` | `uuid` | FK pra entidades. NOT NULL. RESTRICT. |
| `credencial_id` | `uuid` | FK pra credenciais. NOT NULL. RESTRICT — não pode apagar credencial em uso. |
| `ad_account_id` | `text` | Formato `act_<numero>` (com prefixo). Único por entidade. |
| `ad_account_nome` | `text` | Cacheado pra UI. |
| `moeda` | `text` | BRL/USD/EUR. Default BRL. |
| `fuso_horario` | `text` | Ex.: `America/Sao_Paulo`. Meta agrega métricas por esse fuso. |
| `saldo_centavos` | `bigint` | Cache de ~5min. NULL = nunca sincado. |
| `saldo_sync_at` | `timestamptz` | Quando saldo foi atualizado. |
| `gasto_mes_atual_centavos` | `bigint` | `amount_spent` do mês corrente. |
| `limite_diario_centavos` | `bigint` | `spend_cap` diário. NULL = sem limite. |
| `ativa` | `boolean` | Soft-delete REGRA 12. |
| `last_campanhas_sync_at` | `timestamptz` | Gating de re-sync (>30min = re-sync). |
| `created_at` | `timestamptz` | Criação. |
| `updated_at` | `timestamptz` | Trigger. |

---

## Por que multi-conta desde o início

CEDTEC tem conta Meta hoje. Pincel Atômico **deve** ter no futuro (departamento de marketing pode crescer). Outros negócios do Pedro também podem entrar.

Schema multi-conta significa:

- `meta_conexoes` é **N:N** entre `entidades` e ad_accounts (via tabela intermediária).
- Marcos pode trabalhar com **qualquer** conta — UI escolhe contexto via `entidade_id` ativa.
- Sem refactor futuro. Adicionar Pincel = inserir 1 linha em `meta_conexoes`.

Single-conta seria mais simples, mas refatorar pra multi quando virar realidade exige migrar dados, atualizar todas as queries, e mexer na UI já construída. Multi desde o início é decisão sem custo (uma FK extra).

---

## `ad_account_id` text com prefixo `act_`

A Meta API usa numérico internamente, mas a representação canônica em todas as chamadas Graph API e na UI do Ads Manager é `act_<numero>` (com prefixo `act_`). Armazenar `bigint` exigiria concatenar `'act_' || id::text` em toda query/sync. Custo de bytes é desprezível (text de 15 chars vs bigint de 8 bytes). Manter formato exato evita conversões e bugs de "esqueci o prefixo".

---

## UNIQUE composto (entidade_id, ad_account_id)

```sql
CONSTRAINT uniq_meta_conn_entidade_account UNIQUE (entidade_id, ad_account_id)
```

Em tese, **a mesma ad_account Meta poderia estar vinculada a duas entidades distintas no sistema do Pedro** (cenário improvável mas válido — ex.: durante migração de "estava na entidade Agência, vai pra entidade CEDTEC", janela com 2 conexões ativas). Global em `ad_account_id` seria mais restritivo do que precisa.

UNIQUE composto impede o caso real (uma entidade vincular a mesma ad_account 2 vezes — duplicação burra) sem amarrar o caso teórico.

---

## Cache de saldo: trade-off "tempo real vs rate limit Meta"

**Tempo real** (zero cache): toda query da UI dispara chamada Graph API. Latência ~300-800ms por consulta. Risco real: rate limit Meta (~200 chamadas/hora por user token). UX mobile fica lenta. Marcos consultando 5 vezes durante uma análise gasta 5 chamadas só pra mostrar saldo.

**Cache de ~5min** (escolha): Edge Function atualiza `saldo_centavos` + `saldo_sync_at` quando Marcos é chamado E `saldo_sync_at` é mais antigo que 5min.

- ✅ Latência <50ms (query no PG local).
- ✅ Sem rate limit — Marcos pode consultar 100 vezes seguidas.
- ❌ Pedro pode ver saldo "errado" por até 5min. Aceitável pra **decisão** ("posso pausar?", "tô no orçamento?"). Inaceitável pra **operação crítica** ("acabou agora?") — mas esse caso não existe no fluxo do Marcos.

UI mostra `(há 3min)` ao lado do saldo pra Pedro saber.

### `last_campanhas_sync_at` como gating de re-sync de campanhas

Diferente do saldo (5min), o cache de **campanhas/adsets/ads** tem janela de **30min**. Razão: campanhas mudam menos frequentemente que saldo (Pedro não cria/pausa 10 vezes por hora). Re-sync de 30min equilibra dados frescos e custo de chamada.

```sql
-- Pseudo-lógica da Edge Function
SELECT last_campanhas_sync_at FROM meta_conexoes WHERE id = $1;
IF last_campanhas_sync_at IS NULL OR last_campanhas_sync_at < now() - interval '30 minutes' THEN
  -- dispara sync de campanhas (chama Graph API, atualiza meta_campanhas_cache)
  UPDATE meta_conexoes SET last_campanhas_sync_at = now() WHERE id = $1;
END IF;
-- Lê do cache (rápido)
SELECT * FROM meta_campanhas_cache WHERE conexao_id = $1 AND status = 'ACTIVE';
```

Pedro pode forçar re-sync via UI ("atualizar agora") — Edge Function ignora o gating nesse caso.

---

## `moeda` + `fuso_horario`

Vêm da Meta no setup inicial da conexão (Edge Function chama Graph API uma vez pra capturar metadados):

```ts
const { currency, timezone_name } = await fetch(`.../act_X?fields=currency,timezone_name`);
// → currency: 'BRL', timezone_name: 'America/Sao_Paulo'
```

São cacheados aqui pra UI mostrar sem chamada extra. Atualizados se Pedro mudar via Meta Ads Manager (raro).

`fuso_horario` afeta como a Meta agrega métricas por dia. Importante pra interpretar `sync_periodo_inicio`/`sync_periodo_fim` corretamente.

---

## Row Level Security

```sql
ALTER TABLE public.meta_conexoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_full_access
  ON public.meta_conexoes
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

Padrão do projeto.

---

## Índices

```sql
CREATE INDEX idx_meta_conn_entidade   ON public.meta_conexoes (entidade_id);
CREATE INDEX idx_meta_conn_credencial ON public.meta_conexoes (credencial_id);
CREATE INDEX idx_meta_conn_ad_account ON public.meta_conexoes (ad_account_id);
CREATE INDEX idx_meta_conn_ativa      ON public.meta_conexoes (ativa) WHERE ativa = true;
CREATE INDEX idx_meta_conn_sync       ON public.meta_conexoes (last_campanhas_sync_at) WHERE ativa = true;
```

- `idx_meta_conn_sync` — pra job futuro de "conexões precisando re-sync" (`WHERE last_campanhas_sync_at < now() - interval '30 min'`).

---

## Exemplos JS

```js
import { supabase } from '../core/supabase.js';
```

### Listar conexões ativas pra entidade X

```js
const { data } = await supabase
  .from('meta_conexoes')
  .select(`
    id, ad_account_id, ad_account_nome, moeda, saldo_centavos, saldo_sync_at, last_campanhas_sync_at,
    meta_credenciais(nome, expira_em)
  `)
  .eq('entidade_id', cedtecId)
  .eq('ativa', true)
  .order('ad_account_id');
```

### Atualizar saldo via Graph API + cache

(Pseudo-código — quem faz é Edge Function, não o front.)

```ts
async function refreshSaldo(conexaoId: string) {
  // 1. Pega credencial + ad_account
  const { data: conn } = await supabase
    .from('meta_conexoes')
    .select('credencial_id, ad_account_id')
    .eq('id', conexaoId)
    .single();

  // 2. Lê token do Vault
  const token = await getVaultSecret(conn.credencial_id);

  // 3. Chama Graph API
  const res = await fetch(`https://graph.facebook.com/v19.0/${conn.ad_account_id}?fields=balance,amount_spent,spend_cap&access_token=${token}`);
  const { balance, amount_spent, spend_cap } = await res.json();

  // 4. Atualiza cache
  await supabase
    .from('meta_conexoes')
    .update({
      saldo_centavos: parseInt(balance),
      gasto_mes_atual_centavos: parseInt(amount_spent),
      limite_diario_centavos: spend_cap ? parseInt(spend_cap) : null,
      saldo_sync_at: new Date().toISOString(),
    })
    .eq('id', conexaoId);
}
```

### Decidir cache vs re-sync

```js
function precisaResync(conexao, janela_min = 30) {
  if (!conexao.last_campanhas_sync_at) return true;
  const idade_ms = Date.now() - new Date(conexao.last_campanhas_sync_at).getTime();
  return idade_ms > janela_min * 60 * 1000;
}
```

---

## Conexões com outras tabelas

- `entidades.id` (RESTRICT) — entidade dona da conexão.
- `meta_credenciais.id` (RESTRICT) — credencial usada.
- `meta_campanhas_cache.conexao_id` (CASCADE) — cache filho.
- `meta_adsets_cache.conexao_id` (CASCADE) — cache filho.
- `meta_ads_cache.conexao_id` (CASCADE) — cache filho.

Apagar `meta_conexoes` cascateia em **todas as 3 tabelas de cache** (limpa tudo). Re-sync reconstrói.

---

## Relacionado

- [[Tabela — meta_credenciais]] — token via Vault
- [[Tabela — meta_campanhas_cache]] — cache nível 1
- [[Tabela — meta_adsets_cache]] — cache nível 2
- [[Tabela — meta_ads_cache]] — cache nível 3
- [[CONVENÇÕES]] — Integração com sistemas externos
