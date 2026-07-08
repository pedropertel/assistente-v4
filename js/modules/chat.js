import { invokeFunctionStream, supabase } from '../core/supabase.js';
import { show as showToast } from '../core/toast.js';
import { mdParaHtml } from '../core/markdown.js';

/**
 * enviarMensagem — envia mensagem do user pra Edge chat-claude em
 * modo SSE (3.E.2) e atualiza UI token a token.
 *
 * Fluxo:
 *   1. Pega texto do textarea, valida não-vazio
 *   2. Desabilita botão + textarea (defesa contra double-click
 *      e contra Pedro mandar nova msg enquanto a anterior está
 *      em flight — REGRA decisão #13 do plan)
 *   3. Renderiza bolha user "otimista" (aparece imediato com
 *      classe .optimistic)
 *   4. Limpa textarea
 *   5. Chama Edge chat-claude com stream: true e reage aos eventos:
 *      - router → cria bolha assistant com chip da persona +
 *        "digitando…" (~2s antes do 1º token)
 *      - delta  → appenda texto na bolha (efeito digitação)
 *      - tool   → status "executando ação…" enquanto tool roda
 *      - error  → evento de erro emitido DEPOIS do stream abrir
 *   6. Em sucesso: recarrega histórico (substitui bolhas de stream
 *      pelas persistidas, com métricas de custo/latência do banco)
 *   7. Em erro (pré-stream ou evento error): marca bolhas como
 *      .failed + toast
 *   8. Reabilita controles, foca textarea
 */
// ──────────── Seletor de entidade (4.A.2) ────────────
//
// Estado da empresa ativa da conversa. null = chat geral (comportamento
// idêntico ao pré-4.A.2). Persiste em localStorage pra sobreviver a
// reload/reabrir o PWA. O id é validado contra a lista carregada do
// banco — id órfão (entidade apagada) volta pra Geral em silêncio.

let entidadeAtiva = localStorage.getItem('chat.entidade_id') || null;

/**
 * initSeletorEntidade — carrega entidades ativas e renderiza os chips.
 * Chamada 1x no initApp (app.js). Falha graciosa: sem chips, o chat
 * geral continua funcionando (entidadeAtiva permanece utilizável).
 */
export async function initSeletorEntidade() {
  const el = document.getElementById('chat-entidades');
  if (!el) return;

  const { data, error } = await supabase
    .from('entidades')
    .select('id, nome, icone, cor_hex')
    .eq('ativa', true)
    .order('ordem');

  if (error) {
    console.error('[chat] erro ao carregar entidades', error);
    return;
  }

  const entidades = data || [];
  if (entidadeAtiva && !entidades.some((e) => e.id === entidadeAtiva)) {
    entidadeAtiva = null;
    localStorage.removeItem('chat.entidade_id');
  }

  renderChipsEntidade(el, entidades);
}

function renderChipsEntidade(el, entidades) {
  el.innerHTML = '';
  const opcoes = [
    { id: null, nome: 'Geral', icone: '🌐', cor_hex: '6B7280' },
    ...entidades,
  ];
  for (const ent of opcoes) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-entidade-chip' +
      (ent.id === entidadeAtiva ? ' ativa' : '');
    btn.style.setProperty('--chip-cor', '#' + (ent.cor_hex || '6B7280'));
    btn.textContent = [ent.icone, ent.nome].filter(Boolean).join(' ');
    // addEventListener (não onclick no HTML) → sem window bridge (REGRA 4
    // só vale pra onclick inline).
    btn.addEventListener('click', () => {
      if (ent.id === entidadeAtiva) return;
      entidadeAtiva = ent.id;
      if (ent.id) localStorage.setItem('chat.entidade_id', ent.id);
      else localStorage.removeItem('chat.entidade_id');
      renderChipsEntidade(el, entidades);
      carregarHistorico().catch((err) => {
        console.error('[chat] erro ao trocar entidade', err);
      });
    });
    el.appendChild(btn);
  }
}

export async function enviarMensagem() {
  const ta = document.getElementById('chat-textarea');
  const btn = document.getElementById('btn-enviar');

  if (!ta || !btn) {
    console.error('[chat] elementos não encontrados');
    return;
  }

  const texto = ta.value.trim();
  if (!texto) return;

  // 3.H.2: se o texto veio de ditado, marca a origem (Edge grava
  // origem='voz' + transcricao_original nas tools). Reseta o flag e
  // para o mic se ainda estiver gravando.
  const veioDeVoz = textoVeioDeVoz;
  textoVeioDeVoz = false;
  if (ditandoAtivo) recognition?.stop();

  btn.disabled = true;
  ta.disabled = true;

  // Otimista: bolha aparece imediato
  const optimisticEl = appendBubbleOptimistic(texto);
  ta.value = '';

  // Bolha da resposta em streaming — criada no evento `router`
  // (ou no primeiro `delta`, se o router não chegar por algum motivo).
  let stream = null;
  let erroEvento = null;

  const garantirBolha = (chipData) => {
    if (!stream) stream = appendBubbleStreaming(chipData);
    return stream;
  };

  try {
    const { error } = await invokeFunctionStream(
      'chat-claude',
      // 4.A.2: entidade ativa vai no body — Edge filtra histórico e
      // resolve o nome pro Roteador/prompt. null = chat geral.
      { texto, stream: true, origem_voz: veioDeVoz, entidade_id: entidadeAtiva },
      {
        router: (d) => {
          garantirBolha(d);
        },
        delta: (d) => {
          const s = garantirBolha(null);
          if (s.status.textContent) s.status.textContent = '';
          s.texto.textContent += d.texto;
          scrollToBottom();
        },
        tool: (d) => {
          const s = garantirBolha(null);
          s.status.textContent = d.status === 'executando'
            ? '⚙️ executando ação…'
            : (d.status === 'erro' ? '⚠️ ação falhou' : '');
        },
        error: (d) => {
          erroEvento = d;
        },
      },
    );

    if (error || erroEvento) {
      const msg = (erroEvento && erroEvento.message) ||
        (error && error.message) || 'Erro desconhecido';
      showToast(`Erro: ${msg}`, 'error');
      optimisticEl.classList.remove('optimistic');
      optimisticEl.classList.add('failed');
      if (stream) stream.bubble.classList.add('error');
      // C7 (revisão 2026-07-07): devolve o texto pro campo pra Pedro não
      // reescrever. Só se o erro foi ANTES de qualquer resposta chegar
      // (sem stream nem eventos) — senão a mensagem já foi processada.
      if (!stream) ta.value = texto;
      return;
    }

    // Sucesso: recarrega histórico — substitui otimista + bolha de
    // stream pelas rows persistidas (métricas reais + chip do banco).
    await carregarHistorico();
  } catch (err) {
    console.error('[chat] exception inesperada', err);
    showToast('Erro inesperado. Vê o console.', 'error');
    optimisticEl.classList.remove('optimistic');
    optimisticEl.classList.add('failed');
    if (!stream) ta.value = texto; // C7: recupera a mensagem digitada
  } finally {
    btn.disabled = false;
    ta.disabled = false;
    ta.focus();
  }
}

/**
 * carregarHistorico — busca últimas 50 mensagens do chat.
 *
 * 4.A.2: sem argumento, usa a entidade ATIVA do seletor (null = chat
 * geral). Conversas de empresas diferentes não se misturam — mesmo
 * critério de filtro da Edge.
 */
export async function carregarHistorico(entidadeId = entidadeAtiva) {
  let q = supabase
    .from('chat_mensagens')
    .select(`
      id, papel, conteudo, modelo_usado, custo_brl, latencia_ms, erro, created_at,
      persona_id,
      personas(slug, nome, icone, cor_hex)
    `)
    .neq('papel', 'system')
    .order('created_at', { ascending: false })
    .limit(50);

  q = entidadeId === null
    ? q.is('entidade_id', null)
    : q.eq('entidade_id', entidadeId);

  const { data, error } = await q;

  if (error) {
    console.error('[chat] erro ao carregar histórico — DETALHE:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      statusCode: error?.statusCode,
      full: error,
    });
    showToast('Erro ao carregar histórico', 'error');
    return;
  }

  renderHistorico((data || []).reverse());
}

/**
 * handleChatKeydown — Enter envia, Shift+Enter quebra linha.
 */
export function handleChatKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    enviarMensagem();
  }
}

// ──────────── Ditado por voz (3.H.2) ────────────
//
// Web Speech API (SpeechRecognition) — transcrição LOCAL no aparelho,
// custo zero, pt-BR. Fluxo: 🎤 → fala → texto aparece no textarea →
// Pedro REVISA e envia manualmente (decisão 3.H: transcrição errada
// não pode virar lançamento financeiro sem conferência).
//
// iOS Safari: exige toque no botão pra ativar o mic (gesto do usuário)
// e encerra sozinho em pausas de fala — ditado por frase, não contínuo.
// O envio marca `origem_voz: true` → Edge grava origem='voz' +
// transcricao_original nas tools de write.

const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let ditandoAtivo = false;
let textoVeioDeVoz = false;

// Revela o botão 🎤 só quando o browser suporta a API (module scripts
// são deferred — DOM já parseado quando isso roda).
const btnDitadoEl = document.getElementById('btn-ditado');
if (btnDitadoEl && SpeechRec) btnDitadoEl.hidden = false;

/**
 * toggleDitado — inicia/para o ditado. Chamado pelo onclick do 🎤
 * (exposto no window via app.js — REGRA 4).
 */
export function toggleDitado() {
  const btn = document.getElementById('btn-ditado');
  const ta = document.getElementById('chat-textarea');
  if (!SpeechRec || !btn || !ta) return;

  if (ditandoAtivo) {
    recognition?.stop();
    return;
  }

  recognition = new SpeechRec();
  recognition.lang = 'pt-BR';
  recognition.interimResults = true; // texto vai aparecendo enquanto fala
  recognition.continuous = false; // iOS encerra em pausa de qualquer jeito

  // Preserva o que já estava digitado (ditado concatena no fim).
  const baseTexto = ta.value.trim().length > 0 ? ta.value.trim() + ' ' : '';

  recognition.onresult = (event) => {
    let transcrito = '';
    for (const resultado of event.results) {
      transcrito += resultado[0].transcript;
    }
    ta.value = baseTexto + transcrito;
    textoVeioDeVoz = true;
  };

  recognition.onerror = (event) => {
    // 'no-speech' (silêncio) e 'aborted' (parou no botão) são normais.
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      showToast(`Ditado falhou: ${event.error}`, 'error');
    }
  };

  recognition.onend = () => {
    ditandoAtivo = false;
    btn.classList.remove('gravando');
    btn.textContent = '🎤';
    ta.focus();
  };

  ditandoAtivo = true;
  btn.classList.add('gravando');
  btn.textContent = '⏹';
  recognition.start();
}

// ──────────── Helpers internos ────────────

function appendBubbleOptimistic(texto) {
  const histEl = document.getElementById('chat-historico');
  hideEmptyState();

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble user optimistic';
  bubble.textContent = texto;
  histEl.appendChild(bubble);
  scrollToBottom(true);
  return bubble;
}

/**
 * appendBubbleStreaming — bolha assistant do modo SSE (3.E.2).
 *
 * Criada no evento `router` (com chip da persona que o Roteador
 * escolheu) ou no primeiro `delta` (chip fallback "Assistente" 🤖).
 * Estrutura: chip + <span> de texto (deltas appendam aqui) +
 * <small> de status ("digitando…", "⚙️ executando ação…").
 *
 * É temporária: no `done`, `carregarHistorico()` substitui pela
 * row persistida (com métricas de custo/latência do banco).
 */
function appendBubbleStreaming(chipData) {
  const histEl = document.getElementById('chat-historico');
  hideEmptyState();

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble assistant streaming';

  const dados = chipData ?? {
    icone: '🤖',
    nome: 'Assistente',
    cor_hex: '6B7280',
  };
  const chip = document.createElement('span');
  chip.className = 'chat-bubble-persona-chip';
  chip.style.backgroundColor = '#' + dados.cor_hex;

  const icon = document.createElement('span');
  icon.className = 'chip-icon';
  icon.textContent = dados.icone;

  const name = document.createElement('span');
  name.className = 'chip-name';
  name.textContent = dados.nome;

  chip.appendChild(icon);
  chip.appendChild(name);
  bubble.appendChild(chip);
  bubble.appendChild(document.createElement('br'));

  const texto = document.createElement('span');
  bubble.appendChild(texto);

  const status = document.createElement('small');
  status.className = 'chat-bubble-meta';
  status.textContent = 'digitando…';
  bubble.appendChild(status);

  histEl.appendChild(bubble);
  scrollToBottom(true);
  return { bubble, texto, status };
}

function renderHistorico(mensagens) {
  const histEl = document.getElementById('chat-historico');
  histEl.innerHTML = '';

  if (!mensagens.length) {
    showEmptyState();
    return;
  }

  hideEmptyState();

  for (const msg of mensagens) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${msg.papel}`;

    // Chip da persona ativa (3.D.4 + 3.D.4.1) — toda assistant ganha chip.
    // Persona escolhida pelo Roteador → chip colorido próprio (Marcos/Bruno/etc).
    // Sem persona (Roteador retornou null OU mensagens pré-3.D) → fallback
    // chip cinza "Assistente" 🤖. Pedro sempre identifica quem respondeu.
    // Roteador é interno=true e fica em rows papel='system' já filtradas
    // pelo SELECT — chip nunca renderiza Roteador.
    if (msg.papel === 'assistant') {
      const chipData = msg.personas ?? {
        icone: '🤖',
        nome: 'Assistente',
        cor_hex: '6B7280',
      };
      const chip = document.createElement('span');
      chip.className = 'chat-bubble-persona-chip';
      chip.style.backgroundColor = '#' + chipData.cor_hex;

      const icon = document.createElement('span');
      icon.className = 'chip-icon';
      icon.textContent = chipData.icone;

      const name = document.createElement('span');
      name.className = 'chip-name';
      name.textContent = chipData.nome;

      chip.appendChild(icon);
      chip.appendChild(name);
      bubble.appendChild(chip);
      bubble.appendChild(document.createElement('br'));
    }

    // Conteúdo da mensagem — appendChild (não textContent, que apagaria
    // o chip já adicionado acima).
    if (msg.erro) {
      bubble.classList.add('error');
      bubble.appendChild(document.createTextNode(`[erro] ${msg.erro}`));
    } else if (msg.papel === 'assistant') {
      // 4.A.1: assistant renderiza Markdown (negrito, listas, código,
      // quebras). innerHTML é seguro: mdParaHtml escapa TODO o conteúdo
      // antes de gerar as próprias tags. Mensagem do USER continua
      // texto literal (linha abaixo) — o que Pedro digita não vira HTML.
      const md = document.createElement('div');
      md.className = 'chat-md';
      md.innerHTML = mdParaHtml(msg.conteudo);
      bubble.appendChild(md);
    } else {
      bubble.appendChild(document.createTextNode(msg.conteudo));
    }

    // Meta info pra assistant: latência + custo
    if (msg.papel === 'assistant' && !msg.erro && msg.latencia_ms != null) {
      const meta = document.createElement('small');
      meta.className = 'chat-bubble-meta';
      const custoTxt = msg.custo_brl != null
        ? `R$ ${Number(msg.custo_brl).toFixed(4)}`
        : '';
      const latTxt = `${msg.latencia_ms}ms`;
      meta.textContent = [custoTxt, latTxt].filter(Boolean).join(' · ');
      bubble.appendChild(meta);
    }

    histEl.appendChild(bubble);
  }

  scrollToBottom();
}

function showEmptyState() {
  let emptyEl = document.getElementById('chat-empty');
  if (!emptyEl) {
    emptyEl = document.createElement('div');
    emptyEl.className = 'chat-empty';
    emptyEl.id = 'chat-empty';
    emptyEl.textContent = 'Sem mensagens ainda. Manda um "oi" pra começar.';
    document.getElementById('chat-historico').appendChild(emptyEl);
  } else {
    emptyEl.style.display = '';
  }
}

function hideEmptyState() {
  const emptyEl = document.getElementById('chat-empty');
  if (emptyEl) emptyEl.style.display = 'none';
}

function scrollToBottom(smooth = false) {
  const histEl = document.getElementById('chat-historico');
  if (!histEl) return;
  requestAnimationFrame(() => {
    if (smooth) {
      histEl.scrollTo({ top: histEl.scrollHeight, behavior: 'smooth' });
    } else {
      histEl.scrollTop = histEl.scrollHeight;
    }
  });
}
