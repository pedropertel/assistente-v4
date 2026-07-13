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

// abrirEditorEvento chega na 4.C.2b.
function abrirEditorEvento(_evento) {
  showToast('Editor chega na próxima sub-tarefa (4.C.2b)');
}
