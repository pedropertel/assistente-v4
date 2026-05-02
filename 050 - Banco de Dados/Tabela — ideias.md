---
tipo: schema
tabela: ideias
fase: 2
tarefa: 2.10 (bônus)
criada_em: 2026-05-01
---

# Tabela `ideias`

[[Home]] > Banco de Dados > ideias

> Captura rápida de ideias do Pedro durante o dia. **Marina (persona)** refina automaticamente: título, tags, categoria, próxima ação sugerida. Schema isolado (Desenho A) — conversão em tarefa/evento fica pra Fase 4.

---

## Schema

```sql
CREATE TABLE public.ideias (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo                   text NOT NULL,
  conteudo                 text NOT NULL,
  transcricao_original     text,
  tags                     text[] NOT NULL DEFAULT ARRAY[]::text[],
  entidade_id              uuid REFERENCES public.entidades(id)        ON DELETE SET NULL,
  categoria_pessoal        text,
  proxima_acao_sugerida    text,
  proxima_acao_aceita      boolean NOT NULL DEFAULT false,
  status                   text NOT NULL DEFAULT 'capturada'
                           CHECK (status IN ('capturada', 'refinada', 'arquivada', 'convertida')),
  favorita                 boolean NOT NULL DEFAULT false,
  mensagem_origem_id       uuid REFERENCES public.chat_mensagens(id)   ON DELETE SET NULL,
  agente_id                uuid REFERENCES public.agentes(id)          ON DELETE SET NULL,
  persona_id               uuid REFERENCES public.personas(id)         ON DELETE SET NULL,
  origem                   text NOT NULL DEFAULT 'manual'
                           CHECK (origem IN ('manual', 'chat', 'voz', 'sistema')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
```

### Colunas (17 no total)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK. |
| `titulo` | `text` | Sugerido pela Marina (~60 chars), editável. Sem CHECK — REGRA 12. |
| `conteudo` | `text` | Markdown refinado (ou texto puro quando `manual`). |
| `transcricao_original` | `text` | Bruto antes da Marina refinar. Debug de parsing. |
| `tags` | `text[]` | Lowercase sem acento, sugeridas pela Marina. **GIN index**. |
| `entidade_id` | `uuid` | FK opcional pra `entidades`. NULL = ambíguo/transversal/pessoal. SET NULL. |
| `categoria_pessoal` | `text` | Texto livre (ex: "produto", "experimento"). Diferente de `entidade_id`. |
| `proxima_acao_sugerida` | `text` | Marina propõe sem pressionar. |
| `proxima_acao_aceita` | `boolean` | Pedro endossa. Pode triggerar tarefa numa Fase futura. |
| `status` | `text` | Workflow: `capturada → refinada → convertida/arquivada`. CHECK fixo. |
| `favorita` | `boolean` | Ideia-tesouro. Indexado parcial. |
| `mensagem_origem_id` | `uuid` | FK opcional pra `chat_mensagens`. SET NULL. Rastreia voz→ideia. |
| `agente_id` | `uuid` | Geralmente Assistente. SET NULL. |
| `persona_id` | `uuid` | Geralmente Marina. SET NULL. |
| `origem` | `text` | `manual/chat/voz/sistema`. CHECK fixo. |
| `created_at` | `timestamptz` | Timeline padrão. Indexado DESC. |
| `updated_at` | `timestamptz` | Trigger. |

---

## Por que Desenho A (isolada) — não C (pré-tudo)

Considerei 3 desenhos:

- **A — Isolada (escolhido):** tabela `ideias` própria. Conversão em tarefa/evento/doc fica pra Fase 4 via `status='convertida'` + ação manual.
- **B — Filha de tarefas:** ideia = tarefa especial com `tipo='ideia'`. Reuso máximo, mas mistura semântica (ideia em maturação ≠ tarefa pendente).
- **C — Pré-tudo:** schema com FKs pra todas as conversões possíveis (`convertida_em_tarefa_id`, `convertida_em_evento_id`, `convertida_em_doc_id`). Flexível, mas over-engineering pra MVP.

**A vence porque:**
- Modo mental "ideia" é diferente de "tarefa" — querer separar visualmente e por workflow é legítimo.
- `tags` + `entidade_id` + `proxima_acao_sugerida` já dão tudo que a Fase 4 precisa pra "converter".
- Schema permite **evoluir pra C** sem quebra: `ALTER TABLE ADD COLUMN convertida_em_tarefa_id uuid REFERENCES tarefas(id) ON DELETE SET NULL` quando virar dor real.

Simplicidade > flexibilidade pra MVP.

---

## Marina — persona padrão

Marina é a **6ª persona** do projeto (5 reais + Roteador interno). Adicionada na 2.10 junto com esta tabela.

| Atributo | Valor |
|---|---|
| `slug` | `marina` |
| `papel` | Curadora de Ideias |
| `entidades_alvo` | `'{}'` (transversal — igual Marcela) |
| `nivel_complexidade` | `medio` (Sonnet 4.6 via router pattern) |
| `interno` | `false` (Pedro vê na lista de personas) |
| `ordem` | `5` |

**Postura:**
- Escuta sem interromper.
- Refina texto bruto em markdown limpo.
- Propõe título, tags, categoria, próxima ação.
- **NÃO pressiona** pra ideia virar ação imediatamente — algumas ideias maturam dias/semanas.
- **NÃO julga** qualidade da ideia — toda ideia capturada tem valor.

Detalhes completos em [[Tabela — personas]] → seção "Marina".

---

## Caminho principal: voz → Marina refina → ideia estruturada

Mesmo padrão de Alemão→`sitio_lancamentos`:

```
Pedro grava áudio com uma ideia
        │
        ▼ (chat com persona Marina ativa)
┌──────────────────────────────────────────────────┐
│ Edge Function chat-claude (Fase 3):              │
│ 1. Recebe áudio + cria chat_anexos (tipo=audio)  │
│ 2. Whisper transcreve → grava transcricao        │
│ 3. Roteador classifica: persona=marina,          │
│    nivel=medio → modelo Sonnet                   │
│ 4. Marina recebe a transcrição e devolve JSON:   │
│    { titulo, conteudo, tags,                     │
│      categoria_sugerida, proxima_acao_sugerida } │
│ 5. Cria public.ideias com:                       │
│    - origem = 'voz'                              │
│    - persona_id = <marina>                       │
│    - mensagem_origem_id = <chat_mensagens.id>    │
│    - transcricao_original = <texto bruto>        │
│    - status = 'refinada'                         │
│ 6. Confirma com Pedro: "Anotei: '<título>' com   │
│    tags X, Y. Próxima ação sugerida: ... OK?"    │
└──────────────────────────────────────────────────┘
```

### Por que rastreio voz→ideia

`transcricao_original` + `mensagem_origem_id` permitem:

- **Debug de refinamento.** Se Marina entendeu errado o nome de uma empresa ou inverteu o sentido, `transcricao_original` mostra o que Pedro realmente disse.
- **Aprendizado futuro.** Cruzar transcrição com correções manuais pra melhorar prompt da Marina.
- **Auditoria.** Pedro pode voltar à mensagem original 6 meses depois pra entender contexto.

---

## Workflow `status`

```
                  ┌─────────────┐
                  │  capturada  │  ← input bruto, sem refinamento
                  └──────┬──────┘
                         │ Marina processa
                         ▼
                  ┌─────────────┐
                  │  refinada   │  ← título, tags, categoria, próxima ação
                  └──────┬──────┘
                         │
                ┌────────┴────────┐
                ▼                 ▼
        ┌─────────────┐   ┌─────────────┐
        │ convertida  │   │  arquivada  │  ← soft-delete
        │ (virou      │   │ (descartada │
        │  tarefa/    │   │  ou perdeu  │
        │  evento)    │   │  relevância)│
        └─────────────┘   └─────────────┘
```

- **`capturada`** = input bruto (Pedro digitou direto, ou voz ainda não transcrita).
- **`refinada`** = Marina processou — pronto pra revisão do Pedro.
- **`convertida`** = virou tarefa/evento/doc na Fase 4. Ideia preservada como histórico (não apaga).
- **`arquivada`** = soft-delete. Some das listagens padrão (índice parcial `WHERE status <> 'arquivada'`).

CHECK fixo no banco; labels visuais customizáveis via `configuracoes` (`ui_labels.ideia.status.*` — 4 seeds adicionados na parte 3 desta tarefa).

---

## Por que `tags text[]` (vs tabela normalizada)

Mesma escolha de [[Tabela — documentos]] (`documentos.tags`):

- Volume baixo por ideia (2-4 tags típicas).
- Tags são livres, não normalizadas globalmente.
- GIN index cobre busca por tag (`WHERE tags @> ARRAY['cedtec']`).
- 1 tabela em vez de 3.

Se Pedro acumular muitas variações que precisem renomear em massa, evolui pra modelo normalizado (`ALTER TABLE` + migração).

Padrão consolidado em `CONVENÇÕES.md`.

---

## Por que `proxima_acao_aceita boolean` (vs FK pra tarefa criada)

`boolean` reflete "Pedro endossou a próxima ação" sem amarrar conversão obrigatória. Caminhos possíveis:

1. Aceita = `true` → Pedro mentalmente decide e age sem registrar formalmente. Ideia continua viva.
2. Aceita = `true` + Pedro clica "converter em tarefa" na UI → cria `tarefas`, marca `status='convertida'` aqui. Opcionalmente popular FK nova `tarefa_id` via `ALTER TABLE` se virar útil.

Schema isolado (Desenho A) deixa todas as opções abertas. FK pra tarefa seria acoplamento prematuro.

---

## Idempotência por `(titulo, created_at::date)` — limitação

Chave composta funciona pra seed inicial:
- Seed roda 1× por dia no máximo.
- Títulos distintos não colidem entre si.
- Re-execução no mesmo dia → não duplica.

**Limitações conhecidas:**

1. **Re-rodar em outro dia** duplicaria (`created_at::date` muda). Mitigação: rodar seed só 1 vez na vida do projeto.
2. **Pedro cria ideia com mesmo título no mesmo dia** → seed pula achando ser duplicata. Improvável, mas possível.
3. **Em produção, ideias duplicadas são caso de uso real** (memória recente, refinamento incremental). Por isso **não há UNIQUE** na tabela.

Idempotência é só pro seed. Produção aceita títulos repetidos.

---

## Os 7 índices

```sql
CREATE INDEX idx_ideias_entidade  ON public.ideias (entidade_id)        WHERE entidade_id IS NOT NULL;
CREATE INDEX idx_ideias_status    ON public.ideias (status)             WHERE status <> 'arquivada';
CREATE INDEX idx_ideias_favorita  ON public.ideias (favorita)           WHERE favorita = true;
CREATE INDEX idx_ideias_tags      ON public.ideias USING GIN (tags);
CREATE INDEX idx_ideias_persona   ON public.ideias (persona_id)         WHERE persona_id IS NOT NULL;
CREATE INDEX idx_ideias_created   ON public.ideias (created_at DESC);
CREATE INDEX idx_ideias_mensagem  ON public.ideias (mensagem_origem_id) WHERE mensagem_origem_id IS NOT NULL;
```

| Índice | Pra quê |
|---|---|
| `idx_ideias_entidade` | "Ideias da CEDTEC". Parcial — transversais não entram. |
| `idx_ideias_status` | UI esconde arquivadas. Parcial. |
| `idx_ideias_favorita` | "Minhas ideias-tesouro". Parcial. |
| `idx_ideias_tags` | GIN — `WHERE tags @> ARRAY['marketing']`. |
| `idx_ideias_persona` | "Ideias da Marina vs criadas direto". Parcial. |
| `idx_ideias_created DESC` | Timeline padrão da UI. |
| `idx_ideias_mensagem` | Rastreio voz→ideia. Parcial. |

---

## Row Level Security

```sql
ALTER TABLE public.ideias ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_full_access
  ON public.ideias
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

Padrão.

---

## 3 seeds de exemplo

| Cenário | Título | Entidade | Status | Origem | Persona |
|---|---|---|---|---|---|
| Voz típica | Curso modular de soldagem industrial | CEDTEC | refinada | voz | Marina |
| Transversal | Newsletter semanal pra clientes de todas empresas | (transversal) | refinada | chat | Marina |
| Pessoal bruto | Aprender italiano pelo Duolingo | Pessoal | capturada | manual | — |

Refletem 3 estados-padrão: refinada com voz, refinada de chat, capturada bruta sem persona.

---

## Exemplos JS

```js
import { supabase } from '../core/supabase.js';
```

### Capturar ideia por voz (Edge Function chama Marina)

(Pseudo-código — Edge Function da Fase 3 faz, não o front.)

```ts
async function capturarIdeiaPorVoz({ chatMensagemId, transcricao, refinada }) {
  // refinada = JSON que Marina devolveu
  return supabase.from('ideias').insert({
    titulo: refinada.titulo,
    conteudo: refinada.conteudo,
    transcricao_original: transcricao,
    tags: refinada.tags,
    entidade_id: refinada.categoria_sugerida
      ? (await getEntidadeIdBySlug(refinada.categoria_sugerida))
      : null,
    proxima_acao_sugerida: refinada.proxima_acao_sugerida,
    status: 'refinada',
    origem: 'voz',
    mensagem_origem_id: chatMensagemId,
    persona_id: marinaId,
    agente_id: assistenteId,
  }).select().single();
}
```

### Listar ideias de uma entidade ordenadas por data

```js
const { data } = await supabase
  .from('ideias')
  .select(`
    id, titulo, conteudo, tags, status, favorita, created_at,
    proxima_acao_sugerida, proxima_acao_aceita,
    entidades(nome, icone),
    personas(nome, icone)
  `)
  .eq('entidade_id', cedtecId)
  .neq('status', 'arquivada')
  .order('created_at', { ascending: false });
```

### Marcar como favorita

```js
await supabase
  .from('ideias')
  .update({ favorita: true })
  .eq('id', ideiaId);
```

### Buscar por tag (usa GIN index)

```js
const { data } = await supabase
  .from('ideias')
  .select('*')
  .contains('tags', ['marketing'])
  .neq('status', 'arquivada')
  .order('created_at', { ascending: false });
```

### Arquivar (soft-delete via status)

```js
await supabase
  .from('ideias')
  .update({ status: 'arquivada' })
  .eq('id', ideiaId);
// Some das listagens padrão; histórico preserva.
```

### Marcar próxima ação como aceita (Pedro endossa)

```js
await supabase
  .from('ideias')
  .update({ proxima_acao_aceita: true })
  .eq('id', ideiaId);
// Pedro endossou a sugestão da Marina, mas não criou tarefa formal ainda.
// UI pode mostrar "✓ Próxima ação aceita" + botão "Converter em tarefa".
```

---

## Conexões com outras tabelas

- `entidades.id` (SET NULL) — qual empresa é a ideia.
- `chat_mensagens.id` (SET NULL) — origem de voz/chat.
- `agentes.id` (SET NULL) — quem ajudou a registrar.
- `personas.id` (SET NULL) — geralmente Marina.

---

## Relacionado

- [[Tabela — personas]] — Marina é a persona deste módulo
- [[Tabela — chat_mensagens]] — origem de voz/chat
- [[Tabela — sitio_lancamentos]] — irmã (mesmo padrão de rastreio voz→registro)
- [[Tabela — documentos]] — mesmo padrão de `tags text[]` com GIN
- [[CONVENÇÕES]] — fuso, soft-delete via status, REGRA 12
