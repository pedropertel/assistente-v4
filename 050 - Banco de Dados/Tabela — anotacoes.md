# Tabela — anotacoes

> Bloco de Notas do Pedro (4.E, 2026-07-08). Anotações em **Markdown**
> criadas pela tool `salvar_anotacao` no chat ("transforma essa resposta
> em uma anotação com título X") ou manualmente pela aba 📝 Notas.

## Colunas

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| titulo | text NOT NULL | |
| conteudo | text NOT NULL | Markdown — render com `js/core/markdown.js` |
| entidade_id | uuid FK entidades | null = Geral |
| favorita | boolean NOT NULL | default false |
| arquivada | boolean NOT NULL | default false — soft-delete (REGRA 12) |
| origem | text CHECK | 'chat' \| 'voz' \| 'manual' |
| transcricao_original | text | preenchida quando origem='voz' |
| mensagem_origem_id | uuid FK chat_mensagens | rastreio da conversa de origem |
| agente_id / persona_id | uuid FK | quem salvou |
| created_at / updated_at | timestamptz | trigger `set_updated_at()` |

## Regras

- RLS: policy `auth_full_access` (padrão das tabelas de app).
- **Fidelidade por código:** quando o pedido é "essa resposta", a tool usa
  o flag `copiar_resposta_anterior` e o executor busca a última mensagem
  assistant da conversa DIRETO do banco — o modelo não reescreve (Haiku
  resumia; achado do Pedro em 2026-07-08).
- Tela: aba 📝 Notas (`js/modules/notas.js`), recarrega via evento
  `page:change` do router.

Migrations: `20260708160000_tabela_anotacoes.sql`,
`20260708161000_config_tool_salvar_anotacao.sql`.
