---
tipo: schema
tabela: configuracoes
fase: 2
tarefa: 2.9
criada_em: 2026-05-01
---

# Tabela `configuracoes`

[[Home]] > Banco de Dados > configuracoes

> **Chave-valor genérica do sistema.** Liga pontas soltas: customização visual de vocabulário interno (REGRA 12 + 2.6.1), defaults de IA, estado interno, integrações futuras, preferências do Pedro. **Última tabela da Fase 2.**

---

## Schema

```sql
CREATE TABLE public.configuracoes (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave                    text NOT NULL UNIQUE,
  valor                    jsonb NOT NULL,
  categoria                text NOT NULL,
  descricao                text,
  editavel_por_usuario     boolean NOT NULL DEFAULT true,
  valor_default            jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
```

### Colunas (9 no total)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK. |
| `chave` | `text` | UNIQUE. Ponto-separada (`ui_labels.tarefa.status.fazendo`). |
| `valor` | `jsonb` | Suporta string/number/boolean/object/array. |
| `categoria` | `text` | Alta-classificação. **Sem CHECK** — REGRA 12, lista cresce. |
| `descricao` | `text` | Hint na UI de configurações. |
| `editavel_por_usuario` | `boolean` | `false` esconde da UI (configs internas). |
| `valor_default` | `jsonb` | Pra botão "Restaurar padrão". |
| `created_at` | `timestamptz` | Criação. |
| `updated_at` | `timestamptz` | Trigger — registra quando Pedro mudou. |

---

## Por que chave-valor genérico (vs tabelas específicas)

Modelos alternativos considerados:

- **1 tabela por tipo de config** (`tabela_ui_labels`, `tabela_ai_defaults`, `tabela_sistema`) — cada com schema dedicado.
- **Tabela normalizada com FK pra "tipos de config"** (`config_types` + `configuracoes`).

Rejeitei ambos:

- **Adicionar config nova vira DDL** no modelo "1 tabela por tipo". Cada categoria nova exige `CREATE TABLE` + migração + redeploy.
- **Lookup vira JOIN** no modelo normalizado (3 condições pra encontrar 1 valor).
- **Schema chave-valor cobre 100% dos casos** com 1 tabela, 1 índice, 1 lookup O(1).

Trade-off: schema "frouxo" (sem garantia de tipo do `valor` por categoria). Aceitável — `jsonb` cobre todos os tipos, e o uso é controlado pelo código que lê (cada lugar sabe o tipo esperado).

---

## Convenção de nomenclatura — ponto-separado

Hierarquia ponto-separada, do geral pro específico:

```
categoria.modulo.subcategoria.item
```

Exemplos atuais:

| Chave | O que é |
|---|---|
| `ui_labels.tarefa.status.fazendo` | Label visível pro status `fazendo` do kanban |
| `ui_labels.evento.tipo.reuniao` | Label do tipo de evento `reuniao` |
| `ai_defaults.modelo` | Modelo Anthropic padrão |
| `ai_defaults.temperatura` | Temperatura padrão da IA |
| `sistema.primeiro_setup_completo` | Flag interna de onboarding |

Razões:

- **Lookup O(1)** por chave exata. `WHERE chave = 'ui_labels.tarefa.status.fazendo'` é índice único — instantâneo.
- **Adicionar config nova = 1 INSERT** (vs múltiplos em modelo normalizado).
- **Convenção testada** em config files (Spring, .NET, Django settings, env vars). Padrão familiar pra qualquer dev.
- **Reordenar é rename.** Mudar de `ui_labels.tarefa.status.fazendo` pra `tarefa.ui_labels.status.fazendo` é UPDATE simples se a hierarquia for refatorada (improvável).

Padrão registrado em [[CONVENÇÕES]] → "Convenção de nomenclatura — chaves ponto-separadas".

---

## 5 categorias conhecidas

| Categoria | Propósito | Exemplos |
|---|---|---|
| `ui_labels` | Labels visuais customizáveis | `ui_labels.tarefa.status.*`, `ui_labels.evento.tipo.*` |
| `ai_defaults` | Defaults dos agentes | `ai_defaults.modelo`, `ai_defaults.temperatura` |
| `sistema` | Estado interno do app | `sistema.primeiro_setup_completo` |
| `integracao` | Configurações de integrações futuras | `integracao.meta.token_alerta_dias` (hipotético) |
| `preferencia` | Preferências do Pedro | `preferencia.tema`, `preferencia.idioma` (futuras) |

⚠️ **Sem CHECK constraint na categoria.** REGRA 12 vale também aqui — módulos novos podem inventar categorias novas. Lista acima é referência, não lei.

---

## Por que `jsonb` (vs `text` simples)

`text` cobriria 90% dos casos atuais (todos os labels são strings). Mas:

- **`ai_defaults.temperatura = 0.7`** é número — `text` exigiria parse no front (`parseFloat` com risco de bug por locale).
- **`sistema.primeiro_setup_completo = false`** é boolean — parse manual.
- **Configs futuras** podem ser objeto (`{cor: '#5B6AF0', ordem: 3}`) ou array (`['marcos', 'marcela']`).

`jsonb` cobre tudo nativamente:

- Tipo preservado no banco (`SELECT valor` retorna `0.7` como número, não string).
- Operadores `->`, `->>`, `@>` pra navegar em objetos.
- Performance equivalente a `text` pra valores pequenos (binário, sem reparse).

Custo: ~10 bytes a mais por linha pra metadado. Insignificante.

---

## Por que hard-delete (3ª exceção ao soft-delete padrão)

Padrão do projeto (registrado em `CONVENÇÕES.md` na 2.7) é soft-delete (`ativa`/`arquivada`). `configuracoes` foge:

- **Configs são descartáveis.** Pedro apaga `ui_labels.tarefa.status.fazendo` → sistema usa default hardcoded ("Fazendo"). Sem perda — `valor_default` na própria linha + código tem o default.
- **Sem histórico relevante.** Diferente de tarefa arquivada (preserva o que aconteceu), config "antiga" não tem valor histórico.
- **`ativa boolean` seria pegadinha.** Toda query teria que checar `WHERE ativa = true`. Esquecer = bug silencioso de "usei label arquivado por engano".
- **Re-criar é trivial.** Botão "restaurar padrão" lê `valor_default` e re-INSERT.

Registrado em [[CONVENÇÕES]] → seção "Soft-delete é o padrão" como **3ª linha de exceção** (já tem `chat_mensagens` e `chat_anexos`).

---

## `editavel_por_usuario` como flag UI

Em vez de criar 2 tabelas separadas (`configuracoes_usuario` + `configuracoes_sistema`), uma flag boolean na mesma tabela cobre o caso:

| `editavel_por_usuario` | Comportamento UI |
|---|---|
| `true` | Aparece na tela "Configurações" pra Pedro editar (Fase 4). |
| `false` | Esconde da UI. Estado interno gerenciado pelo código (ex.: `sistema.primeiro_setup_completo`). |

Vantagem: configs **migram** entre interna e editável sem mover de tabela. Exemplo: `ai_defaults.modelo` pode ser interna hoje (Edge Function gerencia) e virar editável quando UI tiver tela de IA — só flippar boolean.

---

## `valor_default` — botão "Restaurar padrão"

Quando Pedro edita um label e quer voltar ao original:

```sql
UPDATE public.configuracoes
SET valor = valor_default
WHERE chave = 'ui_labels.tarefa.status.fazendo';
```

Sem hardcode no front — o "padrão" vive no próprio banco, gravado no seed/install. Se um dia o seed mudar (decisão de produto), `valor_default` reflete a versão atual da convenção.

---

## `ON CONFLICT (chave) DO NOTHING` — preserva edições do usuário

Re-execução do seed **não sobrescreve** configs que Pedro editou:

```sql
INSERT INTO public.configuracoes (chave, valor, ...) VALUES (...)
ON CONFLICT (chave) DO NOTHING;
```

Pedro renomeou `ui_labels.tarefa.status.fazendo` pra "Em Produção"? Re-rodar o seed mantém "Em Produção". A linha já existe — `ON CONFLICT` ignora.

Diferente de `ON CONFLICT DO UPDATE` (usado em sync de cache externo, ex.: Meta), que sobrescreve. Pra **seed inicial editável**, `DO NOTHING` é o caminho.

---

## Row Level Security

```sql
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_full_access
  ON public.configuracoes
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

Padrão do projeto.

---

## Índices

```sql
CREATE INDEX idx_config_categoria ON public.configuracoes (categoria);
CREATE INDEX idx_config_editavel  ON public.configuracoes (editavel_por_usuario) WHERE editavel_por_usuario = true;
```

- `idx_config_categoria` — queries "todas configs de UI", "todas configs de IA".
- `idx_config_editavel` parcial — UI lista só editáveis na tela de configurações. Maioria pode ser sistema-interno (no longo prazo).
- **`chave` UNIQUE** já cria índice automático — não precisa explícito.

---

## Seeds iniciais (16 ao todo)

| Chave | Valor | Categoria | Editável? |
|---|---|---|---|
| `ui_labels.tarefa.status.backlog` | `"Backlog"` | ui_labels | ✓ |
| `ui_labels.tarefa.status.a_fazer` | `"A fazer"` | ui_labels | ✓ |
| `ui_labels.tarefa.status.fazendo` | `"Fazendo"` | ui_labels | ✓ |
| `ui_labels.tarefa.status.feito` | `"Feito"` | ui_labels | ✓ |
| `ui_labels.tarefa.prioridade.baixa` | `"Baixa"` | ui_labels | ✓ |
| `ui_labels.tarefa.prioridade.media` | `"Média"` | ui_labels | ✓ |
| `ui_labels.tarefa.prioridade.alta` | `"Alta"` | ui_labels | ✓ |
| `ui_labels.tarefa.prioridade.urgente` | `"Urgente"` | ui_labels | ✓ |
| `ui_labels.evento.tipo.reuniao` | `"Reunião"` | ui_labels | ✓ |
| `ui_labels.evento.tipo.tarefa` | `"Tarefa"` | ui_labels | ✓ |
| `ui_labels.evento.tipo.pessoal` | `"Pessoal"` | ui_labels | ✓ |
| `ui_labels.evento.tipo.lembrete` | `"Lembrete"` | ui_labels | ✓ |
| `ui_labels.evento.tipo.bloqueio` | `"Bloqueio"` | ui_labels | ✓ |
| `ai_defaults.modelo` | `"claude-haiku-4-5-20251001"` | ai_defaults | ✓ |
| `ai_defaults.temperatura` | `0.7` | ai_defaults | ✓ |
| `sistema.primeiro_setup_completo` | `false` | sistema | ✗ |

**13 ui_labels + 2 ai_defaults + 1 sistema = 16 seeds.** Todos editáveis pelo Pedro via UI da Fase 4 (exceto `sistema.primeiro_setup_completo`, que é estado interno).

---

## Exemplos JS

```js
import { supabase } from '../core/supabase.js';
```

### Ler label customizado com fallback pra default

```js
async function getLabel(chave, fallback) {
  const { data } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', chave)
    .maybeSingle();
  return data?.valor ?? fallback;
}

// Uso:
const labelFazendo = await getLabel('ui_labels.tarefa.status.fazendo', 'Fazendo');
// → "Fazendo" (default) ou "Em Produção" (se Pedro renomeou)
```

### Ler todas as configs de uma categoria de uma vez (cache no front)

```js
async function carregarLabelsUI() {
  const { data } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .eq('categoria', 'ui_labels');

  // Vira mapa { chave: valor } pro front consultar O(1)
  return Object.fromEntries(data.map(c => [c.chave, c.valor]));
}

// No bootstrap do app:
const labels = await carregarLabelsUI();
// Renderização:
<span>{labels['ui_labels.tarefa.status.fazendo']}</span>
```

### Atualizar label via UI (Pedro renomeia)

```js
await supabase
  .from('configuracoes')
  .update({ valor: '"Em Produção"' })
  .eq('chave', 'ui_labels.tarefa.status.fazendo');

// Cuidado: valor é jsonb. Pra string, precisa wrappear em aspas.
// Cliente Supabase já serializa o JS string corretamente, mas
// se mandar via SQL puro: '"Em Produção"'::jsonb
```

### Restaurar padrão

```js
await supabase.rpc('restaurar_default_config', { p_chave: 'ui_labels.tarefa.status.fazendo' });
// Ou inline:
const { data: cfg } = await supabase
  .from('configuracoes')
  .select('valor_default')
  .eq('chave', chave)
  .single();
await supabase
  .from('configuracoes')
  .update({ valor: cfg.valor_default })
  .eq('chave', chave);
```

### Listar configs editáveis pela UI (tela de configurações)

```js
const { data } = await supabase
  .from('configuracoes')
  .select('chave, valor, valor_default, descricao, categoria')
  .eq('editavel_por_usuario', true)
  .order('categoria')
  .order('chave');
// UI agrupa por categoria, mostra chave + descrição + valor atual + botão "restaurar"
```

---

## Conexões com outras tabelas

Não tem FKs. `configuracoes` é tabela auxiliar — referenciada por **lookup de chave** no código, não por FK.

---

## Relacionado

- [[CONVENÇÕES]] — convenção de chaves ponto-separadas, exceções de soft-delete
- [[CLAUDE.md]] — REGRA 12 (customização total, mãe desta tabela)
- [[Backlog — Tarefas Pequenas]] — Tarefa 2.9 (✅, última da Fase 2)
