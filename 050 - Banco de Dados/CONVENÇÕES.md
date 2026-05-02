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

## FKs — estruturais vs metadados

### FKs estruturais → `ON DELETE RESTRICT`

São FKs que definem **a quem o registro pertence**. Sem o pai, o filho não faz sentido.

```sql
entidade_id  uuid NOT NULL REFERENCES entidades(id) ON DELETE RESTRICT  -- toda tarefa/evento/doc pertence a uma entidade
pasta_pai_id uuid          REFERENCES pastas(id)    ON DELETE RESTRICT  -- subpasta pertence a uma pasta-pai
pasta_id     uuid          REFERENCES pastas(id)    ON DELETE RESTRICT  -- documento (opcionalmente) pertence a uma pasta
```

**Nunca CASCADE por default.** Apagar uma entidade que ainda tem dados deve **falhar** — força o usuário a arquivar/transferir antes. Combina com soft-delete (`entidades.ativa = false`, `pastas.arquivada = true`, `tarefas.arquivada = true`, etc.).

### FKs de metadados → `ON DELETE SET NULL`

São FKs **associativas** que registram **quem fez/quando rolou**, mas não definem propriedade essencial.

```sql
agente_id  uuid REFERENCES agentes(id)  ON DELETE SET NULL   -- "qual agente criou"
persona_id uuid REFERENCES personas(id) ON DELETE SET NULL   -- "qual persona estava ativa"
```

Se o agente/persona for desativado/apagado, o registro de tarefa/evento/documento **deve sobreviver** — só perde a referência. Apagar um agente não pode destruir histórico de tarefas que ele ajudou a criar.

### Resumo

| Tipo de FK | Pergunta que responde | ON DELETE |
|---|---|---|
| Estrutural | "A quem isto pertence?" | `RESTRICT` |
| Metadados | "Quem fez isto?" / "Em qual contexto foi criado?" | `SET NULL` |

**CASCADE quase nunca é usado.** Sempre que parecer tentador, alguma das 2 opções acima cobre o caso melhor.

### ⚠️ Exceções registradas — `ON DELETE CASCADE`

Padrão consolidado: **CASCADE só pra "filho biológico" com FK NOT NULL onde re-criação é trivial.**

Lista atual de ocorrências (4):

| # | Tabela | FK | Tarefa | Justificativa específica |
|---|---|---|---|---|
| 1 | `chat_anexos.mensagem_id` | mensagem-pai | 2.6 | Anexo é filho biológico da mensagem. Re-criação trivial (anexo é efêmero). |
| 2 | `meta_campanhas_cache.conexao_id` | conexão Meta | 2.8 | Cache é filho biológico da conexão. Re-criação trivial (re-sync da Graph API). |
| 3 | `meta_adsets_cache.conexao_id` | conexão Meta | 2.8 | Idem. |
| 4 | `meta_ads_cache.conexao_id` | conexão Meta | 2.8 | Idem. |

**3 critérios pra CASCADE ser aceito:**
1. Filho biológico (parte intrínseca, não associação).
2. FK `NOT NULL` (SET NULL não é opção — estado inválido).
3. Re-criação trivial (cache: re-sync; anexo: efêmero) ou impacto aceitável.

Se a tabela nova falha em qualquer um dos 3, NÃO usar CASCADE. Default volta a ser RESTRICT/SET NULL conforme a regra estrutural vs metadados acima.

⚠️ **CASCADE no banco NÃO apaga arquivos no Storage.** Quem apaga a entidade-pai precisa fazer `supabase.storage.remove([storage_paths])` antes/depois — mesmo padrão de `documentos` e `chat_anexos`.

Pra registrar uma exceção nova: adicionar linha na tabela acima + nota no doc da tabela explicando os 3 critérios.

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

## Storage (vale pra qualquer bucket futuro)

> Convenção firmada na Tarefa 2.4 quando criamos o bucket `documentos`.

### Bucket sempre privado

`Public bucket = OFF` por padrão. Arquivos do Pedro **nunca** devem ser acessíveis sem autenticação.

Se algum dia precisar de algo realmente público (ex.: foto de perfil de agente exposta numa URL fixa), criar **outro bucket** público em vez de mudar este. Mistura privado/público no mesmo bucket vira pegadinha.

### Path físico plano

```
storage_path = "{id}.{extensao}"
```

**Não replicar a hierarquia lógica no path físico.** Razões:

- Renomear/mover pasta lógica não move arquivo físico (zero trabalho de migração).
- UUID elimina colisões.
- Listar bucket plano é mais rápido que walk recursivo.
- Segurança via policy + tabela de metadados, não via obscuridade de path.

A organização lógica vive na tabela de metadados (ex.: `documentos.pasta_id`, `documentos.tags`).

### 4 policies por bucket

Sempre as 4 operações, restritas a `bucket_id = '<nome>'` e role `authenticated`:

| Policy | Operação |
|---|---|
| `upload_autenticado` | INSERT |
| `leitura_autenticado` | SELECT |
| `update_autenticado` | UPDATE |
| `delete_autenticado` | DELETE |

Convenção de nome em pt-BR. Bucket público (caso raro) usa `*_publico` no lugar.

### Tabela de metadados com `storage_path` UNIQUE

Toda tabela que aponta pra arquivo no Storage tem coluna `storage_path text NOT NULL UNIQUE`. UNIQUE protege contra dois registros apontarem pro mesmo blob (defesa contra bug de upload duplicado).

### ⚠️ Exceção registrada — `chat_anexos` usa prefixo `chat_anexos/` (Tarefa 2.6)

Única exceção à regra "path plano". Anexos de chat vivem no **mesmo bucket** `documentos` (compartilhado), mas com prefixo:

```
chat_anexos/{id}.{extensao}
```

Justificativa:

- Anexos de chat são **efêmeros/contextuais** (vinculados a mensagens), diferente dos documentos da biblioteca que são intencionais e organizados em pastas.
- Prefixo facilita **bulk-delete futuro** (`storage.remove(prefix='chat_anexos/')`) sem precisar de bucket separado agora.
- Path físico ainda contém UUID (`{id}.{extensao}`) — preserva "não colide" e "não depende de renomeação lógica".

**Quando reavaliar (migrar pra bucket dedicado `chat_anexos`):**

1. Volume cresce muito (gigabytes de áudio acumulado) e dificulta listagem do bucket `documentos`.
2. Policies precisam ser diferentes (ex.: TTL automático, MIMEs restritos).
3. Custos de Storage começam a justificar separação por bucket.

Migração futura é direta — `storage.move(...)` em batch + `UPDATE chat_anexos SET storage_path = REPLACE(...)` simultaneamente.

### Reaproveitar bucket de projeto antigo

Se o nome de bucket que você quer já existe (resíduo de projeto anterior no mesmo Supabase), **NÃO** criar policies novas direto. **Conferir e ajustar primeiro:**

1. Public bucket → confirmar OFF (ou ajustar).
2. File size limit → ajustar pro valor desejado.
3. Allowed MIME types → ajustar.
4. Listar policies existentes — se estiverem corretas (operações certas, role `authenticated`, restritas ao bucket), **reusar**. Se estiverem erradas (ex.: role `public` ou bucket público), corrigir antes de prosseguir.

Lição aprendida: o bucket `documentos` na Tarefa 2.4 era do projeto antigo, estava `Public ON` com MIME types restritos. Foi ajustado pra `Public OFF` + MIME aberto, e as 4 policies que já existiam (configuradas certas) foram mantidas.

---

## Router pattern e escolha de modelo

> Convenção firmada na Tarefa 2.5.1.

O sistema escolhe o modelo Anthropic por mensagem usando **router pattern** — uma IA pequena (Haiku) classifica a mensagem antes da IA grande responder. Configuração vive na tabela [[Tabela — personas]] via `modelo_override` + `nivel_complexidade`.

### Mapeamento padrão `nivel_complexidade` → modelo

| Nível | Modelo padrão | Custo relativo |
|---|---|---|
| `simples` | `claude-haiku-4-5-20251001` | 1× |
| `medio` | `claude-sonnet-4-6` | ~5× |
| `complexo` | `claude-opus-4-7` | ~25× |

Mapeamento vive **na Edge Function** (Fase 3), não em tabela do banco. Mudar o mapeamento global = mudar 1 lugar no código. Banco mantém apenas o nível por persona; resolução do nome do modelo é responsabilidade da Edge Function.

### Quando preencher `modelo_override`

Use **`modelo_override`** quando a persona precisa de **garantia** de modelo, ignorando o mapeamento global. Casos válidos:

- **Personas internas** que dependem de comportamento previsível (ex.: Roteador sempre Haiku — se o mapeamento de "simples" mudar, Roteador continua Haiku).
- **Casos especiais** onde Pedro definiu manualmente "essa persona sempre usa X" e não quer que mude com a evolução geral.

Em personas normais, deixa `modelo_override = NULL` e ajusta `nivel_complexidade` — assim, quando o mapeamento global evoluir, todas se beneficiam automaticamente.

### Personas internas (`interno = true`)

Convenção pra utilitários invisíveis na UI:

- `interno = true` esconde da lista de personas selecionáveis.
- `ordem ≤ 0` pra internas, `ordem ≥ 1` pra visíveis ao Pedro.
- `slug` curto e descritivo (ex.: `roteador`, `sumarizador`, `categorizador` — quando existirem).
- Geralmente têm `modelo_override` preenchido (comportamento previsível).
- UI **sempre** filtra `WHERE interno = false` ao listar personas pro Pedro escolher.

### Adicionar nova persona interna no futuro

```sql
INSERT INTO public.personas
  (slug, nome, descricao, icone, cor_hex, contexto, entidades_alvo,
   ordem, interno, modelo_override, nivel_complexidade)
VALUES (
  'sumarizador',
  'Sumarizador',
  'Resume conversas longas em 3-5 linhas. Persona interna.',
  '📝',
  '6B6B80',
  $contexto$Você é o SUMARIZADOR. Sua única função é... [...] $contexto$,
  ARRAY[]::text[],
  -1,                              -- ordem negativa pra ficar antes do Roteador (0)
  true,                            -- interno
  'claude-haiku-4-5-20251001',     -- previsibilidade
  'simples'
)
ON CONFLICT (slug) DO NOTHING;
```

A regra é apenas: `interno = true` + `ordem ≤ 0` + `modelo_override` previsível.

---

## Customização total (REGRA 12 do CLAUDE.md)

> Convenção firmada na Tarefa 2.6.1.

Pedro NUNCA mais mexe em dados via Claude Code, Supabase Dashboard ou terminal depois que o sistema estiver pronto. **Toda CRUD acontece nas telas do app.** Isso dirige o schema desde já — toda tabela criada na Fase 2 precisa estar pronta pra ser editada por humano via UI na Fase 4.

### Regras pra toda tabela nova

- **Coluna de soft-delete** (`ativa`/`arquivada`/`arquivado` boolean, depende do contexto) — usuário "apaga" arquivando, hard-delete só com confirmação explícita.
- **Schema flexível** — sem CHECK em campos que o usuário pode querer editar. CHECK só em **vocabulário interno do código**.
- **Slug ou nome editável** pelo usuário — `nome` text livre, `descricao` text livre, etc.
- **Suporte a CRUD completo via UI** (Fase 4 vai construir as telas) — listagem, criação, edição, arquivamento/exclusão.

### Vocabulário interno vs preferência do usuário

CHECK constraint só pra **vocabulário estrutural do código**:

| Tipo | Exemplo | Por que CHECK fixo |
|---|---|---|
| Status do kanban | `tarefas.status IN ('backlog','a_fazer','fazendo','feito')` | Kanban tem 4 colunas estruturais; código depende. |
| Papel da mensagem | `chat_mensagens.papel IN ('user','assistant','system')` | Compatibilidade com API Anthropic. |
| Tipo de persona interna | `personas.interno boolean` + `ordem ≤ 0` | Convenção de UI (esconder internas). |
| Tipo de evento | `eventos.tipo IN ('reuniao','tarefa','pessoal','lembrete','bloqueio')` | Renderização visual diferenciada. |
| Origem | `tarefas.origem IN ('manual','chat','voz','sistema')` | Fluxo interno de criação. |

**A customização visual** desses vocabulários (ex.: Pedro quer ver "Em Produção" em vez de "Fazendo" na UI) acontece via tabela `configuracoes` (Tarefa 2.9), que mapeia valor interno → label customizada pra UI. **Não muda CHECK no banco.**

### Seeds = ponto de partida, não imutáveis

Todo seed inserido (entidades, personas, categorias, etc.) é **sugestão inicial** pra Pedro não começar com banco vazio. Pode ser editado ou apagado pela UI sem cerimônia. Schema **não** trava nenhum seed como obrigatório (ex.: não há CHECK garantindo que a entidade `cedtec` existe).

Se algum seed for crítico pro funcionamento (ex.: a persona `roteador` interna), o código da Edge Function precisa lidar com ausência (criar se não existe, ou degradar funcionalidade graciosamente).

### Soft-delete é o padrão (formalizado na 2.7)

Toda tabela editável pelo usuário tem coluna boolean pra "arquivar sem apagar":

| Tabela | Coluna | Default | Significado |
|---|---|---|---|
| `entidades` | `ativa` | `true` | Some da UI, FKs preservam histórico. |
| `tarefas`, `eventos`, `documentos` | `arquivada`/`arquivado` | `false` | Some do kanban/agenda/biblioteca, histórico preserva. |
| `pastas` | `arquivada` | `false` | Some da árvore. |
| `agentes`, `personas` | `ativo`/`ativa` | `true` | Não responde mais a novas mensagens; histórico antigo preserva. |
| `chat_mensagens` | (sem soft-delete — `favorita` é destaque, não arquivamento) | — | — |
| `chat_anexos` | (sem — imutáveis; CASCADE limpa quando mensagem-pai é apagada) | — | — |
| `sitio_categorias` | `ativa` | `true` | Some das listas, lançamentos antigos preservam referência. |
| `sitio_lancamentos` | `arquivado` | `false` | Some do fluxo de caixa, histórico preserva. |
| `configuracoes` | (sem — hard-delete, configs descartáveis) | — | Pedro apaga config → sistema usa default hardcoded. `valor_default` na própria linha permite restaurar. Sem histórico útil. |

**Hard-delete só com confirmação explícita** ("apagar permanentemente") na UI da Fase 4. Default é arquivar.

### Denormalização consciente (firmada na 2.7)

Em alguns casos, **repetir um campo do pai no filho** é trade-off aceitável quando:

1. **Query de leitura é muito mais frequente que update** — ler é o caminho quente.
2. **JOIN evita-se vale a complexidade extra** — economia mensurável em queries comuns.
3. **Risco de desalinhamento é aceitável** — usuário ou aplicação são responsáveis pela coerência semântica.

Exemplos no projeto:

| Tabela | Campo denormalizado | Origem | Razão |
|---|---|---|---|
| `sitio_categorias.tipo` | `tipo` (entrada/saida) | Categoria-pai | `SUM(valor) WHERE tipo='saida'` sem JOIN com pai. |
| `sitio_lancamentos.tipo` | `tipo` (entrada/saida) | `categoria.tipo` | Fluxo de caixa instantâneo sem JOIN duplo. |

**Regra:** denormalizar é exceção consciente. Default é normalizar — JOIN é barato no PG. Documenta a razão na própria tabela quando fizer.

### Tabelas customizáveis pelo usuário (Fase 4 vai construir telas CRUD)

Lista atualizada conforme as tarefas vão entrando — toda tabela aqui precisa ter sua tela na Fase 4:

- `entidades` — Pedro pode adicionar/editar/arquivar empresas
- `tarefas`, `eventos`, `documentos` — CRUD óbvio
- `pastas` — árvore editável
- `personas` — incluindo customizar `prompt_base`/`contexto`/`modelo_override`/`nivel_complexidade`
- `agentes` — incluindo `prompt_base`/`modelo`/`temperatura`/`max_tokens`
- `sitio_categorias` — confirmada na 2.7 (29 seeds = ponto de partida)
- `sitio_lancamentos` — incluindo input por voz (Alemão)
- `meta_credenciais` — Pedro adiciona/edita/remove tokens via UI (token vai pro Vault)
- `meta_conexoes` — Pedro vincula entidade ↔ ad_account via UI
- `configuracoes` — centro da customização visual (labels de vocabulário interno) — Tarefa 2.9
- `ideias` — captura, refinamento, arquivamento via UI; conversão pra tarefa/evento na Fase 4 (Tarefa 2.10 bônus)
- `personas` — Marina (Curadora de Ideias) entrou na 2.10; lista atual: Marcos, Bruno, Marcela, Alemão, Marina + Roteador interno

---

## Integração com sistemas externos

> Convenção firmada na Tarefa 2.8 (Meta Ads).

### Tokens/secrets vivem no Vault

Qualquer credencial que dá acesso a sistema externo (Meta, Google, etc.) **NUNCA** vai em texto plano em tabela do `public`. Padrão:

1. Token vai pro Supabase Vault via `vault.create_secret(secret, name, description)`.
2. Tabela do `public` guarda **apenas** `vault_secret_id uuid UNIQUE` apontando pra `vault.secrets.id`.
3. Edge Function lê em runtime via `vault.decrypted_secrets WHERE id = ?` (com privilégio adequado).
4. Front nunca toca o token — envia comando, Edge Function chama API externa.

**`vault_secret_id` é referência LÓGICA, não FK formal.** Schema `vault` é gerenciado pela extension Supabase — `REFERENCES vault.secrets(id)` exigiria privilégios cross-schema que o owner padrão da `public` não tem garantido. UNIQUE no campo evita 2 linhas apontando pro mesmo secret.

Rotação: trocar valor no Vault, `vault_secret_id` permanece. Tabelas dependentes não precisam saber.

### Cache de dados externos

Quando cacheamos resposta de API externa (Meta Ads, futuro Google Ads, etc.):

| Convenção | Por quê |
|---|---|
| **`text` pra ids externos** | Formato canônico da fonte. Ex.: `act_123456789` na Meta — não converter pra bigint. |
| **`raw_data jsonb`** | Preserva resposta crua. Métricas obscuras consultáveis sem ALTER TABLE. |
| **`sync_at timestamptz NOT NULL DEFAULT now()`** | Quando o snapshot foi capturado. |
| **`sync_periodo_inicio` / `sync_periodo_fim` (date)** | Período da agregação das métricas. Sem isso, comparações ficam ambíguas. |
| **UNIQUE composto `(conexao_id, id_externo)`** | Permite UPSERT idempotente do sync (`ON CONFLICT (...) DO UPDATE`). |
| **FKs entre níveis = lógicas (não formais)** | Sync pode chegar fora de ordem (paginação inconsistente). FK formal travaria INSERT. Edge Function garante consistência eventual. |
| **`ON DELETE CASCADE` em `conexao_id`** | Cache é filho biológico da conexão. Re-sync trivial. Exceção registrada acima. |

### Estratégia híbrida pra métricas

Mistura colunas dedicadas (pras métricas top consultadas em toda interação) + `raw_data jsonb` (pro resto). Performance onde importa, flexibilidade onde compensa.

Critério: se Marcos consulta a métrica em **toda** análise → coluna dedicada com índice. Se é métrica obscura/ocasional → fica só em `raw_data`.

---

## Convenção de nomenclatura — chaves ponto-separadas

> Convenção firmada na Tarefa 2.9.

Pra tabelas chave-valor (hoje só `configuracoes`, futuras possíveis), as chaves seguem formato hierárquico ponto-separado:

```
categoria.modulo.subcategoria.item
```

### Exemplos

| Chave | Significado |
|---|---|
| `ui_labels.tarefa.status.fazendo` | Label visível pro status `fazendo` do kanban |
| `ui_labels.evento.tipo.reuniao` | Label do tipo de evento `reuniao` |
| `ai_defaults.modelo` | Modelo Anthropic padrão |
| `sistema.primeiro_setup_completo` | Flag interna de onboarding |
| `integracao.meta.token_alerta_dias` (hipotético) | Quantos dias antes alertar token Meta expirando |

### Razões

- **Lookup O(1)** por chave exata. `WHERE chave = '...'` em índice único é instantâneo.
- **Adicionar nova chave = 1 INSERT** (vs múltiplos em modelo normalizado com tabela `tipos_config`).
- **Convenção testada** em config files (Spring, .NET, Django settings, env vars). Padrão familiar.
- **Reordenar é rename.** Mudar componentes da hierarquia é UPDATE simples.

### Convenção das categorias-raiz

Lista crescente — REGRA 12 não amarra com CHECK. Conhecidas hoje:

- `ui_labels` — labels visuais customizáveis (substitui vocabulário interno na UI)
- `ai_defaults` — defaults dos agentes (modelo, temperatura)
- `sistema` — estado interno do app
- `integracao` — configurações de integrações futuras
- `preferencia` — preferências do Pedro

---

## Idempotência de `ALTER TABLE`

Toda tarefa que evolui schema (adicionar coluna, FK, índice em tabela existente) precisa ser **re-executável** sem erro. Padrões:

### Adicionar coluna

```sql
ALTER TABLE public.tarefas ADD COLUMN IF NOT EXISTS persona_id uuid;
```

`ADD COLUMN IF NOT EXISTS` desde Postgres 9.6. Default em todas as versões modernas do Supabase.

### Adicionar/alterar FK

`ADD CONSTRAINT IF NOT EXISTS` **não existe** pra FKs no Postgres. Usa o padrão drop+add:

```sql
ALTER TABLE public.tarefas DROP CONSTRAINT IF EXISTS fk_tarefas_agente;
ALTER TABLE public.tarefas
  ADD CONSTRAINT fk_tarefas_agente
  FOREIGN KEY (agente_id) REFERENCES public.agentes(id)
  ON DELETE SET NULL;
```

Idempotente sem `IF NOT EXISTS` direto. Funciona pra qualquer constraint (UNIQUE, CHECK, FK).

### Adicionar índice

```sql
CREATE INDEX IF NOT EXISTS idx_tarefas_agente
  ON public.tarefas (agente_id)
  WHERE agente_id IS NOT NULL;
```

`CREATE INDEX IF NOT EXISTS` desde Postgres 9.5.

### Adicionar trigger

```sql
DROP TRIGGER IF EXISTS trg_tarefas_updated_at ON public.tarefas;
CREATE TRIGGER trg_tarefas_updated_at
  BEFORE UPDATE ON public.tarefas
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
```

Mesmo padrão drop+add — `CREATE TRIGGER IF NOT EXISTS` não existe.

### Resumo: comandos idempotentes que usamos

| Operação | Comando |
|---|---|
| Adicionar coluna | `ADD COLUMN IF NOT EXISTS` |
| Adicionar FK/UNIQUE/CHECK | `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` |
| Criar índice | `CREATE INDEX IF NOT EXISTS` |
| Criar trigger | `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` |
| Criar/recriar função | `CREATE OR REPLACE FUNCTION` |
| Habilitar RLS | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (já idempotente — re-execução é no-op) |
| Criar policy | `DROP POLICY IF EXISTS` + `CREATE POLICY` |

Todo SQL do projeto deve ser re-executável sem erro. Pedro roda no Supabase Dashboard sem rollback automático — script frágil = risco real.

---

## Relacionado

- [[Tabela — entidades]]
- [[Tabela — tarefas]]
- [[Tabela — eventos]]
- [[Tabela — pastas]]
- [[Tabela — documentos]]
- [[Tabela — agentes]]
- [[Tabela — personas]]
- [[Tabela — chat_mensagens]]
- [[Tabela — chat_anexos]]
- [[Tabela — sitio_categorias]]
- [[Tabela — sitio_lancamentos]]
- [[Tabela — meta_credenciais]]
- [[Tabela — meta_conexoes]]
- [[Tabela — meta_campanhas_cache]]
- [[Tabela — meta_adsets_cache]]
- [[Tabela — meta_ads_cache]]
- [[Tabela — configuracoes]]
- [[Tabela — ideias]]
- [[CLAUDE.md]] — REGRA 5 (instância única Supabase), REGRA 12 (customização total)
