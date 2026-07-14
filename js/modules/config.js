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
  raiz.appendChild(await secaoCentrosCusto());
  raiz.appendChild(await secaoAjustes());
  raiz.appendChild(await secaoLabels());
  raiz.appendChild(await secaoAvancado());
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

// ──────────── ⚙️ Ajustes (4.C.3c, humanizada) ────────────
//
// Feedback do Pedro (1º teste): chave técnica e JSON cru na tela não
// servem. Cada ajuste ganha NOME EM PORTUGUÊS e editor estruturado
// (número, selects de modelo, checkboxes de tools); os rótulos das
// telas viram grupos de inputs com um salvar só. Manutenção técnica
// (preços por modelo, lista sem-temperature, tools por persona) vive
// na seção "Avançado", colapsada e com aviso — lá o JSON é aceitável.

/** 'claude-sonnet-4-6' → 'Sonnet 4.6' (nome amigável nos selects). */
function nomeModelo(id) {
  const m = String(id).match(/claude-([a-z]+)-(\d+)-(\d+)/);
  if (!m) return id;
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}`;
}

const NOMES_TOOLS = {
  salvar_ideia: '💡 Salvar ideia (Marina)',
  lancar_custo_sitio: '🌱 Lançar custo do sítio (Alemão)',
  salvar_anotacao: '📝 Salvar anotação (bloco de notas)',
};

const GRUPOS_LABELS = [
  { prefixo: 'ui_labels.tarefa.status.', titulo: 'Colunas do kanban' },
  { prefixo: 'ui_labels.tarefa.prioridade.', titulo: 'Prioridades de tarefa' },
  { prefixo: 'ui_labels.evento.tipo.', titulo: 'Tipos de evento' },
  { prefixo: 'ui_labels.ideia.status.', titulo: 'Status de ideia' },
  { prefixo: 'ui_labels.ideia.origem.', titulo: 'Origens de ideia' },
];

const CHAVES_AVANCADO = new Set([
  'ai_defaults.precos_modelos',
  'ai_defaults.modelos_sem_temperature',
  'ai_tools.por_persona',
]);

/** Salva só o que mudou (lista de {chave, valor}) + 1 bump no final. */
async function salvarMudancas(mudancas) {
  if (!mudancas.length) {
    showToast('Nada mudou');
    return true;
  }
  for (const m of mudancas) {
    const { error } = await supabase
      .from('configuracoes')
      .update({ valor: m.valor })
      .eq('chave', m.chave);
    if (error) {
      console.error('[config] erro ao salvar', m.chave, error);
      showToast('Erro ao salvar ajustes', 'error');
      return false;
    }
  }
  await salvoComBump();
  return true;
}

async function secaoAjustes() {
  const { secao, corpo } = criarSecao('⚙️ Ajustes da IA');

  const { data, error } = await supabase
    .from('configuracoes')
    .select('chave, valor, descricao')
    .eq('editavel_por_usuario', true);

  if (error) {
    console.error('[config] erro ao carregar ajustes', error);
    corpo.textContent = 'Erro ao carregar ajustes.';
    return secao;
  }

  const cfg = new Map((data || []).map((r) => [r.chave, r.valor]));
  const form = document.createElement('div');
  form.className = 'nota-editor';

  // ── Números simples, com nome humano ──
  const campoNum = (rotulo, valorAtual) => {
    const wrap = document.createElement('div');
    wrap.className = 'config-campo';
    const label = document.createElement('small');
    label.className = 'config-rotulo';
    label.textContent = rotulo;
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'nota-editor-titulo';
    input.value = valorAtual ?? '';
    wrap.appendChild(label);
    wrap.appendChild(input);
    form.appendChild(wrap);
    return input;
  };

  const inputHistorico = campoNum(
    'Memória da conversa (últimas N mensagens que a IA lembra)',
    cfg.get('ai_defaults.historico_max_mensagens'),
  );
  const inputLimite = campoNum(
    'Limite de mensagens por minuto (proteção de custo)',
    cfg.get('ai_limites.msgs_por_minuto'),
  );

  // ── Modelo por complexidade: 3 selects com nome amigável ──
  // Opções vêm das chaves de precos_modelos (dinâmico) + valores atuais.
  const mapa = cfg.get('ai_defaults.mapeamento_complexidade') ?? {};
  const precos = cfg.get('ai_defaults.precos_modelos') ?? {};
  const modelosDisponiveis = [...new Set([
    ...Object.keys(precos),
    ...Object.values(mapa),
  ])];

  const tituloMapa = document.createElement('small');
  tituloMapa.className = 'config-rotulo config-categoria';
  tituloMapa.textContent = 'Qual modelo responde cada nível de conversa';
  form.appendChild(tituloMapa);

  const selectsMapa = {};
  for (const [nivel, rotulo] of [
    ['simples', 'Conversa simples (rápida e barata)'],
    ['medio', 'Conversa média (análise do dia a dia)'],
    ['complexo', 'Conversa complexa (estratégia, redação importante)'],
  ]) {
    const wrap = document.createElement('div');
    wrap.className = 'config-campo';
    const label = document.createElement('small');
    label.className = 'config-rotulo';
    label.textContent = rotulo;
    const sel = document.createElement('select');
    sel.className = 'nota-editor-titulo';
    for (const modelo of modelosDisponiveis) {
      const opt = document.createElement('option');
      opt.value = modelo;
      opt.textContent = nomeModelo(modelo);
      if (modelo === mapa[nivel]) opt.selected = true;
      sel.appendChild(opt);
    }
    selectsMapa[nivel] = sel;
    wrap.appendChild(label);
    wrap.appendChild(sel);
    form.appendChild(wrap);
  }

  // ── Tools ativas: checkboxes com nome humano ──
  const tituloTools = document.createElement('small');
  tituloTools.className = 'config-rotulo config-categoria';
  tituloTools.textContent = 'O que a IA pode fazer sozinha (ações no banco)';
  form.appendChild(tituloTools);

  const transversais = cfg.get('ai_tools.transversais') ?? [];
  const nomesTools = [...new Set([
    ...Object.keys(NOMES_TOOLS),
    ...transversais,
  ])];
  const checksTools = [];
  for (const tool of nomesTools) {
    const label = document.createElement('label');
    label.className = 'agenda-check-dia';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.value = tool;
    chk.checked = transversais.includes(tool);
    checksTools.push(chk);
    label.appendChild(chk);
    label.appendChild(document.createTextNode(' ' + (NOMES_TOOLS[tool] ?? tool)));
    form.appendChild(label);
  }

  // ── Salvar (só o que mudou; 1 bump) ──
  const btnSalvar = document.createElement('button');
  btnSalvar.type = 'button';
  btnSalvar.className = 'btn btn-primary config-btn-add';
  btnSalvar.textContent = 'Salvar ajustes';
  btnSalvar.addEventListener('click', async () => {
    const mudancas = [];

    const historico = Number(inputHistorico.value);
    if (Number.isInteger(historico) && historico >= 1 && historico <= 100 &&
        historico !== cfg.get('ai_defaults.historico_max_mensagens')) {
      mudancas.push({ chave: 'ai_defaults.historico_max_mensagens', valor: historico });
    }
    const limite = Number(inputLimite.value);
    if (Number.isInteger(limite) && limite >= 1 && limite <= 120 &&
        limite !== cfg.get('ai_limites.msgs_por_minuto')) {
      mudancas.push({ chave: 'ai_limites.msgs_por_minuto', valor: limite });
    }

    const novoMapa = {
      simples: selectsMapa.simples.value,
      medio: selectsMapa.medio.value,
      complexo: selectsMapa.complexo.value,
    };
    if (JSON.stringify(novoMapa) !== JSON.stringify(mapa)) {
      mudancas.push({ chave: 'ai_defaults.mapeamento_complexidade', valor: novoMapa });
    }

    const novasTools = checksTools.filter((c) => c.checked).map((c) => c.value);
    if (JSON.stringify([...novasTools].sort()) !== JSON.stringify([...transversais].sort())) {
      mudancas.push({ chave: 'ai_tools.transversais', valor: novasTools });
    }

    if (await salvarMudancas(mudancas)) carregarConfig().catch(() => {});
  });
  form.appendChild(btnSalvar);

  corpo.appendChild(form);
  return secao;
}

// ──────────── 🏷 Nomes nas telas (labels em grupos) ────────────

async function secaoLabels() {
  const { secao, corpo } = criarSecao('🏷 Nomes nas telas');

  const { data, error } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .like('chave', 'ui_labels.%')
    .eq('editavel_por_usuario', true)
    .order('chave');

  if (error) {
    console.error('[config] erro ao carregar labels', error);
    corpo.textContent = 'Erro ao carregar rótulos.';
    return secao;
  }

  const rows = data || [];
  const inputs = []; // {chave, input, original}

  for (const grupo of GRUPOS_LABELS) {
    const doGrupo = rows.filter((r) => r.chave.startsWith(grupo.prefixo));
    if (!doGrupo.length) continue;

    const titulo = document.createElement('small');
    titulo.className = 'config-rotulo config-categoria';
    titulo.textContent = grupo.titulo;
    corpo.appendChild(titulo);

    for (const r of doGrupo) {
      const linha = document.createElement('div');
      linha.className = 'config-label-linha';
      // Identifica o slot sem jargão: 'a_fazer' → "a fazer".
      const slot = document.createElement('small');
      slot.className = 'config-label-slot';
      slot.textContent = r.chave.split('.').pop().replace(/_/g, ' ');
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'nota-editor-titulo';
      input.value = typeof r.valor === 'string' ? r.valor : '';
      inputs.push({ chave: r.chave, input, original: r.valor });
      linha.appendChild(slot);
      linha.appendChild(input);
      corpo.appendChild(linha);
    }
  }

  const btnSalvar = document.createElement('button');
  btnSalvar.type = 'button';
  btnSalvar.className = 'btn btn-primary config-btn-add';
  btnSalvar.textContent = 'Salvar nomes';
  btnSalvar.addEventListener('click', async () => {
    const mudancas = [];
    for (const { chave, input, original } of inputs) {
      const novo = input.value.trim();
      if (novo && novo !== original) mudancas.push({ chave, valor: novo });
    }
    if (await salvarMudancas(mudancas)) carregarConfig().catch(() => {});
  });
  corpo.appendChild(btnSalvar);

  return secao;
}

// ──────────── 🔬 Avançado (JSON, com aviso — manutenção técnica) ────────────

async function secaoAvancado() {
  const { secao, corpo } = criarSecao('🔬 Avançado');

  const aviso = document.createElement('p');
  aviso.className = 'config-aviso';
  aviso.textContent = '⚠️ Manutenção técnica (preços por modelo, lista de ' +
    'modelos sem temperature, tools por persona). Só mexe aqui se souber ' +
    'exatamente o que está fazendo — valor errado degrada a IA em silêncio.';
  corpo.appendChild(aviso);

  const { data, error } = await supabase
    .from('configuracoes')
    .select('chave, valor, descricao')
    .eq('editavel_por_usuario', true)
    .order('chave');

  if (error) {
    corpo.textContent = 'Erro ao carregar.';
    return secao;
  }

  for (const cfg of (data || []).filter((r) => CHAVES_AVANCADO.has(r.chave))) {
    const linha = document.createElement('button');
    linha.type = 'button';
    linha.className = 'config-linha';
    const nome = document.createElement('span');
    nome.className = 'config-linha-nome';
    nome.textContent = cfg.chave;
    linha.appendChild(nome);
    linha.addEventListener('click', () => abrirEditorJson(cfg));
    corpo.appendChild(linha);
  }

  return secao;
}

function abrirEditorJson(cfg) {
  const form = document.createElement('div');
  form.className = 'nota-editor';

  if (cfg.descricao) {
    const desc = document.createElement('small');
    desc.className = 'config-rotulo';
    desc.style.textTransform = 'none';
    desc.textContent = cfg.descricao;
    form.appendChild(desc);
  }

  const campo = document.createElement('textarea');
  campo.className = 'nota-editor-conteudo config-prompt';
  campo.rows = 10;
  campo.value = JSON.stringify(cfg.valor, null, 2);
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
          try {
            novoValor = JSON.parse(campo.value);
          } catch {
            showToast('JSON inválido — confere vírgulas e aspas', 'error');
            return false; // segura o modal
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
          if (await salvarMudancas([{ chave: cfg.chave, valor: novoValor }])) {
            carregarConfig().catch(() => {});
          }
        },
      },
    ],
  });
}

// ──────────── 🌱 Centros de custo do Sítio (pedido do Pedro 2026-07-13) ────────────
//
// Categorias de sitio_lancamentos — a lista oficial que o Alemão usa no
// enum da tool e o dash usa nos donuts. Hierarquia de 2 níveis: grupo
// raiz (sem pai) → subcategoria. Soft-delete (desativar).
// NOTA: o cache da tool do Alemão na Edge ainda NÃO entra no reset do
// cache_version (gap conhecido da 4.0) — categoria nova chega no chat
// quando o isolate recicla (~5min). A tela e o dash veem na hora.

async function secaoCentrosCusto() {
  const { secao, corpo } = criarSecao('🌱 Centros de custo do Sítio');

  const { data, error } = await supabase
    .from('sitio_categorias')
    .select('id, slug, nome, tipo, categoria_pai_id, cor_hex, ordem, ativa')
    .order('tipo')
    .order('ordem');

  if (error) {
    console.error('[config] erro ao carregar categorias do sítio', error);
    corpo.textContent = 'Erro ao carregar centros de custo.';
    return secao;
  }

  const categorias = data || [];
  const raizes = categorias.filter((c) => !c.categoria_pai_id);

  for (const [tipo, titulo] of [['saida', '↓ Saídas'], ['entrada', '↑ Entradas']]) {
    const cab = document.createElement('small');
    cab.className = 'config-rotulo config-categoria';
    cab.textContent = titulo;
    corpo.appendChild(cab);

    for (const raiz of raizes.filter((r) => r.tipo === tipo)) {
      corpo.appendChild(linhaCategoria(raiz, categorias, false));
      for (const filha of categorias.filter((c) => c.categoria_pai_id === raiz.id)) {
        corpo.appendChild(linhaCategoria(filha, categorias, true));
      }
    }
  }

  const btnNova = document.createElement('button');
  btnNova.type = 'button';
  btnNova.className = 'btn btn-secondary config-btn-add';
  btnNova.textContent = '+ Novo centro de custo';
  btnNova.addEventListener('click', () => abrirEditorCategoria(null, categorias));
  corpo.appendChild(btnNova);

  return secao;
}

function linhaCategoria(cat, categorias, filha) {
  const linha = document.createElement('button');
  linha.type = 'button';
  linha.className = 'config-linha' + (cat.ativa ? '' : ' inativa') +
    (filha ? ' config-linha-filha' : '');

  const swatch = document.createElement('span');
  swatch.className = 'sitio-swatch';
  swatch.style.backgroundColor = '#' + (cat.cor_hex || '6B7280');

  const nome = document.createElement('span');
  nome.className = 'config-linha-nome';
  nome.textContent = cat.nome + (cat.ativa ? '' : ' (inativo)');

  linha.appendChild(swatch);
  linha.appendChild(nome);
  linha.addEventListener('click', () => abrirEditorCategoria(cat, categorias));
  return linha;
}

function abrirEditorCategoria(cat, categorias) {
  const form = document.createElement('div');
  form.className = 'nota-editor';

  const inputNome = document.createElement('input');
  inputNome.type = 'text';
  inputNome.className = 'nota-editor-titulo';
  inputNome.placeholder = 'Nome (ex: Irrigação)';
  inputNome.value = cat?.nome ?? '';

  const selTipo = document.createElement('select');
  selTipo.className = 'nota-editor-titulo';
  for (const [valor, label] of [['saida', '↓ Saída (gasto)'], ['entrada', '↑ Entrada (receita)']]) {
    const opt = document.createElement('option');
    opt.value = valor;
    opt.textContent = label;
    if (valor === (cat?.tipo ?? 'saida')) opt.selected = true;
    selTipo.appendChild(opt);
  }

  // Grupo pai: raízes do MESMO tipo (repopula quando o tipo muda).
  // Uma raiz com filhas não pode virar filha (só 2 níveis).
  const temFilhas = cat
    ? categorias.some((c) => c.categoria_pai_id === cat.id)
    : false;
  const selPai = document.createElement('select');
  selPai.className = 'nota-editor-titulo';
  const popularPais = () => {
    selPai.innerHTML = '';
    const optRaiz = document.createElement('option');
    optRaiz.value = '';
    optRaiz.textContent = '— é um grupo (sem pai)';
    selPai.appendChild(optRaiz);
    if (temFilhas) return; // grupo com filhas fica raiz
    for (const raiz of categorias.filter((c) =>
      !c.categoria_pai_id && c.tipo === selTipo.value && c.id !== cat?.id)) {
      const opt = document.createElement('option');
      opt.value = raiz.id;
      opt.textContent = 'Dentro de: ' + raiz.nome;
      if (raiz.id === cat?.categoria_pai_id) opt.selected = true;
      selPai.appendChild(opt);
    }
  };
  popularPais();
  selTipo.addEventListener('change', popularPais);

  const labelCor = document.createElement('label');
  labelCor.className = 'config-label-cor';
  labelCor.textContent = 'Cor (aparece no dash): ';
  const inputCor = document.createElement('input');
  inputCor.type = 'color';
  inputCor.value = '#' + (cat?.cor_hex || '6B7280');
  labelCor.appendChild(inputCor);

  const labelAtiva = document.createElement('label');
  labelAtiva.className = 'agenda-check-dia';
  const chkAtiva = document.createElement('input');
  chkAtiva.type = 'checkbox';
  chkAtiva.checked = cat?.ativa ?? true;
  labelAtiva.appendChild(chkAtiva);
  labelAtiva.appendChild(document.createTextNode(
    ' Ativo (inativo sai da lista do Alemão e dos filtros)',
  ));

  form.appendChild(inputNome);
  form.appendChild(selTipo);
  form.appendChild(selPai);
  form.appendChild(labelCor);
  form.appendChild(labelAtiva);

  showModal({
    title: cat ? `Editar ${cat.nome}` : 'Novo centro de custo',
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
          // Nome duplicado no mesmo tipo confunde a resolução da tool
          // (foi a duplicata "Outros" da 4.B.2a) — barra na origem.
          const duplicado = categorias.some((c) =>
            c.id !== cat?.id && c.tipo === selTipo.value &&
            c.nome.toLowerCase() === nome.toLowerCase());
          if (duplicado) {
            showToast(`Já existe "${nome}" nesse tipo — usa um nome único`, 'error');
            return false;
          }
          const payload = {
            nome,
            tipo: selTipo.value,
            categoria_pai_id: selPai.value || null,
            cor_hex: inputCor.value.replace('#', '').toUpperCase(),
            ativa: chkAtiva.checked,
          };
          const op = cat
            ? supabase.from('sitio_categorias').update(payload).eq('id', cat.id)
            : supabase.from('sitio_categorias')
              .insert({ ...payload, slug: slugify(nome), ordem: 50 });
          const { error } = await op;
          if (error) {
            console.error('[config] erro ao salvar categoria', error);
            showToast('Erro ao salvar centro de custo', 'error');
            return false;
          }
          await bumpCacheVersion();
          showToast('Salvo ✓ — o Alemão vê em ~5min; telas veem na hora');
          carregarConfig().catch(() => {});
        },
      },
    ],
  });
}
