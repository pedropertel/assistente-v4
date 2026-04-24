import { supabase } from './core/supabase.js';

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

  const statusEl = document.getElementById('status');
  try {
    const { data, error } = await supabase
      .from('teste')
      .select('msg')
      .limit(1)
      .single();

    if (error) {
      statusEl.textContent = 'Erro: ' + error.message;
    } else {
      statusEl.textContent = 'Banco: ' + data.msg;
    }
  } catch (err) {
    statusEl.textContent = 'Erro: ' + err.message;
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
    alert('Erro ao sair: ' + error.message);
  }
  // O onAuthStateChange captura SIGNED_OUT e chama showLogin() automaticamente.
}

// ============================================================
// NAVEGAÇÃO — sidebar/drawer + roteamento placeholder
// ============================================================

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  sidebar.classList.toggle('open');
  backdrop.classList.toggle('open');
}

function goToPage(page) {
  // Navegação real é Tarefa 1.7 — por enquanto só feedback do clique.
  alert('Página: ' + page);
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
}

// ============================================================
// WINDOW BRIDGE — funções chamadas por onclick no HTML (REGRA 4)
// ============================================================

// AUTH
window.signIn = signIn;
window.signOut = signOut;

// NAVEGAÇÃO
window.toggleSidebar = toggleSidebar;
window.goToPage = goToPage;
