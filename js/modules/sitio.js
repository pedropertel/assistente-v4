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

// ──────────── Sub-abas + período (4.B.3b) ────────────

let abaAtiva = 'resumo';
let periodoAtivo = 'mes'; // chave de PERIODOS

const PERIODOS = [
  { chave: 'mes', label: 'Este mês' },
  { chave: 'mes_passado', label: 'Mês passado' },
  { chave: 'ano', label: 'Este ano' },
  { chave: 'safra', label: 'Ano-safra' }, // jul–jun (café)
  { chave: 'tudo', label: 'Tudo' },
];

/** 'YYYY-MM-DD' local (data_lancamento é DATE puro — nunca usar ISO/UTC). */
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Intervalo [ini, fim) do período. null = sem limite (Tudo).
 * Ano-safra do café: jul→jun (mês >= jul → safra corrente começa em jul
 * deste ano; senão começou em jul do ano passado).
 */
function intervaloPeriodo(chave) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth(); // 0-11
  switch (chave) {
    case 'mes':
      return { ini: ymd(new Date(ano, mes, 1)), fim: ymd(new Date(ano, mes + 1, 1)) };
    case 'mes_passado':
      return { ini: ymd(new Date(ano, mes - 1, 1)), fim: ymd(new Date(ano, mes, 1)) };
    case 'ano':
      return { ini: `${ano}-01-01`, fim: `${ano + 1}-01-01` };
    case 'safra': {
      const inicioSafra = mes >= 6 ? ano : ano - 1;
      return { ini: `${inicioSafra}-07-01`, fim: `${inicioSafra + 1}-07-01` };
    }
    default:
      return { ini: null, fim: null };
  }
}

/** Período anterior de mesmo tamanho (pro ▲▼ dos KPIs). null pra Tudo. */
function intervaloPeriodoAnterior(chave) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  switch (chave) {
    case 'mes':
      return { ini: ymd(new Date(ano, mes - 1, 1)), fim: ymd(new Date(ano, mes, 1)) };
    case 'mes_passado':
      return { ini: ymd(new Date(ano, mes - 2, 1)), fim: ymd(new Date(ano, mes - 1, 1)) };
    case 'ano':
      return { ini: `${ano - 1}-01-01`, fim: `${ano}-01-01` };
    case 'safra': {
      const inicioSafra = (mes >= 6 ? ano : ano - 1) - 1;
      return { ini: `${inicioSafra}-07-01`, fim: `${inicioSafra + 1}-07-01` };
    }
    default:
      return null;
  }
}

document.addEventListener('page:change', (ev) => {
  if (ev.detail !== 'sitio') return;
  initAbas();
  carregarAba().catch((err) => {
    console.error('[sitio] erro ao carregar', err);
  });
});

/** Liga os chips de aba e de período (1x) e sincroniza o visual. */
function initAbas() {
  const abasEl = document.getElementById('sitio-abas');
  if (abasEl && !abasEl.dataset.ligado) {
    abasEl.dataset.ligado = '1';
    abasEl.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.aba === abaAtiva) return;
        abaAtiva = btn.dataset.aba;
        abasEl.querySelectorAll('button').forEach((b) => {
          b.classList.toggle('ativa', b.dataset.aba === abaAtiva);
        });
        for (const aba of ['resumo', 'lancamentos', 'contas']) {
          const el = document.getElementById(`sitio-aba-${aba}`);
          if (el) el.hidden = aba !== abaAtiva;
        }
        carregarAba().catch(() => {});
      });
    });
  }

  const perEl = document.getElementById('sitio-periodos');
  if (perEl && !perEl.dataset.ligado) {
    perEl.dataset.ligado = '1';
    for (const p of PERIODOS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-entidade-chip' + (p.chave === periodoAtivo ? ' ativa' : '');
      btn.textContent = p.label;
      btn.addEventListener('click', () => {
        if (p.chave === periodoAtivo) return;
        periodoAtivo = p.chave;
        perEl.querySelectorAll('button').forEach((b, i) => {
          b.classList.toggle('ativa', PERIODOS[i].chave === periodoAtivo);
        });
        carregarResumo().catch(() => {});
      });
      perEl.appendChild(btn);
    }
  }
}

/** Roteia o carregamento pra sub-aba ativa. */
function carregarAba() {
  if (abaAtiva === 'lancamentos') return carregarLancamentos();
  if (abaAtiva === 'contas') return carregarContas();
  return carregarResumo();
}

// ──────────── Resumo BI (4.B.3c) ────────────
//
// Uma query só: TODOS os realizados não-arquivados (volume minúsculo,
// usuário único — decisão do plano). Tudo é agregado aqui: período atual,
// período anterior (tendência ▲▼), investimento acumulado e burn médio.
// Gráficos em CSS puro (donut conic-gradient); cores das categorias raiz
// vêm de sitio_categorias.cor_hex (paleta validada — migration 4.B.3c).

const COR_FALLBACK = '6B7280'; // cinza (cor_hex nula = categoria criada sem cor)

async function carregarResumo() {
  const el = document.getElementById('sitio-resumo-conteudo');
  if (!el) return;

  const categorias = await getCategorias();

  // 4.B.3e: previstos entram junto (projeção + próximos 30 dias).
  const { data, error } = await supabase
    .from('sitio_lancamentos')
    .select('tipo, valor_centavos, data_lancamento, categoria_id, status')
    .eq('arquivado', false);

  if (error) {
    console.error('[sitio] erro no SELECT do resumo', error);
    showToast('Erro ao carregar resumo', 'error');
    return;
  }

  const todos = (data || []).filter((l) => l.status === 'realizado');
  const previstos = (data || []).filter((l) => l.status === 'previsto');
  el.innerHTML = '';

  if (!todos.length && !previstos.length) {
    const vazio = document.createElement('div');
    vazio.className = 'notas-vazio';
    vazio.textContent = 'Nenhum lançamento realizado ainda. Os números ' +
      'aparecem aqui conforme o Alemão registra.';
    el.appendChild(vazio);
    return;
  }

  const { ini, fim } = intervaloPeriodo(periodoAtivo);
  const noIntervalo = (l, int) =>
    (!int.ini || l.data_lancamento >= int.ini) &&
    (!int.fim || l.data_lancamento < int.fim);

  const doPeriodo = todos.filter((l) => noIntervalo(l, { ini, fim }));
  const soma = (lista, tipo) => lista
    .filter((l) => l.tipo === tipo)
    .reduce((acc, l) => acc + Number(l.valor_centavos), 0);

  const entradas = soma(doPeriodo, 'entrada');
  const saidas = soma(doPeriodo, 'saida');

  // Tendência vs período anterior de mesmo tamanho ('tudo' não tem).
  const intAnterior = intervaloPeriodoAnterior(periodoAtivo);
  const doAnterior = intAnterior
    ? todos.filter((l) => noIntervalo(l, intAnterior))
    : null;

  // Investimento acumulado: entradas do grupo raiz 'investimento', sempre
  // all-time (o número da fase de investimento não depende do período).
  const invAcumulado = todos
    .filter((l) => l.tipo === 'entrada' &&
      grupoRaizDe(l.categoria_id, categorias)?.slug === 'investimento')
    .reduce((acc, l) => acc + Number(l.valor_centavos), 0);

  // Burn médio mensal: total de saídas all-time / meses desde o 1º lançamento.
  // (todos pode estar vazio se só existem previstos — burn vira 0.)
  const datas = todos.map((l) => l.data_lancamento).sort();
  const agora = new Date();
  let burnMensal = 0;
  if (datas.length) {
    const [a0, m0] = datas[0].split('-').map(Number);
    const meses = Math.max(1, (agora.getFullYear() - a0) * 12 + (agora.getMonth() + 1 - m0) + 1);
    burnMensal = Math.round(soma(todos, 'saida') / meses);
  }

  // ── KPIs ──
  const kpis = document.createElement('div');
  kpis.className = 'sitio-kpis';
  kpis.appendChild(kpiCard('Entradas', entradas, tendencia(entradas, doAnterior ? soma(doAnterior, 'entrada') : null, false)));
  kpis.appendChild(kpiCard('Saídas', saidas, tendencia(saidas, doAnterior ? soma(doAnterior, 'saida') : null, true)));
  kpis.appendChild(kpiCard('Saldo do período', entradas - saidas, tendencia(entradas - saidas, doAnterior ? soma(doAnterior, 'entrada') - soma(doAnterior, 'saida') : null, false)));
  kpis.appendChild(kpiCard('Investimento acumulado', invAcumulado, null));
  kpis.appendChild(kpiCard('Burn médio mensal', burnMensal, null));
  el.appendChild(kpis);

  // ── Donuts por categoria (gastos e receitas) ──
  el.appendChild(blocoDonut('Gastos por categoria', doPeriodo, 'saida', categorias));
  el.appendChild(blocoDonut('Receitas por categoria', doPeriodo, 'entrada', categorias));

  // ── 4.B.3e: evolução, contas próximas e projeção ──
  el.appendChild(blocoEvolucao(todos));
  el.appendChild(blocoProximos30(previstos));
  el.appendChild(blocoProjecao(todos, previstos));
}

/**
 * blocoEvolucao — colunas entrada × saída dos últimos 12 meses (sempre
 * all-time-relativo a hoje, independe do período — é a régua de longo
 * prazo). Duas séries com legenda; altura proporcional ao maior mês.
 */
function blocoEvolucao(realizados) {
  const bloco = document.createElement('section');
  bloco.className = 'sitio-bloco';

  const h = document.createElement('h2');
  h.className = 'sitio-bloco-titulo';
  h.textContent = 'Evolução — últimos 12 meses';
  bloco.appendChild(h);

  // Buckets YYYY-MM dos últimos 12 meses (mais antigo → mais novo).
  const agora = new Date();
  const buckets = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    buckets.push({
      chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      rotulo: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      entrada: 0,
      saida: 0,
    });
  }
  const porChave = new Map(buckets.map((b) => [b.chave, b]));
  for (const l of realizados) {
    const b = porChave.get(l.data_lancamento.slice(0, 7));
    if (b) b[l.tipo] += Number(l.valor_centavos);
  }
  const maior = Math.max(1, ...buckets.map((b) => Math.max(b.entrada, b.saida)));

  const grafico = document.createElement('div');
  grafico.className = 'sitio-evolucao';
  for (const b of buckets) {
    const col = document.createElement('div');
    col.className = 'sitio-evolucao-mes';
    // Toque no mês mostra os valores (tooltip barato via toast).
    col.addEventListener('click', () => {
      showToast(`${b.rotulo}: +${fmtMoney(b.entrada)} · −${fmtMoney(b.saida)}`);
    });

    const barras = document.createElement('div');
    barras.className = 'sitio-evolucao-barras';
    for (const [serie, valor] of [['entrada', b.entrada], ['saida', b.saida]]) {
      const barra = document.createElement('div');
      barra.className = `sitio-evolucao-barra ${serie}`;
      barra.style.height = `${valor > 0 ? Math.max(3, (valor / maior) * 100) : 0}%`;
      barras.appendChild(barra);
    }

    const rotulo = document.createElement('small');
    rotulo.textContent = b.rotulo;

    col.appendChild(barras);
    col.appendChild(rotulo);
    grafico.appendChild(col);
  }
  bloco.appendChild(grafico);

  const legenda = document.createElement('div');
  legenda.className = 'sitio-evolucao-legenda';
  for (const [classe, label] of [['entrada', 'Entradas'], ['saida', 'Saídas']]) {
    const item = document.createElement('span');
    const swatch = document.createElement('span');
    swatch.className = `sitio-swatch sitio-serie-${classe}`;
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(' ' + label));
    legenda.appendChild(item);
  }
  bloco.appendChild(legenda);

  return bloco;
}

/**
 * blocoProximos30 — total a pagar e a receber nos próximos 30 dias
 * (inclui vencidas não pagas — dinheiro que ainda vai sair). Toque
 * leva pra aba Contas.
 */
function blocoProximos30(previstos) {
  const bloco = document.createElement('section');
  bloco.className = 'sitio-bloco';

  const h = document.createElement('h2');
  h.className = 'sitio-bloco-titulo';
  h.textContent = 'Próximos 30 dias';
  bloco.appendChild(h);

  const hoje = new Date();
  const limite = ymd(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 30));
  const janela = previstos.filter((l) => l.data_lancamento <= limite);
  const pagar = janela.filter((l) => l.tipo === 'saida')
    .reduce((acc, l) => acc + Number(l.valor_centavos), 0);
  const receber = janela.filter((l) => l.tipo === 'entrada')
    .reduce((acc, l) => acc + Number(l.valor_centavos), 0);

  const kpis = document.createElement('div');
  kpis.className = 'sitio-kpis';
  kpis.appendChild(kpiCard('A pagar', pagar, null));
  kpis.appendChild(kpiCard('A receber', receber, null));
  kpis.addEventListener('click', () => {
    document.querySelector('#sitio-abas button[data-aba="contas"]')?.click();
  });
  bloco.appendChild(kpis);

  return bloco;
}

/**
 * blocoProjecao — saldo realizado acumulado (all-time) ± previstos dos
 * próximos 90 dias (vencidas incluídas: vão sair de qualquer jeito).
 */
function blocoProjecao(realizados, previstos) {
  const bloco = document.createElement('section');
  bloco.className = 'sitio-bloco';

  const h = document.createElement('h2');
  h.className = 'sitio-bloco-titulo';
  h.textContent = 'Projeção — 90 dias';
  bloco.appendChild(h);

  const saldoAtual = realizados.reduce((acc, l) =>
    acc + Number(l.valor_centavos) * (l.tipo === 'entrada' ? 1 : -1), 0);

  const hoje = new Date();
  const limite = ymd(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 90));
  const futuro = previstos
    .filter((l) => l.data_lancamento <= limite)
    .reduce((acc, l) =>
      acc + Number(l.valor_centavos) * (l.tipo === 'entrada' ? 1 : -1), 0);

  const linhas = document.createElement('div');
  linhas.className = 'sitio-projecao';
  const fmtComSinal = (v) => (v < 0 ? '− ' : '') + fmtMoney(Math.abs(v));
  for (const [label, valor, forte] of [
    ['Saldo realizado (desde o início)', saldoAtual, false],
    ['Previstos nos próximos 90 dias', futuro, false],
    ['Saldo projetado', saldoAtual + futuro, true],
  ]) {
    const linha = document.createElement('div');
    linha.className = 'sitio-projecao-linha' + (forte ? ' forte' : '');
    const nome = document.createElement('span');
    nome.textContent = label;
    const val = document.createElement('span');
    val.textContent = fmtComSinal(valor);
    if (valor < 0) val.classList.add('negativo');
    linha.appendChild(nome);
    linha.appendChild(val);
    linhas.appendChild(linha);
  }
  bloco.appendChild(linhas);

  return bloco;
}

/**
 * tendencia — Δ% vs período anterior. `inverso=true` quando subir é RUIM
 * (saídas). Sem base de comparação (anterior 0/null) → null (KPI sem seta).
 * Seta + sinal no TEXTO (nunca só cor — acessibilidade).
 */
function tendencia(atual, anterior, inverso) {
  if (anterior === null || anterior === 0) return null;
  const pct = ((atual - anterior) / Math.abs(anterior)) * 100;
  if (!Number.isFinite(pct)) return null;
  const subiu = pct >= 0;
  return {
    texto: `${subiu ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}% vs anterior`,
    boa: inverso ? !subiu : subiu,
  };
}

function kpiCard(titulo, centavos, tend) {
  const card = document.createElement('div');
  card.className = 'kpi-card';

  const label = document.createElement('small');
  label.className = 'kpi-label';
  label.textContent = titulo;

  const valor = document.createElement('strong');
  valor.className = 'kpi-valor';
  if (centavos < 0) valor.classList.add('negativo');
  valor.textContent = (centavos < 0 ? '−' : '') + fmtMoney(Math.abs(centavos));

  card.appendChild(label);
  card.appendChild(valor);

  if (tend) {
    const t = document.createElement('small');
    t.className = 'kpi-tendencia ' + (tend.boa ? 'boa' : 'ruim');
    t.textContent = tend.texto;
    card.appendChild(t);
  }
  return card;
}

/**
 * blocoDonut — título + donut (conic-gradient com gap de 2° entre fatias,
 * total no furo) + legenda com swatch/nome/valor/% por grupo raiz. Toque
 * na linha da legenda expande as subcategorias em barras horizontais
 * (uma cor só — magnitude dentro do grupo, não identidade).
 */
function blocoDonut(titulo, lancamentos, tipo, categorias) {
  const bloco = document.createElement('section');
  bloco.className = 'sitio-bloco';

  const h = document.createElement('h2');
  h.className = 'sitio-bloco-titulo';
  h.textContent = titulo;
  bloco.appendChild(h);

  const doTipo = lancamentos.filter((l) => l.tipo === tipo);
  if (!doTipo.length) {
    const vazio = document.createElement('p');
    vazio.className = 'sitio-bloco-vazio';
    vazio.textContent = tipo === 'saida'
      ? 'Sem gastos no período.'
      : 'Sem receitas no período.';
    bloco.appendChild(vazio);
    return bloco;
  }

  // Agrega por grupo raiz (e guarda o detalhe por subcategoria).
  const grupos = new Map(); // raizId → { raiz, total, subs: Map(catId → total) }
  for (const l of doTipo) {
    const raiz = grupoRaizDe(l.categoria_id, categorias);
    const chave = raiz?.id ?? 'sem';
    if (!grupos.has(chave)) {
      grupos.set(chave, { raiz, total: 0, subs: new Map() });
    }
    const g = grupos.get(chave);
    g.total += Number(l.valor_centavos);
    g.subs.set(l.categoria_id, (g.subs.get(l.categoria_id) ?? 0) + Number(l.valor_centavos));
  }
  const ordenados = [...grupos.values()].sort((a, b) => b.total - a.total);
  const totalGeral = ordenados.reduce((acc, g) => acc + g.total, 0);

  // Donut: fatias em conic-gradient + gap de 2° na cor da superfície
  // (spacer do spec de marks — separa fatias sem borda).
  const GAP_GRAUS = 2;
  const wrap = document.createElement('div');
  wrap.className = 'sitio-donut-wrap';

  const donut = document.createElement('div');
  donut.className = 'sitio-donut';
  const fatias = [];
  let anguloAtual = 0;
  for (const g of ordenados) {
    const graus = (g.total / totalGeral) * 360;
    const cor = '#' + (g.raiz?.cor_hex || COR_FALLBACK);
    const fimFatia = anguloAtual + Math.max(0, graus - GAP_GRAUS);
    fatias.push(`${cor} ${anguloAtual}deg ${fimFatia}deg`);
    fatias.push(`var(--bg-primary) ${fimFatia}deg ${anguloAtual + graus}deg`);
    anguloAtual += graus;
  }
  donut.style.background = `conic-gradient(${fatias.join(', ')})`;

  const furo = document.createElement('div');
  furo.className = 'sitio-donut-furo';
  const furoLabel = document.createElement('small');
  furoLabel.textContent = 'Total';
  const furoValor = document.createElement('strong');
  furoValor.textContent = fmtMoney(totalGeral);
  furo.appendChild(furoLabel);
  furo.appendChild(furoValor);
  donut.appendChild(furo);
  wrap.appendChild(donut);

  // Legenda (é também a "tabela" do gráfico: nome + valor + %).
  const legenda = document.createElement('div');
  legenda.className = 'sitio-legenda';
  for (const g of ordenados) {
    const linha = document.createElement('button');
    linha.type = 'button';
    linha.className = 'sitio-legenda-linha';

    const swatch = document.createElement('span');
    swatch.className = 'sitio-swatch';
    swatch.style.backgroundColor = '#' + (g.raiz?.cor_hex || COR_FALLBACK);

    const nome = document.createElement('span');
    nome.className = 'sitio-legenda-nome';
    nome.textContent = g.raiz?.nome ?? '(sem categoria)';

    const valor = document.createElement('span');
    valor.className = 'sitio-legenda-valor';
    const pct = ((g.total / totalGeral) * 100).toFixed(0);
    valor.textContent = `${fmtMoney(g.total)} · ${pct}%`;

    linha.appendChild(swatch);
    linha.appendChild(nome);
    linha.appendChild(valor);
    legenda.appendChild(linha);

    // Subcategorias em barras (expande no toque; só quando há detalhe).
    const detalhe = document.createElement('div');
    detalhe.className = 'sitio-subbarras';
    detalhe.hidden = true;
    const subsOrdenadas = [...g.subs.entries()].sort((a, b) => b[1] - a[1]);
    const maiorSub = subsOrdenadas[0]?.[1] ?? 1;
    for (const [catId, subTotal] of subsOrdenadas) {
      const cat = categorias.find((c) => c.id === catId);
      const item = document.createElement('div');
      item.className = 'sitio-subbarra';

      const rotulo = document.createElement('span');
      rotulo.className = 'sitio-subbarra-rotulo';
      rotulo.textContent = cat?.nome ?? '(desconhecida)';

      const trilho = document.createElement('div');
      trilho.className = 'sitio-subbarra-trilho';
      const barra = document.createElement('div');
      barra.className = 'sitio-subbarra-fill';
      barra.style.width = `${Math.max(2, (subTotal / maiorSub) * 100)}%`;
      barra.style.backgroundColor = '#' + (g.raiz?.cor_hex || COR_FALLBACK);
      trilho.appendChild(barra);

      const subValor = document.createElement('span');
      subValor.className = 'sitio-subbarra-valor';
      subValor.textContent = fmtMoney(subTotal);

      item.appendChild(rotulo);
      item.appendChild(trilho);
      item.appendChild(subValor);
      detalhe.appendChild(item);
    }
    legenda.appendChild(detalhe);

    linha.addEventListener('click', () => {
      detalhe.hidden = !detalhe.hidden;
    });
  }
  wrap.appendChild(legenda);
  bloco.appendChild(wrap);

  return bloco;
}

// ──────────── Contas a pagar/receber (4.B.3d) ────────────
//
// Conta = lançamento status='previsto'; data_lancamento = vencimento.
// Vencida (< hoje) ganha destaque e fica no topo (ordem asc natural).
// ✓ Pago/Recebido vira 'realizado' — a data real é escolhida na hora
// (hoje ou o vencimento) e o lançamento passa a contar nos números.

let entidadeSitioId = null;

async function getEntidadeSitioId() {
  if (entidadeSitioId) return entidadeSitioId;
  const { data } = await supabase
    .from('entidades')
    .select('id')
    .eq('slug', 'sitio')
    .single();
  if (data?.id) entidadeSitioId = data.id;
  return entidadeSitioId;
}

async function carregarContas() {
  const el = document.getElementById('sitio-contas-lista');
  if (!el) return;

  const btnNova = document.getElementById('btn-nova-conta');
  if (btnNova && !btnNova.dataset.ligado) {
    btnNova.dataset.ligado = '1';
    btnNova.addEventListener('click', () => abrirNovaConta());
  }

  const { data, error } = await supabase
    .from('sitio_lancamentos')
    .select(`
      id, tipo, data_lancamento, descricao, valor_centavos,
      forma_pagamento, fornecedor, categoria_id, sitio_categorias(nome)
    `)
    .eq('arquivado', false)
    .eq('status', 'previsto')
    .order('data_lancamento', { ascending: true });

  if (error) {
    console.error('[sitio] erro no SELECT de contas', error);
    showToast('Erro ao carregar contas', 'error');
    return;
  }

  el.innerHTML = '';
  const contas = data || [];

  if (!contas.length) {
    const vazio = document.createElement('div');
    vazio.className = 'notas-vazio';
    vazio.textContent = 'Nenhuma conta futura. Cadastra em "+ Nova conta" ' +
      'o que tem pra pagar ou receber.';
    el.appendChild(vazio);
    return;
  }

  const hoje = ymd(new Date());
  for (const conta of contas) {
    el.appendChild(criarCardConta(conta, hoje));
  }
}

function criarCardConta(conta, hoje) {
  const vencida = conta.data_lancamento < hoje;
  const card = document.createElement('article');
  card.className = 'nota-card' + (vencida ? ' conta-vencida' : '');

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'nota-card-header';

  const titulo = document.createElement('span');
  titulo.className = 'nota-titulo';
  const rotuloTipo = conta.tipo === 'entrada' ? 'a receber' : 'a pagar';
  titulo.textContent = `${conta.tipo === 'entrada' ? '+' : '−'} ${fmtMoney(conta.valor_centavos)} · ${conta.descricao}`;

  const meta = document.createElement('small');
  meta.className = 'nota-meta';
  const [ano, mes, dia] = conta.data_lancamento.split('-');
  meta.textContent = [
    (vencida ? '⚠️ VENCIDA — ' : '') + `vence ${dia}/${mes}/${ano}`,
    rotuloTipo,
    conta.sitio_categorias?.nome ?? '(sem categoria)',
  ].join(' · ');

  header.appendChild(titulo);
  header.appendChild(meta);
  card.appendChild(header);

  const corpo = document.createElement('div');
  corpo.className = 'nota-corpo';
  corpo.hidden = true;

  const acoes = document.createElement('div');
  acoes.className = 'nota-acoes';

  const btnPagar = document.createElement('button');
  btnPagar.type = 'button';
  btnPagar.textContent = conta.tipo === 'entrada' ? '✓ Recebido' : '✓ Pago';
  btnPagar.addEventListener('click', () => confirmarPagamento(conta));

  const btnEditar = document.createElement('button');
  btnEditar.type = 'button';
  btnEditar.textContent = '✏️ Editar';
  btnEditar.addEventListener('click', () => abrirEditor(conta));

  const btnArq = document.createElement('button');
  btnArq.type = 'button';
  btnArq.textContent = '🗑 Arquivar';
  btnArq.addEventListener('click', async () => {
    const { error } = await supabase
      .from('sitio_lancamentos')
      .update({ arquivado: true })
      .eq('id', conta.id);
    if (error) {
      showToast('Erro ao arquivar', 'error');
      return;
    }
    showToast('Conta arquivada');
    carregarContas().catch(() => {});
  });

  acoes.appendChild(btnPagar);
  acoes.appendChild(btnEditar);
  acoes.appendChild(btnArq);
  corpo.appendChild(acoes);
  card.appendChild(corpo);

  header.addEventListener('click', () => {
    corpo.hidden = !corpo.hidden;
  });

  return card;
}

/**
 * confirmarPagamento — vira `realizado`. A data REAL importa pros números
 * do Resumo: pergunta se foi hoje ou se mantém a do vencimento.
 */
function confirmarPagamento(conta) {
  const verbo = conta.tipo === 'entrada' ? 'Recebido' : 'Pago';
  const hoje = ymd(new Date());

  const marcar = async (dataReal) => {
    const { error } = await supabase
      .from('sitio_lancamentos')
      .update({ status: 'realizado', data_lancamento: dataReal })
      .eq('id', conta.id);
    if (error) {
      showToast('Erro ao marcar', 'error');
      return;
    }
    showToast(`${verbo} ✓ — já conta nos números do Resumo`);
    carregarContas().catch(() => {});
  };

  const [ano, mes, dia] = conta.data_lancamento.split('-');
  showModal({
    title: `${verbo} — qual data?`,
    body: `${conta.descricao} (${fmtMoney(conta.valor_centavos)}). ` +
      'A data entra nos totais do período.',
    actions: [
      { label: 'Cancelar', type: 'secondary' },
      {
        label: `No vencimento (${dia}/${mes})`,
        type: 'secondary',
        onClick: () => marcar(conta.data_lancamento),
      },
      {
        label: 'Hoje',
        type: 'primary',
        onClick: () => marcar(hoje),
      },
    ],
  });
}

/**
 * abrirNovaConta — cadastra previsto(s). "Repetir por N meses" cria N
 * rows de uma vez (decisão do plano: sem engine de recorrência — editar/
 * apagar depois é por row). Categoria filtrada pelo tipo escolhido.
 */
async function abrirNovaConta() {
  const categorias = await getCategorias();
  const sitioId = await getEntidadeSitioId();
  if (!sitioId) {
    showToast('Entidade do sítio não encontrada', 'error');
    return;
  }

  const form = document.createElement('div');
  form.className = 'nota-editor';

  const selTipo = document.createElement('select');
  selTipo.className = 'nota-editor-titulo';
  for (const [valor, label] of [['saida', '− A pagar'], ['entrada', '+ A receber']]) {
    const opt = document.createElement('option');
    opt.value = valor;
    opt.textContent = label;
    selTipo.appendChild(opt);
  }

  const inputDesc = document.createElement('input');
  inputDesc.type = 'text';
  inputDesc.className = 'nota-editor-titulo';
  inputDesc.placeholder = 'Descrição (ex: Salário Zé)';

  const inputValor = document.createElement('input');
  inputValor.type = 'text';
  inputValor.inputMode = 'decimal';
  inputValor.className = 'nota-editor-titulo';
  inputValor.placeholder = 'Valor em reais (ex: 1.800,00)';

  const inputVenc = document.createElement('input');
  inputVenc.type = 'date';
  inputVenc.className = 'nota-editor-titulo';

  const selCategoria = document.createElement('select');
  selCategoria.className = 'nota-editor-titulo';
  const popularCategorias = () => {
    selCategoria.innerHTML = '';
    for (const cat of categorias.filter((c) => c.tipo === selTipo.value)) {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.nome;
      selCategoria.appendChild(opt);
    }
  };
  popularCategorias();
  selTipo.addEventListener('change', popularCategorias);

  const selForma = document.createElement('select');
  selForma.className = 'nota-editor-titulo';
  for (const forma of ['pix', 'dinheiro', 'transferencia', 'cartao', 'boleto']) {
    const opt = document.createElement('option');
    opt.value = forma;
    opt.textContent = 'Pagamento: ' + forma;
    selForma.appendChild(opt);
  }

  const inputRepetir = document.createElement('input');
  inputRepetir.type = 'number';
  inputRepetir.min = '1';
  inputRepetir.max = '24';
  inputRepetir.value = '1';
  inputRepetir.className = 'nota-editor-titulo';
  inputRepetir.title = 'Repetir por N meses';
  const labelRepetir = document.createElement('label');
  labelRepetir.className = 'sitio-label-repetir';
  labelRepetir.textContent = 'Repetir por quantos meses? (1 = só esta)';
  labelRepetir.appendChild(inputRepetir);

  form.appendChild(selTipo);
  form.appendChild(inputDesc);
  form.appendChild(inputValor);
  form.appendChild(inputVenc);
  form.appendChild(selCategoria);
  form.appendChild(selForma);
  form.appendChild(labelRepetir);

  showModal({
    title: 'Nova conta',
    body: form,
    actions: [
      { label: 'Cancelar', type: 'secondary' },
      {
        label: 'Salvar',
        type: 'primary',
        onClick: async () => {
          const descricao = inputDesc.value.trim();
          const valorCentavos = parseReaisParaCentavos(inputValor.value);
          const venc = inputVenc.value;
          const repetir = Math.min(24, Math.max(1, Number(inputRepetir.value) || 1));
          if (!descricao || !valorCentavos || !venc) {
            showToast('Descrição, valor (> 0) e vencimento são obrigatórios', 'error');
            return false; // segura o modal
          }

          const [ano, mes, dia] = venc.split('-').map(Number);
          const rows = [];
          for (let i = 0; i < repetir; i++) {
            rows.push({
              entidade_id: sitioId,
              categoria_id: selCategoria.value,
              tipo: selTipo.value,
              data_lancamento: ymd(new Date(ano, mes - 1 + i, dia)),
              descricao: repetir > 1 ? `${descricao} (${i + 1}/${repetir})` : descricao,
              valor_centavos: valorCentavos,
              forma_pagamento: selForma.value,
              origem: 'manual',
              status: 'previsto',
            });
          }

          const { error } = await supabase.from('sitio_lancamentos').insert(rows);
          if (error) {
            showToast('Erro ao salvar conta', 'error');
            return false;
          }
          showToast(repetir > 1 ? `${repetir} contas criadas` : 'Conta criada');
          carregarContas().catch(() => {});
        },
      },
    ],
  });
}

async function getCategorias() {
  if (categoriasCache) return categoriasCache;
  const { data, error } = await supabase
    .from('sitio_categorias')
    .select('id, slug, nome, tipo, cor_hex, categoria_pai_id')
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

/** Resolve a categoria RAIZ (grupo) de uma categoria qualquer. */
function grupoRaizDe(categoriaId, categorias) {
  let cat = categorias.find((c) => c.id === categoriaId);
  while (cat?.categoria_pai_id) {
    const pai = categorias.find((c) => c.id === cat.categoria_pai_id);
    if (!pai) break;
    cat = pai;
  }
  return cat ?? null;
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
    // 4.B.3a: a lista de Lançamentos mostra só o que ACONTECEU. Previstos
    // (contas a pagar/receber) vivem na aba Contas (4.B.3d).
    .eq('status', 'realizado')
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
