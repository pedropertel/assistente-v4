// Módulo Tarefas (4.C.1a) — kanban de 4 colunas.
//
// Fontes das tarefas: conversão de ideia (4.B.1b, origem='sistema'),
// futuras tools da Marcela, e criação manual (4.C.1b). Esta primeira
// sub-tarefa é READ-ONLY: ver o board; criar/editar vem na 1b e mover
// de coluna na 1c (menu no toque — decisão: sem drag&drop no touch).
//
// Mobile 375px: colunas em scroll horizontal com snap (uma coluna por
// "tela"); desktop = 4 colunas lado a lado. Labels de status/prioridade
// vêm de `configuracoes` (`ui_labels.tarefa.*`, REGRA 12) com fallback.
//
// Recarrega via `page:change`; listeners internos (sem window bridge).

import { supabase } from '../core/supabase.js';
import { show as showToast } from '../core/toast.js';
import { show as showModal } from '../core/modal.js';

// Ordem estrutural das colunas (CHECK da tabela — kanban tem 4 colunas
// por design; o NOME de cada uma é customizável via configuracoes).
const COLUNAS = ['backlog', 'a_fazer', 'fazendo', 'feito'];

const LABELS_FALLBACK = {
  'status.backlog': 'Backlog',
  'status.a_fazer': 'A fazer',
  'status.fazendo': 'Fazendo',
  'status.feito': 'Feito',
  'prioridade.baixa': 'Baixa',
  'prioridade.media': 'Média',
  'prioridade.alta': 'Alta',
  'prioridade.urgente': 'Urgente',
};
let labelsCache = null; // 1x por sessão

// Filtro de empresa do board (null = todas). Só memória de sessão.
let entidadeFiltro = null;

// Entidades ativas (id, nome, icone, cor_hex) — 1x por sessão; alimenta
// os chips do filtro e o select do editor (4.C.1b).
let entidadesCache = null;

async function getEntidades() {
  if (entidadesCache) return entidadesCache;
  const { data, error } = await supabase
    .from('entidades')
    .select('id, nome, icone, cor_hex')
    .eq('ativa', true)
    .order('ordem');
  if (error || !data) {
    console.error('[tasks] erro ao carregar entidades', error);
    return [];
  }
  entidadesCache = data;
  return entidadesCache;
}

/**
 * Prazo: coluna é timestamptz mas a UI trabalha com DIA. Convenção:
 * deadline = fim do dia em Brasília ("até sexta" = sexta 23:59 BRT).
 * Gravar só 'YYYY-MM-DD' viraria meia-noite UTC = 21h do dia ANTERIOR
 * em Brasília — o prazo apareceria um dia antes do combinado.
 */
function prazoParaTimestamp(dataYmd) {
  return `${dataYmd}T23:59:59-03:00`;
}

function prazoParaYmd(timestamp) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(timestamp));
}

document.addEventListener('page:change', (ev) => {
  if (ev.detail !== 'tasks') return;
  carregarBoard().catch((err) => {
    console.error('[tasks] erro ao carregar', err);
  });
});

async function getLabels() {
  if (labelsCache) return labelsCache;
  const { data, error } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .like('chave', 'ui_labels.tarefa.%');
  labelsCache = { ...LABELS_FALLBACK };
  if (!error && data) {
    for (const row of data) {
      // 'ui_labels.tarefa.status.feito' → 'status.feito'
      const chave = row.chave.replace('ui_labels.tarefa.', '');
      if (typeof row.valor === 'string') labelsCache[chave] = row.valor;
    }
  }
  return labelsCache;
}

export async function carregarBoard() {
  const boardEl = document.getElementById('tasks-board');
  if (!boardEl) return;

  const labels = await getLabels();
  await montarFiltroEntidades();

  // + Nova (4.C.1b) — liga 1x.
  const btnNova = document.getElementById('btn-nova-tarefa');
  if (btnNova && !btnNova.dataset.ligado) {
    btnNova.dataset.ligado = '1';
    btnNova.addEventListener('click', () => abrirEditorTarefa(null));
  }

  let q = supabase
    .from('tarefas')
    .select(`
      id, titulo, descricao, status, prioridade, prazo, ordem, origem,
      entidade_id, created_at, entidades(nome, icone, cor_hex)
    `)
    .eq('arquivada', false)
    .order('ordem')
    .order('created_at');

  if (entidadeFiltro) q = q.eq('entidade_id', entidadeFiltro);

  const { data, error } = await q;

  if (error) {
    console.error('[tasks] erro no SELECT', error);
    showToast('Erro ao carregar tarefas', 'error');
    return;
  }

  renderBoard(boardEl, data || [], labels);
}

/** Chips de empresa (Todas + ativas) — liga 1x, mesmo padrão do chat. */
async function montarFiltroEntidades() {
  const el = document.getElementById('tasks-entidades');
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
      carregarBoard().catch(() => {});
    });
    el.appendChild(btn);
  }
}

function renderBoard(boardEl, tarefas, labels) {
  boardEl.innerHTML = '';

  for (const status of COLUNAS) {
    const daColuna = tarefas.filter((t) => t.status === status);

    const coluna = document.createElement('div');
    coluna.className = 'tasks-coluna';

    const header = document.createElement('div');
    header.className = 'tasks-coluna-header';
    const nome = document.createElement('span');
    nome.textContent = labels[`status.${status}`] ?? status;
    const contador = document.createElement('small');
    contador.textContent = String(daColuna.length);
    header.appendChild(nome);
    header.appendChild(contador);
    coluna.appendChild(header);

    const lista = document.createElement('div');
    lista.className = 'tasks-coluna-lista';
    if (!daColuna.length) {
      const vazio = document.createElement('div');
      vazio.className = 'tasks-coluna-vazia';
      vazio.textContent = '—';
      lista.appendChild(vazio);
    } else {
      for (const tarefa of daColuna) {
        lista.appendChild(criarCardTarefa(tarefa, labels));
      }
    }
    coluna.appendChild(lista);
    boardEl.appendChild(coluna);
  }
}

function criarCardTarefa(tarefa, labels) {
  const card = document.createElement('article');
  card.className = 'tasks-card';

  const titulo = document.createElement('strong');
  titulo.className = 'tasks-card-titulo';
  titulo.textContent = tarefa.titulo;
  card.appendChild(titulo);

  const meta = document.createElement('div');
  meta.className = 'tasks-card-meta';

  const prio = document.createElement('span');
  prio.className = `tasks-prioridade ${tarefa.prioridade}`;
  prio.textContent = labels[`prioridade.${tarefa.prioridade}`] ?? tarefa.prioridade;
  meta.appendChild(prio);

  if (tarefa.prazo) {
    const prazoEl = document.createElement('span');
    prazoEl.className = 'tasks-prazo';
    const d = new Date(tarefa.prazo);
    prazoEl.textContent = '📅 ' + d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    });
    // Vencida e ainda não feita → alerta (⚠ no texto, não só cor).
    if (tarefa.status !== 'feito' && d < new Date()) {
      prazoEl.classList.add('vencido');
      prazoEl.textContent = '⚠ ' + prazoEl.textContent;
    }
    meta.appendChild(prazoEl);
  }

  if (tarefa.entidades) {
    const ent = document.createElement('span');
    ent.className = 'tasks-entidade';
    ent.textContent = `${tarefa.entidades.icone ?? ''} ${tarefa.entidades.nome}`.trim();
    meta.appendChild(ent);
  }

  card.appendChild(meta);

  // 4.C.1b — toque abre menu de ações (um por vez no board).
  card.addEventListener('click', () => toggleAcoesTarefa(card, tarefa, labels));

  return card;
}

/** Toque no card abre/fecha menu: mover (4.C.1c) + ✏️/🗑. */
function toggleAcoesTarefa(card, tarefa, labels) {
  const existente = card.querySelector('.tasks-card-acoes');
  document.querySelectorAll('.tasks-card-acoes').forEach((m) => m.remove());
  if (existente) return; // já estava aberto neste card → só fecha

  const menu = document.createElement('div');
  menu.className = 'nota-acoes tasks-card-acoes';

  // 4.C.1c — mover pra outra coluna (decisão do plano: menu no toque em
  // vez de drag&drop — arrastar no touch briga com o scroll do board).
  // Virar 'feito' carimba concluida_em; sair de 'feito' limpa.
  for (const status of COLUNAS) {
    if (status === tarefa.status) continue;
    const btnMover = document.createElement('button');
    btnMover.type = 'button';
    btnMover.textContent = '→ ' + (labels[`status.${status}`] ?? status);
    btnMover.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const { error } = await supabase
        .from('tarefas')
        .update({
          status,
          concluida_em: status === 'feito' ? new Date().toISOString() : null,
        })
        .eq('id', tarefa.id);
      if (error) {
        showToast('Erro ao mover', 'error');
        return;
      }
      showToast(`Movida pra ${labels[`status.${status}`] ?? status}`);
      carregarBoard().catch(() => {});
    });
    menu.appendChild(btnMover);
  }

  const btnEditar = document.createElement('button');
  btnEditar.type = 'button';
  btnEditar.textContent = '✏️ Editar';
  btnEditar.addEventListener('click', (ev) => {
    ev.stopPropagation();
    abrirEditorTarefa(tarefa);
  });

  const btnArq = document.createElement('button');
  btnArq.type = 'button';
  btnArq.textContent = '🗑 Arquivar';
  btnArq.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const { error } = await supabase
      .from('tarefas')
      .update({ arquivada: true })
      .eq('id', tarefa.id);
    if (error) {
      showToast('Erro ao arquivar', 'error');
      return;
    }
    showToast('Tarefa arquivada');
    carregarBoard().catch(() => {});
  });

  menu.appendChild(btnEditar);
  menu.appendChild(btnArq);
  card.appendChild(menu);
}

/**
 * abrirEditorTarefa (4.C.1b) — modal de criar/editar.
 * tarefa=null → criar (nasce em 'a_fazer', origem 'manual').
 * Empresa é obrigatória (NOT NULL na tabela). Prazo é opcional e vira
 * fim do dia em Brasília (ver prazoParaTimestamp).
 */
async function abrirEditorTarefa(tarefa) {
  const entidades = await getEntidades();
  if (!entidades.length) {
    showToast('Nenhuma empresa ativa encontrada', 'error');
    return;
  }
  const labels = await getLabels();

  const form = document.createElement('div');
  form.className = 'nota-editor';

  const inputTitulo = document.createElement('input');
  inputTitulo.type = 'text';
  inputTitulo.className = 'nota-editor-titulo';
  inputTitulo.placeholder = 'Título da tarefa';
  inputTitulo.value = tarefa?.titulo ?? '';

  const taDesc = document.createElement('textarea');
  taDesc.className = 'nota-editor-conteudo';
  taDesc.placeholder = 'Descrição (opcional)';
  taDesc.rows = 4;
  taDesc.value = tarefa?.descricao ?? '';

  const selEntidade = document.createElement('select');
  selEntidade.className = 'nota-editor-titulo';
  for (const ent of entidades) {
    const opt = document.createElement('option');
    opt.value = ent.id;
    opt.textContent = [ent.icone, ent.nome].filter(Boolean).join(' ');
    if (ent.id === (tarefa?.entidade_id ?? entidadeFiltro)) opt.selected = true;
    selEntidade.appendChild(opt);
  }

  const selPrioridade = document.createElement('select');
  selPrioridade.className = 'nota-editor-titulo';
  for (const p of ['baixa', 'media', 'alta', 'urgente']) {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = 'Prioridade: ' + (labels[`prioridade.${p}`] ?? p);
    if (p === (tarefa?.prioridade ?? 'media')) opt.selected = true;
    selPrioridade.appendChild(opt);
  }

  const inputPrazo = document.createElement('input');
  inputPrazo.type = 'date';
  inputPrazo.className = 'nota-editor-titulo';
  inputPrazo.value = prazoParaYmd(tarefa?.prazo);

  form.appendChild(inputTitulo);
  form.appendChild(taDesc);
  form.appendChild(selEntidade);
  form.appendChild(selPrioridade);
  form.appendChild(inputPrazo);

  showModal({
    title: tarefa ? 'Editar tarefa' : 'Nova tarefa',
    body: form,
    actions: [
      { label: 'Cancelar', type: 'secondary' },
      {
        label: 'Salvar',
        type: 'primary',
        onClick: async () => {
          const titulo = inputTitulo.value.trim();
          if (!titulo) {
            showToast('Título é obrigatório', 'error');
            return false; // segura o modal
          }
          const payload = {
            titulo,
            descricao: taDesc.value.trim() || null,
            entidade_id: selEntidade.value,
            prioridade: selPrioridade.value,
            prazo: inputPrazo.value ? prazoParaTimestamp(inputPrazo.value) : null,
          };
          const op = tarefa
            ? supabase.from('tarefas').update(payload).eq('id', tarefa.id)
            : supabase.from('tarefas').insert({ ...payload, origem: 'manual' });
          const { error } = await op;
          if (error) {
            showToast('Erro ao salvar tarefa', 'error');
            return false;
          }
          showToast('Tarefa salva');
          carregarBoard().catch(() => {});
        },
      },
    ],
  });
}
