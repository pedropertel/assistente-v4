// Módulo Ideias (4.B.1a) — tela de correção das ideias da Marina.
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
      entidades(nome, icone, cor_hex)
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
  acoes.appendChild(btnArq);
  corpo.appendChild(acoes);
  card.appendChild(corpo);

  header.addEventListener('click', () => {
    corpo.hidden = !corpo.hidden;
  });

  return card;
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
