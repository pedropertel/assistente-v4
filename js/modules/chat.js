import { invokeFunction } from '../core/supabase.js';
import { show as showToast } from '../core/toast.js';
import { fmtDate } from '../core/utils.js';

/**
 * pingIA — chama a Edge Function health-check e exibe resultado.
 *
 * Tarefa 3.A.3 (UI temporária). Vai ser substituída na 3.B.3
 * pela UI real de chat.
 *
 * Comportamento:
 *   1. Desabilita botão durante request (evita double-click)
 *   2. Exibe spinner/texto "pingando..."
 *   3. Chama invokeFunction('health-check')
 *   4. Em sucesso: showToast verde + render do payload
 *   5. Em erro: showToast vermelho + mensagem de erro
 *   6. Reabilita botão
 */
export async function pingIA() {
  const btn = document.getElementById('btn-ping-ia');
  const status = document.getElementById('ping-status');

  if (!btn || !status) {
    console.error('[pingIA] elementos da UI não encontrados');
    return;
  }

  btn.disabled = true;
  const labelOriginal = btn.textContent;
  btn.textContent = '⏳ pingando...';
  status.innerHTML = '';

  try {
    const { data, error } = await invokeFunction('health-check');

    if (error) {
      showToast(`Erro: ${error.message}`, 'error');
      status.innerHTML = `
        <div class="ping-result ping-error">
          <strong>❌ Falha</strong>
          ${escapeHtml(error.message)}
          ${error.status ? `<br><small>Status: ${error.status}</small>` : ''}
          ${error.code ? `<br><small>Code: ${escapeHtml(error.code)}</small>` : ''}
        </div>
      `;
      return;
    }

    if (data && data.env_ok === true) {
      showToast('Edge OK + secrets OK', 'success');
    } else {
      showToast('Edge OK, mas alguma secret está faltando', 'warning');
    }

    const envCheckRows = Object.entries(data.env_check || {})
      .map(([key, val]) => `
        <tr>
          <td>${escapeHtml(key)}</td>
          <td>${val ? '✅' : '❌'}</td>
        </tr>
      `).join('');

    const requestIdShort = (data.request_id || '').slice(0, 8);
    const tsFormatted = data.timestamp
      ? fmtDate(data.timestamp, { includeTime: true })
      : '(sem timestamp)';

    status.innerHTML = `
      <div class="ping-result ping-success">
        <strong>${data.env_ok ? '✅ Tudo verde' : '⚠️ Parcial'}</strong>
        <table class="ping-env-table">
          <thead>
            <tr><th>Variável</th><th>OK?</th></tr>
          </thead>
          <tbody>${envCheckRows}</tbody>
        </table>
        <small>
          ${tsFormatted} · request_id: ${escapeHtml(requestIdShort)}…
        </small>
      </div>
    `;
  } catch (err) {
    // Defesa de última instância. invokeFunction não joga
    // exception em uso normal, mas se algo bem ruim acontecer
    // (network falhou antes da lib pegar, etc), capturamos aqui.
    console.error('[pingIA] exception inesperada:', err);
    showToast('Erro inesperado. Vê o console.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = labelOriginal;
  }
}

/**
 * escapeHtml — escapa string pra inserção segura em innerHTML.
 * Pequena defesa contra XSS caso a Edge devolva conteúdo
 * inesperado. Em produção real, melhor usar textContent ou
 * libs específicas. Pra esta UI temporária e single-user,
 * suficiente.
 */
function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
