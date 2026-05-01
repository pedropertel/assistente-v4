// Sistema de toasts. Importar `show` ou usar via `window.showToast(msg, type, duration)`.
// Tipos: success, error, info, warning. Duração padrão 3s. Máximo 3 toasts visíveis.

const MAX_TOASTS = 3;
const DEFAULT_DURATION = 3000;
const EXIT_ANIMATION_MS = 300;

let container = null;

function ensureContainer() {
  if (container && document.body.contains(container)) {
    return container;
  }
  const existing = document.getElementById('toast-container');
  if (existing) {
    container = existing;
    return container;
  }
  container = document.createElement('div');
  container.id = 'toast-container';
  document.body.appendChild(container);
  return container;
}

export function show(msg, type = 'info', duration = DEFAULT_DURATION) {
  const root = ensureContainer();

  // Respeita o limite de toasts simultâneos: remove o mais antigo na fila.
  while (root.children.length >= MAX_TOASTS) {
    root.removeChild(root.firstElementChild);
  }

  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = msg;
  root.appendChild(toast);

  // Força reflow antes de aplicar a classe de entrada — garante a animação.
  // eslint-disable-next-line no-unused-expressions
  toast.offsetHeight;
  toast.classList.add('toast-enter');

  setTimeout(() => {
    toast.classList.remove('toast-enter');
    toast.classList.add('toast-exit');
    setTimeout(() => {
      if (toast.parentNode === root) {
        root.removeChild(toast);
      }
    }, EXIT_ANIMATION_MS);
  }, duration);
}
