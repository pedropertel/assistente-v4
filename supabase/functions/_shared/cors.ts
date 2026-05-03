/**
 * CORS — headers e preflight pra Edge Functions.
 *
 * Quando usar:
 *   import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
 *
 *   Deno.serve(async (req) => {
 *     const preflight = handleCorsPreflightRequest(req);
 *     if (preflight) return preflight;
 *
 *     // ... lógica da função ...
 *
 *     return new Response(JSON.stringify(payload), {
 *       headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
 *     });
 *   });
 *
 * Por que allowlist explícita (não wildcard '*'):
 *   - Edge Functions são chamadas com Authorization header (JWT do user).
 *     Browsers se recusam a mandar credenciais quando o servidor responde
 *     Access-Control-Allow-Origin: '*'. Allowlist é obrigatória, não
 *     opcional.
 *   - Limita superfície de ataque: só os domínios do projeto chamam.
 *
 * Por que retornar string vazia (e não '*') pra origens não permitidas:
 *   - Header vazio faz o browser BLOQUEAR a resposta (CORS error visível
 *     no DevTools), o que é o comportamento desejado.
 *   - Retornar '*' como fallback abriria a Edge pra qualquer domínio.
 *
 * Como adicionar nova origem:
 *   - Domínio fixo: adiciona em ALLOWED_ORIGINS_EXACT.
 *   - Padrão dinâmico (ex: novos previews de outro projeto Vercel,
 *     ou alias de domínio customizado): adiciona regex em
 *     ALLOWED_ORIGINS_REGEX.
 */

const ALLOWED_ORIGINS_EXACT: ReadonlySet<string> = new Set([
  'https://assistente-v4.vercel.app',
  'https://assistente-v4-git-dev-pedropertels-projects.vercel.app',
  'http://localhost:5500',
  'http://localhost:3000',
]);

const ALLOWED_ORIGINS_REGEX: ReadonlyArray<RegExp> = [
  /^https:\/\/assistente-v4-[a-z0-9-]+\.vercel\.app$/,
];

function isOriginAllowed(origin: string): boolean {
  if (ALLOWED_ORIGINS_EXACT.has(origin)) return true;
  return ALLOWED_ORIGINS_REGEX.some((rx) => rx.test(origin));
}

export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowOrigin = isOriginAllowed(origin) ? origin : '';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function handleCorsPreflightRequest(
  request: Request,
): Response | null {
  if (request.method !== 'OPTIONS') return null;
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}
