// Módulo Ideias (4.B.1a + 4.B.1b) — tela de correção das ideias da Marina.
//
// Fontes: tool `salvar_ideia` no chat (Marina captura/refina) ou criação
// manual aqui (+ Nova). A tool já grava desde a 3.I.2; esta tela fecha o
// gap D2 da revisão 2026-07-07 (registro criado sem ter como corrigir).
//
// Diferenças pro molde notas.js:
//   - Soft-delete é `status='arquivada'` (workflow no CHECK da tabela),
//     não coluna boolean.
//   - Labels de status vêm de `configuracoes` (`ui_labels.ideia.status.*`,
//     REGRA 12) com fallback hardcoded.
//   - Card mostra tags e `proxima_acao_sugerida` quando existirem.
//
// Recarrega sozinho quando a página abre (evento `page:change` do router).
// Listeners internos (sem onclick inline → fora da window bridge).

import { supabase } from '../core/supabase.js';
import { show as showToast } from '../core/toast.js';
import { show as showModal } from '../core/modal.js';
import { mdParaHtml } from '../core/markdown.js';

// Labels visuais dos status (REGRA 12: customizáveis via configuracoes).
// Fallback se a chave sumir do banco — a tela NUNCA quebra por config.
const LABELS_STATUS_FALLBACK = {
  capturada: 'Capturada',
  refinada: 'Refinada',
  arquivada: 'Arquivada',
  convertida: 'Convertida',
};
let labelsStatus = null; // carregado 1x por sessão

document.addEventListener('page:change', (ev) => {
  if (ev.detail !== 'ideias') return;
  carregarIdeias().catch((err) => {
    console.error('[ideias] erro ao carregar', err);
  });
});

async function getLabelsStatus() {
  if (labelsStatus) return labelsStatus;
  const { data, error } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .like('chave', 'ui_labels.ideia.status.%');
  labelsStatus = { ...LABELS_STATUS_FALLBACK };
  if (!error && data) {
    for (const row of data) {
      const status = row.chave.split('.').pop();
      if (typeof row.valor === 'string') labelsStatus[status] = row.valor;
    }
  }
  return labelsStatus;
}

export async function carregarIdeias() {
  const listaEl = document.getElementById('ideias-lista');
  if (!listaEl) return;

  // Botão + Nova (liga 1x — módulo pode recarregar N vezes).
  const btnNova = document.getElementById('btn-nova-ideia');
  if (btnNova && !btnNova.dataset.ligado) {
    btnNova.dataset.ligado = '1';
    btnNova.addEventListener('click', () => abrirEditor(null));
  }

  const labels = await getLabelsStatus();

  const { data, error } = await supabase
    .from('ideias')
    .select(`
      id, titulo, conteudo, tags, status, favorita,
      proxima_acao_sugerida, origem, created_at, updated_at,
      entidade_id, entidades(nome, icone, cor_hex)
    `)
    .neq('status', 'arquivada')
    .order('favorita', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[ideias] erro no SELECT', error);
    showToast('Erro ao carregar ideias', 'error');
    return;
  }

  renderLista(listaEl, data || [], labels);
}

function renderLista(listaEl, ideias, labels) {
  listaEl.innerHTML = '';

  if (!ideias.length) {
    const vazio = document.createElement('div');
    vazio.className = 'notas-vazio';
    vazio.textContent = 'Nenhuma ideia ainda. Cria uma aqui ou solta no ' +
      'chat: "tive uma ideia..." — a Marina captura.';
    listaEl.appendChild(vazio);
    return;
  }

  for (const ideia of ideias) {
    listaEl.appendChild(criarCard(ideia, labels));
  }
}

function criarCard(ideia, labels) {
  const card = document.createElement('article');
  card.className = 'nota-card' + (ideia.favorita ? ' favorita' : '');

  // Cabeçalho (sempre visível): título + meta — toque expande/recolhe.
  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'nota-card-header';

  const titulo = document.createElement('span');
  titulo.className = 'nota-titulo';
  titulo.textContent = (ideia.favorita ? '⭐ ' : '') + ideia.titulo;

  const meta = document.createElement('small');
  meta.className = 'nota-meta';
  const dt = new Date(ideia.updated_at);
  const partes = [
    labels[ideia.status] ?? ideia.status,
    dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    ideia.entidades ? `${ideia.entidades.icone ?? ''} ${ideia.entidades.nome}`.trim() : null,
    ideia.tags?.length ? ideia.tags.map((t) => `#${t}`).join(' ') : null,
  ].filter(Boolean);
  meta.textContent = partes.join(' · ');

  header.appendChild(titulo);
  header.appendChild(meta);
  card.appendChild(header);

  // Corpo (expande no toque): conteúdo + próxima ação + ações.
  const corpo = document.createElement('div');
  corpo.className = 'nota-corpo';
  corpo.hidden = true;

  const md = document.createElement('div');
  md.className = 'chat-md'; // mdParaHtml escapa tudo — seguro via innerHTML
  md.innerHTML = mdParaHtml(ideia.conteudo);
  corpo.appendChild(md);

  if (ideia.proxima_acao_sugerida) {
    const acao = document.createElement('p');
    acao.className = 'ideia-proxima-acao';
    acao.textContent = '💡 Próxima ação: ' + ideia.proxima_acao_sugerida;
    corpo.appendChild(acao);
  }

  const acoes = document.createElement('div');
  acoes.className = 'nota-acoes';

  const btnEditar = document.createElement('button');
  btnEditar.type = 'button';
  btnEditar.textContent = '✏️ Editar';
  btnEditar.addEventListener('click', () => abrirEditor(ideia));

  const btnFav = document.createElement('button');
  btnFav.type = 'button';
  btnFav.textContent = ideia.favorita ? '⭐ Desfavoritar' : '⭐ Favoritar';
  btnFav.addEventListener('click', async () => {
    const { error } = await supabase
      .from('ideias')
      .update({ favorita: !ideia.favorita })
      .eq('id', ideia.id);
    if (error) {
      showToast('Erro ao favoritar', 'error');
      return;
    }
    carregarIdeias().catch(() => {});
  });

  const btnArq = document.createElement('button');
  btnArq.type = 'button';
  btnArq.textContent = '🗑 Arquivar';
  btnArq.addEventListener('click', async () => {
    // Soft-delete do workflow: status='arquivada' (some da lista; row
    // fica no banco — recuperação via banco até existir toggle).
    const { error } = await supabase
      .from('ideias')
      .update({ status: 'arquivada' })
      .eq('id', ideia.id);
    if (error) {
      showToast('Erro ao arquivar', 'error');
      return;
    }
    showToast('Ideia arquivada');
    carregarIdeias().catch(() => {});
  });

  acoes.appendChild(btnEditar);
  acoes.appendChild(btnFav);

  // 4.B.1b — converter em tarefa. Convertida não converte de novo
  // (duplicaria a tarefa); o chip de status já conta a história.
  if (ideia.status !== 'convertida') {
    const btnConv = document.createElement('button');
    btnConv.type = 'button';
    btnConv.textContent = '📌 Virar tarefa';
    btnConv.addEventListener('click', () => abrirConversao(ideia));
    acoes.appendChild(btnConv);
  }

  acoes.appendChild(btnArq);
  corpo.appendChild(acoes);
  card.appendChild(corpo);

  header.addEventListener('click', () => {
    corpo.hidden = !corpo.hidden;
  });

  return card;
}

/**
 * abrirConversao (4.B.1b) — modal que transforma a ideia em tarefa.
 *
 * `tarefas.entidade_id` é NOT NULL mas a ideia pode ser transversal
 * (entidade_id null) → o modal exige escolher a empresa (pré-seleciona a
 * da ideia quando houver). Descrição da tarefa = conteúdo da ideia +
 * próxima ação sugerida. origem='sistema' (nasceu de uma ideia, não foi
 * digitada do zero). A tela de tarefas é a 4.C.1 — até lá a tarefa
 * criada vive só no banco, e o status 'convertida' aqui é o recibo.
 *
 * Ordem das operações: INSERT tarefa → UPDATE ideia. Se o UPDATE falhar
 * a tarefa JÁ existe — avisa em vez de re-tentar (re-converter duplicaria).
 */
async function abrirConversao(ideia) {
  const { data: entidades, error: errEnt } = await supabase
    .from('entidades')
    .select('id, nome, icone')
    .eq('ativa', true)
    .order('ordem');

  if (errEnt || !entidades?.length) {
    showToast('Erro ao carregar empresas', 'error');
    return;
  }

  const form = document.createElement('div');
  form.className = 'nota-editor';

  const inputTitulo = document.createElement('input');
  inputTitulo.type = 'text';
  inputTitulo.className = 'nota-editor-titulo';
  inputTitulo.placeholder = 'Título da tarefa';
  inputTitulo.value = ideia.titulo;

  const selEntidade = document.createElement('select');
  selEntidade.className = 'nota-editor-titulo';
  for (const ent of entidades) {
    const opt = document.createElement('option');
    opt.value = ent.id;
    opt.textContent = [ent.icone, ent.nome].filter(Boolean).join(' ');
    if (ent.id === ideia.entidade_id) opt.selected = true;
    selEntidade.appendChild(opt);
  }

  const selPrioridade = document.createElement('select');
  selPrioridade.className = 'nota-editor-titulo';
  for (const [valor, label] of [
    ['baixa', 'Prioridade: baixa'],
    ['media', 'Prioridade: média'],
    ['alta', 'Prioridade: alta'],
    ['urgente', 'Prioridade: urgente'],
  ]) {
    const opt = document.createElement('option');
    opt.value = valor;
    opt.textContent = label;
    if (valor === 'media') opt.selected = true;
    selPrioridade.appendChild(opt);
  }

  form.appendChild(inputTitulo);
  form.appendChild(selEntidade);
  form.appendChild(selPrioridade);

  showModal({
    title: 'Converter em tarefa',
    body: form,
    actions: [
      { label: 'Cancelar', type: 'secondary' },
      {
        label: 'Converter',
        type: 'primary',
        onClick: async () => {
          const titulo = inputTitulo.value.trim();
          if (!titulo) {
            showToast('Título é obrigatório', 'error');
            return false; // segura o modal
          }

          const descricao = [
            ideia.conteudo,
            ideia.proxima_acao_sugerida
              ? `Próxima ação sugerida: ${ideia.proxima_acao_sugerida}`
              : null,
          ].filter(Boolean).join('\n\n');

          const { error: errIns } = await supabase.from('tarefas').insert({
            entidade_id: selEntidade.value,
            titulo,
            descricao,
            status: 'a_fazer',
            prioridade: selPrioridade.value,
            origem: 'sistema',
          });
          if (errIns) {
            showToast('Erro ao criar tarefa', 'error');
            return false; // nada mudou — pode tentar de novo
          }

          const { error: errUpd } = await supabase
            .from('ideias')
            .update({ status: 'convertida' })
            .eq('id', ideia.id);
          if (errUpd) {
            // Tarefa já criada — só o recibo falhou. NÃO re-tentar a
            // conversão (duplicaria); Pedro marca o status na edição.
            showToast('Tarefa criada, mas a ideia não marcou como convertida', 'warning');
          } else {
            showToast('Tarefa criada ✓');
          }
          carregarIdeias().catch(() => {});
        },
      },
    ],
  });
}

/**
 * abrirEditor — modal com título + conteúdo + tags (vírgula-separadas).
 * ideia=null → criar (origem 'manual', status default 'capturada');
 * ideia → editar. DOM via createElement + .value (anti-XSS).
 */
function abrirEditor(ideia) {
  const form = document.createElement('div');
  form.className = 'nota-editor';

  const inputTitulo = document.createElement('input');
  inputTitulo.type = 'text';
  inputTitulo.className = 'nota-editor-titulo';
  inputTitulo.placeholder = 'Título';
  inputTitulo.value = ideia?.titulo ?? '';

  const taConteudo = document.createElement('textarea');
  taConteudo.className = 'nota-editor-conteudo';
  taConteudo.placeholder = 'Descreve a ideia...';
  taConteudo.rows = 8;
  taConteudo.value = ideia?.conteudo ?? '';

  const inputTags = document.createElement('input');
  inputTags.type = 'text';
  inputTags.className = 'nota-editor-titulo';
  inputTags.placeholder = 'Tags separadas por vírgula (opcional)';
  inputTags.value = (ideia?.tags ?? []).join(', ');

  form.appendChild(inputTitulo);
  form.appendChild(taConteudo);
  form.appendChild(inputTags);

  showModal({
    title: ideia ? 'Editar ideia' : 'Nova ideia',
    body: form,
    actions: [
      { label: 'Cancelar', type: 'secondary' },
      {
        label: 'Salvar',
        type: 'primary',
        onClick: async () => {
          const titulo = inputTitulo.value.trim();
          const conteudo = taConteudo.value.trim();
          if (!titulo || !conteudo) {
            showToast('Título e conteúdo são obrigatórios', 'error');
            return false; // segura o modal — não perde o digitado
          }
          const tags = inputTags.value
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
          const op = ideia
            ? supabase.from('ideias').update({ titulo, conteudo, tags }).eq('id', ideia.id)
            : supabase.from('ideias').insert({ titulo, conteudo, tags, origem: 'manual' });
          const { error } = await op;
          if (error) {
            showToast('Erro ao salvar ideia', 'error');
            return false; // idem
          }
          showToast('Ideia salva');
          carregarIdeias().catch(() => {});
        },
      },
    ],
  });
}
