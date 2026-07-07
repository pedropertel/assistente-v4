-- 3.5.A.4 (revisão 2026-07-07): remove a tabela órfã `teste` (sobra da Fase 0,
-- exposta ao anon via policy allow_all TO public). Só continha mensagens de
-- teste. O ping do login migrou pra `entidades` (js/app.js). Aplicada via MCP.
DROP TABLE IF EXISTS public.teste CASCADE;
