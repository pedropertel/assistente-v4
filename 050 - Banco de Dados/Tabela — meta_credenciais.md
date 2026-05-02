---
tipo: schema
tabela: meta_credenciais
fase: 2
tarefa: 2.8
criada_em: 2026-05-01
---

# Tabela `meta_credenciais`

[[Home]] > Banco de Dados > meta_credenciais

> Credenciais Meta Ads (token + metadados). **1 conjunto reusável por múltiplas conexões.** O `access_token` vive **no Vault** — esta tabela só guarda referência. REGRA 12: nome editável, soft-delete via `ativa`.

---

## Schema

```sql
CREATE TABLE public.meta_credenciais (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              text NOT NULL,
  vault_secret_id   uuid NOT NULL UNIQUE,
  app_id            text,
  business_id       text,
  escopo            text,
  expira_em         timestamptz,
  ativa             boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

### Colunas (10 no total)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK. |
| `nome` | `text` | Legível pra Pedro identificar (ex.: "Token CEDTEC produção"). Editável. |
| `vault_secret_id` | `uuid` | UNIQUE. Referência pra `vault.secrets.id`. **Não é FK formal** — schema separado. |
| `app_id` | `text` | App ID do Facebook que gera o token. Opcional. |
| `business_id` | `text` | Business Manager ID. Opcional. |
| `escopo` | `text` | Lista de permissions (ex.: `'ads_read,ads_management'`). Útil pra debug. |
| `expira_em` | `timestamptz` | Long-lived tokens duram ~60 dias. Pra alertas (Fase 5). |
| `ativa` | `boolean` | Soft-delete REGRA 12. |
| `created_at` | `timestamptz` | Criação. |
| `updated_at` | `timestamptz` | Trigger. |

---

## Por que Vault

O `access_token` Meta dá **controle total da conta de anúncios**: pausar campanhas, sacar saldo, criar/excluir tudo. Tratado como senha de conta bancária — **nunca em texto plano em tabela do `public`**.

Razões pra usar Supabase Vault:

1. **Criptografia em repouso** — secrets são criptografados no disco com chave gerenciada pelo Supabase.
2. **Acesso explícito.** Apenas funções com privilégio (Edge Functions com service_role, ou via `vault.decrypted_secrets` em runtime controlado) podem descriptografar. Backups/dumps não vazam o token.
3. **Audit trail** — Vault loga acessos.
4. **Rotação simples** — trocar valor no Vault, `vault_secret_id` permanece. Outras tabelas não precisam saber.
5. **Conformidade** — se um dia precisar passar por compliance (LGPD, ISO), token em Vault é o caminho aceito.

Alternativas consideradas e descartadas:

- **`pgcrypto` + chave em variável de ambiente** — funcionaria, mas exige chave passada em tudo, gerência manual de rotação, sem audit. Plano B (hoje desnecessário).
- **RLS-only com texto plano** — tech debt instalado. Plano C (rejeitado).

---

## `vault_secret_id` como UUID lógico (não FK formal)

`vault.secrets` vive em schema separado (`vault`), gerenciado pela extension Supabase. Criar `REFERENCES vault.secrets(id)` exigiria privilégios cross-schema que o owner padrão da `public` **não tem garantido** — depende da versão da extension e do contrato dela. Risco real: tentar `ALTER TABLE ... ADD FOREIGN KEY REFERENCES vault.secrets(id)` falhar com `permission denied` agora ou em update futuro do Vault.

Solução: armazena o UUID como **referência lógica**.

- UNIQUE no campo evita 2 linhas apontando pro mesmo secret.
- Edge Function consulta `vault.decrypted_secrets WHERE id = ?` em runtime; se voltar vazio, trata como token inexistente.
- Custo: se Pedro deletar o secret do Vault sem deletar a linha em `meta_credenciais`, ela vira "lixo apontando pra nada" — Edge Function detecta e UI pode exibir "❌ Token não encontrado, recriar".

Padrão registrado em `CONVENÇÕES.md` → "Integração com sistemas externos".

---

## Como a Edge Function lê o secret

```ts
// Dentro da Edge Function (TypeScript/Deno) com service_role:
const { data, error } = await supabase
  .from('vault.decrypted_secrets')
  .select('decrypted_secret')
  .eq('id', credencial.vault_secret_id)
  .single();

if (error || !data) {
  // token inexistente — alerta UI
  throw new Error('Token Meta não encontrado no Vault');
}

const accessToken = data.decrypted_secret;

// Usa pra chamar Graph API
const res = await fetch(
  `https://graph.facebook.com/v19.0/${adAccountId}/campaigns?access_token=${accessToken}&fields=...`
);
```

⚠️ **Front nunca lê o token.** UI envia comando ("rodar sync da CEDTEC"); Edge Function autentica → busca no Vault → chama Graph API → devolve resultado processado. Token jamais cruza a fronteira do servidor.

---

## Fluxos de uso

### Cadastro de credencial (Fase 4 — UI)

```
Pedro abre tela "Configurações > Meta Ads"
        │
        ▼
Cola o long-lived token + nome ("Token CEDTEC produção")
        │
        ▼
UI POST → Edge Function /meta/credenciais
        │
        ▼
Edge Function:
  1. SELECT vault.create_secret(token, nome_único, descrição)
  2. INSERT INTO meta_credenciais (nome, vault_secret_id, ...)
  3. Retorna {id} pra UI
```

### Rotação de token

```
Pedro pega token novo no Facebook (long-lived expira ~60 dias)
        │
        ▼
Tela "Configurações > Meta Ads > Token X" → "Trocar"
        │
        ▼
Edge Function:
  UPDATE vault.secrets SET secret = $novo_token WHERE id = $vault_secret_id
        │
        ▼
meta_credenciais.vault_secret_id NÃO MUDA. meta_conexoes não precisam saber.
Próxima chamada Graph API usa o novo token automaticamente.
```

### Alerta de expiração (Fase 5)

Cron consulta tokens próximos do vencimento e dispara notificação:

```sql
SELECT id, nome, expira_em
FROM public.meta_credenciais
WHERE ativa = true
  AND expira_em IS NOT NULL
  AND expira_em < now() + interval '7 days'
ORDER BY expira_em;
```

---

## Row Level Security

```sql
ALTER TABLE public.meta_credenciais ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_full_access
  ON public.meta_credenciais
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

Padrão do projeto. **Note:** RLS aqui só protege a tabela de metadados — o `access_token` em si está protegido pela camada do Vault, não pela policy do `public`.

---

## Índices

```sql
CREATE INDEX idx_meta_cred_vault  ON public.meta_credenciais (vault_secret_id);
CREATE INDEX idx_meta_cred_ativa  ON public.meta_credenciais (ativa)     WHERE ativa = true;
CREATE INDEX idx_meta_cred_expira ON public.meta_credenciais (expira_em) WHERE expira_em IS NOT NULL;
```

- `idx_meta_cred_vault` — lookup reverso (raro mas útil pra debug).
- `idx_meta_cred_ativa` — UI lista só ativas. Parcial.
- `idx_meta_cred_expira` — query de "tokens expirando em N dias". Parcial — só os que têm data preenchida.

---

## Exemplos JS

```js
import { supabase } from '../core/supabase.js';
```

### Listar credenciais ativas (sem expor token)

```js
const { data } = await supabase
  .from('meta_credenciais')
  .select('id, nome, app_id, business_id, escopo, expira_em')
  .eq('ativa', true)
  .order('nome');
// Note: vault_secret_id é incluído por default? Não — selecionamos apenas o que UI precisa.
```

### Alertar tokens expirando em <7 dias

```js
const limite = new Date();
limite.setDate(limite.getDate() + 7);

const { data } = await supabase
  .from('meta_credenciais')
  .select('id, nome, expira_em')
  .eq('ativa', true)
  .not('expira_em', 'is', null)
  .lt('expira_em', limite.toISOString())
  .order('expira_em');
```

### Soft-disable (não apaga do Vault automaticamente)

```js
await supabase
  .from('meta_credenciais')
  .update({ ativa: false })
  .eq('id', credencialId);
// Conexões que usavam essa credencial param de funcionar; podem ser
// ressincadas depois com outra credencial via UI.
```

---

## Conexões com outras tabelas

- **`meta_conexoes.credencial_id`** — FK obrigatória pra `meta_credenciais(id)` com `ON DELETE RESTRICT`. Apagar credencial em uso falha — força arquivar/migrar conexões antes.

---

## Relacionado

- [[Tabela — meta_conexoes]] — usa esta credencial
- [[CONVENÇÕES]] — Integração com sistemas externos (Vault)
- [[CLAUDE.md]] — REGRA 12 (customização total)
