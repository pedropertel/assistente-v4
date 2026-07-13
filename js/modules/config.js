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
  raiz.appendChild(await secaoPersonas());
  raiz.appendChild(await secaoAgente());
  raiz.appendChild(await secaoAjustes());
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

// ──────────── 🎭 Personas (4.C.3b) ────────────
//
// O `contexto` é o "código" mais sensível do sistema — define o
// comportamento da persona. A tela edita com aviso; snapshot em
// `040 - IA e Agentes/prompts/` continua sendo o backup versionado.
// Roteador (interno=true) aparece com badge — editar afeta TODO o
// roteamento; o modal avisa mais alto.

const NIVEIS = ['simples', 'medio', 'complexo'];

async function secaoPersonas() {
  const { secao, corpo } = criarSecao('🎭 Personas');

  const { data, error } = await supabase
    .from('personas')
    .select('id, slug, nome, icone, cor_hex, contexto, nivel_complexidade, modelo_override, entidades_alvo, interno, ativa, ordem')
    .order('interno')
    .order('ordem');

  if (error) {
    console.error('[config] erro ao carregar personas', error);
    corpo.textContent = 'Erro ao carregar personas.';
    return secao;
  }

  const lista = document.createElement('div');
  lista.className = 'config-lista';
  for (const p of data || []) {
    const linha = document.createElement('button');
    linha.type = 'button';
    linha.className = 'config-linha' + (p.ativa ? '' : ' inativa');

    const swatch = document.createElement('span');
    swatch.className = 'sitio-swatch';
    swatch.style.backgroundColor = '#' + (p.cor_hex || '6B7280');

    const nome = document.createElement('span');
    nome.className = 'config-linha-nome';
    nome.textContent = `${p.icone ?? ''} ${p.nome}`.trim() +
      (p.interno ? ' · interna (Roteador)' : '') +
      (p.ativa ? '' : ' (inativa)');

    linha.appendChild(swatch);
    linha.appendChild(nome);
    linha.addEventListener('click', () => abrirEditorPersona(p));
    lista.appendChild(linha);
  }
  corpo.appendChild(lista);

  return secao;
}

async function abrirEditorPersona(p) {
  const { data: entidades } = await supabase
    .from('entidades')
    .select('slug, nome, icone')
    .eq('ativa', true)
    .order('ordem');

  const form = document.createElement('div');
  form.className = 'nota-editor';

  if (p.interno) {
    const aviso = document.createElement('p');
    aviso.className = 'config-aviso';
    aviso.textContent = '⚠️ Persona INTERNA: o contexto abaixo é o prompt ' +
      'do Roteador — controla pra qual persona cada mensagem vai. ' +
      'Mexer errado quebra o roteamento inteiro.';
    form.appendChild(aviso);
  }

  const inputNome = document.createElement('input');
  inputNome.type = 'text';
  inputNome.className = 'nota-editor-titulo';
  inputNome.placeholder = 'Nome';
  inputNome.value = p.nome ?? '';

  const inputIcone = document.createElement('input');
  inputIcone.type = 'text';
  inputIcone.className = 'nota-editor-titulo';
  inputIcone.placeholder = 'Ícone (emoji)';
  inputIcone.value = p.icone ?? '';

  const labelCor = document.createElement('label');
  labelCor.className = 'config-label-cor';
  labelCor.textContent = 'Cor: ';
  const inputCor = document.createElement('input');
  inputCor.type = 'color';
  inputCor.value = '#' + (p.cor_hex || '6B7280');
  labelCor.appendChild(inputCor);

  const selNivel = document.createElement('select');
  selNivel.className = 'nota-editor-titulo';
  for (const n of NIVEIS) {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = 'Complexidade default: ' + n +
      (n === 'simples' ? ' (Haiku)' : n === 'medio' ? ' (Sonnet)' : ' (Opus)');
    if (n === p.nivel_complexidade) opt.selected = true;
    selNivel.appendChild(opt);
  }

  // Empresas-alvo: vazio = transversal (vale pra tudo).
  const grupoAlvo = document.createElement('div');
  grupoAlvo.className = 'config-grupo-alvo';
  const tituloAlvo = document.createElement('small');
  tituloAlvo.textContent = 'Empresas-alvo (nenhuma marcada = transversal):';
  grupoAlvo.appendChild(tituloAlvo);
  const checksAlvo = [];
  for (const ent of entidades || []) {
    const label = document.createElement('label');
    label.className = 'agenda-check-dia';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.value = ent.slug;
    chk.checked = (p.entidades_alvo ?? []).includes(ent.slug);
    checksAlvo.push(chk);
    label.appendChild(chk);
    label.appendChild(document.createTextNode(
      ` ${ent.icone ?? ''} ${ent.nome}`.trimEnd(),
    ));
    grupoAlvo.appendChild(label);
  }

  const labelAtiva = document.createElement('label');
  labelAtiva.className = 'agenda-check-dia';
  const chkAtiva = document.createElement('input');
  chkAtiva.type = 'checkbox';
  chkAtiva.checked = p.ativa;
  labelAtiva.appendChild(chkAtiva);
  labelAtiva.appendChild(document.createTextNode(
    ' Ativa (inativa sai do Roteador e do chat)',
  ));

  const tituloPrompt = document.createElement('small');
  tituloPrompt.className = 'config-rotulo';
  tituloPrompt.textContent = 'Contexto (prompt da persona — o comportamento dela):';

  const taContexto = document.createElement('textarea');
  taContexto.className = 'nota-editor-conteudo config-prompt';
  taContexto.rows = 14;
  taContexto.value = p.contexto ?? '';

  form.appendChild(inputNome);
  form.appendChild(inputIcone);
  form.appendChild(labelCor);
  if (!p.interno) {
    form.appendChild(selNivel);
    form.appendChild(grupoAlvo);
  }
  form.appendChild(labelAtiva);
  form.appendChild(tituloPrompt);
  form.appendChild(taContexto);

  showModal({
    title: `Editar persona ${p.nome}`,
    body: form,
    actions: [
      { label: 'Cancelar', type: 'secondary' },
      {
        label: 'Salvar',
        type: 'primary',
        onClick: async () => {
          const nome = inputNome.value.trim();
          const contexto = taContexto.value.trim();
          if (!nome || !contexto) {
            showToast('Nome e contexto são obrigatórios', 'error');
            return false; // segura o modal
          }
          const payload = {
            nome,
            icone: inputIcone.value.trim() || null,
            cor_hex: inputCor.value.replace('#', '').toUpperCase(),
            contexto,
            ativa: chkAtiva.checked,
          };
          if (!p.interno) {
            payload.nivel_complexidade = selNivel.value;
            payload.entidades_alvo = checksAlvo
              .filter((c) => c.checked)
              .map((c) => c.value);
          }
          const { error } = await supabase
            .from('personas')
            .update(payload)
            .eq('id', p.id);
          if (error) {
            console.error('[config] erro ao salvar persona', error);
            showToast('Erro ao salvar persona', 'error');
            return false;
          }
          await salvoComBump();
          carregarConfig().catch(() => {});
        },
      },
    ],
  });
}

// ──────────── 🤖 Agente (4.C.3b) ────────────
//
// O agente único: prompt_base (identidade do Assistente), modelo default
// (fallback quando o Roteador não escolhe persona), temperatura e
// max_tokens. Edita inline na própria seção (é UM registro só).

async function secaoAgente() {
  const { secao, corpo } = criarSecao('🤖 Agente (IA)');

  const { data: agente, error } = await supabase
    .from('agentes')
    .select('id, nome, prompt_base, modelo, temperatura, max_tokens')
    .eq('slug', 'assistente')
    .single();

  if (error || !agente) {
    console.error('[config] erro ao carregar agente', error);
    corpo.textContent = 'Erro ao carregar o agente.';
    return secao;
  }

  const form = document.createElement('div');
  form.className = 'nota-editor';

  const rotuloModelo = document.createElement('small');
  rotuloModelo.className = 'config-rotulo';
  rotuloModelo.textContent = 'Modelo default (fallback sem persona):';
  const inputModelo = document.createElement('input');
  inputModelo.type = 'text';
  inputModelo.className = 'nota-editor-titulo';
  inputModelo.value = agente.modelo ?? '';

  const linhaNums = document.createElement('div');
  linhaNums.className = 'agenda-horas';
  const inputTemp = document.createElement('input');
  inputTemp.type = 'number';
  inputTemp.step = '0.1';
  inputTemp.min = '0';
  inputTemp.max = '1';
  inputTemp.className = 'nota-editor-titulo';
  inputTemp.title = 'Temperatura (0-1)';
  inputTemp.value = agente.temperatura ?? '';
  const inputMax = document.createElement('input');
  inputMax.type = 'number';
  inputMax.min = '256';
  inputMax.max = '8192';
  inputMax.className = 'nota-editor-titulo';
  inputMax.title = 'Máx. tokens da resposta';
  inputMax.value = agente.max_tokens ?? '';
  linhaNums.appendChild(inputTemp);
  linhaNums.appendChild(inputMax);

  const rotuloPrompt = document.createElement('small');
  rotuloPrompt.className = 'config-rotulo';
  rotuloPrompt.textContent = 'Prompt base (identidade do Assistente — vale pra TODAS as personas):';
  const taPrompt = document.createElement('textarea');
  taPrompt.className = 'nota-editor-conteudo config-prompt';
  taPrompt.rows = 14;
  taPrompt.value = agente.prompt_base ?? '';

  const btnSalvar = document.createElement('button');
  btnSalvar.type = 'button';
  btnSalvar.className = 'btn btn-primary config-btn-add';
  btnSalvar.textContent = 'Salvar agente';
  btnSalvar.addEventListener('click', async () => {
    const prompt_base = taPrompt.value.trim();
    const modelo = inputModelo.value.trim();
    const temperatura = Number(inputTemp.value);
    const max_tokens = Number(inputMax.value);
    if (!prompt_base || !modelo) {
      showToast('Prompt base e modelo são obrigatórios', 'error');
      return;
    }
    if (!Number.isFinite(temperatura) || temperatura < 0 || temperatura > 1 ||
        !Number.isInteger(max_tokens) || max_tokens < 256) {
      showToast('Temperatura (0-1) ou max_tokens (≥256) inválidos', 'error');
      return;
    }
    const { error: errUpd } = await supabase
      .from('agentes')
      .update({ prompt_base, modelo, temperatura, max_tokens })
      .eq('id', agente.id);
    if (errUpd) {
      console.error('[config] erro ao salvar agente', errUpd);
      showToast('Erro ao salvar agente', 'error');
      return;
    }
    await salvoComBump();
  });

  form.appendChild(rotuloModelo);
  form.appendChild(inputModelo);
  form.appendChild(linhaNums);
  form.appendChild(rotuloPrompt);
  form.appendChild(taPrompt);
  form.appendChild(btnSalvar);
  corpo.appendChild(form);

  return secao;
}

// ──────────── ⚙️ Ajustes (4.C.3c) ────────────
//
// Chaves de `configuracoes` com editavel_por_usuario=true, agrupadas por
// categoria (ai_defaults, ai_limites, ai_tools, ui_labels). Valor jsonb:
// string/número editam em input simples; objeto/array em textarea JSON
// com validação no save (JSON inválido não grava — a Edge tem o C4 de
// defesa, mas melhor nem deixar entrar). Categoria 'sistema' fica fora
// (cache_version e afins são mecânica interna, não preferência).

const NOMES_CATEGORIA = {
  ai_defaults: '🧠 IA — comportamento',
  ai_limites: '🚦 IA — limites',
  ai_tools: '🔧 IA — tools ativas',
  ui_labels: '🏷 Rótulos das telas',
};

async function secaoAjustes() {
  const { secao, corpo } = criarSecao('⚙️ Ajustes');

  const { data, error } = await supabase
    .from('configuracoes')
    .select('chave, valor, categoria, descricao')
    .eq('editavel_por_usuario', true)
    .order('categoria')
    .order('chave');

  if (error) {
    console.error('[config] erro ao carregar ajustes', error);
    corpo.textContent = 'Erro ao carregar ajustes.';
    return secao;
  }

  let categoriaAtual = null;
  for (const cfg of data || []) {
    if (cfg.categoria !== categoriaAtual) {
      categoriaAtual = cfg.categoria;
      const titulo = document.createElement('small');
      titulo.className = 'config-rotulo config-categoria';
      titulo.textContent = NOMES_CATEGORIA[cfg.categoria] ?? cfg.categoria;
      corpo.appendChild(titulo);
    }

    const linha = document.createElement('button');
    linha.type = 'button';
    linha.className = 'config-linha';

    const nome = document.createElement('span');
    nome.className = 'config-linha-nome';
    // 'ui_labels.tarefa.status.feito' → 'tarefa.status.feito' (o grupo
    // já está no cabeçalho da categoria).
    nome.textContent = cfg.chave.replace(`${cfg.categoria}.`, '');

    const valor = document.createElement('span');
    valor.className = 'config-linha-valor';
    valor.textContent = typeof cfg.valor === 'string'
      ? cfg.valor
      : JSON.stringify(cfg.valor);

    linha.appendChild(nome);
    linha.appendChild(valor);
    linha.addEventListener('click', () => abrirEditorAjuste(cfg));
    corpo.appendChild(linha);
  }

  return secao;
}

function abrirEditorAjuste(cfg) {
  const form = document.createElement('div');
  form.className = 'nota-editor';

  if (cfg.descricao) {
    const desc = document.createElement('small');
    desc.className = 'config-rotulo';
    desc.style.textTransform = 'none';
    desc.textContent = cfg.descricao;
    form.appendChild(desc);
  }

  const tipoSimples = typeof cfg.valor === 'string' || typeof cfg.valor === 'number';
  let campo;
  if (tipoSimples) {
    campo = document.createElement('input');
    campo.type = 'text';
    campo.className = 'nota-editor-titulo';
    if (typeof cfg.valor === 'number') campo.inputMode = 'decimal';
    campo.value = String(cfg.valor);
  } else {
    campo = document.createElement('textarea');
    campo.className = 'nota-editor-conteudo config-prompt';
    campo.rows = 10;
    campo.value = JSON.stringify(cfg.valor, null, 2);
  }
  form.appendChild(campo);

  showModal({
    title: cfg.chave,
    body: form,
    actions: [
      { label: 'Cancelar', type: 'secondary' },
      {
        label: 'Salvar',
        type: 'primary',
        onClick: async () => {
          let novoValor;
          if (typeof cfg.valor === 'number') {
            novoValor = Number(campo.value.replace(',', '.'));
            if (!Number.isFinite(novoValor)) {
              showToast('Valor precisa ser um número', 'error');
              return false; // segura o modal
            }
          } else if (typeof cfg.valor === 'string') {
            novoValor = campo.value.trim();
            if (!novoValor) {
              showToast('Valor não pode ser vazio', 'error');
              return false;
            }
          } else {
            // Objeto/array: valida o JSON e o TIPO (mesmo shape de antes —
            // trocar array por objeto quebraria o lerConfig da Edge).
            try {
              novoValor = JSON.parse(campo.value);
            } catch {
              showToast('JSON inválido — confere vírgulas e aspas', 'error');
              return false;
            }
            if (Array.isArray(cfg.valor) !== Array.isArray(novoValor)) {
              showToast(
                Array.isArray(cfg.valor)
                  ? 'Este ajuste precisa ser uma lista [...]'
                  : 'Este ajuste precisa ser um objeto {...}',
                'error',
              );
              return false;
            }
          }

          const { error } = await supabase
            .from('configuracoes')
            .update({ valor: novoValor })
            .eq('chave', cfg.chave);
          if (error) {
            console.error('[config] erro ao salvar ajuste', error);
            showToast('Erro ao salvar ajuste', 'error');
            return false;
          }
          await salvoComBump();
          carregarConfig().catch(() => {});
        },
      },
    ],
  });
}
