// Módulo Configurações (4.C.3) — REGRA 12 na prática: Pedro edita
// empresas, personas, agente e ajustes de IA POR TELA, sem SQL.
//
// Peça-chave: TODO save aqui incrementa `configuracoes.cache_version`
// (convenção da 4.0) — a Edge zera os caches de isolate no request
// seguinte e a mudança vale na PRÓXIMA mensagem do chat, sem redeploy.
//
// Seções em acordeão (uma aberta por vez, mobile-first):
//   🏢 Empresas — nome, ícone, cor, ordem, ativa (+ Nova; slug gerado)
//   🎭 Personas (4.C.3b) · 🤖 Agente (4.C.3b) · ⚙️ Ajustes (4.C.3c)
//
// Soft-delete sempre (desativar, não apagar). Recarrega via page:change.

import { supabase } from '../core/supabase.js';
import { show as showToast } from '../core/toast.js';
import { show as showModal } from '../core/modal.js';
import { slugify } from '../core/utils.js';

document.addEventListener('page:change', (ev) => {
  if (ev.detail !== 'config') return;
  carregarConfig().catch((err) => {
    console.error('[config] erro ao carregar', err);
  });
});

/**
 * bumpCacheVersion — incrementa a versão pra Edge recarregar os caches
 * (4.0). Read+write sem lock: usuário único, corrida não é problema real.
 * Falha vira warning — o dado JÁ foi salvo; só o efeito fica pro isolate
 * reciclar (~5min).
 */
async function bumpCacheVersion() {
  const { data, error } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'cache_version')
    .maybeSingle();
  if (error || typeof data?.valor !== 'number') {
    showToast('Salvo — mas a IA pode demorar ~5min pra ver (cache)', 'warning');
    return;
  }
  const { error: errUpd } = await supabase
    .from('configuracoes')
    .update({ valor: data.valor + 1 })
    .eq('chave', 'cache_version');
  if (errUpd) {
    showToast('Salvo — mas a IA pode demorar ~5min pra ver (cache)', 'warning');
  }
}

/** Toast padrão pós-save (o bump é o que faz valer NA HORA). */
async function salvoComBump() {
  await bumpCacheVersion();
  showToast('Salvo ✓ — vale na próxima mensagem');
}

// ──────────── Estrutura da página ────────────

export async function carregarConfig() {
  const raiz = document.getElementById('config-conteudo');
  if (!raiz) return;

  raiz.innerHTML = '';
  raiz.appendChild(await secaoEmpresas());
  // 4.C.3b/c: Personas, Agente e Ajustes entram nas próximas sub-tarefas.
}

/** Seção acordeão: cabeçalho que expande/recolhe o corpo. */
function criarSecao(titulo, aberta = false) {
  const secao = document.createElement('section');
  secao.className = 'nota-card config-secao';

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'nota-card-header config-secao-header';
  const nome = document.createElement('span');
  nome.className = 'nota-titulo';
  nome.textContent = titulo;
  const seta = document.createElement('span');
  seta.className = 'config-seta';
  seta.textContent = '›';
  header.appendChild(nome);
  header.appendChild(seta);
  secao.appendChild(header);

  const corpo = document.createElement('div');
  corpo.className = 'nota-corpo config-secao-corpo';
  corpo.hidden = !aberta;
  secao.classList.toggle('aberta', aberta);
  secao.appendChild(corpo);

  header.addEventListener('click', () => {
    corpo.hidden = !corpo.hidden;
    secao.classList.toggle('aberta', !corpo.hidden);
  });

  return { secao, corpo };
}

// ──────────── 🏢 Empresas (4.C.3a) ────────────

async function secaoEmpresas() {
  const { secao, corpo } = criarSecao('🏢 Empresas', true);

  const { data, error } = await supabase
    .from('entidades')
    .select('id, slug, nome, icone, cor_hex, ordem, ativa')
    .order('ordem');

  if (error) {
    console.error('[config] erro ao carregar entidades', error);
    corpo.textContent = 'Erro ao carregar empresas.';
    return secao;
  }

  const lista = document.createElement('div');
  lista.className = 'config-lista';
  for (const ent of data || []) {
    const linha = document.createElement('button');
    linha.type = 'button';
    linha.className = 'config-linha' + (ent.ativa ? '' : ' inativa');

    const swatch = document.createElement('span');
    swatch.className = 'sitio-swatch';
    swatch.style.backgroundColor = '#' + (ent.cor_hex || '6B7280');

    const nome = document.createElement('span');
    nome.className = 'config-linha-nome';
    nome.textContent = `${ent.icone ?? ''} ${ent.nome}`.trim() +
      (ent.ativa ? '' : ' (inativa)');

    linha.appendChild(swatch);
    linha.appendChild(nome);
    linha.addEventListener('click', () => abrirEditorEmpresa(ent));
    lista.appendChild(linha);
  }
  corpo.appendChild(lista);

  const btnNova = document.createElement('button');
  btnNova.type = 'button';
  btnNova.className = 'btn btn-secondary config-btn-add';
  btnNova.textContent = '+ Nova empresa';
  btnNova.addEventListener('click', () => abrirEditorEmpresa(null));
  corpo.appendChild(btnNova);

  return secao;
}

function abrirEditorEmpresa(ent) {
  const form = document.createElement('div');
  form.className = 'nota-editor';

  const inputNome = document.createElement('input');
  inputNome.type = 'text';
  inputNome.className = 'nota-editor-titulo';
  inputNome.placeholder = 'Nome da empresa';
  inputNome.value = ent?.nome ?? '';

  const inputIcone = document.createElement('input');
  inputIcone.type = 'text';
  inputIcone.className = 'nota-editor-titulo';
  inputIcone.placeholder = 'Ícone (emoji, ex: 🎓)';
  inputIcone.value = ent?.icone ?? '';

  const labelCor = document.createElement('label');
  labelCor.className = 'config-label-cor';
  labelCor.textContent = 'Cor: ';
  const inputCor = document.createElement('input');
  inputCor.type = 'color';
  inputCor.value = '#' + (ent?.cor_hex || '6B7280');
  labelCor.appendChild(inputCor);

  const inputOrdem = document.createElement('input');
  inputOrdem.type = 'number';
  inputOrdem.className = 'nota-editor-titulo';
  inputOrdem.placeholder = 'Ordem na lista (menor = primeiro)';
  inputOrdem.value = ent?.ordem ?? 99;

  const labelAtiva = document.createElement('label');
  labelAtiva.className = 'agenda-check-dia';
  const chkAtiva = document.createElement('input');
  chkAtiva.type = 'checkbox';
  chkAtiva.checked = ent?.ativa ?? true;
  labelAtiva.appendChild(chkAtiva);
  labelAtiva.appendChild(document.createTextNode(
    ' Ativa (inativa some dos chips e do Roteador)',
  ));

  form.appendChild(inputNome);
  form.appendChild(inputIcone);
  form.appendChild(labelCor);
  form.appendChild(inputOrdem);
  form.appendChild(labelAtiva);

  showModal({
    title: ent ? `Editar ${ent.nome}` : 'Nova empresa',
    body: form,
    actions: [
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
            cor_hex: inputCor.value.replace('#', '').toUpperCase(),
            ordem: Number(inputOrdem.value) || 99,
            ativa: chkAtiva.checked,
          };
          const op = ent
            ? supabase.from('entidades').update(payload).eq('id', ent.id)
            : supabase.from('entidades')
              .insert({ ...payload, slug: slugify(nome), tipo: 'empresa' });
          const { error } = await op;
          if (error) {
            console.error('[config] erro ao salvar empresa', error);
            showToast('Erro ao salvar empresa', 'error');
            return false;
          }
          await salvoComBump();
          carregarConfig().catch(() => {});
        },
      },
    ],
  });
}
