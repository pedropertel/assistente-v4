-- 4.B.3a — contas a pagar/receber: coluna `status` em sitio_lancamentos.
--
-- Decisão do plano 4.B.3 (2026-07-13): conta futura é um lançamento
-- `status='previsto'` com data de vencimento em `data_lancamento` — mesma
-- tabela, mesmas categorias, mesma tela. Marcar como pago/recebido =
-- UPDATE pra 'realizado'. Os números do dash usam só 'realizado';
-- previstos alimentam a aba Contas e a projeção.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + backfill explícito (não
-- depender do default pra rows antigas — todas eram realizadas de fato).
ALTER TABLE sitio_lancamentos
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'realizado'
  CHECK (status IN ('previsto', 'realizado'));

UPDATE sitio_lancamentos SET status = 'realizado' WHERE status IS NULL;

COMMENT ON COLUMN sitio_lancamentos.status IS
  'realizado = aconteceu (conta nos totais); previsto = conta a pagar/receber futura (data_lancamento = vencimento).';

-- Índice parcial: a aba Contas lista só previstos (poucos e voláteis).
CREATE INDEX IF NOT EXISTS idx_sitio_lancamentos_previstos
  ON sitio_lancamentos (data_lancamento)
  WHERE status = 'previsto' AND arquivado = false;
