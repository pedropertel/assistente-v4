-- 4.B.2a — desduplicar "Outros" nas categorias do sítio (achado dados da
-- revisão 2026-07-07; a tool já contornava com dedup por nome desde 3.H.0).
--
-- Diagnóstico: "Outros" aparecia 2× em saída — a raiz catch-all (slug
-- `outros`) E a filha de Operacional (slug `outros-operacional`). A
-- resolução nome→id da tool escolhia entre elas por ordem arbitrária.
-- O padrão do próprio seed pra filha catch-all é nome QUALIFICADO
-- ("Outros tributos") — as filhas `outros-operacional` e `outros-receita`
-- violavam isso usando "Outros" seco.
--
-- Fix não-destrutivo: renomear as filhas seguindo o padrão. Nenhuma
-- categoria apagada; lançamentos existentes não referenciam nenhuma das
-- afetadas (verificado 2026-07-13). Idempotente (WHERE nome = 'Outros').
UPDATE sitio_categorias
SET nome = 'Outros operacionais'
WHERE slug = 'outros-operacional' AND nome = 'Outros';

UPDATE sitio_categorias
SET nome = 'Outras receitas'
WHERE slug = 'outros-receita' AND nome = 'Outros';
