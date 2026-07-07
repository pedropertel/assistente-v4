# supabase/migrations — schema versionado (B2 da revisão 2026-07-07)

Antes desta revisão, o schema real só existia no banco de produção + docs
manuais em `050 - Banco de Dados/`. O histórico de migrations do próprio
Supabase **divergiu** da produção (tinha o schema velho do recomeço de
março: `role` em vez de `papel`, sem `personas`/`ideias`, `valor` em vez de
`valor_centavos`). Ou seja: reconstruir a partir dele daria o schema ERRADO.

## Regra daqui pra frente
**Todo `ALTER TABLE`, `CREATE`, seed ou mudança estrutural vira um arquivo
novo aqui**, nomeado `AAAAMMDDHHMMSS_descricao.sql`, aplicado via
`apply_migration` (não `execute_sql` — este não registra no histórico).

## Arquivos
- `00000000000000_baseline_schema.sql` — schema COMPLETO reconstruído do
  banco vivo em 2026-07-07 (20 tabelas + constraints + índices + RLS).
  Autoridade final: rodar `supabase db dump --project-ref msbwplsknncnxwsalumd`
  quando o CLI logar (item F1) e substituir este arquivo pelo dump oficial.
- `20260707000000_seed_configuracoes.sql` — seed idempotente das 31 chaves
  de `configuracoes` (captura os seeds 3.G/3.H feitos via execute_sql).

## Como regenerar o baseline (enquanto o CLI não loga)
Peça ao Claude: "regenera o baseline do schema". Ele roda a query de
`information_schema` + `pg_constraint` + `pg_indexes` + `pg_policies` que
produziu este arquivo.

## O que NÃO está aqui
- Dados (ficam em `090 - Backups/`)
- Prompts de personas/agente (ficam em `040 - IA e Agentes/prompts/`)
- `auth.*`, `vault.*`, Storage (geridos pelo Supabase)
