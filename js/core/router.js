// Router simples. Importar `goPage` em app.js.
// Cada página é uma <section class="page" id="page-X"> dentro de #page-container.
// Nav items da sidebar devem ter data-page="X" pra receberem .active.

export const PAGES = {
  dashboard: { title: 'Dashboard',     icon: '🏠' },
  chat:      { title: 'Chat',          icon: '💬' },
  notas:     { title: 'Notas',         icon: '📝' },
  tasks:     { title: 'Tarefas',       icon: '✓'  },
  agenda:    { title: 'Agenda',        icon: '📅' },
  docs:      { title: 'Documentos',    icon: '📁' },
  cedtec:    { title: 'CEDTEC',        icon: '🎓' },
  sitio:     { title: 'Sítio',         icon: '🌱' },
  config:    { title: 'Configurações', icon: '⚙️' },
};

let currentPage = 'chat';

export function goPage(pageId) {
  if (!PAGES[pageId]) {
    console.warn('[router] página desconhecida:', pageId);
    return;
  }

  // Mostra a alvo, esconde as demais
  document.querySelectorAll('.page').forEach((el) => {
    el.hidden = el.id !== 'page-' + pageId;
  });

  // Header title
  document.getElementById('page-title').textContent = PAGES[pageId].title;

  // Sidebar active state
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.page === pageId);
  });

  // Fecha drawer em mobile
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');

  currentPage = pageId;

  // 4.E.3 — evento genérico de navegação: cada módulo escuta e recarrega
  // os próprios dados quando a SUA página abre (ex: notas.js). Evita o
  // app.js ter que conhecer o init de cada módulo da Fase 4.
  document.dispatchEvent(new CustomEvent('page:change', { detail: pageId }));
}

export function getCurrentPage() {
  return currentPage;
}
