import { invokeFunction, supabase } from '../core/supabase.js';
import { show as showToast } from '../core/toast.js';

/**
 * enviarMensagem — envia mensagem do user pra Edge chat-claude e
 * atualiza UI.
 *
 * Fluxo:
 *   1. Pega texto do textarea, valida não-vazio
 *   2. Desabilita botão + textarea (defesa contra double-click
 *      e contra Pedro mandar nova msg enquanto a anterior está
 *      em flight — REGRA decisão #13 do plan)
 *   3. Renderiza bolha user "otimista" (aparece imediato com
 *      classe .optimistic)
 *   4. Limpa textarea
 *   5. Chama Edge chat-claude
 *   6. Em sucesso: recarrega histórico (substitui bolha
 *      otimista pela persistida + adiciona bolha assistant)
 *   7. Em erro: marca bolha otimista como .failed + toast
 *   8. Reabilita controles, foca textarea
 */
export async function enviarMensagem() {
  const ta = document.getElementById('chat-textarea');
  const btn = document.getElementById('btn-enviar');

  if (!ta || !btn) {
    console.error('[chat] elementos não encontrados');
    return;
  }

  const texto = ta.value.trim();
  if (!texto) return;

  btn.disabled = true;
  ta.disabled = true;

  // Otimista: bolha aparece imediato
  const optimisticEl = appendBubbleOptimistic(texto);
  ta.value = '';

  try {
    const { error } = await invokeFunction('chat-claude', { texto });

    if (error) {
      showToast(`Erro: ${error.message}`, 'error');
      optimisticEl.classList.remove('optimistic');
      optimisticEl.classList.add('failed');
      return;
    }

    // Sucesso: recarrega histórico (substitui otimista +
    // mostra resposta assistant)
    await carregarHistorico();
  } catch (err) {
    console.error('[chat] exception inesperada', err);
    showToast('Erro inesperado. Vê o console.', 'error');
    optimisticEl.classList.remove('optimistic');
    optimisticEl.classList.add('failed');
  } finally {
    btn.disabled = false;
    ta.disabled = false;
    ta.focus();
  }
}

/**
 * carregarHistorico — busca últimas 50 mensagens do chat.
 *
 * 3.B: entidadeId sempre null (UI ainda não tem seletor de
 * entidade). Filtra entidade_id IS NULL pra mostrar só chat
 * geral.
 * 3.D vai estender pra suportar histórico por entidade ativa
 * + filtragem por persona quando relevante.
 */
export async function carregarHistorico(entidadeId = null) {
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
