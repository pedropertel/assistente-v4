// Helpers comuns. Importar funções avulsas:
//   import { fmtDate, fmtMoney, fmtRelative, debounce, slugify } from './core/utils.js';
//
// Também exposto no window via app.js como `window.utils` pra debug no console.

// Parse defensivo de data: aceita Date, string ISO completa ou date-only "YYYY-MM-DD".
// Date-only é interpretado como local (não UTC) pra não escorregar de dia em Brasília.
function parseDate(input) {
  if (input == null || input === '') return null;
  if (input instanceof Date) return isNaN(input) ? null : input;
  if (typeof input === 'string') {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(input);
    const d = new Date(dateOnly ? input + 'T00:00:00' : input);
    return isNaN(d) ? null : d;
  }
  return null;
}

export function fmtDate(input, options = {}) {
  const d = parseDate(input);
  if (!d) return '';

  const { includeTime = false } = options;

  const datePart = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);

  if (!includeTime) return datePart;

  const timePart = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);

  return datePart + ' ' + timePart;
}

export function fmtMoney(cents, options = {}) {
  const { showSymbol = true, showSign = false } = options;

  const value = (cents == null || Number.isNaN(cents)) ? 0 : Number(cents) / 100;

  const formatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  let formatted = formatter.format(Math.abs(value));
  if (!showSymbol) {
    formatted = formatted.replace(/^R\$\s?/, '');
  }

  let prefix = '';
  if (value < 0) {
    prefix = '-';
  } else if (showSign && value > 0) {
    prefix = '+';
  }

  return prefix + formatted;
}

export function fmtRelative(input) {
  const d = parseDate(input);
  if (!d) return '';

  const diffMs = Date.now() - d.getTime();
  const isPast = diffMs >= 0;
  const abs = Math.abs(diffMs);

  const SEC = 1000;
  const MIN = 60 * SEC;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  if (abs < MIN) return 'agora mesmo';

  const prefix = isPast ? 'há ' : 'em ';

  if (abs < HOUR) {
    const n = Math.floor(abs / MIN);
    return prefix + n + (n === 1 ? ' minuto' : ' minutos');
  }

  if (abs < DAY) {
    const n = Math.floor(abs / HOUR);
    return prefix + n + (n === 1 ? ' hora' : ' horas');
  }

  if (abs < 2 * DAY) {
    return isPast ? 'ontem' : 'amanhã';
  }

  if (abs < 7 * DAY) {
    const n = Math.floor(abs / DAY);
    return prefix + n + ' dias';
  }

  return fmtDate(d);
}

export function debounce(fn, delay = 300) {
  let timerId = null;
  return function debounced(...args) {
    if (timerId !== null) clearTimeout(timerId);
    timerId = setTimeout(() => {
      timerId = null;
      fn.apply(this, args);
    }, delay);
  };
}

export function slugify(str) {
  if (str == null) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // remove diacríticos (range Unicode dos acentos combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')       // não-alfanuméricos viram hífen
    .replace(/^-+|-+$/g, '');          // tira hífens nas bordas
}
