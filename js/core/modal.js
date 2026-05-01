// Sistema de modais. Importar `show`/`close` ou usar via
// `window.showModal(config)` / `window.closeModal()`. Apenas um modal aberto por vez.
//
// config = { title?, body, actions?, dismissible? }
//   - title: string opcional (sem header se omitido)
//   - body: string — texto puro OU HTML (heurística: contém '<')
//   - actions: array de { label, type?, onClick? }; default = [{ label: 'OK', type: 'primary' }]
//     type ∈ {'primary','secondary','danger'}; onClick opcional (botão sempre fecha o modal)
//   - dismissible: boolean (default true) — Esc / clique no overlay / X fecham

const EXIT_ANIMATION_MS = 200;

let currentModal = null;

function ensureOverlay() {
  const existing = document.getElementById('modal-overlay');
  if (existing) return existing;
  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  document.body.appendChild(overlay);
  return overlay;
}

export function show(config = {}) {
  if (currentModal) close();

  const {
    title,
    body = '',
    actions = [{ label: 'OK', type: 'primary' }],
    dismissible = true,
  } = config;

  const overlay = ensureOverlay();
  overlay.innerHTML = '';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  if (dismissible) {
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'modal-close';
    closeBtn.setAttribute('aria-label', 'Fechar');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', close);
    modal.appendChild(closeBtn);
  }

  if (title) {
    const h = document.createElement('h3');
    h.className = 'modal-title';
    h.textContent = title;
    modal.appendChild(h);
  }

  const bodyEl = document.createElement('div');
  bodyEl.className = 'modal-body';
  if (typeof body === 'string' && body.includes('<')) {
    bodyEl.innerHTML = body;
  } else {
    bodyEl.textContent = body;
  }
  modal.appendChild(bodyEl);

  const actionsEl = document.createElement('div');
  actionsEl.className = 'modal-actions';
  actions.forEach((action) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-' + (action.type || 'primary');
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      if (typeof action.onClick === 'function') action.onClick();
      close();
    });
    actionsEl.appendChild(btn);
  });
  modal.appendChild(actionsEl);

  overlay.appendChild(modal);

  const overlayClickHandler = (e) => {
    if (e.target === overlay && currentModal && currentModal.dismissible) {
      close();
    }
  };
  overlay.addEventListener('click', overlayClickHandler);

  const escHandler = (e) => {
    if (e.key === 'Escape' && currentModal && currentModal.dismissible) close();
  };
  document.addEventListener('keydown', escHandler);

  document.body.classList.add('modal-open');

  currentModal = { overlay, dismissible, escHandler, overlayClickHandler };

  // Força reflow antes de aplicar a classe de entrada — garante a animação.
  // eslint-disable-next-line no-unused-expressions
  overlay.offsetHeight;
  overlay.classList.add('modal-overlay-enter');
}

export function close() {
  if (!currentModal) return;

  const { overlay, escHandler, overlayClickHandler } = currentModal;
  document.removeEventListener('keydown', escHandler);
  overlay.removeEventListener('click', overlayClickHandler);

  overlay.classList.remove('modal-overlay-enter');
  overlay.classList.add('modal-overlay-exit');

  currentModal = null;

  setTimeout(() => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.body.classList.remove('modal-open');
  }, EXIT_ANIMATION_MS);
}
