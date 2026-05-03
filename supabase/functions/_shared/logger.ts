/**
 * Logger estruturado JSON pra Edge Functions.
 *
 * Quando usar:
 *   import { generateRequestId, logInfo, logError } from '../_shared/logger.ts';
 *
 *   const request_id = generateRequestId();
 *   logInfo('chat-claude.start', { request_id, entidade_id });
 *   try {
 *     // ...
 *     logInfo('chat-claude.done', { request_id, latencia_ms, custo_usd });
 *   } catch (err) {
 *     logError('chat-claude.fail', { request_id }, err);
 *   }
 *
 * Por que JSON estruturado (e não console.log de texto livre):
 *   - Os logs do Supabase Edge Functions são indexados — se forem JSON,
 *     dá pra fazer query por campos: filtrar por request_id, agregar
 *     custo_usd por dia, calcular latência média por persona.
 *   - Texto livre vira "tinta no chão": só serve pra ler manualmente,
 *     não dá pra montar o dashboard de observabilidade da Fase 5.
 *
 * Padrão de uso recomendado:
 *   - 1 request_id por invocação (gerado no início da Edge).
 *   - Todos os logs daquela invocação carregam o mesmo request_id no
 *     context — assim, no Dashboard você filtra por ele e vê a história
 *     completa do request em ordem.
 *
 * Campos de context úteis (convenção):
 *   - request_id        — sempre.
 *   - entidade_id       — qual empresa o user está focado.
 *   - persona_slug      — qual persona respondeu (marcos, marina, ...).
 *   - modelo            — claude-haiku-4-5-20251001, etc.
 *   - latencia_ms       — tempo end-to-end do request.
 *   - tokens_input      — pra somar custo.
 *   - tokens_output     — idem.
 *   - custo_usd         — calculado na própria Edge.
 *
 * LOG_LEVEL=debug:
 *   - Por default, logDebug() é silencioso. Configurar a env var
 *     LOG_LEVEL=debug no Supabase pra ativar logs verbosos sem mexer
 *     em código.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

type LogContext = Record<string, unknown>;

function log(
  level: LogLevel,
  message: string,
  context: LogContext = {},
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  console.log(JSON.stringify(entry));
}

export function logInfo(message: string, context?: LogContext): void {
  log('info', message, context);
}

export function logWarn(message: string, context?: LogContext): void {
  log('warn', message, context);
}

export function logError(
  message: string,
  context?: LogContext,
  error?: unknown,
): void {
  const errorContext: LogContext = { ...(context ?? {}) };
  if (error instanceof Error) {
    errorContext.error_message = error.message;
    errorContext.error_stack = error.stack;
  } else if (error !== undefined) {
    errorContext.error_value = String(error);
  }
  log('error', message, errorContext);
}

export function logDebug(message: string, context?: LogContext): void {
  if (Deno.env.get('LOG_LEVEL') !== 'debug') return;
  log('debug', message, context);
}

export function generateRequestId(): string {
  return crypto.randomUUID();
}
