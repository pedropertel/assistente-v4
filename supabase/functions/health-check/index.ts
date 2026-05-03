/**
 * health-check — smoke test de infraestrutura.
 *
 * Propósito:
 *   Validar end-to-end que a Edge Function tá no ar, com env vars
 *   acessíveis e CORS funcionando. SEM lógica de negócio. SEM chamada
 *   Anthropic. Custo zero por invocação.
 *
 * Quando chamar:
 *   - Após deploy: curl manual pra confirmar que subiu certo.
 *   - Debug: quando algo na Fase 3 começar a falhar, primeiro confirma
 *     que a infra continua em pé batendo aqui.
 *   - CI/monitoring futuro: ping periódico pra alertar se a Edge cair.
 *
 * Retorno:
 *   200 + { ok, env_ok, env_check, timestamp, request_id }
 *   - ok          → função respondeu (sempre true se chega no return).
 *   - env_ok      → todas as env vars críticas estão presentes.
 *   - env_check   → mapa booleano por var (qual está faltando, se for
 *                   o caso). Não expõe valores.
 *   - timestamp   → ISO UTC.
 *   - request_id  → UUID v4 pra cruzar com logs.
 *
 *   500 + { ok: false, error: 'internal' } se algo explodir antes do
 *   payload sair. Detalhes no log estruturado (não no body).
 */

import {
  getCorsHeaders,
  handleCorsPreflightRequest,
} from '../_shared/cors.ts';
import {
  generateRequestId,
  logError,
  logInfo,
} from '../_shared/logger.ts';

Deno.serve((req: Request): Response => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const request_id = generateRequestId();

  try {
    logInfo('health-check.start', { request_id });

    const env_check = {
      SUPABASE_URL: !!Deno.env.get('SUPABASE_URL'),
      SUPABASE_SERVICE_ROLE_KEY: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      ANTHROPIC_API_KEY: !!Deno.env.get('ANTHROPIC_API_KEY'),
    };
    const env_ok = Object.values(env_check).every(Boolean);

    const payload = {
      ok: true,
      env_ok,
      env_check,
      timestamp: new Date().toISOString(),
      request_id,
    };

    logInfo('health-check.done', { request_id, env_ok });

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        ...getCorsHeaders(req),
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    logError('health-check.fail', { request_id }, err);
    return new Response(
      JSON.stringify({ ok: false, error: 'internal' }),
      {
        status: 500,
        headers: {
          ...getCorsHeaders(req),
          'Content-Type': 'application/json',
        },
      },
    );
  }
});
