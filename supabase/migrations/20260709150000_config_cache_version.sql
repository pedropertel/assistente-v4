-- 4.0 — invalidação ativa dos caches de isolate da Edge (E4 da revisão
-- 2026-07-07). A Edge compara `cache_version` no início de cada request;
-- mudou → zera os caches (configuracoes, agente, personas, nomes de
-- entidades) e recarrega do banco na hora — sem esperar o isolate reciclar.
--
-- CONVENÇÃO daqui pra frente: toda edição em agentes/personas/
-- configuracoes/entidades (por tela na Fase 4 ou por SQL) incrementa:
--   UPDATE configuracoes
--   SET valor = to_jsonb((valor #>> '{}')::int + 1)
--   WHERE chave = 'cache_version';
--
-- Idempotente: não sobrescreve versão existente (DO NOTHING).
INSERT INTO configuracoes (chave, valor, categoria, descricao, editavel_por_usuario, valor_default)
VALUES (
  'cache_version',
  '1'::jsonb,
  'sistema',
  'Versão dos caches de isolate da Edge. Incrementar (+1) após editar agentes/personas/configuracoes/entidades pra Edge recarregar imediatamente.',
  false,
  '1'::jsonb
)
ON CONFLICT (chave) DO NOTHING;
