// Módulo Sítio (4.B.2b) — tela de correção dos lançamentos do Alemão.
//
// Fonte dos lançamentos: tool `lancar_custo_sitio` no chat, tipicamente
// por voz 🎤 (3.H.1). Esta tela fecha o gap D2 da revisão pro sítio:
// transcrição de voz errada agora tem onde ser conferida e corrigida.
// SEM "+ Novo" por decisão da 4.B.2 — a entrada é pelo chat/voz.
//
// A transcrição original (origem='voz') aparece no corpo do card — é o
// que o Pedro compara com o que foi gravado.
//
// Valores: `valor_centavos` bigint no banco; edição em reais com vírgula
// ("1.234,56") convertida aqui. fmtMoney do utils formata a exibição.
//
// Recarrega via `page:change` do router; listeners internos (sem onclick
// inline → fora da window bridge). Soft-delete: `arquivado=true`.

import { supabase } from '../core/supabase.js';
import { show as showToast } from '../core/toast.js';
import { show as showModal } from '../core/modal.js';
import { fmtMoney } from '../core/utils.js';

// Filtros ativos da lista (persistem enquanto a sessão vive; reset no reload).
let filtroCategoriaId = '';
let filtroMes = ''; // 'YYYY-MM' ou '' = todos

// Categorias ativas (id, nome, tipo) — carregadas 1x por sessão pros
// selects de filtro e de edição.
let categoriasCache = null;

document.addEventListener('page:change', (ev) => {
  if (ev.detail !== 'sitio') return;
  carregarLancamentos().catch((err) => {
    console.error('[sitio] erro ao carregar', err);
  });
});

async function getCategorias() {
  if (categoriasCache) return categoriasCache;
  const { data, error } = await supabase
    .from('sitio_categorias')
    .select('id, nome, tipo, categoria_pai_id')
    .eq('ativa', true)
    .order('tipo')
    .order('ordem');
  if (error || !data) {
    console.error('[sitio] erro ao carregar categorias', error);
    return [];
  }
  categoriasCache = data;
  return categoriasCache;
}

export async function carregarLancamentos() {
  const listaEl = document.getElementById('sitio-lista');
  if (!listaEl) return;

  await montarFiltros();

  let q = supabase
    .from('sitio_lancamentos')
    .select(`
      id, tipo, data_lancamento, descricao, valor_centavos, quantidade,
      unidade, forma_pagamento, fornecedor, transcricao_original, origem,
      categoria_id, sitio_categorias(nome, tipo)
    `)
    .eq('arquivado', false)
    .order('data_lancamento', { ascending: false })
    .order('created_at', { ascending: false });

  if (filtroCategoriaId) q = q.eq('categoria_id', filtroCategoriaId);
  if (filtroMes) {
    // Mês 'YYYY-MM' → intervalo [1º dia, 1º dia do mês seguinte).
    const [ano, mes] = filtroMes.split('-').map(Number);
    const ini = `${filtroMes}-01`;
    const fim = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
    q = q.gte('data_lancamento', ini).lt('data_lancamento', fim);
  }

  const { data, error } = await q;

  if (error) {
    console.error('[sitio] erro no SELECT', error);
    showToast('Erro ao carregar lançamentos', 'error');
    return;
  }

  renderLista(listaEl, data || []);
}

/**
 * montarFiltros — selects de categoria e mês (liga 1x; re-render só
 * repopula as opções de categoria quando o cache chegar).
 * Meses: últimos 12 a partir de hoje — simples e cobre o uso real.
 */
async function montarFiltros() {
  const selCat = document.getElementById('sitio-filtro-categoria');
  const selMes = document.getElementById('sitio-filtro-mes');
  if (!selCat || !selMes) return;

  if (!selCat.dataset.ligado) {
    selCat.dataset.ligado = '1';
    selCat.addEventListener('change', () => {
      filtroCategoriaId = selCat.value;
      carregarLancamentos().catch(() => {});
    });

    selMes.dataset.ligado = '1';
    const agora = new Date();
    const optTodos = document.createElement('option');
    optTodos.value = '';
    optTodos.textContent = 'Todos os meses';
    selMes.appendChild(optTodos);
    for (let i = 0; i < 12; i++) {
      const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const opt = document.createElement('option');
      opt.value = valor;
      opt.textContent = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      selMes.appendChild(opt);
    }
    selMes.addEventListener('change', () => {
      filtroMes = selMes.value;
      carregarLancamentos().catch(() => {});
    });
  }

  // Popula categorias 1x (cache de sessão).
  if (selCat.options.length <= 1) {
    selCat.innerHTML = '';
    const optTodas = document.createElement('option');
    optTodas.value = '';
    optTodas.textContent = 'Todas as categorias';
    selCat.appendChild(optTodas);
    for (const cat of await getCategorias()) {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = `${cat.tipo === 'entrada' ? '↑' : '↓'} ${cat.nome}`;
      selCat.appendChild(opt);
    }
    selCat.value = filtroCategoriaId;
  }
}

function renderLista(listaEl, lancamentos) {
  listaEl.innerHTML = '';

  if (!lancamentos.length) {
    const vazio = document.createElement('div');
    vazio.className = 'notas-vazio';
    vazio.textContent = filtroCategoriaId || filtroMes
      ? 'Nenhum lançamento com esses filtros.'
      : 'Nenhum lançamento ainda. Fala com o Alemão no chat: ' +
        '"paguei 350 de diarista no sítio".';
    listaEl.appendChild(vazio);
    return;
  }

  for (const lanc of lancamentos) {
    listaEl.appendChild(criarCard(lanc));
  }
}

function criarCard(lanc) {
  const card = document.createElement('article');
  card.className = 'nota-card';

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'nota-card-header';

  const titulo = document.createElement('span');
  titulo.className = 'nota-titulo';
  const sinal = lanc.tipo === 'entrada' ? '+' : '−';
  titulo.textContent = `${sinal} ${fmtMoney(lanc.valor_centavos)} · ${lanc.descricao}`;

  const meta = document.createElement('small');
  meta.className = 'nota-meta';
  // data_lancamento é DATE puro (YYYY-MM-DD) — new Date() interpretaria
  // como UTC e mostraria o dia ANTERIOR em Brasília. Formata na mão.
  const [ano, mes, dia] = lanc.data_lancamento.split('-');
  const partes = [
    `${dia}/${mes}/${ano}`,
    lanc.sitio_categorias?.nome ?? '(sem categoria)',
    lanc.origem === 'voz' ? '🎤 voz' : null,
  ].filter(Boolean);
  meta.textContent = partes.join(' · ');

  header.appendChild(titulo);
  header.appendChild(meta);
  card.appendChild(header);

  const corpo = document.createElement('div');
  corpo.className = 'nota-corpo';
  corpo.hidden = true;

  const detalhes = document.createElement('div');
  const linhas = [
    lanc.quantidade && lanc.unidade ? `Quantidade: ${lanc.quantidade} ${lanc.unidade}` : null,
    `Pagamento: ${lanc.forma_pagamento}`,
    lanc.fornecedor ? `Fornecedor: ${lanc.fornecedor}` : null,
  ].filter(Boolean);
  for (const linha of linhas) {
    const p = document.createElement('p');
    p.style.margin = '2px 0';
    p.textContent = linha;
    detalhes.appendChild(p);
  }
  corpo.appendChild(detalhes);

  // Transcrição original do ditado — é o que o Pedro confere pra saber
  // se a voz virou o registro certo.
  if (lanc.transcricao_original) {
    const trans = document.createElement('p');
    trans.className = 'ideia-proxima-acao';
    trans.textContent = '🎤 Você disse: ' + lanc.transcricao_original;
    corpo.appendChild(trans);
  }

  const acoes = document.createElement('div');
  acoes.className = 'nota-acoes';

  const btnEditar = document.createElement('button');
  btnEditar.type = 'button';
  btnEditar.textContent = '✏️ Editar';
  btnEditar.addEventListener('click', () => abrirEditor(lanc));

  const btnArq = document.createElement('button');
  btnArq.type = 'button';
  btnArq.textContent = '🗑 Arquivar';
  btnArq.addEventListener('click', async () => {
    const { error } = await supabase
      .from('sitio_lancamentos')
      .update({ arquivado: true })
      .eq('id', lanc.id);
    if (error) {
      showToast('Erro ao arquivar', 'error');
      return;
    }
    showToast('Lançamento arquivado');
    carregarLancamentos().catch(() => {});
  });

  acoes.appendChild(btnEditar);
  acoes.appendChild(btnArq);
  corpo.appendChild(acoes);
  card.appendChild(corpo);

  header.addEventListener('click', () => {
    corpo.hidden = !corpo.hidden;
  });

  return card;
}

/** "1.234,56" | "350" | "89.90" → centavos (int) ou null se inválido. */
function parseReaisParaCentavos(texto) {
  const limpo = texto.trim().replace(/[R$\s]/g, '');
  if (!limpo) return null;
  // Com vírgula: formato BR ("1.234,56") — pontos são milhar.
  // Sem vírgula: ponto é decimal ("89.90") ou inteiro ("350").
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo;
  const reais = Number(normalizado);
  if (!Number.isFinite(reais) || reais <= 0) return null;
  return Math.round(reais * 100);
}

/**
 * abrirEditor — modal de correção: descrição, valor, data, categoria.
 * Trocar a categoria também atualiza `tipo` (o tipo do lançamento segue
 * o tipo da categoria — mesma regra da tool). Demais campos (forma de
 * pagamento, fornecedor, quantidade) ficam como estão nesta versão.
 */
async function abrirEditor(lanc) {
  const categorias = await getCategorias();

  const form = document.createElement('div');
  form.className = 'nota-editor';

  const inputDesc = document.createElement('input');
  inputDesc.type = 'text';
  inputDesc.className = 'nota-editor-titulo';
  inputDesc.placeholder = 'Descrição';
  inputDesc.value = lanc.descricao;

  const inputValor = document.createElement('input');
  inputValor.type = 'text';
  inputValor.inputMode = 'decimal';
  inputValor.className = 'nota-editor-titulo';
  inputValor.placeholder = 'Valor em reais (ex: 350 ou 1.234,56)';
  inputValor.value = (lanc.valor_centavos / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
  });

  const inputData = document.createElement('input');
  inputData.type = 'date';
  inputData.className = 'nota-editor-titulo';
  inputData.value = lanc.data_lancamento;

  const selCategoria = document.createElement('select');
  selCategoria.className = 'nota-editor-titulo';
  for (const cat of categorias) {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = `${cat.tipo === 'entrada' ? '↑ entrada' : '↓ saída'} · ${cat.nome}`;
    if (cat.id === lanc.categoria_id) opt.selected = true;
    selCategoria.appendChild(opt);
  }

  form.appendChild(inputDesc);
  form.appendChild(inputValor);
  form.appendChild(inputData);
  form.appendChild(selCategoria);

  showModal({
    title: 'Corrigir lançamento',
    body: form,
    actions: [
      { label: 'Cancelar', type: 'secondary' },
      {
        label: 'Salvar',
        type: 'primary',
        onClick: async () => {
          const descricao = inputDesc.value.trim();
          const valorCentavos = parseReaisParaCentavos(inputValor.value);
          const dataLanc = inputData.value;
          if (!descricao || !valorCentavos || !dataLanc) {
            showToast('Descrição, valor (> 0) e data são obrigatórios', 'error');
            return false; // segura o modal
          }
          const categoria = categorias.find((c) => c.id === selCategoria.value);
          if (!categoria) {
            showToast('Categoria inválida', 'error');
            return false;
          }
          const { error } = await supabase
            .from('sitio_lancamentos')
            .update({
              descricao,
              valor_centavos: valorCentavos,
              data_lancamento: dataLanc,
              categoria_id: categoria.id,
              tipo: categoria.tipo,
            })
            .eq('id', lanc.id);
          if (error) {
            showToast('Erro ao salvar', 'error');
            return false;
          }
          showToast('Lançamento corrigido');
          carregarLancamentos().catch(() => {});
        },
      },
    ],
  });
}
