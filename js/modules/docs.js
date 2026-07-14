// Módulo Documentos (4.C.4a) — biblioteca por empresa.
//
// Navegação: chips de empresa → pastas (hierarquia máx 3 níveis) →
// documentos. Breadcrumb pra voltar. Documento abre via URL ASSINADA do
// Storage (bucket `documentos` é privado; policies auth-only da Fase 2).
// Upload chega na 4.C.4b.
//
// Recarrega via `page:change`; listeners internos (sem window bridge).

import { supabase } from '../core/supabase.js';
import { show as showToast } from '../core/toast.js';
import { show as showModal } from '../core/modal.js';

const BUCKET = 'documentos';
const NIVEL_MAX = 3;

let entidadesCache = null;
let entidadeAtiva = null; // primeira empresa por default
let pastaAtual = null; // objeto pasta ou null (raiz)
let trilha = []; // breadcrumb: [pasta, subpasta...]

document.addEventListener('page:change', (ev) => {
  if (ev.detail !== 'docs') return;
  carregarDocs().catch((err) => {
    console.error('[docs] erro ao carregar', err);
  });
});

async function getEntidades() {
  if (entidadesCache) return entidadesCache;
  const { data, error } = await supabase
    .from('entidades')
    .select('id, slug, nome, icone, cor_hex')
    .eq('ativa', true)
    .order('ordem');
  if (error || !data) {
    console.error('[docs] erro ao carregar entidades', error);
    return [];
  }
  entidadesCache = data;
  return entidadesCache;
}

function fmtBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function iconePorMime(mime) {
  if (!mime) return '📎';
  if (mime.startsWith('image/')) return '🖼';
  if (mime === 'application/pdf') return '📄';
  if (mime.startsWith('audio/')) return '🎧';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return '📊';
  return '📎';
}

export async function carregarDocs() {
  const raiz = document.getElementById('docs-conteudo');
  if (!raiz) return;

  const entidades = await getEntidades();
  if (!entidades.length) {
    raiz.textContent = 'Nenhuma empresa ativa.';
    return;
  }
  if (!entidadeAtiva || !entidades.some((e) => e.id === entidadeAtiva.id)) {
    entidadeAtiva = entidades[0];
  }

  raiz.innerHTML = '';
  raiz.appendChild(criarChipsEmpresas(entidades));
  raiz.appendChild(criarBreadcrumb());
  raiz.appendChild(await criarLista());
}

function criarChipsEmpresas(entidades) {
  const wrap = document.createElement('div');
  wrap.className = 'tasks-filtros';
  for (const ent of entidades) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-entidade-chip' +
      (ent.id === entidadeAtiva.id ? ' ativa' : '');
    btn.style.setProperty('--chip-cor', '#' + (ent.cor_hex || '6B7280'));
    btn.textContent = [ent.icone, ent.nome].filter(Boolean).join(' ');
    btn.addEventListener('click', () => {
      if (ent.id === entidadeAtiva.id) return;
      entidadeAtiva = ent;
      pastaAtual = null;
      trilha = [];
      carregarDocs().catch(() => {});
    });
    wrap.appendChild(btn);
  }
  return wrap;
}

function criarBreadcrumb() {
  const nav = document.createElement('div');
  nav.className = 'docs-trilha';

  const irPara = (pasta, indice) => {
    pastaAtual = pasta;
    trilha = pasta === null ? [] : trilha.slice(0, indice + 1);
    carregarDocs().catch(() => {});
  };

  const btnRaiz = document.createElement('button');
  btnRaiz.type = 'button';
  btnRaiz.textContent = '🏠';
  btnRaiz.addEventListener('click', () => irPara(null, -1));
  nav.appendChild(btnRaiz);

  trilha.forEach((pasta, i) => {
    nav.appendChild(document.createTextNode(' / '));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = pasta.nome;
    if (i === trilha.length - 1) btn.classList.add('atual');
    btn.addEventListener('click', () => irPara(pasta, i));
    nav.appendChild(btn);
  });

  return nav;
}

async function criarLista() {
  const wrap = document.createElement('div');
  wrap.className = 'notas-lista';

  // Pastas do nível atual.
  let qPastas = supabase
    .from('pastas')
    .select('id, nome, icone, cor_hex, nivel, pasta_pai_id')
    .eq('entidade_id', entidadeAtiva.id)
    .eq('arquivada', false)
    .order('ordem')
    .order('nome');
  qPastas = pastaAtual
    ? qPastas.eq('pasta_pai_id', pastaAtual.id)
    : qPastas.is('pasta_pai_id', null);

  // Documentos do nível atual.
  let qDocs = supabase
    .from('documentos')
    .select('id, nome, descricao, tipo_mime, extensao, tamanho_bytes, storage_path, favorito, pasta_id, created_at')
    .eq('entidade_id', entidadeAtiva.id)
    .eq('arquivado', false)
    .order('favorito', { ascending: false })
    .order('nome');
  qDocs = pastaAtual
    ? qDocs.eq('pasta_id', pastaAtual.id)
    : qDocs.is('pasta_id', null);

  const [{ data: pastas, error: errP }, { data: docs, error: errD }] =
    await Promise.all([qPastas, qDocs]);

  if (errP || errD) {
    console.error('[docs] erro no SELECT', errP ?? errD);
    showToast('Erro ao carregar documentos', 'error');
    return wrap;
  }

  for (const pasta of pastas || []) {
    wrap.appendChild(criarLinhaPasta(pasta));
  }
  for (const doc of docs || []) {
    wrap.appendChild(criarCardDocumento(doc));
  }

  if (!(pastas || []).length && !(docs || []).length) {
    const vazio = document.createElement('div');
    vazio.className = 'notas-vazio';
    vazio.textContent = pastaAtual
      ? 'Pasta vazia.'
      : `Nada em ${entidadeAtiva.nome} ainda. Cria uma pasta ou envia um arquivo.`;
    wrap.appendChild(vazio);
  }

  // Ações do nível: nova pasta (até nível 3) + upload (4.C.4b).
  const acoes = document.createElement('div');
  acoes.className = 'docs-acoes-nivel';
  const nivelAtual = pastaAtual?.nivel ?? 0;
  if (nivelAtual < NIVEL_MAX) {
    const btnPasta = document.createElement('button');
    btnPasta.type = 'button';
    btnPasta.className = 'btn btn-secondary';
    btnPasta.textContent = '📁 Nova pasta';
    btnPasta.addEventListener('click', () => abrirEditorPasta(null));
    acoes.appendChild(btnPasta);
  }
  wrap.appendChild(acoes);

  return wrap;
}

function criarLinhaPasta(pasta) {
  const linha = document.createElement('div');
  linha.className = 'docs-pasta';

  const btnEntrar = document.createElement('button');
  btnEntrar.type = 'button';
  btnEntrar.className = 'docs-pasta-entrar';
  btnEntrar.textContent = `${pasta.icone ?? '📁'} ${pasta.nome}`;
  btnEntrar.addEventListener('click', () => {
    pastaAtual = pasta;
    trilha.push(pasta);
    carregarDocs().catch(() => {});
  });

  const btnEditar = document.createElement('button');
  btnEditar.type = 'button';
  btnEditar.className = 'docs-pasta-editar';
  btnEditar.textContent = '✏️';
  btnEditar.setAttribute('aria-label', `Editar pasta ${pasta.nome}`);
  btnEditar.addEventListener('click', () => abrirEditorPasta(pasta));

  linha.appendChild(btnEntrar);
  linha.appendChild(btnEditar);
  return linha;
}

function criarCardDocumento(doc) {
  const card = document.createElement('article');
  card.className = 'nota-card' + (doc.favorito ? ' favorita' : '');

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'nota-card-header agenda-card-header';

  const icone = document.createElement('span');
  icone.className = 'docs-icone';
  icone.textContent = iconePorMime(doc.tipo_mime);

  const corpo = document.createElement('span');
  corpo.className = 'agenda-card-corpo';
  const titulo = document.createElement('span');
  titulo.className = 'nota-titulo';
  titulo.textContent = (doc.favorito ? '⭐ ' : '') + doc.nome;
  const meta = document.createElement('small');
  meta.className = 'nota-meta';
  const dt = new Date(doc.created_at);
  meta.textContent = [
    doc.extensao?.toUpperCase(),
    fmtBytes(doc.tamanho_bytes),
    dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
  ].filter(Boolean).join(' · ');
  corpo.appendChild(titulo);
  corpo.appendChild(meta);

  header.appendChild(icone);
  header.appendChild(corpo);
  card.appendChild(header);

  const detalhe = document.createElement('div');
  detalhe.className = 'nota-corpo';
  detalhe.hidden = true;

  if (doc.descricao) {
    const desc = document.createElement('p');
    desc.style.margin = '0';
    desc.textContent = doc.descricao;
    detalhe.appendChild(desc);
  }

  const acoes = document.createElement('div');
  acoes.className = 'nota-acoes';

  const btnAbrir = document.createElement('button');
  btnAbrir.type = 'button';
  btnAbrir.textContent = '👁 Abrir';
  btnAbrir.addEventListener('click', async () => {
    // URL assinada de 5 min — bucket é privado; o link nasce e morre.
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 300);
    if (error || !data?.signedUrl) {
      console.error('[docs] erro na URL assinada', error);
      showToast('Erro ao abrir o arquivo', 'error');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  });

  const btnFav = document.createElement('button');
  btnFav.type = 'button';
  btnFav.textContent = doc.favorito ? '⭐ Desfavoritar' : '⭐ Favoritar';
  btnFav.addEventListener('click', async () => {
    const { error } = await supabase
      .from('documentos')
      .update({ favorito: !doc.favorito })
      .eq('id', doc.id);
    if (error) {
      showToast('Erro ao favoritar', 'error');
      return;
    }
    carregarDocs().catch(() => {});
  });

  const btnArq = document.createElement('button');
  btnArq.type = 'button';
  btnArq.textContent = '🗑 Arquivar';
  btnArq.addEventListener('click', async () => {
    // Soft-delete: some da UI; arquivo continua no Storage (recuperável).
    const { error } = await supabase
      .from('documentos')
      .update({ arquivado: true })
      .eq('id', doc.id);
    if (error) {
      showToast('Erro ao arquivar', 'error');
      return;
    }
    showToast('Documento arquivado');
    carregarDocs().catch(() => {});
  });

  acoes.appendChild(btnAbrir);
  acoes.appendChild(btnFav);
  acoes.appendChild(btnArq);
  detalhe.appendChild(acoes);
  card.appendChild(detalhe);

  header.addEventListener('click', () => {
    detalhe.hidden = !detalhe.hidden;
  });

  return card;
}

/**
 * abrirEditorPasta — criar (no nível atual) ou editar pasta.
 * Nível calculado do pai (raiz=1); máx 3 (CHECK/convenção da Fase 2).
 */
function abrirEditorPasta(pasta) {
  const form = document.createElement('div');
  form.className = 'nota-editor';

  const inputNome = document.createElement('input');
  inputNome.type = 'text';
  inputNome.className = 'nota-editor-titulo';
  inputNome.placeholder = 'Nome da pasta (ex: Contratos)';
  inputNome.value = pasta?.nome ?? '';

  const inputIcone = document.createElement('input');
  inputIcone.type = 'text';
  inputIcone.className = 'nota-editor-titulo';
  inputIcone.placeholder = 'Ícone (emoji, opcional — default 📁)';
  inputIcone.value = pasta?.icone ?? '';

  form.appendChild(inputNome);
  form.appendChild(inputIcone);

  const acoes = [
    { label: 'Cancelar', type: 'secondary' },
    {
      label: 'Salvar',
      type: 'primary',
      onClick: async () => {
        const nome = inputNome.value.trim();
        if (!nome) {
          showToast('Nome é obrigatório', 'error');
          return false; // segura o modal
        }
        const payload = {
          nome,
          icone: inputIcone.value.trim() || null,
        };
        const op = pasta
          ? supabase.from('pastas').update(payload).eq('id', pasta.id)
          : supabase.from('pastas').insert({
            ...payload,
            entidade_id: entidadeAtiva.id,
            pasta_pai_id: pastaAtual?.id ?? null,
            nivel: (pastaAtual?.nivel ?? 0) + 1,
          });
        const { error } = await op;
        if (error) {
          console.error('[docs] erro ao salvar pasta', error);
          showToast('Erro ao salvar pasta', 'error');
          return false;
        }
        showToast('Pasta salva');
        carregarDocs().catch(() => {});
      },
    },
  ];

  if (pasta) {
    acoes.splice(1, 0, {
      label: '🗑 Arquivar',
      type: 'danger',
      onClick: async () => {
        const { error } = await supabase
          .from('pastas')
          .update({ arquivada: true })
          .eq('id', pasta.id);
        if (error) {
          showToast('Erro ao arquivar pasta', 'error');
          return false;
        }
        showToast('Pasta arquivada (documentos dela ficam no banco)');
        carregarDocs().catch(() => {});
      },
    });
  }

  showModal({
    title: pasta ? `Editar ${pasta.nome}` : 'Nova pasta',
    body: form,
    actions: acoes,
  });
}
