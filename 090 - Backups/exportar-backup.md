# Backup dos dados — como exportar

O banco (free tier) é hoje a única cópia dos dados. Este é o backup manual
até o cron automático da Fase 3.5 (item B1).

## Export manual (rodar quando quiser um snapshot)

No chat do Claude Code, peça: **"exporta o backup do banco"**. Ele roda um
`SELECT json_build_object(...)` com todas as tabelas de app e salva em
`090 - Backups/backup-AAAA-MM-DD.json`.

Ou, se tiver o Supabase CLI logado:
```bash
supabase db dump --project-ref msbwplsknncnxwsalumd -f "090 - Backups/dump-$(date +%F).sql"
```

## O que o backup contém
Todas as 13 tabelas de aplicação: entidades, agentes, personas, configuracoes,
tarefas, eventos, pastas, documentos, ideias, sitio_categorias,
sitio_lancamentos, chat_mensagens, chat_anexos.

**NÃO** contém: auth.users (gerido pelo Supabase Auth), vault.secrets (tokens —
por segurança), Storage (arquivos dos buckets documentos/agentes).

## Restaurar
Os arquivos em `040 - IA e Agentes/prompts/` são a fonte da verdade dos prompts
(personas + agente). As migrations em `supabase/migrations/` recriam o schema.
O JSON de backup recarrega os dados via INSERT.

## Histórico
- `backup-2026-07-07.json` — primeiro backup (revisão 3.5.A). 6 entidades,
  6 personas, 31 configs, 6 ideias, 5 lançamentos do sítio, 96 mensagens.
