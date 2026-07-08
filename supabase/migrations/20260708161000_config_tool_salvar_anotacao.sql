-- 4.E.2 — ativa a tool salvar_anotacao nas transversais (a config do
-- banco prevalece sobre o fallback da Edge — 3.G.2). Idempotente.
UPDATE configuracoes
SET valor = '["salvar_ideia", "lancar_custo_sitio", "salvar_anotacao"]'::jsonb
WHERE chave = 'ai_tools.transversais'
  AND NOT valor @> '["salvar_anotacao"]'::jsonb;
