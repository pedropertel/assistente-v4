// Router simples. Importar `goPage` em app.js.
// Cada página é uma <section class="page" id="page-X"> dentro de #page-container.
// Nav items da sidebar devem ter data-page="X" pra receberem .active.

export const PAGES = {
  dashboard: { title: 'Dashboard',     icon: '🏠' },
  chat:      { title: 'Chat',          icon: '💬' },
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
}

export function getCurrentPage() {
  return currentPage;
}
