---
tipo: schema
tabela: chat_mensagens
fase: 2
tarefa: 2.6
criada_em: 2026-05-01
---

# Tabela `chat_mensagens`

[[Home]] > Banco de Dados > chat_mensagens

> **Coração do sistema.** Toda interação Pedro ↔ Assistente fica gravada aqui. É a memória persistente do cérebro único. Lista plana, com métricas completas de uso pra observabilidade.

---

## Schema

```sql
CREATE TABLE public.chat_mensagens (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  papel            text NOT NULL CHECK (papel IN ('user', 'assistant', 'system')),
  conteudo         text NOT NULL,
  entidade_id      uuid REFERENCES public.entidades(id) ON DELETE SET NULL,
  agente_id        uuid REFERENCES public.agentes(id)   ON DELETE SET NULL,
  persona_id      uuid REFERENCES public.personas(id)  ON DELETE SET NULL,
  modelo_usado     text,
  tokens_entrada   integer CHECK (tokens_entrada >= 0),
  tokens_saida     integer CHECK (tokens_saida   >= 0),
  custo_usd        numeric(10,6) CHECK (custo_usd >= 0),
  custo_brl        numeric(10,4) CHECK (custo_brl >= 0),
  latencia_ms      integer CHECK (latencia_ms >= 0),
  mensagem_pai_id  uuid REFERENCES public.chat_mensagens(id) ON DELETE SET NULL,
  erro             text,
  favorita         boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
```

### Colunas (18 no total)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK. |
| `papel` | `text` | `user`/`assistant`/`system` (mesmos termos da API Anthropic). |
| `conteudo` | `text` | Markdown permitido. |
| `entidade_id` | `uuid` | **Nullable** — chat geral é fora de qualquer entidade. SET NULL. |
| `agente_id` | `uuid` | Sempre Assistente nesta versão. SET NULL. |
| `persona_id` | `uuid` | Inclui Roteador (em mensagens `system` de classificação). SET NULL. |
| `modelo_usado` | `text` | Modelo que efetivamente respondeu — pode diferir de `agente.modelo` por causa do router. |
| `tokens_entrada` | `integer` | NULL pra mensagens `user`/`system`. |
| `tokens_saida` | `integer` | NULL pra mensagens `user`/`system`. |
| `custo_usd` | `numeric(10,6)` | Granularidade alta — chamadas custam frações de centavo. |
| `custo_brl` | `numeric(10,4)` | Convertido na hora da chamada (cotação muda). |
| `latencia_ms` | `integer` | Útil pra observabilidade de performance. |
| `mensagem_pai_id` | `uuid` | Self-reference. SET NULL. Permite cadeias user→assistant→user. |
| `erro` | `text` | Mensagem de erro se chamada falhou. |
| `favorita` | `boolean` | Pedro pode marcar pra reler. Indexado parcialmente. |
| `created_at` | `timestamptz` | Indexado DESC pra "últimas mensagens". |
| `updated_at` | `timestamptz` | Trigger. Raramente muda — só edição. |

---

## Por que lista plana (não threads)

Decisão arquitetural firmada na 2.6: cada mensagem é **uma linha plana** em `chat_mensagens`. Não há tabela `conversas` agrupando mensagens em threads. O "histórico" é montado no cliente filtrando por `entidade_id` + `created_at` + (opcionalmente) `persona_id`.

### Por quê

- **Coerência com "cérebro único".** O agente Assistente tem memória contínua. Threads sugerem isolamento ("essa conversa não sabe da outra") — exatamente o oposto do modelo.
- **Sem over-engineering.** Adicionar `conversa_id` exigiria UI pra criar/listar/deletar conversas, decisão de quando "começar conversa nova" (timeout? botão?), e migração futura quando virar irrelevante.
- **Filtragem flexível.** "Últimas 50 mensagens", "últimas 50 da CEDTEC", "últimas 50 com Marcela" — tudo é WHERE + ORDER. Sem precisar conceito de "conversa" no schema.
- **Reversível.** Se virar dor, `ALTER TABLE ADD COLUMN conversa_id uuid REFERENCES conversas(id) ON DELETE SET NULL` cobre. Schema atual não impede evolução.

A janela de contexto enviada ao modelo (últimas N mensagens) é decisão de runtime, não de schema. Edge Function decide quanto puxar.

---

## Os 3 papéis (`papel`)

Mesmos termos da API Anthropic — facilita serializar pra `messages: [{ role, content }, ...]` ao chamar o modelo:

| Papel | Quem cria | Conteúdo típico |
|---|---|---|
| `user` | Pedro | Mensagem que o Pedro envia. Sem métricas (`tokens_*`/`custo_*`/`latencia_ms` ficam NULL). |
| `assistant` | Edge Function (resposta do modelo) | Resposta da IA. Métricas todas preenchidas. |
| `system` | Edge Function (classificação interna) | Mensagens internas — ex.: registro da decisão do Roteador (`persona_id` aponta pra Roteador, `conteudo` é o JSON `{persona_slug, nivel_complexidade, razao}`). Útil pra debug e auditoria. |

### Exemplo de fluxo gravado

Quando Pedro envia "olha o CPL da semana e me diz se devo pausar":

```
1. INSERT papel=user      conteudo="olha o CPL..."  (entidade_id=cedtec opcional, métricas NULL)
2. Edge Function chama Roteador (Haiku)
3. INSERT papel=system    conteudo='{"persona_slug":"marcos","nivel_complexidade":"medio","razao":"CPL = Meta Ads = Marcos. medio = pede análise."}'
                          persona_id=<roteador.id>  modelo_usado=claude-haiku-4-5...
                          mensagem_pai_id=<id da mensagem 1>
4. Edge Function chama Sonnet com prompt = agente.prompt_base + persona Marcos
5. INSERT papel=assistant conteudo="CPL tá em R$ 92, acima do alvo de R$ 80..."
                          persona_id=<marcos.id>    modelo_usado=claude-sonnet-4-6
                          mensagem_pai_id=<id da mensagem 1>
                          tokens_entrada=2300 tokens_saida=180 custo_usd=0.015 custo_brl=0.082 latencia_ms=4500
```

A mensagem `system` (passo 3) NUNCA é mostrada na UI — fica só pra debug/auditoria. A UI filtra `WHERE papel != 'system'` quando renderiza histórico.

---

## Métricas — observabilidade futura

Cada chamada à IA grava 5 métricas:

- **`tokens_entrada`** — tokens enviados (system + histórico + mensagem nova).
- **`tokens_saida`** — tokens recebidos.
- **`custo_usd`** — calculado pela Edge Function usando tabela de preços do modelo (Haiku/Sonnet/Opus têm preços diferentes por 1M tokens input/output).
- **`custo_brl`** — `custo_usd × cotação` na hora da chamada. Cotação muda diariamente, capturada no momento.
- **`latencia_ms`** — tempo entre envio e resposta. Detecta degradação de performance da API ou do roteador.

### Análises que isso habilita (Fase 5+)

- "Quanto gastei com IA esse mês?" → `SUM(custo_brl) WHERE created_at >= ...`
- "Qual entidade consome mais tokens?" → `GROUP BY entidade_id`
- "Qual persona é mais cara?" → `GROUP BY persona_id` (Bruno tende a ser mais caro porque puxa Opus)
- "Roteador errou? Vou pagar Sonnet quando bastava Haiku?" → cruzar `persona_id` com `nivel_complexidade` da persona.
- "API tá lenta?" → `AVG(latencia_ms) BY date_trunc('hour', created_at)`

Métricas não são consumidas hoje — preparação pra dashboard de observabilidade quando virar prioridade.

---

## `mensagem_pai_id` — rastreio de cadeias

Self-reference opcional. Permite reconstruir "quem respondeu o quê":

```
user      "olha o CPL"               id=A   pai=NULL
system    {classificação Roteador}    id=B   pai=A
assistant "CPL em R$ 92..."           id=C   pai=A
user      "OK, pausa o conjunto X"    id=D   pai=C
assistant "Pausado."                   id=E   pai=D
```

Útil pra:
- UI de "respostas" (mostrar setinha `↳ resposta a:` em mensagens com pai).
- Debug ("essa resposta veio de qual pergunta?").
- Métricas de latência por cadeia ("quanto tempo da pergunta à resolução?").

`ON DELETE SET NULL` — apagar mãe não destrói filha (vira órfã com `pai=NULL`).

---

## Índices (6 ao todo)

```sql
CREATE INDEX idx_chat_papel     ON public.chat_mensagens (papel);
CREATE INDEX idx_chat_entidade  ON public.chat_mensagens (entidade_id)     WHERE entidade_id IS NOT NULL;
CREATE INDEX idx_chat_persona   ON public.chat_mensagens (persona_id)      WHERE persona_id IS NOT NULL;
CREATE INDEX idx_chat_pai       ON public.chat_mensagens (mensagem_pai_id) WHERE mensagem_pai_id IS NOT NULL;
CREATE INDEX idx_chat_created   ON public.chat_mensagens (created_at DESC);
CREATE INDEX idx_chat_favorita  ON public.chat_mensagens (favorita)        WHERE favorita = true;
```

| Índice | Pra quê |
|---|---|
| `idx_chat_papel` | UI filtra `WHERE papel != 'system'` em quase toda renderização. |
| `idx_chat_entidade` | Histórico por entidade. Parcial — chat geral (`entidade_id IS NULL`) não entra. |
| `idx_chat_persona` | "Tudo que a Marcela disse". Parcial. |
| `idx_chat_pai` | Reconstrução de cadeias. Parcial. |
| `idx_chat_created` | DESC porque query mais comum é "últimas N mensagens" (`ORDER BY created_at DESC LIMIT 50`). DESC evita scan reverso. |
| `idx_chat_favorita` | Lista de favoritas. Parcial — maioria das mensagens não é favorita. |

---

## Row Level Security

```sql
ALTER TABLE public.chat_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_full_access
  ON public.chat_mensagens
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

Padrão do projeto. Quando virar multi-user, ganha filtro por `auth.uid()` ou coluna `usuario_id`.

---

## Exemplos de query no front (JS)

```js
import { supabase } from '../core/supabase.js';
```

### Carregar últimas N mensagens da entidade X (sem `system`)

```js
async function historicoEntidade(entidadeId, limite = 50) {
  const { data, error } = await supabase
    .from('chat_mensagens')
    .select(`
      id, papel, conteudo, modelo_usado, custo_brl, latencia_ms, favorita, created_at,
      personas(slug, nome, icone, cor_hex)
    `)
    .eq('entidade_id', entidadeId)
    .neq('papel', 'system')
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data.reverse(); // re-ordena cronologicamente pra renderizar
}
```

### Chat geral (mensagens sem entidade)

```js
const { data } = await supabase
  .from('chat_mensagens')
  .select('*')
  .is('entidade_id', null)
  .neq('papel', 'system')
  .order('created_at', { ascending: false })
  .limit(50);
```

### Reconstruir cadeia a partir de uma mensagem

```js
async function cadeiaCompleta(mensagemId) {
  const cadeia = [];
  let cursor = mensagemId;
  while (cursor) {
    const { data } = await supabase
      .from('chat_mensagens')
      .select('id, papel, conteudo, mensagem_pai_id, created_at')
      .eq('id', cursor)
      .single();
    if (!data) break;
    cadeia.unshift(data);
    cursor = data.mensagem_pai_id;
  }
  return cadeia;
}
```

### Marcar como favorita

```js
await supabase
  .from('chat_mensagens')
  .update({ favorita: true })
  .eq('id', mensagemId);
```

### Custo do mês

```js
const inicioMes = new Date();
inicioMes.setDate(1);
inicioMes.setHours(0, 0, 0, 0);

const { data } = await supabase
  .from('chat_mensagens')
  .select('custo_brl')
  .gte('created_at', inicioMes.toISOString());

const total = data.reduce((sum, m) => sum + Number(m.custo_brl ?? 0), 0);
// total em BRL
```

---

## Conexões com outras tabelas

- **`entidades`**, **`agentes`**, **`personas`** — todas as 3 FKs com `ON DELETE SET NULL` (histórico sobrevive a deletes upstream).
- **`mensagem_pai_id`** — self-reference, SET NULL.
- **`chat_anexos`** referencia `chat_mensagens.id` com **`ON DELETE CASCADE`** (anexo sem mensagem é lixo). Detalhes em [[Tabela — chat_anexos]].

---

## Relacionado

- [[Tabela — chat_anexos]] — anexos das mensagens
- [[Tabela — agentes]] — quem responde
- [[Tabela — personas]] — qual tom (inclui Roteador)
- [[CONVENÇÕES]] — fuso, FKs, RLS
- [[VISAO.md]] — "interface primária = conversa"
