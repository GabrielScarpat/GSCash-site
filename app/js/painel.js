/* =========================================================
   GSCASH — Painel
   ========================================================= */

(function () {
  const { icone, esc, widgets } = GS;
  const $ = id => document.getElementById(id);

  const estado = {
    modo: 'mes',
    ref: GS.hoje(),          // data que "ancora" o período
    custom: null,            // { inicio: Date, fim: Date }
  };

  /* ---------- Período ---------- */

  function periodo() {
    const r = estado.ref;
    switch (estado.modo) {
      case 'hoje': return { inicio: r, fim: r };
      case '7d': return { inicio: GS.somarDias(r, -6), fim: r };
      case '30d': return { inicio: GS.somarDias(r, -29), fim: r };
      case 'ano': return { inicio: new Date(r.getFullYear(), 0, 1), fim: new Date(r.getFullYear(), 11, 31) };
      case 'custom': return estado.custom;
      default: return { inicio: new Date(r.getFullYear(), r.getMonth(), 1), fim: new Date(r.getFullYear(), r.getMonth() + 1, 0) };
    }
  }

  function rotulo({ inicio, fim }) {
    if (estado.modo === 'mes') return GS.mesAno(inicio);
    if (estado.modo === 'ano') return String(inicio.getFullYear());
    if (GS.diasEntre(inicio, fim) === 0) return GS.dataMedia(inicio);
    return inicio.getFullYear() === fim.getFullYear()
      ? `${GS.dataCurta(inicio)} – ${GS.dataMedia(fim)}`
      : `${GS.dataMedia(inicio)} – ${GS.dataMedia(fim)}`;
  }

  // período imediatamente anterior, do mesmo tamanho
  function periodoAnterior(p) {
    if (estado.modo === 'mes') {
      return { inicio: new Date(p.inicio.getFullYear(), p.inicio.getMonth() - 1, 1), fim: GS.somarDias(p.inicio, -1) };
    }
    if (estado.modo === 'ano') {
      return { inicio: new Date(p.inicio.getFullYear() - 1, 0, 1), fim: new Date(p.inicio.getFullYear() - 1, 11, 31) };
    }
    const dias = GS.diasEntre(p.inicio, p.fim) + 1;
    return { inicio: GS.somarDias(p.inicio, -dias), fim: GS.somarDias(p.inicio, -1) };
  }

  function mover(direcao) {
    const r = estado.ref;
    switch (estado.modo) {
      case 'hoje': estado.ref = GS.somarDias(r, direcao); break;
      case '7d': estado.ref = GS.somarDias(r, 7 * direcao); break;
      case '30d': estado.ref = GS.somarDias(r, 30 * direcao); break;
      case 'ano': estado.ref = new Date(r.getFullYear() + direcao, r.getMonth(), 1); break;
      case 'custom': {
        const dias = GS.diasEntre(estado.custom.inicio, estado.custom.fim) + 1;
        estado.custom = {
          inicio: GS.somarDias(estado.custom.inicio, dias * direcao),
          fim: GS.somarDias(estado.custom.fim, dias * direcao),
        };
        break;
      }
      default: estado.ref = new Date(r.getFullYear(), r.getMonth() + direcao, 1);
    }
    desenhar();
  }

  function escolherPersonalizado() {
    const p = periodo();
    const corpo = GS.el('div', 'row-2');
    corpo.innerHTML = `
      <div class="field"><span class="field-label">De</span><div data-slot="ini"></div></div>
      <div class="field"><span class="field-label">Até</span><div data-slot="fim"></div></div>`;
    const ini = GS.campoData(GS.isoData(p.inicio));
    const fim = GS.campoData(GS.isoData(p.fim));
    corpo.querySelector('[data-slot="ini"]').append(ini.el);
    corpo.querySelector('[data-slot="fim"]').append(fim.el);

    const modal = GS.abrirModal({
      titulo: 'Período personalizado',
      corpo,
      tamanho: 'sm',
      rodapeClasse: 'even',
      rodape: `<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
               <button type="button" class="btn btn-primary" data-ok>${icone('check')}Aplicar</button>`,
    });
    modal.foot.querySelector('[data-ok]').addEventListener('click', () => {
      let a = GS.parseData(ini.valor);
      let b = GS.parseData(fim.valor);
      if (a > b) [a, b] = [b, a];
      estado.modo = 'custom';
      estado.custom = { inicio: a, fim: b };
      modal.fechar();
      desenhar();
    });
  }

  document.querySelectorAll('#periodoModos button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.modo === 'custom') return escolherPersonalizado();
    estado.modo = b.dataset.modo;
    estado.ref = GS.hoje();
    desenhar();
  }));
  $('periodoAnterior').addEventListener('click', () => mover(-1));
  $('periodoProximo').addEventListener('click', () => mover(1));

  // relatório em PDF do período que está na tela (js/relatorio.js)
  $('relatorio').addEventListener('click', () => {
    const p = periodo();
    GS.relatorio.abrir({ periodo: p, anterior: periodoAnterior(p), modo: estado.modo, rotulo: rotulo(p) });
  });

  /* ---------- Desenho ---------- */

  async function desenhar() {
    const ctx = await GS.carregarTudo();
    const prefs = await GS.api.obterPreferencias();
    if (!preferenciasLidas) {
      mesesEvolucao = prefs.evolucaoMeses === 12 ? 12 : 6;
      preferenciasLidas = true;
      // primeiro acesso (conta sem nenhum lançamento): o tour abre sozinho, uma única vez
      if (!prefs.boasVindasVista && !ctx.transacoes.length) GS.abrirTour({ primeiraVez: true });
    }
    GS.desenharPrimeirosPassos($('primeirosPassos'), ctx, prefs);
    const hoje = GS.hoje();
    const hojeIso = GS.isoData(hoje);
    const p = periodo();
    const ini = GS.isoData(p.inicio);
    // os números do Painel contam só o que já aconteceu (lançamentos futuros ficam no "previsto")
    const fim = GS.isoData(p.fim) > hojeIso ? hojeIso : GS.isoData(p.fim);

    pintarOlho();

    // cabeçalho do período
    document.querySelectorAll('#periodoModos button').forEach(b => {
      const ativo = b.dataset.modo === estado.modo;
      b.classList.toggle('active', ativo);
      b.setAttribute('aria-pressed', ativo);
    });
    $('periodoRotulo').textContent = rotulo(p);
    $('periodoProximo').disabled = p.fim >= hoje;

    desenharSaldo(ctx, hoje);

    // despesas e receitas do período (até hoje)
    const despesas = ini <= fim ? GS.calc.despesasNoPeriodo(ctx.transacoes, ini, fim) : [];
    const total = GS.calc.somar(despesas);
    const receitas = ini <= fim ? GS.calc.somar(GS.calc.receitasNoPeriodo(ctx.transacoes, ini, fim)) : 0;

    // média por dia: conta só os dias que já passaram
    const fimEfetivo = p.fim > hoje && p.inicio <= hoje ? hoje : p.fim;
    const dias = Math.max(1, GS.diasEntre(p.inicio, fimEfetivo) + 1);
    desenharResultado(p, receitas, total, Math.round(total / dias));

    desenharEvolucao(ctx, hoje);
    desenharCategorias(ctx, despesas, total);
    desenharComparacao(ctx, total, p);
    desenharCarteiras(ctx, despesas, total);
    desenharUltimos(ctx, ini, fim);
  }

  /* ---------- Saldo atual e previsto ---------- */

  function desenharSaldo(ctx, hoje) {
    const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    const fimMesIso = GS.isoData(fimMes);
    // carteiras ocultas não entram no saldo
    const visiveis = GS.calc.visiveis(ctx.carteiras);
    const ocultas = ctx.carteiras.filter(c => c.oculta);
    const atual = visiveis.reduce((s, c) => s + GS.calc.saldoCarteira(c, ctx.transacoes), 0);

    // previsto = lançamentos até o fim do mês − faturas em aberto que vencem até lá
    // (só as faturas pagas por uma carteira visível)
    const comFuturos = visiveis.reduce((s, c) => s + GS.calc.saldoCarteira(c, ctx.transacoes, fimMesIso), 0);
    const pagaComVisivel = cartao => !(ctx.carteira.get(cartao.credito.pagarComId) || cartao).oculta;
    const faturas = GS.faturas.cartoes(ctx.carteiras).filter(pagaComVisivel).reduce((s, cartao) => s + GS.faturas.listar(cartao, ctx.transacoes, hoje)
      .filter(f => f.restante > 0 && f.vencimento <= fimMes)
      .reduce((t, f) => t + f.restante, 0), 0);
    const previsto = comFuturos - faturas;
    const dif = previsto - atual;

    $('saldoTotal').textContent = GS.moeda(atual);
    $('saldoSub').innerHTML = 'em ' + GS.plural(visiveis.length, 'carteira', 'carteiras') + (ocultas.length
      ? ` · <span class="selo neutro" title="Fora do saldo: ${esc(ocultas.map(c => c.nome).join(', '))}">${GS.plural(ocultas.length, 'oculta', 'ocultas')}</span>`
      : '');
    $('previstoRotulo').textContent = `Previsto para ${fimMes.getDate()} de ${GS.mesAno(fimMes).split(' ')[0].toLowerCase()}`;
    $('previsto').textContent = GS.moeda(previsto);
    $('previstoDif').textContent = dif === 0 ? '' : `${dif > 0 ? '+' : '−'}${GS.moeda(Math.abs(dif))}`;
    $('previstoDif').className = 'num ' + (dif < 0 ? 'neg' : 'pos');
    $('previstoSub').textContent = dif === 0 ? 'nada previsto até o fim do mês' : 'receitas, contas e faturas a vir';
  }

  /* ---------- Resultado do período ---------- */

  function desenharResultado(p, entrou, saiu, media) {
    const sobrou = entrou - saiu;
    $('resultadoTitulo').textContent = estado.modo === 'mes' ? 'Resultado do mês' : 'Resultado do período';
    $('resultadoSub').textContent = rotulo(p);
    $('entrou').textContent = GS.moeda(entrou);
    $('saiu').textContent = GS.moeda(saiu);
    $('sobrouRotulo').textContent = sobrou < 0 ? 'Faltou' : 'Sobrou';
    $('sobrou').textContent = GS.moeda(Math.abs(sobrou));
    $('sobrou').className = 'num ' + (sobrou < 0 ? 'neg' : 'pos');

    const uso = entrou > 0 ? saiu / entrou : (saiu > 0 ? 1 : 0);
    $('usoBarra').style.width = `${Math.min(100, uso * 100)}%`;
    $('usoTexto').textContent = entrou > 0
      ? `Gastou ${Math.round(uso * 100)}% do que entrou`
      : (saiu > 0 ? 'Nenhuma receita no período' : 'Nenhuma transação no período');
    $('mediaDia').innerHTML = `média de <b>${GS.moeda(media)}</b> por dia`;
  }

  /* ---------- Evolução mensal ---------- */

  let mesesEvolucao = 6;
  let dadosEvolucao = [];

  function desenharEvolucao(ctx, hoje) {
    const hojeIso = GS.isoData(hoje);
    dadosEvolucao = Array.from({ length: mesesEvolucao }, (_, i) => {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - (mesesEvolucao - 1 - i), 1);
      const ini = GS.isoData(inicio);
      let fim = GS.isoData(new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0));
      const parcial = fim > hojeIso;
      if (parcial) fim = hojeIso;
      return {
        rotulo: GS.mesAno(inicio).slice(0, 3),
        nome: GS.mesAno(inicio),
        entrou: GS.calc.somar(GS.calc.receitasNoPeriodo(ctx.transacoes, ini, fim)),
        saiu: GS.calc.somar(GS.calc.despesasNoPeriodo(ctx.transacoes, ini, fim)),
        parcial,
      };
    });
    document.querySelectorAll('#evoMeses button').forEach(b => {
      const ativo = Number(b.dataset.n) === mesesEvolucao;
      b.classList.toggle('active', ativo);
      b.setAttribute('aria-pressed', ativo);
    });
    pintarGrafico();
  }

  // eixo em valores "redondos": 1, 2, 2,5 ou 5 × 10^n
  function escalaY(maximo) {
    if (maximo <= 0) return { max: 100000, passo: 25000 };
    const bruto = maximo / 4;
    const potencia = Math.pow(10, Math.floor(Math.log10(bruto)));
    const passo = [1, 2, 2.5, 5, 10].map(m => m * potencia).find(v => v >= bruto);
    return { max: Math.ceil(maximo / passo) * passo, passo };
  }

  function rotuloEixo(centavos) {
    if (GS.oculto) return '•••';
    const reais = centavos / 100;
    if (reais === 0) return '0';
    const local = GS.moedaAtual().local;
    if (reais >= 1000) return `${(reais / 1000).toLocaleString(local, { maximumFractionDigits: 1 })} mil`;
    return reais.toLocaleString(local, { maximumFractionDigits: 0 });
  }

  function pintarGrafico() {
    const caixa = $('grafico');
    const dados = dadosEvolucao;
    if (!dados.some(d => d.entrou || d.saiu)) {
      caixa.innerHTML = widgets.vazio('Nenhuma transação nos últimos meses', 'O gráfico aparece assim que houver receitas ou despesas.');
      return;
    }

    const W = Math.max(320, caixa.clientWidth);
    const H = 300, ml = 60, mb = 52, mt = 12;
    const { max, passo } = escalaY(Math.max(...dados.map(d => Math.max(d.entrou, d.saiu))));
    const y = v => mt + (H - mt - mb) * (1 - v / max);
    const grupo = (W - ml) / dados.length;
    const bw = Math.max(6, Math.min(34, grupo * 0.24));

    const barra = (x, v, cor, parcial) => {
      if (!v) return '';
      const topo = y(v), r = Math.min(4, y(0) - topo);
      return `<path d="M${x},${y(0)} V${topo + r} Q${x},${topo} ${x + r},${topo} H${x + bw - r} Q${x + bw},${topo} ${x + bw},${topo + r} V${y(0)} Z"
        fill="${cor}" opacity="${parcial ? 0.55 : 1}" pointer-events="none"/>`;
    };

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Entrou e saiu nos últimos ${dados.length} meses"><g class="grade eixo">`;
    for (let v = 0; v <= max + 1; v += passo) {
      svg += `<line x1="${ml}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${ml - 10}" y="${y(v) + 4}" text-anchor="end">${rotuloEixo(v)}</text>`;
    }
    svg += '</g>';

    dados.forEach((d, i) => {
      const centro = ml + grupo * i + grupo / 2;
      const sobra = d.entrou - d.saiu;
      svg += `<rect class="faixa" data-i="${i}" tabindex="0" aria-label="${d.nome}: entrou ${GS.moeda(d.entrou)}, saiu ${GS.moeda(d.saiu)}"
        x="${ml + grupo * i + 3}" y="${mt}" width="${grupo - 6}" height="${H - mt - mb + 44}" rx="10"/>`;
      svg += barra(centro - bw - 1, d.entrou, 'var(--entrou)', d.parcial);
      svg += barra(centro + 1, d.saiu, 'var(--saiu)', d.parcial);
      svg += `<g class="mes ${d.parcial ? 'atual' : ''}" pointer-events="none">
        <text x="${centro}" y="${H - mb + 22}" text-anchor="middle">${d.rotulo}${d.parcial && dados.length <= 6 ? ' (parcial)' : ''}</text>
        ${dados.length <= 6 && (d.entrou || d.saiu)
          ? `<text class="sob" x="${centro}" y="${H - mb + 40}" text-anchor="middle">${sobra < 0 ? 'faltou' : 'sobrou'} ${GS.moedaInteira(Math.abs(sobra))}</text>` : ''}
      </g>`;
    });
    svg += '</svg>';
    caixa.innerHTML = svg + '<div class="tip" role="status"></div>';

    const tip = caixa.querySelector('.tip');
    const mostrar = f => {
      const d = dados[Number(f.dataset.i)];
      const sobra = d.entrou - d.saiu;
      caixa.querySelectorAll('.faixa').forEach(x => x.classList.toggle('on', x === f));
      tip.innerHTML = `<b>${d.nome}${d.parcial ? ' · até hoje' : ''}</b>
        <div><span><i class="sq sq-entrou"></i>Entrou</span><span class="num">${GS.moeda(d.entrou)}</span></div>
        <div><span><i class="sq sq-saiu"></i>Saiu</span><span class="num">${GS.moeda(d.saiu)}</span></div>
        <div class="tot"><span>${sobra < 0 ? 'Faltou' : 'Sobrou'}</span><span class="num">${GS.moeda(Math.abs(sobra))}</span></div>`;
      const r = f.getBoundingClientRect(), base = caixa.getBoundingClientRect();
      tip.style.left = Math.max(0, Math.min(r.left - base.left + r.width / 2 - 100, base.width - 210)) + 'px';
      tip.style.top = '-14px';
      tip.classList.add('on');
    };
    const esconder = () => { tip.classList.remove('on'); caixa.querySelectorAll('.faixa').forEach(x => x.classList.remove('on')); };
    caixa.querySelectorAll('.faixa').forEach(f => {
      f.addEventListener('mouseenter', () => mostrar(f));
      f.addEventListener('focus', () => mostrar(f));
      f.addEventListener('mouseleave', esconder);
      f.addEventListener('blur', esconder);
    });
  }

  document.getElementById('evoMeses').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    mesesEvolucao = Number(b.dataset.n);
    GS.api.salvarPreferencia('evolucaoMeses', mesesEvolucao).catch(err => GS.toast(err.message, 'erro'));
    desenhar();
  });

  // redesenha o gráfico quando a largura do card muda (janela, zoom, layout)
  let larguraGrafico = 0;
  let redimensionando = null;
  new ResizeObserver(([entrada]) => {
    const largura = Math.round(entrada.contentRect.width);
    if (!largura || largura === larguraGrafico) return;
    larguraGrafico = largura;
    clearTimeout(redimensionando);
    redimensionando = setTimeout(() => { if (dadosEvolucao.length) pintarGrafico(); }, 80);
  }).observe($('grafico'));

  /* ---------- Ocultar valores ---------- */

  function pintarOlho() {
    const olho = $('olho');
    olho.innerHTML = icone(GS.oculto ? 'eye-off' : 'eye');
    olho.classList.toggle('on', GS.oculto);
    olho.setAttribute('aria-pressed', GS.oculto);
    olho.title = GS.oculto ? 'Mostrar valores' : 'Ocultar valores';
    olho.setAttribute('aria-label', olho.title);
  }

  $('olho').addEventListener('click', async () => {
    GS.oculto = !GS.oculto;
    // a tela muda na hora; se não der para salvar, avisa que a escolha não vai ficar guardada
    try {
      await GS.api.salvarPreferencia('ocultarValores', GS.oculto);
    } catch (err) {
      GS.toast(err.message, 'erro');
    }
    desenhar();
  });

  let preferenciasLidas = false;

  function desenharCategorias(ctx, despesas, total) {
    const grupos = GS.calc.agrupar(despesas, 'categoriaId');
    const maior = grupos[0] ? grupos[0].total : 0;

    if (!grupos.length) {
      $('porCategoria').innerHTML = widgets.vazio('Nenhum gasto neste período', 'Use o botão "Nova transação" para registrar.');
      $('distribuicao').innerHTML = widgets.vazio('Sem dados para o gráfico');
      return;
    }

    const filtroMes = estado.modo === 'mes' ? `&mes=${GS.isoMes(periodo().inicio)}` : '';

    $('porCategoria').innerHTML = grupos.map(g => {
      const c = ctx.categoria.get(g.id) || { nome: 'Sem categoria', icone: 'tag' };
      return `
        <li>
          <a class="cat-bar-row" href="transacoes.html?categoria=${encodeURIComponent(g.id)}${filtroMes}">
            <span class="tile">${icone(c.icone)}</span>
            <div class="cat-bar-body">
              <div class="cat-bar-line">
                <span class="cat-bar-name">${esc(c.nome)}</span>
                <span class="num cat-bar-val">${GS.moeda(g.total)}</span>
                <span class="num cat-bar-pct">${GS.pct(g.total, total)}</span>
              </div>
              <div class="bar bare"><span style="width:${(g.total / maior) * 100}%"></span></div>
            </div>
          </a>
        </li>`;
    }).join('');

    const itens = grupos.map(g => {
      const c = ctx.categoria.get(g.id) || { nome: 'Sem categoria', cor: '#999' };
      return { rotulo: c.nome, valor: g.total, cor: c.cor };
    });
    $('distribuicao').innerHTML = `<div class="donut-wrap">${widgets.rosca(itens, total)}${widgets.legenda(itens, total)}</div>`;
  }

  function desenharComparacao(ctx, total, p) {
    const ant = periodoAnterior(p);
    const totalAnterior = GS.calc.somar(GS.calc.despesasNoPeriodo(ctx.transacoes, GS.isoData(ant.inicio), GS.isoData(ant.fim)));
    const el = $('comparacao');
    if (!totalAnterior || !total) { el.innerHTML = ''; return; }

    const dif = total - totalAnterior;
    const pct = Math.round((dif / totalAnterior) * 100);
    if (dif === 0) {
      el.className = 'compare';
      el.innerHTML = 'Mesmo valor do período anterior';
      return;
    }
    const menos = dif < 0;
    el.className = 'compare ' + (menos ? 'good' : 'bad');
    el.innerHTML = `${icone(menos ? 'arrow-down' : 'arrow-up')}
      ${GS.moeda(Math.abs(dif))} ${menos ? 'a menos' : 'a mais'} que o período anterior (${pct > 0 ? '+' : ''}${pct}%)`;
  }

  function desenharCarteiras(ctx, despesas, total) {
    const grupos = GS.calc.agrupar(despesas, 'carteiraId');
    if (!grupos.length) {
      $('porCarteira').innerHTML = widgets.vazio('Nenhum gasto neste período');
      return;
    }
    const info = g => ctx.carteira.get(g.id) || { nome: 'Sem carteira', cor: '#999' };
    $('porCarteira').innerHTML = `
      <div class="stacked-bar">${grupos.map(g =>
        `<span style="flex-grow:${g.total};background:${info(g).cor}" title="${esc(info(g).nome)}"></span>`).join('')}
      </div>
      <ul class="wallet-legend">${grupos.map(g => `
        <li>
          <a href="transacoes.html?carteira=${encodeURIComponent(g.id)}">
            <span class="sq" style="background:${info(g).cor}"></span>
            <span class="wl-name">${esc(info(g).nome)}</span>
            <span class="num wl-val">${GS.moeda(g.total)}</span>
            <span class="num wl-pct">${GS.pct(g.total, total)}</span>
          </a>
        </li>`).join('')}
      </ul>`;
  }

  function desenharUltimos(ctx, ini, fim) {
    const doPeriodo = ctx.transacoes.filter(t => t.data >= ini && t.data <= fim);
    const recentes = GS.calc.ordenarRecentes(doPeriodo).slice(0, 6);
    $('ultimos').innerHTML = recentes.length
      ? recentes.map(t => widgets.linhaTransacao(t, ctx, { comData: true })).join('')
      : widgets.vazio('Nenhuma transação neste período');
  }

  GS.iniciarPagina('painel', desenhar);
})();
