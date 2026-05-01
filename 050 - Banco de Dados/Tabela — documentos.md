---
tipo: schema
tabela: documentos
fase: 2
tarefa: 2.4
criada_em: 2026-05-01
---

# Tabela `documentos`

[[Home]] > Banco de Dados > documentos

> **Metadados** dos arquivos do Pedro. O **arquivo físico** vive no **Supabase Storage** (bucket `documentos`, privado). Cada documento pertence a uma entidade e (opcionalmente) a uma pasta da MESMA entidade.

---

## Schema

```sql
CREATE TABLE public.documentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_id     uuid NOT NULL REFERENCES public.entidades(id) ON DELETE RESTRICT,
  pasta_id        uuid REFERENCES public.pastas(id) ON DELETE RESTRICT,
  nome            text NOT NULL,
  descricao       text,
  tags            text[] NOT NULL DEFAULT '{}',
  tipo_mime       text NOT NULL,
  extensao        text NOT NULL,
  tamanho_bytes   bigint NOT NULL CHECK (tamanho_bytes > 0),
  storage_path    text NOT NULL UNIQUE,
  favorito        boolean NOT NULL DEFAULT false,
  agente_id       uuid,                 -- FK adicionada na Tarefa 2.5
  origem          text NOT NULL DEFAULT 'manual'
                  CHECK (origem IN ('manual', 'chat', 'sistema', 'email', 'whatsapp')),
  arquivado       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

### Colunas (16 no total)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK. **Também usado como base do `storage_path`**. |
| `entidade_id` | `uuid` | FK pra `entidades(id)`. **NOT NULL**. RESTRICT. |
| `pasta_id` | `uuid` | FK pra `pastas(id)`. **NULL = solto na entidade**. RESTRICT. |
| `nome` | `text` | Nome de exibição, **sem extensão**. Pode ter acentos e espaços. |
| `descricao` | `text` | Markdown opcional. |
| `tags` | `text[]` | Array de tags. Default `'{}'`. **Indexado via GIN** pra busca rápida. |
| `tipo_mime` | `text` | Ex.: `application/pdf`, `image/jpeg`. UI usa pra escolher viewer. |
| `extensao` | `text` | **Sem ponto** (`pdf`, não `.pdf`). Usada no `storage_path` e ícone. |
| `tamanho_bytes` | `bigint` | CHECK > 0. `bigint` cobre até 9 EB (vs `integer` que limita a ~2 GB). |
| `storage_path` | `text` | Path no bucket. **UNIQUE**. Convenção: `{id}.{extensao}`. |
| `favorito` | `boolean` | Marcado pelo Pedro. Indexado parcialmente. |
| `agente_id` | `uuid` | Sem FK até Tarefa 2.5. |
| `origem` | `text` | 5 valores via CHECK — ver tabela abaixo. |
| `arquivado` | `boolean` | Soft-archive — esconde da listagem **mas não apaga arquivo do Storage**. |
| `created_at` | `timestamptz` | Criação. |
| `updated_at` | `timestamptz` | Atualizado via trigger. |

---

## Convenção de `storage_path` — plano, baseado em ID

```
storage_path = "{documento.id}.{documento.extensao}"
```

Exemplos:

```
b3c4d2e1-77a8-4f5b-9c0d-1234567890ab.pdf
98765432-aaaa-bbbb-cccc-ddddddddddee.jpg
```

**Sem replicar a hierarquia lógica de pastas no path físico.** O bucket Storage é totalmente plano.

### Por que plano?

1. **Independência de renomeação lógica.** Se o Pedro renomear uma pasta de "Marketing" pra "Mídia paga", o arquivo físico não precisa ser movido. O metadado muda, o Storage não.
2. **Sem colisões.** UUID é único por design — nenhuma chance de duas pastas terem arquivos com mesmo nome no Storage.
3. **Performance.** Listar bucket plano é O(1) por chamada à API; bucket profundo exige walk recursivo.
4. **Segurança via metadata, não via path.** Quem decide se o usuário pode ver o arquivo é a policy + a tabela `documentos`, não a estrutura de pastas no Storage. Path obscuro (`{uuid}.pdf`) também não é convite a brute force.
5. **Migração trivial.** Se um dia o Storage mudar de provedor, mover 1.000 arquivos planos é mais simples do que reproduzir uma árvore arbitrária.

A organização "lógica" (pastas, tags, favorito) vive **só** no metadado da tabela. O Storage é um saco grande de blobs identificados por UUID.

---

## Storage — bucket `documentos`

| Configuração | Valor |
|---|---|
| Nome | `documentos` |
| Public | **OFF** (privado) |
| File size limit | 52 428 800 bytes (50 MB) |
| Allowed MIME types | (vazio — aceita qualquer tipo) |

### As 4 policies do Storage

Configuradas no nível do bucket, **restritas a `bucket_id = 'documentos'` e à role `authenticated`**:

| Policy | Operação | Quem pode |
|---|---|---|
| `upload_autenticado` | INSERT | Usuário autenticado pode subir arquivo (precisa do `INSERT` pra `supabase.storage.from('documentos').upload(...)`) |
| `leitura_autenticado` | SELECT | Usuário autenticado pode listar e baixar (necessário pra `download` ou `createSignedUrl`) |
| `update_autenticado` | UPDATE | Usuário autenticado pode sobrescrever (`upsert: true` ou `update`) |
| `delete_autenticado` | DELETE | Usuário autenticado pode apagar (`remove`) |

> **Origem das policies:** já existiam no Supabase, herdadas do projeto antigo, com configuração correta. Confirmadas e mantidas. Nenhuma policy nova foi criada na Tarefa 2.4.

### Acesso pelo front

Como o bucket é privado, **não há URL pública**. O app usa **URLs assinadas** com TTL:

```js
const { data, error } = await supabase
  .storage
  .from('documentos')
  .createSignedUrl(documento.storage_path, 60 * 60); // 1 hora
// data.signedUrl pode ser usado em <img src> ou <a href>
```

Quando o TTL expira, o app gera uma nova URL.

---

## Trigger de coerência — pasta deve ser da mesma entidade

```sql
CREATE OR REPLACE FUNCTION public.validar_documento_pasta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  pasta_entidade uuid;
BEGIN
  IF NEW.pasta_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT entidade_id INTO pasta_entidade
  FROM public.pastas
  WHERE id = NEW.pasta_id;

  IF pasta_entidade IS NULL THEN
    RAISE EXCEPTION 'Pasta % não encontrada', NEW.pasta_id;
  END IF;

  IF pasta_entidade <> NEW.entidade_id THEN
    RAISE EXCEPTION 'Documento deve estar em pasta da mesma entidade (esperado %, recebido %)',
      pasta_entidade, NEW.entidade_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_documentos_validar
  BEFORE INSERT OR UPDATE OF pasta_id, entidade_id ON public.documentos
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_documento_pasta();
```

Mesmo padrão de [[Tabela — pastas]]: `BEFORE INSERT OR UPDATE OF (pasta_id, entidade_id)` só dispara nas mudanças relevantes.

Trigger genérico de `updated_at` reusado da Tarefa 2.1.

---

## Os 5 valores de `origem`

| Origem | Significado |
|---|---|
| `manual` | Pedro fez upload manualmente pelo app. Default. |
| `chat` | Salvou um anexo enviado durante uma conversa com agente. |
| `sistema` | Gerado automaticamente (ex.: backup de relatório de campanha). |
| `email` | Marcela (Fase 3) salvou anexo de email do Pedro. |
| `whatsapp` | Marcela salvou anexo de WhatsApp. |

**Sem `voz`** — não se envia documento por voz. **Não tem `google_calendar`** — documentos não vêm do Google Calendar (só eventos vêm).

---

## Índices

```sql
CREATE INDEX idx_documentos_entidade  ON public.documentos (entidade_id);
CREATE INDEX idx_documentos_pasta     ON public.documentos (pasta_id);
CREATE INDEX idx_documentos_favorito  ON public.documentos (favorito) WHERE favorito = true;
CREATE INDEX idx_documentos_tags      ON public.documentos USING GIN (tags);
CREATE INDEX idx_documentos_arquivado ON public.documentos (arquivado) WHERE arquivado = false;
```

- **GIN em `tags`**: índice especializado pra arrays/JSONB. Suporta operadores `@>` (contém), `&&` (overlap). B-tree não funciona pra arrays.
- **Parciais em `favorito` e `arquivado`**: maioria das linhas vai pro lado oposto do filtro. Índices parciais ficam 5–20× menores.
- **Sem CHECK em `tipo_mime`**: deixar aberto. Validação de MIMEs aceitos fica na borda (UI/upload), não no schema.

---

## Row Level Security

```sql
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_full_access
  ON public.documentos
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

Padrão do projeto. **Importante: essa policy é sobre a tabela `documentos`** (metadados). O acesso ao **arquivo físico** é gated pelas 4 policies do Storage descritas acima.

---

## Exemplo JS — fluxo completo: upload → INSERT → download

```js
import { supabase } from '../core/supabase.js';

// 1. Pedro escolhe um arquivo (ex.: input file)
async function uploadDocumento(file, entidadeId, pastaId = null) {
  // 1a. Gera id e calcula extensão
  const id = crypto.randomUUID();
  const extensao = file.name.split('.').pop().toLowerCase();
  const nome = file.name.replace(/\.[^.]+$/, '');
  const storagePath = `${id}.${extensao}`;

  // 1b. Upload pro Storage
  const { error: upErr } = await supabase
    .storage
    .from('documentos')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });
  if (upErr) throw upErr;

  // 1c. INSERT do metadado na tabela
  const { data, error: insErr } = await supabase
    .from('documentos')
    .insert({
      id,
      entidade_id: entidadeId,
      pasta_id: pastaId,
      nome,
      tipo_mime: file.type,
      extensao,
      tamanho_bytes: file.size,
      storage_path: storagePath,
    })
    .select()
    .single();
  if (insErr) {
    // Rollback do Storage caso o INSERT falhe
    await supabase.storage.from('documentos').remove([storagePath]);
    throw insErr;
  }

  return data;
}

// 2. Listar documentos de uma pasta
async function listarPasta(pastaId) {
  return supabase
    .from('documentos')
    .select('id, nome, extensao, tamanho_bytes, tags, favorito, created_at')
    .eq('pasta_id', pastaId)
    .eq('arquivado', false)
    .order('favorito', { ascending: false })
    .order('nome');
}

// 3. Gerar URL assinada pra abrir/baixar
async function urlAssinada(documento, ttlSeg = 3600) {
  const { data, error } = await supabase
    .storage
    .from('documentos')
    .createSignedUrl(documento.storage_path, ttlSeg);
  if (error) throw error;
  return data.signedUrl;
}

// 4. Apagar documento (Storage + tabela)
async function apagarDocumento(documento) {
  await supabase.storage.from('documentos').remove([documento.storage_path]);
  await supabase.from('documentos').delete().eq('id', documento.id);
}

// 5. Buscar por tag
async function buscarPorTag(tag) {
  return supabase
    .from('documentos')
    .select('*')
    .contains('tags', [tag])  // usa o índice GIN
    .eq('arquivado', false);
}
```

**Atenção pra ordem do upload**: arquivo primeiro, metadado depois. Se o upload falha, nada vai pra tabela. Se o INSERT falha, o arquivo é removido do Storage (rollback manual). Sem rollback, ficaria arquivo "órfão" no bucket.

---

## Pendência de schema

### `agente_id` ainda não tem FK

Vai virar FK na **Tarefa 2.5**:

```sql
ALTER TABLE public.documentos
  ADD CONSTRAINT fk_documentos_agente
  FOREIGN KEY (agente_id) REFERENCES public.agentes(id)
  ON DELETE SET NULL;
```

---

## Relacionado

- [[CONVENÇÕES]] — fuso, idempotência, FKs, RLS, naming, **Storage**
- [[Tabela — pastas]] — referencia hierarquia de pastas
- [[Tabela — entidades]] — FK obrigatória
- [[Backlog — Tarefas Pequenas]] — Tarefa 2.4 (✅), 2.5 (vai adicionar a FK do `agente_id`)
