import { supabase } from './core/supabase.js';

async function initApp() {
  const status = document.getElementById('status');
  const { data, error } = await supabase
    .from('teste')
    .select('msg')
    .limit(1)
    .single();
  if (error) {
    status.textContent = 'Erro: ' + error.message;
  } else {
    status.textContent = 'Banco: ' + data.msg;
  }
}

initApp();

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

// ============================================================
// WINDOW BRIDGE — funções chamadas por onclick no HTML
// ============================================================
window.signIn = signIn;
