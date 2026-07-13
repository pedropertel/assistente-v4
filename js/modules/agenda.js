// Módulo Agenda (4.C.2, reprojetada) — calendário mensal + dia + editor.
//
// Feedback do Pedro no 1º teste: lista simples "muito básica, não
// atende". Redesign: vista de CALENDÁRIO (estilo Google Calendar) —
// grade do mês com bolinhas coloridas por empresa, ‹ › navega, "Hoje"
// volta, toque no dia lista os eventos dele embaixo. Editor com:
//   - seletor de data PRÓPRIO (grade que seleciona e FECHA no toque —
//     o input date nativo do iOS não fecha sozinho);
//   - horas em campos HH/MM com AUTO-AVANÇO (digitou 2 dígitos → pula
//     pro minuto → pula pra hora final; fim auto-preenche +1h).
//
// Fuso: timestamptz UTC no banco; exibição/agrupamento SEMPRE em
// America/Sao_Paulo; escrita com offset -03:00 explícito (sem DST no BR).
// Recorrência e lembretes continuam fora (Backlog: depois).

import { supabase } from '../core/supabase.js';
import { show as showToast } from '../core/toast.js';
import { show as showModal } from '../core/modal.js';

const LABELS_TIPO_FALLBACK = {
  reuniao: 'Reunião',
  tarefa: 'Tarefa',
  pessoal: 'Pessoal',
  lembrete: 'Lembrete',
  bloqueio: 'Bloqueio',
};
const EMOJI_TIPO = {
  reuniao: '🤝',
  tarefa: '✓',
  pessoal: '🏠',
  lembrete: '🔔',
  bloqueio: '🚫',
};
let labelsTipo = null;

// Sem filtro de empresa (decisão do Pedro 2026-07-13): agenda é visão
// unificada da vida dele — a cor do dot já diz de qual empresa é.
let entidadesCache = null;

const TZ = 'America/Sao_Paulo';

// Estado da vista: mês exibido (1º dia) e dia selecionado ('YYYY-MM-DD').
let mesExibido = null; // Date (dia 1 do mês)
let diaSelecionado = null;

document.addEventListener('page:change', (ev) => {
  if (ev.detail !== 'agenda') return;
  if (!mesExibido) {
    const hoje = hojeYmd();
    diaSelecionado = hoje;
    const [a, m] = hoje.split('-').map(Number);
    mesExibido = new Date(a, m - 1, 1);
  }
  carregarAgenda().catch((err) => {
    console.error('[agenda] erro ao carregar', err);
  });
});

// ──────────── Helpers de data/fuso ────────────

function hojeYmd() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

function ymdLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diaBrasilia(timestamp) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ })
    .format(new Date(timestamp));
}

function horaBrasilia(timestamp) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function partesBrasilia(timestamp) {
  return {
    data: diaBrasilia(timestamp),
    hora: horaBrasilia(timestamp),
  };
}

/** "Hoje · sex, 18 de jul" / "seg, 20 de jul". */
function rotuloDia(ymd) {
  const d = new Date(`${ymd}T12:00:00-03:00`);
  const texto = d.toLocaleDateString('pt-BR', {
    timeZone: TZ,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).replace(/\./g, '');
  return ymd === hojeYmd() ? `Hoje · ${texto}` : texto;
}

// ──────────── Dados ────────────

async function getLabelsTipo() {
  if (labelsTipo) return labelsTipo;
  const { data, error } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .like('chave', 'ui_labels.evento.tipo.%');
  labelsTipo = { ...LABELS_TIPO_FALLBACK };
  if (!error && data) {
    for (const row of data) {
      const tipo = row.chave.split('.').pop();
      if (typeof row.valor === 'string') labelsTipo[tipo] = row.valor;
    }
  }
  return labelsTipo;
}

async function getEntidades() {
  if (entidadesCache) return entidadesCache;
  const { data, error } = await supabase
    .from('entidades')
    .select('id, nome, icone, cor_hex')
    .eq('ativa', true)
    .order('ordem');
  if (error || !data) {
    console.error('[agenda] erro ao carregar entidades', error);
    return [];
  }
  entidadesCache = data;
  return entidadesCache;
}

/** Eventos do mês exibido (passado visível — navegar mostra história). */
async function buscarEventosDoMes() {
  const ini = ymdLocal(mesExibido);
  const proximoMes = new Date(mesExibido.getFullYear(), mesExibido.getMonth() + 1, 1);
  const fim = ymdLocal(proximoMes);

  let q = supabase
    .from('eventos')
    .select(`
      id, titulo, descricao, tipo, inicio, fim, dia_inteiro, local, url,
      entidade_id, entidades(nome, icone, cor_hex)
    `)
    .eq('arquivado', false)
    .gte('inicio', `${ini}T00:00:00-03:00`)
    .lt('inicio', `${fim}T00:00:00-03:00`)
    .order('inicio');

  const { data, error } = await q;
  if (error) {
    console.error('[agenda] erro no SELECT', error);
    showToast('Erro ao carregar agenda', 'error');
    return [];
  }
  return data || [];
}

/** Próximos eventos (independente do mês exibido) — visão "o que vem aí". */
async function buscarProximos() {
  const { data, error } = await supabase
    .from('eventos')
    .select(`
      id, titulo, descricao, tipo, inicio, fim, dia_inteiro, local, url,
      entidade_id, entidades(nome, icone, cor_hex)
    `)
    .eq('arquivado', false)
    .gte('fim', new Date().toISOString())
    .order('inicio')
    .limit(30);

  if (error) {
    console.error('[agenda] erro no SELECT de próximos', error);
    return [];
  }
  return data || [];
}

// ──────────── Vista principal ────────────

export async function carregarAgenda() {
  const raiz = document.getElementById('agenda-conteudo');
  if (!raiz) return;

  const labels = await getLabelsTipo();
  const [eventos, proximos] = await Promise.all([
    buscarEventosDoMes(),
    buscarProximos(),
  ]);

  // Índice dia → eventos (pros dots e pra lista do dia).
  const porDia = new Map();
  for (const ev of eventos) {
    const dia = diaBrasilia(ev.inicio);
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(ev);
  }

  raiz.innerHTML = '';

  // Coluna do calendário (desktop: esquerda; mobile: em cima).
  const colCal = document.createElement('div');
  colCal.className = 'agenda-col-cal';
  colCal.appendChild(criarCabecalhoMes());
  colCal.appendChild(criarGradeMes(mesExibido, {
    porDia,
    selecionado: diaSelecionado,
    aoTocarDia: (ymd) => {
      diaSelecionado = ymd;
      carregarAgenda().catch(() => {});
    },
  }));
  colCal.appendChild(criarListaDoDia(porDia.get(diaSelecionado) ?? [], labels));
  raiz.appendChild(colCal);

  // Coluna dos próximos (desktop: direita; mobile: embaixo) — visão
  // corrida de tudo que vem aí, sem clicar dia a dia.
  const colProx = document.createElement('div');
  colProx.className = 'agenda-col-proximos';
  const tituloProx = document.createElement('h2');
  tituloProx.className = 'agenda-dia';
  tituloProx.textContent = 'Próximos eventos';
  colProx.appendChild(tituloProx);
  if (!proximos.length) {
    const vazio = document.createElement('p');
    vazio.className = 'sitio-bloco-vazio';
    vazio.textContent = 'Nada agendado daqui pra frente.';
    colProx.appendChild(vazio);
  } else {
    for (const evento of proximos) {
      colProx.appendChild(criarCardEvento(evento, labels, { comData: true }));
    }
  }
  raiz.appendChild(colProx);
}

function criarCabecalhoMes() {
  const header = document.createElement('div');
  header.className = 'agenda-mes-header';

  const btnAnt = document.createElement('button');
  btnAnt.type = 'button';
  btnAnt.className = 'agenda-nav';
  btnAnt.textContent = '‹';
  btnAnt.setAttribute('aria-label', 'Mês anterior');
  btnAnt.addEventListener('click', () => mudarMes(-1));

  const titulo = document.createElement('strong');
  titulo.className = 'agenda-mes-titulo';
  titulo.textContent = mesExibido.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });

  const btnProx = document.createElement('button');
  btnProx.type = 'button';
  btnProx.className = 'agenda-nav';
  btnProx.textContent = '›';
  btnProx.setAttribute('aria-label', 'Próximo mês');
  btnProx.addEventListener('click', () => mudarMes(1));

  const btnHoje = document.createElement('button');
  btnHoje.type = 'button';
  btnHoje.className = 'agenda-hoje';
  btnHoje.textContent = 'Hoje';
  btnHoje.addEventListener('click', () => {
    const hoje = hojeYmd();
    diaSelecionado = hoje;
    const [a, m] = hoje.split('-').map(Number);
    mesExibido = new Date(a, m - 1, 1);
    carregarAgenda().catch(() => {});
  });

  const btnNovo = document.createElement('button');
  btnNovo.type = 'button';
  btnNovo.className = 'btn btn-primary agenda-btn-novo';
  btnNovo.textContent = '+ Novo';
  btnNovo.addEventListener('click', () => abrirEditorEvento(null));

  header.appendChild(btnAnt);
  header.appendChild(titulo);
  header.appendChild(btnProx);
  header.appendChild(btnHoje);
  header.appendChild(btnNovo);
  return header;
}

function mudarMes(delta) {
  mesExibido = new Date(mesExibido.getFullYear(), mesExibido.getMonth() + delta, 1);
  // Seleção acompanha: dia 1 do mês novo (ou hoje, se for o mês atual).
  const hoje = hojeYmd();
  diaSelecionado = hoje.startsWith(ymdLocal(mesExibido).slice(0, 7))
    ? hoje
    : ymdLocal(mesExibido);
  carregarAgenda().catch(() => {});
}

/**
 * criarGradeMes — grade 7×N do mês. Usada na vista principal (com dots
 * por empresa + seleção) e no seletor de data do editor (aoTocarDia
 * seleciona e FECHA — o pedido do Pedro).
 */
function criarGradeMes(mes, { porDia = new Map(), selecionado = null, aoTocarDia }) {
  const wrap = document.createElement('div');
  wrap.className = 'agenda-grade';

  for (const dia of ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']) {
    const cab = document.createElement('span');
    cab.className = 'agenda-grade-semana';
    cab.textContent = dia;
    wrap.appendChild(cab);
  }

  const primeiroDia = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const diasNoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const hoje = hojeYmd();

  // Células vazias até o dia da semana do dia 1 (domingo = 0).
  for (let i = 0; i < primeiroDia.getDay(); i++) {
    wrap.appendChild(document.createElement('span'));
  }

  for (let dia = 1; dia <= diasNoMes; dia++) {
    const ymd = ymdLocal(new Date(mes.getFullYear(), mes.getMonth(), dia));
    const cel = document.createElement('button');
    cel.type = 'button';
    cel.className = 'agenda-grade-dia' +
      (ymd === hoje ? ' hoje' : '') +
      (ymd === selecionado ? ' selecionado' : '');

    const num = document.createElement('span');
    num.textContent = String(dia);
    cel.appendChild(num);

    // Dots: identidade = EMPRESA (cor da entidade), máx 3 por célula.
    const eventosDoDia = porDia.get(ymd) ?? [];
    if (eventosDoDia.length) {
      const dots = document.createElement('span');
      dots.className = 'agenda-dots';
      const cores = [...new Set(
        eventosDoDia.map((e) => e.entidades?.cor_hex || '6B7280'),
      )].slice(0, 3);
      for (const cor of cores) {
        const dot = document.createElement('i');
        dot.style.backgroundColor = '#' + cor;
        dots.appendChild(dot);
      }
      cel.appendChild(dots);
    }

    cel.addEventListener('click', () => aoTocarDia(ymd));
    wrap.appendChild(cel);
  }

  return wrap;
}

function criarListaDoDia(eventos, labels) {
  const secao = document.createElement('div');
  secao.className = 'agenda-dia-secao';

  const titulo = document.createElement('h2');
  titulo.className = 'agenda-dia';
  titulo.textContent = rotuloDia(diaSelecionado);
  secao.appendChild(titulo);

  if (!eventos.length) {
    const vazio = document.createElement('p');
    vazio.className = 'sitio-bloco-vazio';
    vazio.textContent = 'Sem eventos neste dia.';
    secao.appendChild(vazio);
    return secao;
  }

  for (const evento of eventos) {
    secao.appendChild(criarCardEvento(evento, labels));
  }
  return secao;
}

function criarCardEvento(evento, labels, { comData = false } = {}) {
  const card = document.createElement('article');
  card.className = 'nota-card agenda-card';

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'nota-card-header agenda-card-header';

  const hora = document.createElement('span');
  hora.className = 'agenda-hora';
  const textoHora = evento.dia_inteiro
    ? 'dia inteiro'
    : `${horaBrasilia(evento.inicio)}–${horaBrasilia(evento.fim)}`;
  if (comData) {
    // Lista de próximos: a data entra em cima da hora.
    const dataEl = document.createElement('span');
    dataEl.className = 'agenda-hora-data';
    dataEl.textContent = rotuloDia(diaBrasilia(evento.inicio));
    hora.appendChild(dataEl);
    hora.appendChild(document.createTextNode(textoHora));
  } else {
    hora.textContent = textoHora;
  }

  const corpo = document.createElement('span');
  corpo.className = 'agenda-card-corpo';

  const titulo = document.createElement('span');
  titulo.className = 'nota-titulo';
  titulo.textContent = `${EMOJI_TIPO[evento.tipo] ?? ''} ${evento.titulo}`.trim();

  const meta = document.createElement('small');
  meta.className = 'nota-meta';
  meta.textContent = [
    labels[evento.tipo] ?? evento.tipo,
    evento.entidades
      ? `${evento.entidades.icone ?? ''} ${evento.entidades.nome}`.trim()
      : null,
    evento.local ? `📍 ${evento.local}` : null,
  ].filter(Boolean).join(' · ');

  corpo.appendChild(titulo);
  corpo.appendChild(meta);
  header.appendChild(hora);
  header.appendChild(corpo);
  card.appendChild(header);

  const detalhe = document.createElement('div');
  detalhe.className = 'nota-corpo';
  detalhe.hidden = true;

  if (evento.descricao) {
    const desc = document.createElement('p');
    desc.style.margin = '0';
    desc.textContent = evento.descricao;
    detalhe.appendChild(desc);
  }
  if (evento.url) {
    const link = document.createElement('a');
    link.href = evento.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = '🔗 ' + evento.url;
    link.className = 'agenda-link';
    detalhe.appendChild(link);
  }

  const acoes = document.createElement('div');
  acoes.className = 'nota-acoes';

  const btnEditar = document.createElement('button');
  btnEditar.type = 'button';
  btnEditar.textContent = '✏️ Editar';
  btnEditar.addEventListener('click', () => abrirEditorEvento(evento));

  const btnArq = document.createElement('button');
  btnArq.type = 'button';
  btnArq.textContent = '🗑 Arquivar';
  btnArq.addEventListener('click', async () => {
    const { error } = await supabase
      .from('eventos')
      .update({ arquivado: true })
      .eq('id', evento.id);
    if (error) {
      showToast('Erro ao arquivar', 'error');
      return;
    }
    showToast('Evento arquivado');
    carregarAgenda().catch(() => {});
  });

  acoes.appendChild(btnEditar);
  acoes.appendChild(btnArq);
  detalhe.appendChild(acoes);
  card.appendChild(detalhe);

  header.addEventListener('click', () => {
    detalhe.hidden = !detalhe.hidden;
  });

  return card;
}

// ──────────── Editor (data que fecha no toque + horas com auto-avanço) ────────────

/**
 * criarSeletorData — botão com a data por extenso; toque abre a MESMA
 * grade do calendário logo abaixo; tocar num dia seleciona e FECHA.
 */
function criarSeletorData(ymdInicial) {
  let valor = ymdInicial || hojeYmd();
  let aberto = false;

  const wrap = document.createElement('div');
  wrap.className = 'agenda-seletor-data';

  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'nota-editor-titulo agenda-seletor-data-btn';

  const areaGrade = document.createElement('div');
  areaGrade.className = 'agenda-seletor-grade';
  areaGrade.hidden = true;

  let mesPicker = null;
  const atualizarBotao = () => {
    const d = new Date(`${valor}T12:00:00-03:00`);
    botao.textContent = '📅 ' + d.toLocaleDateString('pt-BR', {
      timeZone: TZ,
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).replace(/\./g, '');
  };

  const renderGrade = () => {
    areaGrade.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'agenda-mes-header compacto';
    const btnAnt = document.createElement('button');
    btnAnt.type = 'button';
    btnAnt.className = 'agenda-nav';
    btnAnt.textContent = '‹';
    btnAnt.addEventListener('click', () => {
      mesPicker = new Date(mesPicker.getFullYear(), mesPicker.getMonth() - 1, 1);
      renderGrade();
    });
    const titulo = document.createElement('strong');
    titulo.className = 'agenda-mes-titulo';
    titulo.textContent = mesPicker.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
    const btnProx = document.createElement('button');
    btnProx.type = 'button';
    btnProx.className = 'agenda-nav';
    btnProx.textContent = '›';
    btnProx.addEventListener('click', () => {
      mesPicker = new Date(mesPicker.getFullYear(), mesPicker.getMonth() + 1, 1);
      renderGrade();
    });
    header.appendChild(btnAnt);
    header.appendChild(titulo);
    header.appendChild(btnProx);
    areaGrade.appendChild(header);

    areaGrade.appendChild(criarGradeMes(mesPicker, {
      selecionado: valor,
      aoTocarDia: (ymd) => {
        valor = ymd; // seleciona…
        aberto = false; // …e FECHA (pedido do Pedro)
        areaGrade.hidden = true;
        atualizarBotao();
      },
    }));
  };

  botao.addEventListener('click', () => {
    aberto = !aberto;
    if (aberto) {
      const [a, m] = valor.split('-').map(Number);
      mesPicker = new Date(a, m - 1, 1);
      renderGrade();
    }
    areaGrade.hidden = !aberto;
  });

  atualizarBotao();
  wrap.appendChild(botao);
  wrap.appendChild(areaGrade);

  return { el: wrap, getValor: () => valor };
}

/**
 * criarCampoHora — HH e MM separados, inputmode numérico, AUTO-AVANÇO:
 * 2 dígitos na hora → pula pro minuto; 2 dígitos no minuto → aoCompletar
 * (o editor encadeia: fim do minuto inicial → hora final).
 */
function criarCampoHora(rotulo, aoCompletar) {
  const wrap = document.createElement('div');
  wrap.className = 'agenda-campo-hora';

  const label = document.createElement('small');
  label.textContent = rotulo;
  wrap.appendChild(label);

  const caixa = document.createElement('div');
  caixa.className = 'agenda-campo-hora-caixa';

  const fazerInput = (placeholder, max) => {
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.maxLength = 2;
    input.placeholder = placeholder;
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 2);
      if (input.value.length === 2 && Number(input.value) > max) {
        input.value = String(max);
      }
    });
    // Toque seleciona o conteúdo — digitar substitui em vez de emendar.
    input.addEventListener('focus', () => input.select());
    return input;
  };

  const hh = fazerInput('hh', 23);
  const mm = fazerInput('mm', 59);

  hh.addEventListener('input', () => {
    // 2 dígitos, ou 1 dígito impossível de virar hora válida (3-9) →
    // completa e pula pro minuto.
    if (hh.value.length === 2) mm.focus();
    else if (hh.value.length === 1 && Number(hh.value) >= 3) {
      hh.value = '0' + hh.value;
      mm.focus();
    }
  });
  mm.addEventListener('input', () => {
    if (mm.value.length === 2) aoCompletar?.();
  });

  const sep = document.createElement('span');
  sep.textContent = ':';

  caixa.appendChild(hh);
  caixa.appendChild(sep);
  caixa.appendChild(mm);
  wrap.appendChild(caixa);

  return {
    el: wrap,
    hh,
    mm,
    getValor: () => {
      if (!hh.value) return null;
      return `${hh.value.padStart(2, '0')}:${(mm.value || '0').padStart(2, '0')}`;
    },
    setValor: (hhmm) => {
      const [h, m] = (hhmm ?? '').split(':');
      hh.value = h ?? '';
      mm.value = m ?? '';
    },
    setDisabled: (v) => {
      hh.disabled = v;
      mm.disabled = v;
    },
  };
}

async function abrirEditorEvento(evento) {
  const entidades = await getEntidades();
  if (!entidades.length) {
    showToast('Nenhuma empresa ativa encontrada', 'error');
    return;
  }
  const labels = await getLabelsTipo();

  const form = document.createElement('div');
  form.className = 'nota-editor';

  const inputTitulo = document.createElement('input');
  inputTitulo.type = 'text';
  inputTitulo.className = 'nota-editor-titulo';
  inputTitulo.placeholder = 'Título do evento';
  inputTitulo.value = evento?.titulo ?? '';

  const selEntidade = document.createElement('select');
  selEntidade.className = 'nota-editor-titulo';
  for (const ent of entidades) {
    const opt = document.createElement('option');
    opt.value = ent.id;
    opt.textContent = [ent.icone, ent.nome].filter(Boolean).join(' ');
    if (ent.id === evento?.entidade_id) opt.selected = true;
    selEntidade.appendChild(opt);
  }

  const selTipo = document.createElement('select');
  selTipo.className = 'nota-editor-titulo';
  for (const tipo of Object.keys(LABELS_TIPO_FALLBACK)) {
    const opt = document.createElement('option');
    opt.value = tipo;
    opt.textContent = `${EMOJI_TIPO[tipo]} ${labels[tipo] ?? tipo}`;
    if (tipo === (evento?.tipo ?? 'reuniao')) opt.selected = true;
    selTipo.appendChild(opt);
  }

  const ini = evento ? partesBrasilia(evento.inicio) : null;
  const fimP = evento ? partesBrasilia(evento.fim) : null;

  // Novo evento nasce no DIA SELECIONADO do calendário.
  const seletorData = criarSeletorData(ini?.data ?? diaSelecionado);

  const chkDiaInteiro = document.createElement('input');
  chkDiaInteiro.type = 'checkbox';
  chkDiaInteiro.checked = evento?.dia_inteiro ?? false;
  const labelDia = document.createElement('label');
  labelDia.className = 'agenda-check-dia';
  labelDia.appendChild(chkDiaInteiro);
  labelDia.appendChild(document.createTextNode(' Dia inteiro'));

  const horas = document.createElement('div');
  horas.className = 'agenda-horas';
  let campoFim; // referência pro encadeamento abaixo
  const campoIni = criarCampoHora('Início', () => {
    // Minuto inicial completo → auto-preenche fim (+1h) e pula pra lá.
    const v = campoIni.getValor();
    if (v && !campoFim.getValor()) {
      const [h, m] = v.split(':').map(Number);
      campoFim.setValor(`${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
    campoFim.hh.focus();
  });
  campoFim = criarCampoHora('Fim', null);
  if (evento && !evento.dia_inteiro) {
    campoIni.setValor(ini?.hora);
    campoFim.setValor(fimP?.hora);
  }
  horas.appendChild(campoIni.el);
  horas.appendChild(campoFim.el);

  const sincronizarHoras = () => {
    campoIni.setDisabled(chkDiaInteiro.checked);
    campoFim.setDisabled(chkDiaInteiro.checked);
  };
  chkDiaInteiro.addEventListener('change', sincronizarHoras);
  sincronizarHoras();

  const inputLocal = document.createElement('input');
  inputLocal.type = 'text';
  inputLocal.className = 'nota-editor-titulo';
  inputLocal.placeholder = 'Local (opcional)';
  inputLocal.value = evento?.local ?? '';

  form.appendChild(inputTitulo);
  form.appendChild(selEntidade);
  form.appendChild(selTipo);
  form.appendChild(seletorData.el);
  form.appendChild(labelDia);
  form.appendChild(horas);
  form.appendChild(inputLocal);

  showModal({
    title: evento ? 'Editar evento' : 'Novo evento',
    body: form,
    actions: [
      { label: 'Cancelar', type: 'secondary' },
      {
        label: 'Salvar',
        type: 'primary',
        onClick: async () => {
          const titulo = inputTitulo.value.trim();
          const data = seletorData.getValor();
          const diaInteiro = chkDiaInteiro.checked;
          if (!titulo || !data) {
            showToast('Título e data são obrigatórios', 'error');
            return false; // segura o modal
          }

          let inicio;
          let fim;
          if (diaInteiro) {
            inicio = `${data}T00:00:00-03:00`;
            fim = `${data}T23:59:59-03:00`;
          } else {
            const horaIni = campoIni.getValor();
            if (!horaIni) {
              showToast('Hora de início é obrigatória (ou marca dia inteiro)', 'error');
              return false;
            }
            inicio = `${data}T${horaIni}:00-03:00`;
            const horaFim = campoFim.getValor();
            if (horaFim) {
              if (horaFim <= horaIni) {
                showToast('Hora final tem que ser depois do início', 'error');
                return false;
              }
              fim = `${data}T${horaFim}:00-03:00`;
            } else {
              fim = new Date(new Date(inicio).getTime() + 60 * 60 * 1000)
                .toISOString();
            }
          }

          const payload = {
            titulo,
            entidade_id: selEntidade.value,
            tipo: selTipo.value,
            inicio,
            fim,
            dia_inteiro: diaInteiro,
            local: inputLocal.value.trim() || null,
          };
          const op = evento
            ? supabase.from('eventos').update(payload).eq('id', evento.id)
            : supabase.from('eventos').insert({ ...payload, origem: 'manual' });
          const { error } = await op;
          if (error) {
            showToast('Erro ao salvar evento', 'error');
            return false;
          }
          showToast('Evento salvo');
          // Traz a vista pro dia do evento salvo.
          diaSelecionado = data;
          const [a, m] = data.split('-').map(Number);
          mesExibido = new Date(a, m - 1, 1);
          carregarAgenda().catch(() => {});
        },
      },
    ],
  });
}
