-- 4.E.1 — Bloco de Notas (pedido Pedro 2026-07-08). Anotações em
-- Markdown criadas via tool salvar_anotacao ("transforma essa resposta
-- em anotação com título X") ou manualmente pela aba Notas (4.E.3).
-- Padrões: soft-delete (arquivada), RLS auth_full_access, trigger
-- updated_at — espelhados da tabela ideias. Idempotente.

CREATE TABLE IF NOT EXISTS anotacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  conteudo text NOT NULL, -- markdown (render com js/core/markdown.js)
  entidade_id uuid REFERENCES entidades(id),
  favorita boolean NOT NULL DEFAULT false,
  arquivada boolean NOT NULL DEFAULT false,
  origem text NOT NULL DEFAULT 'chat' CHECK (origem IN ('chat', 'voz', 'manual')),
  transcricao_original text,
  mensagem_origem_id uuid REFERENCES chat_mensagens(id),
  agente_id uuid REFERENCES agentes(id),
  persona_id uuid REFERENCES personas(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE anotacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_full_access ON anotacoes;
CREATE POLICY auth_full_access ON anotacoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_anotacoes_updated_at ON anotacoes;
CREATE TRIGGER trg_anotacoes_updated_at
  BEFORE UPDATE ON anotacoes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
