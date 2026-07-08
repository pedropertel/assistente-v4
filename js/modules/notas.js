// Módulo Notas (4.E.3) — bloco de notas do Pedro.
//
// Fontes das anotações: tool `salvar_anotacao` no chat ("transforma essa
// resposta em uma anotação com título X") ou criação manual aqui (+ Nova).
// Conteúdo é Markdown — renderizado com js/core/markdown.js (mesmo motor
// do chat: listas, negrito, código).
//
// Recarrega sozinho quando a página abre (evento `page:change` do router)
// — pega anotações novas que a IA salvou desde a última visita. Todos os
// listeners são internos (sem onclick inline → fora da window bridge).
//
// Soft-delete (REGRA 12): arquivar esconde; row fica no banco.

import { supabase } from '../core/supabase.js';
import { show as showToast } from '../core/toast.js';
import { show as showModal } from '../core/modal.js';
import { mdParaHtml } from '../core/markdown.js';

document.addEventListener('page:change', (ev) => {
  if (ev.detail !== 'notas') return;
  carregarNotas().catch((err) => {
    console.error('[notas] erro ao carregar', err);
  });
});

export async function carregarNotas() {
  const listaEl = document.getElementById('notas-lista');
  if (!listaEl) return;

  // Botão + Nova (liga 1x — módulo pode recarregar N vezes).
  const btnNova = document.getElementById('btn-nova-nota');
  if (btnNova && !btnNova.dataset.ligado) {
    btnNova.dataset.ligado = '1';
    btnNova.addEventListener('click', () => abrirEditor(null));
  }

  const { data, error } = await supabase
    .from('anotacoes')
    .select(`
      id, titulo, conteudo, favorita, origem, created_at, updated_at,
      entidades(nome, icone, cor_hex)
    `)
    .eq('arquivada', false)
    .order('favorita', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[notas] erro no SELECT', error);
    showToast('Erro ao carregar notas', 'error');
    return;
  }

  renderLista(listaEl, data || []);
}

function renderLista(listaEl, notas) {
  listaEl.innerHTML = '';

  if (!notas.length) {
    const vazio = document.createElement('div');
    vazio.className = 'notas-vazio';
    vazio.textContent = 'Nenhuma anotação ainda. Cria uma aqui ou pede no ' +
      'chat: "transforma essa resposta em uma anotação".';
    listaEl.appendChild(vazio);
    return;
  }

  for (const nota of notas) {
    listaEl.appendChild(criarCard(nota));
  }
}

function criarCard(nota) {
  const card = document.createElement('article');
  card.className = 'nota-card' + (nota.favorita ? ' favorita' : '');

  // Cabeçalho (sempre visível): título + data — toque expande/recolhe.
  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'nota-card-header';

  const titulo = document.createElement('span');
  titulo.className = 'nota-titulo';
  titulo.textContent = (nota.favorita ? '⭐ ' : '') + nota.titulo;

  const meta = document.createElement('small');
  meta.className = 'nota-meta';
  const dt = new Date(nota.updated_at);
  const partes = [
    dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    nota.entidades ? `${nota.entidades.icone ?? ''} ${nota.entidades.nome}`.trim() : null,
  ].filter(Boolean);
  meta.textContent = partes.join(' · ');

  header.appendChild(titulo);
  header.appendChild(meta);
  card.appendChild(header);

  // Corpo (expande no toque): markdown + ações.
  const corpo = document.createElement('div');
  corpo.className = 'nota-corpo';
  corpo.hidden = true;

  const md = document.createElement('div');
  md.className = 'chat-md'; // reusa o CSS do markdown do chat
  md.innerHTML = mdParaHtml(nota.conteudo);
  corpo.appendChild(md);

  const acoes = document.createElement('div');
  acoes.className = 'nota-acoes';

  const btnEditar = document.createElement('button');
  btnEditar.type = 'button';
  btnEditar.textContent = '✏️ Editar';
  btnEditar.addEventListener('click', () => abrirEditor(nota));

  const btnFav = document.createElement('button');
  btnFav.type = 'button';
  btnFav.textContent = nota.favorita ? '⭐ Desfavoritar' : '⭐ Favoritar';
  btnFav.addEventListener('click', async () => {
    const { error } = await supabase
      .from('anotacoes')
      .update({ favorita: !nota.favorita })
      .eq('id', nota.id);
    if (error) {
      showToast('Erro ao favoritar', 'error');
      return;
    }
    carregarNotas().catch(() => {});
  });

  const btnArq = document.createElement('button');
  btnArq.type = 'button';
  btnArq.textContent = '🗑 Arquivar';
  btnArq.addEventListener('click', async () => {
    const { error } = await supabase
      .from('anotacoes')
      .update({ arquivada: true })
      .eq('id', nota.id);
    if (error) {
      showToast('Erro ao arquivar', 'error');
      return;
    }
    showToast('Anotação arquivada');
    carregarNotas().catch(() => {});
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
 * abrirEditor — modal com form de título + conteúdo (markdown).
 * nota=null → criar (origem 'manual'); nota → editar.
 * DOM montado com createElement + .value (nunca innerHTML com conteúdo
 * do banco — mesmo princípio anti-XSS do markdown.js).
 */
function abrirEditor(nota) {
  const form = document.createElement('div');
  form.className = 'nota-editor';

  const inputTitulo = document.createElement('input');
  inputTitulo.type = 'text';
  inputTitulo.className = 'nota-editor-titulo';
  inputTitulo.placeholder = 'Título';
  inputTitulo.value = nota?.titulo ?? '';

  const taConteudo = document.createElement('textarea');
  taConteudo.className = 'nota-editor-conteudo';
  taConteudo.placeholder = 'Conteúdo (markdown: **negrito**, - listas...)';
  taConteudo.rows = 10;
  taConteudo.value = nota?.conteudo ?? '';

  form.appendChild(inputTitulo);
  form.appendChild(taConteudo);

  showModal({
    title: nota ? 'Editar anotação' : 'Nova anotação',
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
          const op = nota
            ? supabase.from('anotacoes').update({ titulo, conteudo }).eq('id', nota.id)
            : supabase.from('anotacoes').insert({ titulo, conteudo, origem: 'manual' });
          const { error } = await op;
          if (error) {
            showToast('Erro ao salvar anotação', 'error');
            return false; // idem
          }
          showToast('Anotação salva');
          carregarNotas().catch(() => {});
        },
      },
    ],
  });
}
