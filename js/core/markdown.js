/**
 * markdown — parser mínimo de Markdown pra HTML seguro (4.A.1).
 *
 * Por que parser próprio: stack sem bundler (CLAUDE.md) e o subset que
 * a IA realmente usa é pequeno — negrito, itálico, código, listas,
 * títulos e quebras. Biblioteca externa seria dependência nova pra isso.
 *
 * SEGURANÇA (leia antes de mexer): o texto é 100% escapado ANTES de
 * qualquer transformação — `<`, `>`, `&` e aspas viram entidades. As
 * únicas tags no output são as GERADAS AQUI (strong/em/code/pre/ul/ol/
 * li/br). Conteúdo do modelo ou do banco nunca vira HTML executável.
 * NUNCA adicionar transformação que preserve HTML do input (ex: links
 * com href do conteúdo exigiriam sanitização de protocolo — fora do
 * escopo da 4.A.1).
 *
 * Suporte:
 *   **negrito**  *itálico*  `código inline`  ```bloco de código```
 *   - listas (- ou *)   1. listas numeradas   ## títulos (viram negrito)
 *   Quebras: \n vira <br>; linha em branco separa blocos.
 *
 * Uso: container.innerHTML = mdParaHtml(texto)
 * (seguro pelo escape acima; o container deve ter white-space: normal —
 * classe .chat-md — porque .chat-bubble usa pre-wrap).
 */

function escapeHtml(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Transformações inline (texto já escapado). Ordem importa: código
 *  primeiro (protege o miolo de virar negrito/itálico). */
function inline(s) {
  // `código` — miolo sem crase
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // **negrito** — não-guloso, sem atravessar linha
  s = s.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>');
  // *itálico* — exige não-espaço nas bordas pra não pegar "2 * 3 * 4"
  s = s.replace(/\*([^\s*][^\n*]*?[^\s*]|\S)\*/g, '<em>$1</em>');
  return s;
}

/** Converte um trecho SEM fences de código pra HTML. */
function blocos(texto) {
  const linhas = texto.split('\n');
  const out = [];
  let lista = null; // 'ul' | 'ol' | null

  const fecharLista = () => {
    if (lista) {
      out.push(`</${lista}>`);
      lista = null;
    }
  };

  for (const linha of linhas) {
    const mUl = linha.match(/^\s*[-*]\s+(.*)$/);
    const mOl = linha.match(/^\s*\d+[.)]\s+(.*)$/);
    const mTitulo = linha.match(/^#{1,6}\s+(.*)$/);

    if (mUl) {
      if (lista !== 'ul') {
        fecharLista();
        out.push('<ul>');
        lista = 'ul';
      }
      out.push(`<li>${inline(mUl[1])}</li>`);
    } else if (mOl) {
      if (lista !== 'ol') {
        fecharLista();
        out.push('<ol>');
        lista = 'ol';
      }
      out.push(`<li>${inline(mOl[1])}</li>`);
    } else if (mTitulo) {
      // Título vira linha em negrito — hierarquia h1-h6 não faz sentido
      // dentro de bolha de chat.
      fecharLista();
      out.push(`<strong>${inline(mTitulo[1])}</strong><br>`);
    } else if (linha.trim() === '') {
      fecharLista();
      // Linha em branco = respiro entre blocos (um <br> só; o bloco
      // seguinte já começa em linha nova).
      out.push('<br>');
    } else {
      fecharLista();
      out.push(`${inline(linha)}<br>`);
    }
  }
  fecharLista();

  // Remove <br> final sobrando (a bolha já tem padding).
  let html = out.join('');
  while (html.endsWith('<br>')) html = html.slice(0, -4);
  return html;
}

/**
 * mdParaHtml — Markdown → HTML seguro (string pra innerHTML).
 */
export function mdParaHtml(md) {
  const escapado = escapeHtml(String(md ?? ''));

  // Fences ``` alternam texto/código. Split preserva os miolos ímpares
  // como código literal (sem transformações inline).
  const partes = escapado.split(/```(?:\w*\n)?/);
  const out = [];
  for (let i = 0; i < partes.length; i++) {
    if (i % 2 === 1) {
      out.push(`<pre><code>${partes[i].replace(/\n$/, '')}</code></pre>`);
    } else {
      out.push(blocos(partes[i]));
    }
  }
  return out.join('');
}
