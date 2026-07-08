-- 4.A.3a — soft-delete de mensagem do chat (REGRA 12: soft-delete sempre).
-- Mensagem arquivada some da UI E do histórico enviado à IA (filtro na
-- Edge). "Limpar conversa" = arquivar todas da entidade. Idempotente.
ALTER TABLE chat_mensagens
  ADD COLUMN IF NOT EXISTS arquivada boolean NOT NULL DEFAULT false;
