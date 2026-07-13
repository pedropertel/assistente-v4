-- 4.B.3c — cores das categorias raiz do sítio (donuts do dash).
--
-- cor_hex era NULL em todas. Paleta categórica validada (skill dataviz,
-- script validate_palette: PASS em lightness/chroma/contraste nas DUAS
-- superfícies do app — dark 0F0F14 e light FFFFFF; CVD na faixa-piso,
-- mitigada por gap de 2px entre fatias + legenda com valores).
-- Ordem dos slots é mecanismo de segurança CVD — não é cosmética.
-- HEX sem '#' (convenção do projeto). Idempotente: só preenche NULL —
-- cor editada pelo Pedro via tela (REGRA 12) nunca é sobrescrita.
UPDATE sitio_categorias SET cor_hex = v.cor
FROM (VALUES
  ('insumos',      '3987e5'),  -- slot 1 azul
  ('mao-de-obra',  '199e70'),  -- slot 2 verde-água
  ('equipamento',  'c98500'),  -- slot 3 amarelo
  ('operacional',  '008300'),  -- slot 4 verde
  ('tributos',     '9085e9'),  -- slot 5 violeta
  ('outros',       'e66767'),  -- slot 6 vermelho
  ('investimento', 'd55181'),  -- slot 7 magenta
  ('receita',      'd95926')   -- slot 8 laranja
) AS v(slug, cor)
WHERE sitio_categorias.slug = v.slug
  AND sitio_categorias.cor_hex IS NULL;
