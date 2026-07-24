// Cliente Supabase — INSTÂNCIA ÚNICA do projeto (REGRA 5 do CLAUDE.md).
// Outros módulos DEVEM importar `supabase` daqui — nunca chamar createClient
// em outro lugar, pra evitar múltiplos clientes (e múltiplos onAuthStateChange).

const SUPABASE_URL = 'https://msbwplsknncnxwsalumd.supabase.co';

// Anon JWT clássica (sistema legacy do Supabase). Compatível
// com Edge Functions Gateway (sb_publishable_* não funciona
// como Bearer token nele). Pública por design — vai pro bundle
// JS, RLS protege os dados. Rotação: gerar nova via Dashboard
// → Settings → API → JWT Settings → Generate new JWT secret.
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zYndwbHNrbm5jbnh3c2FsdW1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NTUzMTAsImV4cCI6MjA4OTQzMTMxMH0.qDSAYC8KQO_PQsdRrwsIdYWdkrwqO2riFiDjJ08zctI';

const supabaseJs = window.supabase;

export const supabase = supabaseJs.createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * invokeFunction — chama uma Edge Function do Supabase via supabase-js.
 *
 * Quando usar:
 *   Toda chamada do front pra qualquer Edge Function da Fase 3 em diante
 *   (health-check, chat-claude, meta-sync, etc). Não usar fetch direto —
 *   o supabase-js já injeta o header Authorization com a anon JWT
 *   automaticamente, mantém base URL única e padroniza o tratamento de
 *   erro entre todas as chamadas.
 *
 * Parâmetros:
 *   - name: slug da função (ex: 'health-check', 'chat-claude').
 *   - payload: objeto que vira o JSON body do POST. Default {}.
 *
 * Contrato de retorno:
 *   Sempre devolve { data, error } — NUNCA joga exception. O caller
 *   decide o que fazer com o erro.
 *
 *   - Sucesso: { data: <body parseado>, error: null }
 *   - Erro:    { data: null, error: { message, status?, code? } }
 *
 * Padrão de uso:
 *   const { data, error } = await invokeFunction('health-check');
 *   if (error) {
 *     showToast(`Erro: ${error.message}`, 'error');
 *     return;
 *   }
 *   // ... usa data ...
 *
 * Logging:
 *   Em caso de erro, loga no console nome da função + mensagem + status.
 *   NUNCA loga payload — pode conter dados sensíveis (chat, credenciais,
 *   tokens) em chamadas futuras.
 */
export async function invokeFunction(name, payload) {
  const body = payload === undefined ? {} : payload;
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    const status = (error.context && error.context.status) || error.status;
    const code = error.code;
    const message = error.message || 'Erro desconhecido ao chamar Edge Function';
    console.error(`[invokeFunction] ${name} falhou:`, { message, status, code });
    return { data: null, error: { message, status, code } };
  }

  return { data, error: null };
}

/**
 * invokeFunctionStream — chama uma Edge Function em modo SSE (3.E.2).
 *
 * Por que fetch direto (e não supabase.functions.invoke):
 *   - EventSource não faz POST; functions.invoke não expõe o body
 *     como stream. fetch + ReadableStream é o único caminho pra SSE
 *     com POST no browser (Safari iOS 14.5+ suporta).
 *   - Auth (SEC-1): Bearer é SEMPRE o session token do user logado —
 *     sem fallback pra anon key (a Edge rejeita anon com 401). Sem
 *     session → erro local, nem faz o request.
 *
 * Parâmetros:
 *   - name: slug da função (ex: 'chat-claude').
 *   - payload: JSON body do POST (o caller inclui stream: true).
 *   - handlers: { [nomeDoEvento]: (dados) => void } — chamado por
 *     evento SSE recebido (router, delta, tool, done, error).
 *
 * Contrato de retorno (mesmo espírito do invokeFunction):
 *   - Stream consumido até o fim: { error: null }. Eventos (inclusive
 *     `error` emitido pela Edge DEPOIS do stream abrir) chegam SÓ
 *     pelos handlers — o caller decide como reagir.
 *   - Falha ANTES do stream abrir (HTTP != 2xx, corpo JSON de erro,
 *     rede fora): { error: { message, status? } }, nenhum handler roda.
 */
export async function invokeFunctionStream(name, payload, handlers = {}) {
  // D2 (revisão 2026-07-07): timeout/abort. Sem isso, uma Edge pendurada
  // (ou rede que morre no meio) travava o chat até recarregar a página.
  // O timer reinicia a cada chunk recebido — só dispara em silêncio real
  // de STREAM_TIMEOUT_MS (não corta respostas longas que estão fluindo).
  const STREAM_TIMEOUT_MS = 45_000;
  const ctrl = new AbortController();
  let timer = setTimeout(() => ctrl.abort(), STREAM_TIMEOUT_MS);
  const resetTimeout = () => {
    clearTimeout(timer);
    timer = setTimeout(() => ctrl.abort(), STREAM_TIMEOUT_MS);
  };

  let resp;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    // SEC-1: sem session não tem o que mandar — a anon key seria 401
    // na Edge de qualquer jeito. Erro local, sem gastar request.
    const token = sessionData?.session?.access_token;
    if (!token) {
      clearTimeout(timer);
      return { error: { message: 'Sessão expirada — entra de novo.' } };
    }

    resp = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload === undefined ? {} : payload),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const abortou = err && err.name === 'AbortError';
    console.error(`[invokeFunctionStream] ${name} falhou na rede:`, err);
    return {
      error: {
        message: abortou
          ? 'O servidor demorou demais pra responder. Tenta de novo.'
          : 'Sem conexão com o servidor.',
      },
    };
  }

  const contentType = resp.headers.get('Content-Type') || '';
  if (!resp.ok || !contentType.includes('text/event-stream')) {
    clearTimeout(timer);
    // Erro pré-stream — a Edge responde JSON normal nesses casos.
    let error = { message: `Erro HTTP ${resp.status}`, status: resp.status };
    try {
      const j = await resp.json();
      if (j && j.message) error = { message: j.message, status: resp.status, code: j.error };
    } catch { /* corpo não-JSON — mantém erro genérico */ }
    console.error(`[invokeFunctionStream] ${name} falhou:`, error);
    return { error };
  }

  // Parser SSE mínimo: eventos separados por \n\n, linhas event:/data:.
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetTimeout(); // D2: chegou dado → reinicia o relógio de silêncio
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const bloco = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        let evento = 'message';
        let dataStr = '';
        for (const linha of bloco.split('\n')) {
          if (linha.startsWith('event: ')) evento = linha.slice(7).trim();
          else if (linha.startsWith('data: ')) dataStr += linha.slice(6);
        }
        if (!dataStr) continue;

        try {
          const dados = JSON.parse(dataStr);
          if (typeof handlers[evento] === 'function') handlers[evento](dados);
        } catch (err) {
          // Handler quebrou ou JSON veio sujo — loga e segue o stream.
          console.error(`[invokeFunctionStream] evento ${evento} falhou:`, err);
        }
      }
    }
  } catch (err) {
    clearTimeout(timer);
    const abortou = err && err.name === 'AbortError';
    console.error(`[invokeFunctionStream] ${name} stream interrompido:`, err);
    // Stream já abriu (HTTP 200), então sinaliza via evento error pro caller,
    // que já sabe lidar (mostra toast, marca bolha). Também retorna error.
    const e = {
      message: abortou
        ? 'A resposta travou no meio. Tenta de novo.'
        : 'Conexão interrompida no meio da resposta.',
    };
    if (typeof handlers.error === 'function') handlers.error(e);
    return { error: e };
  }
  clearTimeout(timer);

  return { error: null };
}
