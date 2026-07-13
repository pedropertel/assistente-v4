import { supabase, invokeFunction } from './core/supabase.js';
import { goPage } from './core/router.js';
import { show as showToast } from './core/toast.js';
import { show as showModal, close as closeModal } from './core/modal.js';
import * as utils from './core/utils.js';
import {
  carregarHistorico,
  enviarMensagem,
  handleChatKeydown,
  initSeletorEntidade,
  toggleDitado,
} from './modules/chat.js';
// 4.E.3 — Notas: import por efeito colateral (registra o listener de
// page:change; carrega os dados quando a página abre).
import './modules/notas.js';
// 4.B.1a — Ideias: mesmo padrão (listener de page:change).
import './modules/ideias.js';
// 4.B.2b — Lançamentos do Sítio: mesmo padrão.
import './modules/sitio.js';

// Flag pra evitar dupla inicialização (REGRA 6 do CLAUDE.md).
let appInitialized = false;

// ============================================================
// AUTH — onAuthStateChange é a ÚNICA fonte de verdade (REGRA 3)
// ============================================================

supabase.auth.onAuthStateChange((event, session) => {
  console.log('[auth]', event, session ? 'com sessão' : 'sem sessão');

  if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
    if (!appInitialized) {
      appInitialized = true;
      initApp(session);
    }
  }

  if (event === 'SIGNED_OUT') {
    appInitialized = false;
    showLogin();
  }
});

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display = 'none';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'flex';
}

async function initApp(session) {
  console.log('[initApp] logado como', session.user.email);
  showApp();
  goPage('chat');
  // 4.A.2: chips de entidade (listeners internos — sem window bridge).
  initSeletorEntidade().catch((err) => {
    console.error('[initApp] initSeletorEntidade falhou', err);
  });
  carregarHistorico().catch((err) => {
    console.error('[initApp] carregarHistorico falhou', err);
  });

  // Ping de sanity da conexão — inofensivo, detecta regressão cedo.
  // 3.5.A.4: antes usava a tabela órfã `teste` (sobra da Fase 0, removida
  // na limpeza de legado). Agora usa `entidades`, que sempre existe.
  try {
    const { error } = await supabase
      .from('entidades')
      .select('id')
      .limit(1);

    if (error) {
      console.warn('[initApp] ping de conexão falhou:', error.message);
    } else {
      console.log('[initApp] conexão ok');
    }
  } catch (err) {
    console.warn('[initApp] erro:', err.message);
  }
}

async function signIn() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const loginError = document.getElementById('login-error');

  loginError.textContent = '';

  if (!email || !password) {
    loginError.textContent = 'Preencha email e senha';
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    loginError.textContent = traduzErroLogin(error);
    return;
  }

  console.log('login ok', data);
}

function traduzErroLogin(error) {
  const msg = (error && error.message) || '';
  if (msg.includes('Invalid login credentials')) {
    return 'Email ou senha incorretos';
  }
  if (msg.includes('Email not confirmed')) {
    return 'Email ainda não foi confirmado. Verifique sua caixa de entrada.';
  }
  if (msg.includes('Network request failed') || msg.toLowerCase().includes('failed to fetch')) {
    return 'Sem conexão. Verifique sua internet.';
  }
  return msg || 'Erro desconhecido ao tentar entrar.';
}

async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('[signOut]', error);
    showToast('Erro ao sair: ' + error.message, 'error');
  }
  // O onAuthStateChange captura SIGNED_OUT e chama showLogin() automaticamente.
}

// ============================================================
// NAVEGAÇÃO — sidebar/drawer (goPage vem do router.js)
// ============================================================

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  sidebar.classList.toggle('open');
  backdrop.classList.toggle('open');
}

// ============================================================
// WINDOW BRIDGE — funções chamadas por onclick no HTML (REGRA 4)
// ============================================================

// AUTH
window.signIn = signIn;
window.signOut = signOut;

// NAVEGAÇÃO
window.toggleSidebar = toggleSidebar;
window.goPage = goPage;

// FEEDBACK
window.showToast = showToast;
window.showModal = showModal;
window.closeModal = closeModal;

// UTILS (debug/console)
window.utils = utils;

// EDGE FUNCTIONS (debug/console)
// Permite testar Edge Functions direto do console:
//   await invokeFunction('health-check')
window.invokeFunction = invokeFunction;

// CHAT (3.B — chat real com persistência)
window.enviarMensagem = enviarMensagem;
window.handleChatKeydown = handleChatKeydown;
window.toggleDitado = toggleDitado; // 3.H.2 — ditado por voz
