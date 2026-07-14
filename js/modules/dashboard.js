// Módulo Dashboard (4.C.5) — visão geral em 5 segundos.
//
// Planejado com 3 agentes (produto/UX/dados — plano no Dev Log da 4.C.5).
// Antessala, não tela rica: leitura + navegação, ZERO edição. Cada bloco
// responde uma pergunta e toca pra tela dona do dado:
//   ⚠️ Faixa de Atenção (condicional) → o que JÁ estourou
//   📅 Hoje → o que me atropela hoje (agenda)
//   ✓ Tarefas (pulso) → 3 contadores, sem lista (lista crua matou a agenda v1)
//   💰 Dinheiro → contas 7 dias + saldo do sítio no mês
//   💡 Ideias / 🤖 IA este mês → memória e operação (commit b)
//
// Dados: 6 queries via Promise.allSettled — bloco com erro mostra
// fallback e NÃO derruba os outros. Fuso: todo "hoje" via Intl com
// America/Sao_Paulo (nunca toISOString/getMonth do device); boundaries
// timestamptz com -03:00 explícito; data_lancamento (DATE) comparado
// como string. kpiCard/tendencia duplicados do sitio.js de propósito
// (REGRA 3 — módulos são ilhas; promover pra core = refatoração não pedida).

import { supabase } from '../core/supabase.js';
import { goPage } from '../core/router.js';
import { fmtMoney } from '../core/utils.js';

const TZ = 'America/Sao_Paulo';

document.addEventListener('page:change', (ev) => {
  if (ev.detail !== 'dashboard') return;
  carregarDashboard().catch((err) => {
    console.error('[dashboard] erro ao carregar', err);
  });
});

// ──────────── Helpers de fuso (padrão agenda.js/sitio.js) ────────────

function hojeYmd() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

function ymdLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diaBrasilia(timestamp) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ })
    .format(new Date(timestamp));
}

function horaBrasilia(timestamp) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

/** 'sex, 18/07' compacto pra faixa e próximos. */
function diaCurto(ymd) {
  const d = new Date(`${ymd}T12:00:00-03:00`);
  return d.toLocaleDateString('pt-BR', {
    timeZone: TZ,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).replace(/\./g, '');
}

// ──────────── KPI (duplicado do sitio.js — módulo é ilha) ────────────

function kpiCard(titulo, texto, classeValor) {
  const card = document.createElement('div');
  card.className = 'kpi-card';

  const label = document.createElement('small');
  label.className = 'kpi-label';
  label.textContent = titulo;

  const valor = document.createElement('strong');
  valor.className = 'kpi-valor' + (classeValor ? ` ${classeValor}` : '');
  valor.textContent = texto;

  card.appendChild(label);
  card.appendChild(valor);
  return card;
}

function tendencia(atual, anterior, inverso) {
  if (anterior === null || anterior === 0) return null;
  const pct = ((atual - anterior) / Math.abs(anterior)) * 100;
  if (!Number.isFinite(pct)) return null;
  const subiu = pct >= 0;
  return {
    texto: `${subiu ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}% vs mês anterior`,
    boa: inverso ? !subiu : subiu,
  };
}

// ──────────── Carga ────────────

export async function carregarDashboard() {
  const raiz = document.getElementById('dash-conteudo');
  if (!raiz) return;

  const hoje = hojeYmd();
  const [a, m, d] = hoje.split('-').map(Number);
  const limite7 = ymdLocal(new Date(a, m - 1, d + 7));
  const iniMesAnterior = ymdLocal(new Date(a, m - 2, 1));

  const [rEventos, rTarefas, rLanc, rIdeias, rCusto] = await Promise.allSettled([
    supabase.from('eventos')
      .select('id, titulo, tipo, inicio, fim, dia_inteiro, entidades(nome, icone)')
      .eq('arquivado', false)
      .gte('inicio', `${hoje}T00:00:00-03:00`)
      .order('inicio')
      .limit(20),
    supabase.from('tarefas')
      .select('titulo, status, prioridade, prazo')
      .eq('arquivada', false),
    supabase.from('sitio_lancamentos')
      .select('tipo, valor_centavos, data_lancamento, status, descricao')
      .eq('arquivado', false),
    supabase.from('ideias')
      .select('id, titulo, created_at')
      .neq('status', 'arquivada')
      .order('created_at', { ascending: false })
      .limit(3),
    supabase.from('chat_mensagens')
      .select('custo_brl, created_at')
      .gte('created_at', `${iniMesAnterior}T00:00:00-03:00`)
      .not('custo_brl', 'is', null),
  ]);

  const dados = (r) => (r.status === 'fulfilled' && !r.value.error)
    ? (r.value.data ?? [])
    : null; // null = query falhou → bloco mostra fallback

  const eventos = dados(rEventos);
  const tarefas = dados(rTarefas);
  const lancamentos = dados(rLanc);
  const ideias = dados(rIdeias);
  const custos = dados(rCusto);

  raiz.innerHTML = '';

  // Primeiro uso absoluto: tudo vazio → um único empty apontando pro chat.
  const tudoVazio = [eventos, tarefas, lancamentos, ideias, custos]
    .every((lista) => Array.isArray(lista) && lista.length === 0);
  if (tudoVazio) {
    const vazio = document.createElement('div');
    vazio.className = 'notas-vazio';
    vazio.textContent = 'Tudo quieto por aqui. Começa uma conversa no ' +
      'Chat — o resto do sistema nasce dela.';
    raiz.appendChild(vazio);
    return;
  }

  const faixa = blocoAtencao(tarefas, lancamentos, hoje);
  if (faixa) raiz.appendChild(faixa);

  // Duas colunas no desktop (esquerda: agora; direita: números) —
  // no mobile os wrappers empilham na ordem natural.
  const colEsq = document.createElement('div');
  colEsq.className = 'dash-col';
  const colDir = document.createElement('div');
  colDir.className = 'dash-col';

  colEsq.appendChild(blocoHoje(eventos, hoje));
  colDir.appendChild(blocoTarefas(tarefas));
  colDir.appendChild(blocoDinheiro(lancamentos, hoje, limite7));
  colEsq.appendChild(blocoIdeias(ideias));
  colDir.appendChild(blocoCustoIA(custos, hoje));

  raiz.appendChild(colEsq);
  raiz.appendChild(colDir);
}

// ──────────── ⚠️ Faixa de Atenção (condicional) ────────────

function blocoAtencao(tarefas, lancamentos, hoje) {
  if (!tarefas && !lancamentos) return null;
  const agora = new Date();

  const tarefasVencidas = (tarefas ?? []).filter((t) =>
    t.status !== 'feito' && t.prazo && new Date(t.prazo) < agora);
  const contasVencidas = (lancamentos ?? []).filter((l) =>
    l.status === 'previsto' && l.data_lancamento < hoje);

  if (!tarefasVencidas.length && !contasVencidas.length) return null;

  const faixa = document.createElement('button');
  faixa.type = 'button';
  faixa.className = 'dash-atencao';

  const partes = [];
  if (contasVencidas.length) {
    partes.push(`${contasVencidas.length} conta${contasVencidas.length > 1 ? 's' : ''} vencida${contasVencidas.length > 1 ? 's' : ''}`);
  }
  if (tarefasVencidas.length) {
    partes.push(`${tarefasVencidas.length} tarefa${tarefasVencidas.length > 1 ? 's' : ''} atrasada${tarefasVencidas.length > 1 ? 's' : ''}`);
  }
  const titulo = document.createElement('strong');
  titulo.textContent = '⚠️ ' + partes.join(' · ');
  faixa.appendChild(titulo);

  // Item mais grave por extenso: conta de maior valor > tarefa mais antiga.
  const detalhe = document.createElement('small');
  let destino = 'sitio';
  if (contasVencidas.length) {
    const pior = contasVencidas
      .reduce((max, l) => Number(l.valor_centavos) > Number(max.valor_centavos) ? l : max);
    detalhe.textContent = `${pior.descricao} · ${fmtMoney(pior.valor_centavos)} · venceu ${diaCurto(pior.data_lancamento)}`;
  } else {
    const pior = tarefasVencidas
      .reduce((min, t) => new Date(t.prazo) < new Date(min.prazo) ? t : min);
    detalhe.textContent = `${pior.titulo} · venceu ${diaCurto(diaBrasilia(pior.prazo))}`;
    destino = 'tasks';
  }
  faixa.appendChild(detalhe);

  faixa.addEventListener('click', () => goPage(destino));
  return faixa;
}

// ──────────── 📅 Hoje ────────────

function blocoHoje(eventos, hoje) {
  const bloco = document.createElement('section');
  bloco.className = 'sitio-bloco';

  const h = document.createElement('h2');
  h.className = 'sitio-bloco-titulo';
  const dHoje = new Date(`${hoje}T12:00:00-03:00`);
  h.textContent = 'Hoje · ' + dHoje.toLocaleDateString('pt-BR', {
    timeZone: TZ,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).replace(/\./g, '');
  bloco.appendChild(h);

  if (!eventos) return blocoErro(bloco, 'agenda');

  const agora = new Date();
  const deHoje = eventos.filter((e) =>
    diaBrasilia(e.inicio) === hoje && new Date(e.fim) >= agora);
  const futuros = eventos.filter((e) => diaBrasilia(e.inicio) > hoje);

  if (!deHoje.length) {
    const vazio = document.createElement('p');
    vazio.className = 'sitio-bloco-vazio';
    vazio.textContent = 'Nada agendado pra hoje.';
    bloco.appendChild(vazio);
  } else {
    for (const ev of deHoje.slice(0, 3)) {
      bloco.appendChild(cardEventoCompacto(ev, false));
    }
    if (deHoje.length > 3) {
      bloco.appendChild(linhaMais(`+${deHoje.length - 3} eventos hoje`, 'agenda'));
    }
  }

  if (futuros.length) {
    const sub = document.createElement('small');
    sub.className = 'kpi-label';
    sub.textContent = 'Próximos';
    bloco.appendChild(sub);
    for (const ev of futuros.slice(0, 2)) {
      bloco.appendChild(cardEventoCompacto(ev, true));
    }
  }

  return bloco;
}

function cardEventoCompacto(ev, comData) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'nota-card agenda-card dash-evento';

  const inner = document.createElement('span');
  inner.className = 'nota-card-header agenda-card-header';

  const hora = document.createElement('span');
  hora.className = 'agenda-hora';
  if (comData) {
    const dataEl = document.createElement('span');
    dataEl.className = 'agenda-hora-data';
    dataEl.textContent = diaCurto(diaBrasilia(ev.inicio));
    hora.appendChild(dataEl);
  }
  hora.appendChild(document.createTextNode(
    ev.dia_inteiro ? 'dia inteiro' : horaBrasilia(ev.inicio),
  ));

  const corpo = document.createElement('span');
  corpo.className = 'agenda-card-corpo';
  const titulo = document.createElement('span');
  titulo.className = 'nota-titulo dash-truncar';
  titulo.textContent = ev.titulo;
  const meta = document.createElement('small');
  meta.className = 'nota-meta';
  meta.textContent = ev.entidades
    ? `${ev.entidades.icone ?? ''} ${ev.entidades.nome}`.trim()
    : '';
  corpo.appendChild(titulo);
  if (meta.textContent) corpo.appendChild(meta);

  inner.appendChild(hora);
  inner.appendChild(corpo);
  card.appendChild(inner);
  card.addEventListener('click', () => goPage('agenda'));
  return card;
}

function linhaMais(texto, pagina) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dash-mais';
  btn.textContent = texto + ' →';
  btn.addEventListener('click', () => goPage(pagina));
  return btn;
}

function blocoErro(bloco, nomeDado) {
  const p = document.createElement('p');
  p.className = 'sitio-bloco-vazio';
  p.textContent = `Não consegui carregar (${nomeDado}). Puxa pra recarregar.`;
  bloco.appendChild(p);
  return bloco;
}

// ──────────── ✓ Tarefas (pulso) ────────────

function blocoTarefas(tarefas) {
  const bloco = document.createElement('section');
  bloco.className = 'sitio-bloco';

  const h = document.createElement('h2');
  h.className = 'sitio-bloco-titulo';
  h.textContent = 'Tarefas';
  bloco.appendChild(h);

  if (!tarefas) return blocoErro(bloco, 'tarefas');

  const agora = new Date();
  const abertas = tarefas.filter((t) => t.status !== 'feito');
  const vencidas = abertas.filter((t) => t.prazo && new Date(t.prazo) < agora).length;
  const urgentes = abertas.filter((t) => t.prioridade === 'urgente').length;
  const andamento = abertas.filter((t) => t.status === 'fazendo').length;

  const kpis = document.createElement('div');
  kpis.className = 'sitio-kpis dash-kpis-3';
  // Cor só quando o número é problema real; zero é neutro (regra UX).
  kpis.appendChild(kpiCard('Atrasadas', String(vencidas), vencidas > 0 ? 'negativo' : ''));
  kpis.appendChild(kpiCard('Urgentes', String(urgentes), urgentes > 0 ? 'dash-warning' : ''));
  kpis.appendChild(kpiCard('Em andamento', String(andamento), ''));
  kpis.addEventListener('click', () => goPage('tasks'));
  bloco.appendChild(kpis);

  return bloco;
}

// ──────────── 💰 Dinheiro ────────────

function blocoDinheiro(lancamentos, hoje, limite7) {
  const bloco = document.createElement('section');
  bloco.className = 'sitio-bloco';

  const h = document.createElement('h2');
  h.className = 'sitio-bloco-titulo';
  h.textContent = 'Dinheiro · Sítio';
  bloco.appendChild(h);

  if (!lancamentos) return blocoErro(bloco, 'sítio');

  if (!lancamentos.length) {
    const vazio = document.createElement('p');
    vazio.className = 'sitio-bloco-vazio';
    vazio.textContent = 'Sem lançamentos ainda.';
    bloco.appendChild(vazio);
    return bloco;
  }

  // Contas: janela até hoje+7 SEM piso (vencida ainda vai sair do bolso).
  const previstos = lancamentos.filter((l) => l.status === 'previsto');
  const janela = previstos.filter((l) => l.data_lancamento <= limite7);
  const vencidasJanela = janela.filter((l) => l.data_lancamento < hoje);
  const soma = (lista, tipo) => lista
    .filter((l) => l.tipo === tipo)
    .reduce((acc, l) => acc + Number(l.valor_centavos), 0);
  const pagar = soma(janela, 'saida');
  const receber = soma(janela, 'entrada');

  // Saldo do mês (realizados) + tendência vs mês anterior.
  const iniMes = hoje.slice(0, 8) + '01';
  const [a, m] = hoje.split('-').map(Number);
  const fimMes = ymdLocal(new Date(a, m, 1));
  const iniAnterior = ymdLocal(new Date(a, m - 2, 1));
  const realizados = lancamentos.filter((l) => l.status === 'realizado');
  const saldoDe = (ini, fim) => realizados
    .filter((l) => l.data_lancamento >= ini && l.data_lancamento < fim)
    .reduce((acc, l) => acc + Number(l.valor_centavos) * (l.tipo === 'entrada' ? 1 : -1), 0);
  const saldoMes = saldoDe(iniMes, fimMes);
  const saldoAnterior = saldoDe(iniAnterior, iniMes);

  const kpis = document.createElement('div');
  kpis.className = 'sitio-kpis';

  kpis.appendChild(kpiCard('A pagar · 7 dias', fmtMoney(pagar), pagar > 0 ? '' : ''));
  kpis.appendChild(kpiCard('A receber · 7 dias', fmtMoney(receber), ''));

  const cardSaldo = kpiCard(
    'Saldo do mês',
    (saldoMes < 0 ? '− ' : '') + fmtMoney(Math.abs(saldoMes)),
    saldoMes < 0 ? 'negativo' : '',
  );
  const tend = tendencia(saldoMes, saldoAnterior, false);
  if (tend) {
    const t = document.createElement('small');
    t.className = 'kpi-tendencia ' + (tend.boa ? 'boa' : 'ruim');
    t.textContent = tend.texto;
    cardSaldo.appendChild(t);
  }

  if (vencidasJanela.length) {
    const totalVencidas = soma(vencidasJanela, 'saida') + soma(vencidasJanela, 'entrada');
    kpis.appendChild(kpiCard(
      `Vencidas (${vencidasJanela.length})`,
      fmtMoney(totalVencidas),
      'negativo',
    ));
    kpis.appendChild(cardSaldo);
  } else {
    cardSaldo.classList.add('dash-kpi-largo');
    kpis.appendChild(cardSaldo);
  }

  kpis.addEventListener('click', () => goPage('sitio'));
  bloco.appendChild(kpis);

  return bloco;
}

// ──────────── 💡 Últimas ideias ────────────

function blocoIdeias(ideias) {
  const bloco = document.createElement('section');
  bloco.className = 'sitio-bloco';

  const h = document.createElement('h2');
  h.className = 'sitio-bloco-titulo';
  h.textContent = 'Últimas ideias';
  bloco.appendChild(h);

  if (!ideias) return blocoErro(bloco, 'ideias');

  if (!ideias.length) {
    const vazio = document.createElement('p');
    vazio.className = 'sitio-bloco-vazio';
    vazio.textContent = 'Nenhuma ideia capturada ainda.';
    bloco.appendChild(vazio);
    return bloco;
  }

  for (const ideia of ideias.slice(0, 2)) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'nota-card dash-ideia';
    const titulo = document.createElement('span');
    titulo.className = 'nota-titulo dash-truncar';
    titulo.textContent = ideia.titulo;
    const meta = document.createElement('small');
    meta.className = 'nota-meta';
    meta.textContent = tempoRelativo(ideia.created_at);
    card.appendChild(titulo);
    card.appendChild(meta);
    card.addEventListener('click', () => goPage('ideias'));
    bloco.appendChild(card);
  }

  return bloco;
}

function tempoRelativo(timestamp) {
  const dias = Math.floor((Date.now() - new Date(timestamp).getTime()) / 86_400_000);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

// ──────────── 🤖 IA este mês ────────────

function blocoCustoIA(custos, hoje) {
  const bloco = document.createElement('section');
  bloco.className = 'sitio-bloco';

  if (!custos) return bloco; // sem título nem erro — rodapé é discreto até no fallback

  const iniMes = `${hoje.slice(0, 7)}-01`;
  let mesAtual = 0;
  let mesAnterior = 0;
  for (const c of custos) {
    if (diaBrasilia(c.created_at) >= iniMes) mesAtual += Number(c.custo_brl);
    else mesAnterior += Number(c.custo_brl);
  }

  const linha = document.createElement('button');
  linha.type = 'button';
  linha.className = 'sitio-projecao dash-linha-ia';

  const item = document.createElement('div');
  item.className = 'sitio-projecao-linha';
  const label = document.createElement('span');
  label.textContent = '🤖 IA este mês';
  const valor = document.createElement('span');
  const tend = tendencia(mesAtual, mesAnterior, true);
  valor.textContent = fmtMoney(Math.round(mesAtual * 100)) +
    (tend ? ` · ${tend.texto.replace(' vs mês anterior', '')}` : '');
  item.appendChild(label);
  item.appendChild(valor);
  linha.appendChild(item);

  linha.addEventListener('click', () => goPage('config'));
  bloco.appendChild(linha);
  return bloco;
}
