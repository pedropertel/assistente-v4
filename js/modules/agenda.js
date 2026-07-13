// Módulo Agenda (4.C.2a) — lista dos próximos eventos agrupada por dia.
//
// Fontes: criação manual aqui (4.C.2b) e, no futuro, tool da Marcela +
// sync Google (coluna google_event_id já reservada). Recorrência e
// lembretes ficaram FORA desta série (Backlog: "recorrência depois";
// lembrete depende do canal de notificação — mesma pendência do kanban).
//
// Fuso: inicio/fim são timestamptz (UTC no banco, convenção do projeto);
// agrupamento por dia e horas exibidas SEMPRE em America/Sao_Paulo.
// Brasília não tem mais horário de verão → offset fixo -03:00 na escrita.
//
// Recarrega via `page:change`; listeners internos (sem window bridge).

import { supabase } from '../core/supabase.js';
import { show as showToast } from '../core/toast.js';
import { show as showModal } from '../core/modal.js';

// Labels de tipo customizáveis via configuracoes (REGRA 12); emoji é
// vestimenta visual fixa do código.
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
let labelsTipo = null; // 1x por sessão

// Filtro de empresa (null = todas), memória de sessão.
let entidadeFiltro = null;
let entidadesCache = null;

const TZ = 'America/Sao_Paulo';

document.addEventListener('page:change', (ev) => {
  if (ev.detail !== 'agenda') return;
  carregarAgenda().catch((err) => {
    console.error('[agenda] erro ao carregar', err);
  });
});

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

/** 'YYYY-MM-DD' de um timestamp, no fuso de Brasília. */
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

/** "Hoje" / "Amanhã" / "seg, 20 de jul". */
function rotuloDia(ymdDia) {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const amanha = new Intl.DateTimeFormat('en-CA', { timeZone: TZ })
    .format(new Date(Date.now() + 24 * 60 * 60 * 1000));
  if (ymdDia === hoje) return 'Hoje';
  if (ymdDia === amanha) return 'Amanhã';
  // Meio-dia evita o dia "andar" na conversão de fuso.
  const d = new Date(`${ymdDia}T12:00:00-03:00`);
  return d.toLocaleDateString('pt-BR', {
    timeZone: TZ,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).replace(/\./g, '');
}

export async function carregarAgenda() {
  const listaEl = document.getElementById('agenda-lista');
  if (!listaEl) return;

  const labels = await getLabelsTipo();
  await montarFiltroEntidades();

  // + Novo (4.C.2b) — liga 1x.
  const btnNovo = document.getElementById('btn-novo-evento');
  if (btnNovo && !btnNovo.dataset.ligado) {
    btnNovo.dataset.ligado = '1';
    btnNovo.addEventListener('click', () => abrirEditorEvento(null));
  }

  // Próximos eventos: tudo que ainda não TERMINOU (em andamento conta).
  let q = supabase
    .from('eventos')
    .select(`
      id, titulo, descricao, tipo, inicio, fim, dia_inteiro, local, url,
      entidade_id, entidades(nome, icone, cor_hex)
    `)
    .eq('arquivado', false)
    .gte('fim', new Date().toISOString())
    .order('inicio')
    .limit(100);

  if (entidadeFiltro) q = q.eq('entidade_id', entidadeFiltro);

  const { data, error } = await q;

  if (error) {
    console.error('[agenda] erro no SELECT', error);
    showToast('Erro ao carregar agenda', 'error');
    return;
  }

  renderAgenda(listaEl, data || [], labels);
}

async function montarFiltroEntidades() {
  const el = document.getElementById('agenda-entidades');
  if (!el || el.dataset.ligado) return;
  el.dataset.ligado = '1';

  const entidades = await getEntidades();
  const opcoes = [
    { id: null, nome: 'Todas', icone: '🗂', cor_hex: '6B7280' },
    ...entidades,
  ];
  for (const ent of opcoes) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-entidade-chip' +
      (ent.id === entidadeFiltro ? ' ativa' : '');
    btn.style.setProperty('--chip-cor', '#' + (ent.cor_hex || '6B7280'));
    btn.textContent = [ent.icone, ent.nome].filter(Boolean).join(' ');
    btn.addEventListener('click', () => {
      if (ent.id === entidadeFiltro) return;
      entidadeFiltro = ent.id;
      el.querySelectorAll('button').forEach((b, i) => {
        b.classList.toggle('ativa', opcoes[i].id === entidadeFiltro);
      });
      carregarAgenda().catch(() => {});
    });
    el.appendChild(btn);
  }
}

function renderAgenda(listaEl, eventos, labels) {
  listaEl.innerHTML = '';

  if (!eventos.length) {
    const vazio = document.createElement('div');
    vazio.className = 'notas-vazio';
    vazio.textContent = 'Agenda livre daqui pra frente. Cria um evento no "+ Novo".';
    listaEl.appendChild(vazio);
    return;
  }

  // Agrupa por dia de INÍCIO (Brasília), preservando a ordem cronológica.
  let diaAtual = null;
  for (const evento of eventos) {
    const dia = diaBrasilia(evento.inicio);
    if (dia !== diaAtual) {
      diaAtual = dia;
      const header = document.createElement('h2');
      header.className = 'agenda-dia';
      header.textContent = rotuloDia(dia);
      listaEl.appendChild(header);
    }
    listaEl.appendChild(criarCardEvento(evento, labels));
  }
}

function criarCardEvento(evento, labels) {
  const card = document.createElement('article');
  card.className = 'nota-card agenda-card';

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'nota-card-header agenda-card-header';

  const hora = document.createElement('span');
  hora.className = 'agenda-hora';
  hora.textContent = evento.dia_inteiro
    ? 'dia inteiro'
    : `${horaBrasilia(evento.inicio)}–${horaBrasilia(evento.fim)}`;

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

  // Detalhe expande no toque (descrição + ações — editor na 4.C.2b).
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

/** Componentes de data/hora de um timestamp, no fuso de Brasília. */
function partesBrasilia(timestamp) {
  const d = new Date(timestamp);
  return {
    data: new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d),
    hora: new Intl.DateTimeFormat('pt-BR', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
    }).format(d),
  };
}

/**
 * abrirEditorEvento (4.C.2b) — criar/editar evento.
 * evento=null → criar (origem 'manual', tipo default reunião).
 * Escrita sempre com offset -03:00 explícito (UTC no banco, convenção).
 * Dia inteiro = 00:00 → 23:59 de Brasília; desabilita as horas no form.
 * Fim vazio = início + 1h. Recorrência/lembretes fora desta série.
 */
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
    if (ent.id === (evento?.entidade_id ?? entidadeFiltro)) opt.selected = true;
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

  const inputData = document.createElement('input');
  inputData.type = 'date';
  inputData.className = 'nota-editor-titulo';
  inputData.value = ini?.data ?? '';

  const chkDiaInteiro = document.createElement('input');
  chkDiaInteiro.type = 'checkbox';
  chkDiaInteiro.checked = evento?.dia_inteiro ?? false;
  const labelDia = document.createElement('label');
  labelDia.className = 'agenda-check-dia';
  labelDia.appendChild(chkDiaInteiro);
  labelDia.appendChild(document.createTextNode(' Dia inteiro'));

  const horas = document.createElement('div');
  horas.className = 'agenda-horas';
  const inputHoraIni = document.createElement('input');
  inputHoraIni.type = 'time';
  inputHoraIni.className = 'nota-editor-titulo';
  inputHoraIni.value = evento?.dia_inteiro ? '' : (ini?.hora ?? '');
  const inputHoraFim = document.createElement('input');
  inputHoraFim.type = 'time';
  inputHoraFim.className = 'nota-editor-titulo';
  inputHoraFim.value = evento?.dia_inteiro ? '' : (fimP?.hora ?? '');
  horas.appendChild(inputHoraIni);
  horas.appendChild(inputHoraFim);

  const sincronizarHoras = () => {
    inputHoraIni.disabled = chkDiaInteiro.checked;
    inputHoraFim.disabled = chkDiaInteiro.checked;
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
  form.appendChild(inputData);
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
          const data = inputData.value;
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
            const horaIni = inputHoraIni.value;
            if (!horaIni) {
              showToast('Hora de início é obrigatória (ou marca dia inteiro)', 'error');
              return false;
            }
            inicio = `${data}T${horaIni}:00-03:00`;
            if (inputHoraFim.value) {
              if (inputHoraFim.value <= horaIni) {
                showToast('Hora final tem que ser depois do início', 'error');
                return false;
              }
              fim = `${data}T${inputHoraFim.value}:00-03:00`;
            } else {
              // Sem hora final → 1h de duração (default de reunião).
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
          carregarAgenda().catch(() => {});
        },
      },
    ],
  });
}
