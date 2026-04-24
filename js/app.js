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
