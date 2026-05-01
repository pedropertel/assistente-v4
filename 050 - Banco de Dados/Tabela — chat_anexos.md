---
tipo: schema
tabela: chat_anexos
fase: 2
tarefa: 2.6
criada_em: 2026-05-01
---

# Tabela `chat_anexos`

[[Home]] > Banco de Dados > chat_anexos

> Anexos das mensagens de chat (imagem/áudio/documento/vídeo). Múltiplos anexos por mensagem suportados via FK 1:N. **Imutável** (sem `updated_at`). **Única tabela do projeto com `ON DELETE CASCADE`** — exceção consciente registrada em [[CONVENÇÕES]].

---

## Schema

```sql
CREATE TABLE public.chat_anexos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem_id        uuid NOT NULL REFERENCES public.chat_mensagens(id) ON DELETE CASCADE,
  documento_id       uuid REFERENCES public.documentos(id) ON DELETE SET NULL,
  tipo               text NOT NULL CHECK (tipo IN ('imagem', 'audio', 'documento', 'video')),
  nome_original      text NOT NULL,
  tipo_mime          text NOT NULL,
  tamanho_bytes      bigint NOT NULL CHECK (tamanho_bytes > 0),
  storage_path       text NOT NULL UNIQUE,
  duracao_segundos   integer CHECK (duracao_segundos > 0),
  transcricao        text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
```

### Colunas (11 no total)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK. Base do `storage_path`. |
| `mensagem_id` | `uuid` | FK pra `chat_mensagens(id)`. **NOT NULL**. **`ON DELETE CASCADE`** ⚠️. |
| `documento_id` | `uuid` | FK opcional pra `documentos(id)`. Quando preenchida = anexo também salvo na biblioteca permanente. SET NULL. |
| `tipo` | `text` | `imagem` / `audio` / `documento` / `video`. Determina viewer e validações. |
| `nome_original` | `text` | Nome do arquivo como o usuário enviou (com extensão). |
| `tipo_mime` | `text` | Ex.: `image/jpeg`, `audio/mp4`. |
| `tamanho_bytes` | `bigint` | CHECK > 0. |
| `storage_path` | `text` | UNIQUE. Convenção: `chat_anexos/{id}.{extensao}` no bucket `documentos` compartilhado (ver exceção abaixo). |
| `duracao_segundos` | `integer` | NULL pra imagem/documento. Precisão de 1 segundo é suficiente pra UI. |
| `transcricao` | `text` | Transcrição automática pra áudio (Whisper ou similar). NULL se não foi transcrito ou não é áudio. |
| `created_at` | `timestamptz` | Carimbo de criação. **Sem `updated_at`** — anexos são imutáveis. |

---

## ⚠️ Exceção 1 — `ON DELETE CASCADE` em `mensagem_id`

**Única tabela do projeto com CASCADE.** O padrão geral (registrado em [[CONVENÇÕES]] → "FKs estruturais vs metadados") é `RESTRICT` pra estruturais e `SET NULL` pra metadados. Aqui é CASCADE consciente.

### Justificativa

- **Anexo é parte intrínseca da mensagem**, não associação. Não é "tarefa associada a um agente" (metadata) nem "tarefa pertencente a uma entidade" (estrutural). É "anexo da mensagem", filho biológico.
- **Anexo sem mensagem é lixo órfão.** `mensagem_id` é NOT NULL. Se a mensagem fosse apagada com RESTRICT, o anexo bloquearia o delete e exigiria limpeza manual. Se fosse SET NULL, o registro ficaria órfão num estado inválido (`mensagem_id` é NOT NULL — nem dá pra setar NULL).
- **Apagar mensagem deve apagar anexos junto** — UX esperada. Pedro apaga uma mensagem, anexos vão junto. Não há cenário onde anexo deva sobreviver à mensagem-pai.

### Consequência

`DELETE FROM chat_mensagens WHERE id = X` automaticamente apaga as linhas em `chat_anexos` com `mensagem_id = X`. **Não apaga o arquivo físico no Storage** — isso continua sendo responsabilidade do código que dispara o DELETE (mesmo padrão de `documentos`: a Edge Function/cleanup precisa chamar `supabase.storage.remove([storage_path])` antes/depois).

---

## ⚠️ Exceção 2 — `storage_path` com prefixo `chat_anexos/`

**Única exceção à convenção "path plano"** registrada em [[CONVENÇÕES]] → "Storage" (firmada na 2.4 com o bucket `documentos`).

### Convenção atual

```
storage_path = "chat_anexos/{id}.{extensao}"
```

Exemplo: `chat_anexos/seed-2-6-screenshot-primeiro-teste.png`.

### Justificativa

- **Anexos de chat são efêmeros/contextuais**, diferente dos documentos da biblioteca (`documentos`) que são intencionais e organizados em pastas.
- **Bucket compartilhado com `documentos`** (ambos no bucket `documentos` privado). Prefixo separa visualmente sem precisar criar bucket dedicado.
- **Facilita gerenciamento futuro** — se virar dor (ex.: bulk-delete de anexos antigos pra liberar espaço), basta `supabase.storage.remove(prefix='chat_anexos/')`.
- **Path físico ainda contém UUID** (`{id}.{extensao}`) — preserva a propriedade de "não colide" e "não depende de renomeação lógica".

### Quando reavaliar

Migrar pra **bucket dedicado** `chat_anexos` separado se acontecer um dos:

1. **Volume cresce muito** (gigabytes de áudio acumulado, por ex.) e dificultar listagem do bucket `documentos`.
2. **Policies precisam ser diferentes** (ex.: anexos com TTL automático, ou MIME types restritos só pra anexos).
3. **Custos de Storage** começarem a justificar separação por bucket.

Hoje nada disso é problema — fica como está. Quando precisar, migração é direta: `supabase.storage.move(...)` em batch + `UPDATE chat_anexos SET storage_path = REPLACE(storage_path, 'chat_anexos/', '')` simultaneamente.

---

## Os 4 tipos

| Tipo | MIMEs típicos | Casos de uso |
|---|---|---|
| `imagem` | `image/jpeg`, `image/png`, `image/webp`, `image/gif` | Print de gráfico Meta, foto de comprovante de fornecedor, screenshot pra mostrar problema. |
| `audio` | `audio/mp4`, `audio/webm`, `audio/ogg` | Pedro grava lançamento do Sítio por voz; transcrição vai em `transcricao`. |
| `documento` | `application/pdf`, `application/msword`, `text/plain` | Proposta comercial pra escola, contrato pra revisar, planilha de custos. |
| `video` | `video/mp4`, `video/quicktime` | Raro — vídeo curto (criativo de campanha pra revisar, vídeo do sítio). |

`tipo` é categoria visual (**ícone, viewer**); `tipo_mime` é o real (**parser**).

---

## Vínculo opcional com `documentos` — `documento_id`

`chat_anexos.documento_id` (FK opcional pra `documentos(id)`) registra que **o anexo também foi salvo na biblioteca permanente do Pedro**.

| `documento_id` | Significado |
|---|---|
| `NULL` | Anexo é só efêmero do chat — não está na biblioteca de documentos. Some quando a mensagem-pai for apagada (CASCADE). |
| `<uuid>` | Anexo também é um documento permanente da biblioteca. Se Pedro apagar a mensagem do chat, o documento sobrevive na biblioteca. Se Pedro apagar o documento da biblioteca, o anexo do chat fica com `documento_id = NULL` (SET NULL) e continua existindo. |

### Fluxo típico

1. Pedro envia áudio gravando lançamento do Sítio → cria `chat_anexos` com `documento_id = NULL`.
2. Alemão (persona) responde transcrevendo e classificando.
3. Pedro decide salvar a transcrição como documento na pasta `Sítio > Lançamentos`. Edge Function:
   - Cria registro em `documentos`.
   - Atualiza `chat_anexos.documento_id` apontando pro novo doc.
   - **Mesmo arquivo no Storage** — não duplica blob. (Ou copia se forem buckets diferentes — depende da convenção firmada na hora da implementação.)

---

## Áudio e `transcricao`

Quando `tipo = 'audio'`:

- **`duracao_segundos`** preenchido (a UI mostra "1:47" formatado).
- **`transcricao`** opcional — Edge Function (ou Whisper API) pode transcrever assincronamente após o upload e gravar aqui.
- **`tipo_mime`** geralmente `audio/mp4` ou `audio/webm` (formatos do MediaRecorder do browser).

A persona Alemão (do Sítio) é pensada pra esse fluxo: Pedro grava lançamento por voz, Alemão pega `transcricao` + extrai dados estruturados pra tabela `sitio_lancamentos` (Tarefa 2.7).

---

## Sem `updated_at`

Anexos são **imutáveis**. Decisão consciente:

- Conteúdo do arquivo não muda (mesmo `storage_path`).
- Metadados (`nome_original`, `tipo_mime`, `tamanho_bytes`, `duracao_segundos`) não mudam após upload.
- `transcricao` é a coisa mais "atualizável" (preenchida assíncronamente após o upload), mas vai ser preenchida **uma vez** e ficar — não há cenário de re-transcrição.

Sem `updated_at` = sem trigger = uma fonte de mutação a menos pra raciocinar.

Se algum dia surgir caso de uso de mutação (ex.: re-transcrição manual com modelo melhor), basta `ALTER TABLE ADD COLUMN updated_at` e criar trigger — schema atual não impede.

---

## Índices (3)

```sql
CREATE INDEX idx_chat_anexos_mensagem  ON public.chat_anexos (mensagem_id);
CREATE INDEX idx_chat_anexos_documento ON public.chat_anexos (documento_id) WHERE documento_id IS NOT NULL;
CREATE INDEX idx_chat_anexos_tipo      ON public.chat_anexos (tipo);
```

- `idx_chat_anexos_mensagem` — query principal: "anexos da mensagem X".
- `idx_chat_anexos_documento` — parcial. "Esse documento da biblioteca veio de qual chat?". Maioria dos anexos NÃO vira documento permanente.
- `idx_chat_anexos_tipo` — pra filtros tipo "todos os áudios" (lista de gravações).

---

## Row Level Security

```sql
ALTER TABLE public.chat_anexos ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_full_access
  ON public.chat_anexos
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

Padrão do projeto. Acesso ao **arquivo físico** continua gated pelas 4 policies do bucket `documentos` (firmadas na 2.4).

---

## Exemplos de query no front (JS)

```js
import { supabase } from '../core/supabase.js';
```

### Listar anexos de uma mensagem

```js
const { data } = await supabase
  .from('chat_anexos')
  .select('id, tipo, nome_original, tipo_mime, tamanho_bytes, storage_path, duracao_segundos, transcricao')
  .eq('mensagem_id', mensagemId)
  .order('created_at');
```

### Upload completo (mensagem + anexo + Storage)

```js
async function enviarMensagemComAnexo(textoMensagem, file, contexto) {
  // 1. Cria a mensagem do user
  const { data: msg, error: msgErr } = await supabase
    .from('chat_mensagens')
    .insert({
      papel: 'user',
      conteudo: textoMensagem,
      entidade_id: contexto.entidadeId,
    })
    .select()
    .single();
  if (msgErr) throw msgErr;

  // 2. Upload do arquivo pro Storage
  const id = crypto.randomUUID();
  const extensao = file.name.split('.').pop().toLowerCase();
  const storagePath = `chat_anexos/${id}.${extensao}`;

  const { error: upErr } = await supabase.storage
    .from('documentos')
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (upErr) {
    // rollback da mensagem? ou deixa ela sem anexo? depende da UX
    throw upErr;
  }

  // 3. INSERT do anexo apontando pra mensagem
  const tipo = inferirTipo(file.type); // 'imagem'|'audio'|'documento'|'video'
  const { data: anexo, error: anxErr } = await supabase
    .from('chat_anexos')
    .insert({
      id,
      mensagem_id: msg.id,
      tipo,
      nome_original: file.name,
      tipo_mime: file.type,
      tamanho_bytes: file.size,
      storage_path: storagePath,
    })
    .select()
    .single();
  if (anxErr) {
    await supabase.storage.from('documentos').remove([storagePath]);
    throw anxErr;
  }

  return { mensagem: msg, anexo };
}
```

### Apagar mensagem (CASCADE remove anexos automaticamente)

```js
// Importante: pega os anexos ANTES de apagar a mensagem,
// pra remover os arquivos físicos do Storage.
const { data: anexos } = await supabase
  .from('chat_anexos')
  .select('storage_path')
  .eq('mensagem_id', mensagemId);

if (anexos?.length) {
  await supabase.storage.from('documentos').remove(anexos.map(a => a.storage_path));
}

// Agora apaga a mensagem — CASCADE limpa chat_anexos automaticamente.
await supabase.from('chat_mensagens').delete().eq('id', mensagemId);
```

### Salvar anexo na biblioteca permanente

```js
// Cria documento na biblioteca apontando pro mesmo arquivo
const { data: doc } = await supabase.from('documentos').insert({
  entidade_id: entidadeId,
  pasta_id: pastaId,
  nome: anexo.nome_original.replace(/\.[^.]+$/, ''),
  tipo_mime: anexo.tipo_mime,
  extensao: anexo.nome_original.split('.').pop(),
  tamanho_bytes: anexo.tamanho_bytes,
  storage_path: anexo.storage_path,   // mesmo path
  origem: 'chat',
}).select().single();

// Vincula o anexo ao documento criado
await supabase
  .from('chat_anexos')
  .update({ documento_id: doc.id })
  .eq('id', anexo.id);
```

---

## Relacionado

- [[Tabela — chat_mensagens]] — mensagem-pai
- [[Tabela — documentos]] — vínculo opcional via `documento_id`
- [[CONVENÇÕES]] — exceções CASCADE e path com prefixo registradas
