-- Seed idempotente de `configuracoes` — snapshot da produção 2026-07-07.
-- Captura os seeds feitos via execute_sql nas sub-fases 3.G/3.H que NÃO viraram migration.
-- Reaplica o estado atual das 31 chaves (ai_defaults, ai_tools, ai_limites, ui_labels, sistema).

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ai_defaults.historico_max_mensagens', '20'::jsonb, 'ai_defaults', 'Quantas mensagens recentes da mesma entidade entram como memória de curto prazo em cada chamada.', true, '20'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ai_defaults.mapeamento_complexidade', '{"medio": "claude-sonnet-4-6", "simples": "claude-haiku-4-5-20251001", "complexo": "claude-opus-4-7"}'::jsonb, 'ai_defaults', 'Qual modelo Anthropic responde cada nível de complexidade decidido pelo Roteador (3.G.2 — antes hardcoded na Edge).', true, '{"medio": "claude-sonnet-4-6", "simples": "claude-haiku-4-5-20251001", "complexo": "claude-opus-4-7"}'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ai_defaults.modelo', '"claude-haiku-4-5-20251001"'::jsonb, 'ai_defaults', 'Modelo padrão usado quando uma persona não tem modelo_override. Roteador pode promover pra Sonnet/Opus conforme nivel_complexidade.', true, '"claude-haiku-4-5-20251001"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ai_defaults.modelos_sem_temperature', '["claude-opus-4-7"]'::jsonb, 'ai_defaults', 'Modelos que rejeitam o parâmetro temperature (Adaptive Thinking). A Edge não envia temperature pra estes.', true, '["claude-opus-4-7"]'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ai_defaults.precos_modelos', '{"claude-opus-4-7": {"input": 5, "output": 25}, "claude-sonnet-4-6": {"input": 3, "output": 15}, "claude-haiku-4-5-20251001": {"input": 1, "output": 5}}'::jsonb, 'ai_defaults', 'Preço USD por 1M tokens (input/output) por modelo, pro cálculo de custo exibido no chat.', true, '{"claude-opus-4-7": {"input": 5, "output": 25}, "claude-sonnet-4-6": {"input": 3, "output": 15}, "claude-haiku-4-5-20251001": {"input": 1, "output": 5}}'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ai_defaults.temperatura', '0.7'::jsonb, 'ai_defaults', 'Temperatura padrão pra criatividade da IA. 0 = determinístico, 1 = criativo. 0.7 é balanceado pra conversa.', true, '0.7'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ai_limites.msgs_por_minuto', '10'::jsonb, 'ai_limites', 'Rate limit: máximo de mensagens por minuto aceitas pela Edge (proteção de custo contra loop/bug). 3.G.3.', true, '10'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ai_tools.por_persona', '{}'::jsonb, 'ai_tools', 'Tools exclusivas por persona (slug → lista de nomes). Exceção pra tools com credencial/risco, ex. Meta do Marcos na 3.F.', true, '{}'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ai_tools.transversais', '["salvar_ideia", "lancar_custo_sitio"]'::jsonb, 'ai_tools', 'Tools disponíveis em TODA conversa, qualquer persona (nomes do catálogo da Edge). Persona define tom, não poder.', true, '["salvar_ideia", "lancar_custo_sitio"]'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('sistema.primeiro_setup_completo', 'false'::jsonb, 'sistema', 'Flag interna que vira true depois que Pedro completa o primeiro setup. Controla onboarding.', false, 'false'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.evento.tipo.bloqueio', '"Bloqueio"'::jsonb, 'ui_labels', 'Label do tipo de evento "bloqueio".', true, '"Bloqueio"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.evento.tipo.lembrete', '"Lembrete"'::jsonb, 'ui_labels', 'Label do tipo de evento "lembrete".', true, '"Lembrete"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.evento.tipo.pessoal', '"Pessoal"'::jsonb, 'ui_labels', 'Label do tipo de evento "pessoal".', true, '"Pessoal"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.evento.tipo.reuniao', '"Reunião"'::jsonb, 'ui_labels', 'Label do tipo de evento "reuniao".', true, '"Reunião"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.evento.tipo.tarefa', '"Tarefa"'::jsonb, 'ui_labels', 'Label do tipo de evento "tarefa".', true, '"Tarefa"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.ideia.origem.chat', '"Chat"'::jsonb, 'ui_labels', 'Label da origem "chat" — ideia veio de conversa no chat principal.', true, '"Chat"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.ideia.origem.manual', '"Manual"'::jsonb, 'ui_labels', 'Label da origem "manual" — Pedro digitou direto na UI.', true, '"Manual"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.ideia.origem.sistema', '"Sistema"'::jsonb, 'ui_labels', 'Label da origem "sistema" — criada automaticamente por uma rotina (futuro).', true, '"Sistema"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.ideia.origem.voz', '"Voz"'::jsonb, 'ui_labels', 'Label da origem "voz" — Pedro gravou áudio, Marina transcreveu.', true, '"Voz"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.ideia.status.arquivada', '"Arquivada"'::jsonb, 'ui_labels', 'Label do status "arquivada" — soft-delete, não aparece em listagens padrão.', true, '"Arquivada"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.ideia.status.capturada', '"Capturada"'::jsonb, 'ui_labels', 'Label do status "capturada" — ideia bruta, sem refinamento ainda.', true, '"Capturada"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.ideia.status.convertida', '"Convertida"'::jsonb, 'ui_labels', 'Label do status "convertida" — virou tarefa/evento/doc; ideia preservada como histórico.', true, '"Convertida"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.ideia.status.refinada', '"Refinada"'::jsonb, 'ui_labels', 'Label do status "refinada" — Marina processou (título, tags, próxima ação).', true, '"Refinada"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.tarefa.prioridade.alta', '"Alta"'::jsonb, 'ui_labels', 'Label da prioridade "alta".', true, '"Alta"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.tarefa.prioridade.baixa', '"Baixa"'::jsonb, 'ui_labels', 'Label da prioridade "baixa".', true, '"Baixa"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.tarefa.prioridade.media', '"Média"'::jsonb, 'ui_labels', 'Label da prioridade "media".', true, '"Média"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.tarefa.prioridade.urgente', '"Urgente"'::jsonb, 'ui_labels', 'Label da prioridade "urgente".', true, '"Urgente"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.tarefa.status.a_fazer', '"A fazer"'::jsonb, 'ui_labels', 'Label visível pro status "a_fazer" do kanban.', true, '"A fazer"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.tarefa.status.backlog', '"Backlog"'::jsonb, 'ui_labels', 'Label visível pro status "backlog" do kanban de tarefas.', true, '"Backlog"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.tarefa.status.fazendo', '"Fazendo"'::jsonb, 'ui_labels', 'Label visível pro status "fazendo" do kanban.', true, '"Fazendo"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;

INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default) VALUES
  ('ui_labels.tarefa.status.feito', '"Feito"'::jsonb, 'ui_labels', 'Label visível pro status "feito" do kanban.', true, '"Feito"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, descricao=EXCLUDED.descricao, valor_default=EXCLUDED.valor_default;