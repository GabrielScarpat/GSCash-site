/* =========================================================
   GSCASH — relatório por categoria em PDF (Categorias › Relatório)

   A pessoa escolhe categorias e subcategorias; cada categoria vira uma seção
   (total, evolução, subcategorias e lançamentos). Na tela Categorias o período
   é o mês que está na tela; no Painel, qualquer período (Hoje, 7 dias, 30 dias,
   Mês, Ano ou Personalizado). A janela, a prévia, o A4 e o salvar são os do
   relatório do Painel (js/relatorio.js).
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const { icone, esc } = GS;
  const { salvar, avisoSalvo, opcaoHtml, comparar, nomeAnterior, rodapeFolha, marca, moeda, pct } = GS.relatorio._comum;

  const SEM_SUB = '__sem';           // lançamentos da categoria que não têm subcategoria
  const MESES_GRAFICO = 6;
  const LIMITE_MAIORES = 10;        // nível "Os 10 maiores" dos lançamentos
  // alturas aproximadas (px) para repartir o conteúdo nas folhas A4 (a folha tem 1123 px)
  const ORCAMENTO_1 = 640;           // primeira folha: cabeçalho e resumo ocupam uma parte
  const ORCAMENTO_N = 830;
  const H = { orcamento: 26, cabecalho: 46, grafico: 104, tabHead: 30, tabLinha: 29, tabFim: 38, linhaLanc: 29, lancExtra: 15, espaco: 22 };

  const nomeMes = iso => GS.mesAnoDeIso(iso).split(' ')[0];

  /* ---------- Período e barras do gráfico ---------- */

  const mesesAte = (mesIso, n) => {
    const [a, m] = mesIso.split('-').map(Number);
    return Array.from({ length: n }, (_, i) => GS.isoMes(new Date(a, m - 1 - (n - 1 - i), 1)));
  };
  const fimDoMes = mesIso => { const [a, m] = mesIso.split('-').map(Number); return GS.isoData(new Date(a, m, 0)); };
  const abrev = dt => nomeMes(GS.isoMes(dt)).slice(0, 3);
  const abrevMin = dt => abrev(dt).toLowerCase();

  /* As barras de cada categoria cobrem o período escolhido, em escala que cabe no gráfico:
     Mês: os últimos 6 meses · até 14 dias: por dia · até ~3 meses: por semana · mais: por mês
     (por ano acima de 36 meses). Hoje (um dia só) não tem gráfico. */
  function barrasDo(modo, inicio, fim) {
    const hoje = GS.isoData(GS.hoje());
    const dias = GS.diasEntre(inicio, fim) + 1;
    const nova = (ini, f, rotulo, parcial) => ({ ini, fim: f, rotulo, parcial: !!parcial, futuro: ini > hoje });
    if (dias === 1) return { barras: [], escala: '' };
    if (modo === 'mes') {
      return { escala: `os últimos ${MESES_GRAFICO} meses`, barras: mesesAte(GS.isoMes(inicio), MESES_GRAFICO).map(j => nova(`${j}-01`, fimDoMes(j), abrev(new Date(`${j}-01T12:00`)))) };
    }
    const barras = [];
    if (dias <= 14) {
      for (let i = 0; i < dias; i++) { const d = GS.somarDias(inicio, i); barras.push(nova(GS.isoData(d), GS.isoData(d), String(d.getDate()))); }
      return { barras, escala: 'por dia' };
    }
    if (dias <= 92) {
      for (let i = 0; i < dias; i += 7) {
        const bi = GS.somarDias(inicio, i);
        const bf = GS.somarDias(bi, 6) > fim ? fim : GS.somarDias(bi, 6);
        const mesmo = bi.getMonth() === bf.getMonth();
        const rotulo = bi.getDate() === bf.getDate() && mesmo ? `${bi.getDate()} ${abrevMin(bi)}` : mesmo ? `${bi.getDate()}–${bf.getDate()} ${abrevMin(bf)}` : `${bi.getDate()} ${abrevMin(bi)}`;
        barras.push(nova(GS.isoData(bi), GS.isoData(bf), rotulo, GS.diasEntre(bi, bf) < 6));
      }
      return { barras, escala: 'por semana' };
    }
    const meses = (fim.getFullYear() - inicio.getFullYear()) * 12 + fim.getMonth() - inicio.getMonth() + 1;
    const porAno = meses > 36;
    const passo = porAno ? 12 : 1;
    const mostrarAno = !porAno && inicio.getFullYear() !== fim.getFullYear();
    for (let k = 0; k < (porAno ? fim.getFullYear() - inicio.getFullYear() + 1 : meses); k += 1) {
      const bi0 = porAno ? new Date(inicio.getFullYear() + k, 0, 1) : new Date(inicio.getFullYear(), inicio.getMonth() + k * passo, 1);
      const bf0 = porAno ? new Date(bi0.getFullYear(), 11, 31) : new Date(bi0.getFullYear(), bi0.getMonth() + 1, 0);
      const bi = bi0 < inicio ? inicio : bi0, bf = bf0 > fim ? fim : bf0;
      const rotulo = porAno ? String(bi0.getFullYear()) : `${abrev(bi0)}${mostrarAno ? `/${String(bi0.getFullYear()).slice(2)}` : ''}`;
      barras.push(nova(GS.isoData(bi), GS.isoData(bf), rotulo, bi > bi0 || bf < bf0));
    }
    return { barras, escala: porAno ? 'por ano' : 'por mês' };
  }

  // o período do relatório: datas, textos, período anterior (para comparar) e barras do gráfico
  function montarPeriodo({ modo, inicio, fim, anterior, rotulo }) {
    const { barras, escala } = barrasDo(modo, inicio, fim);
    const mes = modo === 'mes';
    return {
      modo, ini: GS.isoData(inicio), fim: GS.isoData(fim), rotulo, barras, escala,
      titulo: mes ? `${nomeMes(GS.isoMes(inicio))} de ${inicio.getFullYear()}` : rotulo,
      que: mes ? 'mês' : 'período',
      semMov: mes ? `nos últimos ${MESES_GRAFICO} meses` : 'neste período',
      nomeAnt: nomeAnterior(modo, anterior),
      antes: { ini: GS.isoData(anterior.inicio), fim: GS.isoData(anterior.fim) },
      nota: !barras.length ? 'sem gráfico (é um dia só)' : mes ? `gráfico dos últimos ${MESES_GRAFICO} meses` : `gráfico ${escala}`,
    };
  }
  function periodoDoMes(mes) {
    const [a, m] = mes.split('-').map(Number);
    return montarPeriodo({
      modo: 'mes', inicio: new Date(a, m - 1, 1), fim: new Date(a, m, 0),
      anterior: { inicio: new Date(a, m - 2, 1), fim: new Date(a, m - 1, 0) }, rotulo: GS.mesAnoDeIso(mes),
    });
  }
  // info é a do relatório do Painel (js/relatorio.js)
  const periodoDoPainel = info => montarPeriodo({ modo: info.modo, inicio: info.periodo.inicio, fim: info.periodo.fim, anterior: info.anterior, rotulo: info.rotulo });

  /* ---------- Dados ---------- */

  // por categoria: o que existe (subcategorias com valor) para a lista de escolha
  function montarCategorias(ctx, per) {
    const ini = per.ini, fim = per.fim;
    const desde = per.barras.length && per.barras[0].ini < ini ? per.barras[0].ini : ini;
    const dosMeses = ctx.transacoes.filter(t => (t.tipo === 'despesa' || t.tipo === 'receita') && t.data >= desde && t.data <= fim);
    return ctx.categorias.map(c => {
      const tipo = c.tipo === 'receita' ? 'receita' : 'despesa';
      const dela = dosMeses.filter(t => t.categoriaId === c.id && t.tipo === tipo);
      const doMes = dela.filter(t => t.data >= ini);
      const subs = (c.subcategorias || []).map(s => ({
        id: s.id, nome: s.nome, total: doMes.filter(t => t.subcategoriaId === s.id).reduce((x, t) => x + t.valor, 0),
      }));
      const semSub = dela.some(t => !t.subcategoriaId || !c.subcategorias.some(s => s.id === t.subcategoriaId));
      if (subs.length && semSub) subs.push({ id: SEM_SUB, nome: 'Sem subcategoria', total: doMes.filter(t => !t.subcategoriaId || !c.subcategorias.some(s => s.id === t.subcategoriaId)).reduce((x, t) => x + t.valor, 0) });
      return { id: c.id, nome: c.nome, tipo, orcamento: tipo === 'despesa' && c.orcamento > 0 ? c.orcamento : 0, total: GS.calc.somar(doMes), qtd: doMes.length, subs };
    }).sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'despesa' ? -1 : 1) || b.total - a.total || a.nome.localeCompare(b.nome));
  }

  const dentro = (sel, cat, t) => {
    const subs = sel.get(cat.id);
    if (!subs) return false;
    if (!cat.subs.length) return true;
    const sid = cat.subs.some(s => s.id === t.subcategoriaId) ? t.subcategoriaId : SEM_SUB;
    return subs.has(sid);
  };

  function montarDados(ctx, per, cats, sel) {
    const ini = per.ini, fim = per.fim;
    const doMesTodas = ctx.transacoes.filter(t => t.data >= ini && t.data <= fim);
    const saiuMes = GS.calc.somar(doMesTodas.filter(t => t.tipo === 'despesa'));
    const entrouMes = GS.calc.somar(doMesTodas.filter(t => t.tipo === 'receita'));

    const secoes = cats.filter(c => sel.has(c.id)).map(c => {
      const todas = ctx.transacoes.filter(t => t.tipo === c.tipo && t.categoriaId === c.id && dentro(sel, c, t));
      const mesLanc = todas.filter(t => t.data >= ini && t.data <= fim).sort((x, y) => x.data.localeCompare(y.data) || (x.criadoEm || 0) - (y.criadoEm || 0));
      const total = GS.calc.somar(mesLanc);
      const anterior = GS.calc.somar(todas.filter(t => t.data >= per.antes.ini && t.data <= per.antes.fim));
      const barras = per.barras.map(b => ({ ...b, total: GS.calc.somar(todas.filter(t => t.data >= b.ini && t.data <= b.fim)) }));
      const escolhidas = sel.get(c.id);
      const subs = c.subs.filter(s => escolhidas.has(s.id)).map(s => ({
        ...s, total: GS.calc.somar(mesLanc.filter(t => (c.subs.some(x => x.id === t.subcategoriaId) ? t.subcategoriaId : SEM_SUB) === s.id)),
      })).sort((x, y) => y.total - x.total);
      return { cat: c, total, anterior, barras, subs, lancamentos: mesLanc, parcial: c.subs.length ? `${escolhidas.size} de ${c.subs.length} subcategorias` : '' };
    });
    // quantas categorias existem (com movimento ou escolhidas) e quantas entraram, para os totais do cabeçalho
    const conta = tipo => ({
      de: cats.filter(c => c.tipo === tipo && (c.qtd > 0 || sel.has(c.id))).length,
      n: secoes.filter(x => x.cat.tipo === tipo).length,
    });
    return { per, secoes, saiuMes, entrouMes, categoriasSaiu: conta('despesa'), categoriasEntrou: conta('receita') };
  }

  /* ---------- Folhas ---------- */

  // "Saiu · 3 de 8 categorias": diz quantas categorias entraram nos totais
  const rotuloKpi = (base, { n, de }) => !de ? base : n === de ? `${base} · ${de > 1 ? 'todas as categorias' : '1 categoria'}` : `${base} · ${n} de ${de} categorias`;

  // extra.embutido: as folhas entram no fim do relatório do Painel (sem a capa, numeração continua)
  function folhasDe(d, op, extra) {
    const emb = !!(extra && extra.embutido);
    const lancTotal = d.secoes.reduce((s, x) => s + x.lancamentos.length, 0);
    const saiu = d.secoes.filter(s => s.cat.tipo === 'despesa').reduce((s, x) => s + x.total, 0);
    const entrou = d.secoes.filter(s => s.cat.tipo === 'receita').reduce((s, x) => s + x.total, 0);
    const hoje = GS.hoje();
    const per = d.per;
    const titulo = per.titulo;
    const nome = per.nomeAnt;

    /* itens: blocos inteiros ou linhas de tabela (que podem passar para a folha seguinte) */
    const itens = [];
    d.secoes.forEach(s => {
      const c = s.cat;
      const base = c.tipo === 'despesa' ? d.saiuMes : d.entrouMes;
      const cmp = op.comparar ? comparar(s.total, s.anterior, nome, c.tipo === 'receita') : null;
      const maior = Math.max(...s.barras.map(b => b.total), 1);
      const comBarras = op.evolucao && s.barras.length > 0;
      // orçamento mensal da categoria inteira (só quando o período é um mês, como no relatório do Painel)
      const orcamento = per.modo === 'mes' && c.orcamento > 0 ? `
        <div class="f-orc ${c.total > c.orcamento ? 'passou' : ''}"><div class="trilho"><i style="width:${Math.min(100, (c.total / c.orcamento) * 100)}%"></i></div>
          <small>${c.total > c.orcamento ? `Passou ${moeda(c.total - c.orcamento)} do limite de ${moeda(c.orcamento)}` : `${pct(c.total, c.orcamento)}% do orçamento de ${moeda(c.orcamento)} · restam ${moeda(c.orcamento - c.total)}`}</small></div>` : '';
      const grafico = !comBarras ? '' : s.barras.every(b => !b.total) ? `<div class="f-mini-vazio">Sem movimento ${per.semMov}</div>` : `
        <div class="f-mini-grafico">${s.barras.map((b, i) => `<i class="${i === s.barras.length - 1 ? 'atual' : ''}${b.parcial ? ' parcial' : ''}" style="height:${Math.max(b.total ? 6 : 0, (b.total / maior) * 100)}%" title="${esc(moeda(b.total))}"></i>`).join('')}</div>
        <div class="f-mini-leg">${s.barras.map(b => `<span${b.futuro ? ' class="fut"' : ''}>${esc(b.rotulo)}</span>`).join('')}</div>`;
      itens.push({
        h: H.espaco + H.cabecalho + (comBarras ? H.grafico : 0) + (orcamento ? H.orcamento : 0),
        html: `<div class="f-cat"><h3>${esc(c.nome)}${s.parcial ? ` <em>${s.parcial}</em>` : ''}
          <span>${moeda(s.total)}${base ? ` · ${pct(s.total, base)}% ${c.tipo === 'despesa' ? 'do que saiu' : 'do que entrou'}` : ''}${cmp && cmp.texto ? ` · <b class="${cmp.classe}">${cmp.texto}</b>` : ''}</span></h3>${orcamento}${grafico}</div>`,
      });
      if (!s.lancamentos.length) {
        itens.push({ h: H.tabLinha, html: `<p class="f-vazio">Sem lançamentos neste ${per.que}.</p>` });
        return;
      }
      if (s.subs.length > 1) {
        const maiorSub = Math.max(...s.subs.map(x => x.total), 1);
        itens.push({
          h: H.tabHead + H.tabLinha * s.subs.length + H.tabFim,
          html: `<table class="f-tab"><thead><tr><th style="width:30%">Subcategoria</th><th></th><th class="r" style="width:18%">Valor</th><th class="r" style="width:10%">%</th></tr></thead>
            <tbody>${s.subs.map(x => `<tr><td>${esc(x.nome)}</td><td><div class="f-barra"><i style="width:${(x.total / maiorSub) * 100}%"></i></div></td><td class="r">${moeda(x.total)}</td><td class="r">${pct(x.total, s.total)}%</td></tr>`).join('')}</tbody>
            <tfoot><tr><td>Total</td><td></td><td class="r">${moeda(s.total)}</td><td class="r">100%</td></tr></tfoot></table>`,
        });
      }
      const nivel = op.nivel || 'todos';
      if (nivel !== 'nenhum') {
        const comSub = c.subs.length > 0;
        const grupo = `l${c.id}`;
        let lanc = s.lancamentos;
        if (nivel === 'maiores' && lanc.length > LIMITE_MAIORES) {
          lanc = [...lanc].sort((x, y) => y.valor - x.valor).slice(0, LIMITE_MAIORES);
          itens.push({ h: H.tabHead, html: `<p class="f-lanc-tit">Os ${LIMITE_MAIORES} maiores de ${GS.plural(s.lancamentos.length, 'lançamento', 'lançamentos')}</p>` });
        }
        lanc.forEach(t => {
          const sub = comSub ? (c.subs.find(x => x.id === (c.subs.some(y => y.id === t.subcategoriaId) ? t.subcategoriaId : SEM_SUB)) || {}).nome || '' : '';
          const desc = t.descricao ? ` <span class="f-lim">· ${esc(t.descricao)}</span>` : '';
          itens.push({
            grupo, cabeca: `<th style="width:11%">Data</th><th>Lançamento</th>${comSub ? '<th style="width:22%">Subcategoria</th>' : ''}<th class="r" style="width:17%">Valor</th>`,
            h: H.linhaLanc + (t.descricao && t.descricao.length > 55 ? H.lancExtra : 0),
            html: `<tr><td>${GS.dataCurta(t.data)}</td><td>${esc(t.titulo)}${desc}</td>${comSub ? `<td>${esc(sub)}</td>` : ''}<td class="r">${moeda(t.valor)}</td></tr>`,
          });
        });
      }
    });

    /* reparte nas folhas */
    const paginas = [];
    let atual = [], usado = 0, limite = emb ? ORCAMENTO_N : ORCAMENTO_1;
    const fechar = () => { paginas.push(atual); atual = []; usado = 0; limite = ORCAMENTO_N; };
    itens.forEach(it => {
      const extra = it.grupo && !(atual.length && atual[atual.length - 1].grupo === it.grupo) ? H.tabHead : 0;
      if (usado + it.h + extra > limite && atual.length) fechar();
      const novoGrupo = it.grupo && !(atual.length && atual[atual.length - 1].grupo === it.grupo);
      usado += it.h + (novoGrupo ? H.tabHead : 0);
      atual.push(it);
    });
    if (atual.length || !paginas.length) paginas.push(atual);

    const corpoDe = lista => {
      let html = '', i = 0;
      while (i < lista.length) {
        const it = lista[i];
        if (!it.grupo) { html += it.html; i++; continue; }
        const linhas = [];
        while (i < lista.length && lista[i].grupo === it.grupo) { linhas.push(lista[i].html); i++; }
        html += `<table class="f-tab f-lanc"><thead><tr>${it.cabeca}</tr></thead><tbody>${linhas.join('')}</tbody></table>`;
      }
      return html;
    };

    const total = emb ? extra.total : paginas.length;
    const inicio = emb ? extra.inicioN : 1;
    return paginas.map((lista, n) => `
      <article class="folha">
        ${n === 0 && !emb ? `
        <div class="f-head">${marca}<div class="f-tit"><small>Relatório por categoria</small><strong>${esc(titulo)}</strong><span>${per.modo === 'mes' ? `${esc(per.rotulo)} · ` : ''}gerado em ${GS.dataMedia(hoje)}</span></div></div>
        <div class="f-kpis">
          <div class="f-kpi"><small><i class="saiu"></i>${rotuloKpi('Saiu', d.categoriasSaiu)}</small><strong>${moeda(saiu)}</strong><span>${d.saiuMes ? `${pct(saiu, d.saiuMes)}% do que saiu no ${per.que}` : ''}</span></div>
          <div class="f-kpi"><small><i class="entrou"></i>${rotuloKpi('Entrou', d.categoriasEntrou)}</small><strong>${moeda(entrou)}</strong><span>${d.entrouMes ? `${pct(entrou, d.entrouMes)}% do que entrou no ${per.que}` : ''}</span></div>
          <div class="f-kpi"><small>Lançamentos</small><strong>${lancTotal}</strong><span>${GS.plural(d.secoes.length, 'categoria', 'categorias')}</span></div>
        </div>` : `<div class="f-head p2">${marca}<div class="f-tit"><strong>${esc(titulo)} · por categoria</strong></div></div>`}
        <div class="f-sec">${corpoDe(lista)}</div>
        ${rodapeFolha(inicio + n, total)}
      </article>`);
  }
  const montarFolhas = (d, op) => folhasDe(d, op).join('');

  /* ---------- Escolha de categorias e subcategorias ---------- */

  const norm = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // destaca o trecho pesquisado (sem diferenciar acentos); se o texto tiver acento decomposto, não destaca
  function destaque(nome, q) {
    if (!q) return esc(nome);
    const n = norm(nome);
    const i = n.length === nome.length ? n.indexOf(q) : -1;
    return i < 0 ? esc(nome) : `${esc(nome.slice(0, i))}<mark>${esc(nome.slice(i, i + q.length))}</mark>${esc(nome.slice(i + q.length))}`;
  }

  // começa com todas as categorias que tiveram movimento no mês
  function selecaoInicial(cats) {
    const sel = new Map();
    cats.filter(c => c.qtd > 0).forEach(c => sel.set(c.id, new Set(c.subs.map(s => s.id))));
    return sel;
  }

  const ehPadrao = (cats, sel) => {
    const com = cats.filter(c => c.qtd > 0);
    return com.length > 0 && sel.size === com.length && com.every(c => sel.has(c.id) && sel.get(c.id).size === c.subs.length);
  };

  /* A última escolha (categorias e nível de lançamentos) fica na conta, nas preferências, e vale nas duas
     janelas. Se a escolha era a padrão, guarda só o nível: assim o padrão acompanha cada período. */
  const CHAVE_PREF = 'relatorioCategorias';
  async function lerEscolha(cats, sel) {
    let salvo = null;
    try { salvo = (await GS.api.obterPreferencias())[CHAVE_PREF] || null; } catch (e) { /* sem preferências: usa o padrão */ }
    const nivel = salvo && ['nenhum', 'maiores', 'todos'].includes(salvo.nivel) ? salvo.nivel : 'todos';
    if (salvo && salvo.sel) {
      const lembradas = new Map();
      Object.entries(salvo.sel).forEach(([id, subs]) => {
        const c = cats.find(x => x.id === id);
        if (!c) return;
        const ids = new Set((subs || []).filter(sid => c.subs.some(x => x.id === sid)));
        if (!c.subs.length || ids.size) lembradas.set(id, ids);
      });
      if (lembradas.size) { sel.clear(); lembradas.forEach((v, k) => sel.set(k, v)); }
    }
    return nivel;
  }
  function guardarEscolha(cats, sel, nivel) {
    const valor = { nivel, sel: ehPadrao(cats, sel) ? null : Object.fromEntries([...sel].map(([id, subs]) => [id, [...subs]])) };
    GS.api.salvarPreferencia(CHAVE_PREF, valor).catch(() => { /* só uma lembrança: não atrapalha o relatório */ });
  }

  // "Lançamentos de cada categoria: Nenhum · Os 10 maiores · Todos"
  function criarNiveis(valor, aoMudar) {
    const el = GS.el('div', 'rc-niveis');
    el.setAttribute('role', 'radiogroup');
    el.setAttribute('aria-label', 'Lançamentos de cada categoria');
    el.innerHTML = [['nenhum', 'Nenhum'], ['maiores', `Os ${LIMITE_MAIORES} maiores`], ['todos', 'Todos']].map(([id, nome]) =>
      `<button type="button" role="radio" data-nivel="${id}" aria-checked="${id === valor}">${nome}</button>`).join('');
    let atual = valor;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-nivel]');
      if (!b || b.dataset.nivel === atual) return;
      atual = b.dataset.nivel;
      el.querySelectorAll('[data-nivel]').forEach(x => x.setAttribute('aria-checked', x.dataset.nivel === atual));
      aoMudar(atual);
    });
    return { el, valor: () => atual };
  }

  function resumoHtml(ctx, per, cats, sel) {
    const escolhidas = cats.filter(c => sel.has(c.id));
    if (!escolhidas.length) return 'Escolha pelo menos uma categoria.';
    const lancs = escolhidas.reduce((n, c) => n + montarDados(ctx, per, cats, new Map([[c.id, sel.get(c.id)]])).secoes[0].lancamentos.length, 0);
    const parciais = escolhidas.filter(c => c.subs.length && sel.get(c.id).size < c.subs.length).length;
    return `<b>${GS.plural(escolhidas.length, 'categoria', 'categorias')}</b>${parciais ? ` · ${parciais === 1 ? '1 com' : `${parciais} com`} subcategorias de fora` : ''} · ${GS.plural(lancs, 'lançamento', 'lançamentos')}`;
  }

  function linhaCategoria(c, sel, abertas, q) {
    const marcadas = sel.get(c.id);
    const todas = c.subs.length ? c.subs.map(s => s.id) : [];
    const estado = !marcadas ? 'nao' : (!c.subs.length || todas.every(id => marcadas.has(id))) ? 'sim' : 'meio';
    // pesquisando, a categoria abre sozinha quando o que combina é uma subcategoria
    const achouSub = !!q && c.subs.some(s => norm(s.nome).includes(q));
    const aberta = abertas.has(c.id) || achouSub;
    const subs = c.subs.length && aberta ? `<div class="rc-subs">${c.subs.map(s => `
        <label class="rc-sub"><input type="checkbox" data-sub="${esc(c.id)}" data-id="${esc(s.id)}" ${marcadas && marcadas.has(s.id) ? 'checked' : ''}>
          <span class="rel-caixa">${icone('check')}</span><span class="nome">${destaque(s.nome, q)}</span><span class="valor">${s.total ? moeda(s.total) : '—'}</span></label>`).join('')}</div>` : '';
    return `
      <div class="rc-cat ${estado}">
        <label class="rc-linha"><input type="checkbox" data-cat="${esc(c.id)}" ${estado !== 'nao' ? 'checked' : ''}>
          <span class="rel-caixa ${estado === 'meio' ? 'meio' : ''}">${estado === 'meio' ? icone('traco') : icone('check')}</span>
          <span class="nome">${destaque(c.nome, q)}</span><span class="valor">${c.total ? moeda(c.total) : '—'}</span></label>
        ${c.subs.length ? `<button type="button" class="rc-seta ${aberta ? 'aberta' : ''}" data-abrir="${esc(c.id)}" aria-expanded="${aberta}" aria-label="${aberta ? 'Esconder' : 'Ver'} subcategorias de ${esc(c.nome)}">${icone('chevron-down')}</button>` : '<span class="rc-seta vazia"></span>'}
      </div>${subs}`;
  }

  /* A linha "Todas as categorias · Escolher quais" e, escondida atrás dela, a lista com pesquisa.
     `sel` é alterado aqui dentro; `aoMudar` roda depois de cada mudança. */
  function criarEscolha({ cats, sel, resumo, aoMudar }) {
    const el = GS.el('div', 'rc-escolha');
    el.innerHTML = `
      <p class="rc-frase"><span data-frase></span><button type="button" class="link-btn rc-alternar" data-alternar aria-expanded="false"><span>Escolher quais</span>${icone('chevron-down')}</button><span class="rc-padrao hidden" data-padrao-lugar> · <button type="button" class="link-btn" data-padrao>Voltar ao padrão</button></span></p>
      <div class="rc-painel hidden" data-painel>
        <div class="input rc-busca">${icone('search')}<input type="search" data-busca placeholder="Pesquisar categoria ou subcategoria" autocomplete="off" aria-label="Pesquisar categoria ou subcategoria"></div>
        <div class="rc-topo"><span class="rc-quem" data-quem></span>
          <span><button type="button" class="link-btn" data-todas>Marcar todas</button> · <button type="button" class="link-btn" data-limpar>Limpar</button></span></div>
        <div class="rc-arvore" data-arvore></div>
      </div>
      <p class="rc-resumo" data-resumo></p>`;
    const $ = s => el.querySelector(s);
    const abertas = new Set();
    let q = '';

    const visiveis = () => !q ? cats : cats.filter(c => norm(c.nome).includes(q) || c.subs.some(s => norm(s.nome).includes(q)));

    const desenharArvore = () => {
      const lista = visiveis();
      $('[data-quem]').textContent = q ? 'Resultados da pesquisa' : 'Categorias';
      if (!lista.length) { $('[data-arvore]').innerHTML = `<p class="rc-nada">Nada encontrado para “${esc($('[data-busca]').value.trim())}”.</p>`; return; }
      $('[data-arvore]').innerHTML = [['despesa', 'Gastos'], ['receita', 'Receitas']].map(([tipo, rotulo]) => {
        const l = lista.filter(c => c.tipo === tipo);
        return l.length ? `<div class="rc-grupo">${rotulo}</div>${l.map(c => linhaCategoria(c, sel, abertas, q)).join('')}` : '';
      }).join('');
    };
    const atualizar = () => {
      const padrao = ehPadrao(cats, sel);
      $('[data-frase]').textContent = !sel.size ? 'Nenhuma categoria · '
        : padrao ? 'Todas com movimento · '
        : `${GS.plural(sel.size, 'categoria', 'categorias')} · `;
      $('[data-padrao-lugar]').classList.toggle('hidden', padrao);
      $('[data-resumo]').innerHTML = resumo();
    };
    const mudou = () => { desenharArvore(); atualizar(); aoMudar(); };

    $('[data-alternar]').addEventListener('click', () => {
      const botao = $('[data-alternar]');
      const abrir = botao.getAttribute('aria-expanded') !== 'true';
      botao.setAttribute('aria-expanded', abrir);
      botao.firstElementChild.textContent = abrir ? 'Esconder' : 'Escolher quais';
      botao.classList.toggle('aberto', abrir);
      $('[data-painel]').classList.toggle('hidden', !abrir);
      if (abrir) $('[data-busca]').focus();
    });
    $('[data-busca]').addEventListener('input', e => { q = norm(e.target.value.trim()); desenharArvore(); });
    const arvore = $('[data-arvore]');
    arvore.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.cat) {
        const c = cats.find(x => x.id === t.dataset.cat);
        if (t.checked) sel.set(c.id, new Set(c.subs.map(s => s.id))); else sel.delete(c.id);
      } else if (t.dataset.sub) {
        const c = cats.find(x => x.id === t.dataset.sub);
        const set = sel.get(c.id) || new Set();
        t.checked ? set.add(t.dataset.id) : set.delete(t.dataset.id);
        set.size ? sel.set(c.id, set) : sel.delete(c.id);
      }
      mudou();
    });
    arvore.addEventListener('click', e => {
      const b = e.target.closest('[data-abrir]');
      if (!b) return;
      abertas.has(b.dataset.abrir) ? abertas.delete(b.dataset.abrir) : abertas.add(b.dataset.abrir);
      desenharArvore();
    });
    $('[data-padrao]').addEventListener('click', () => { sel.clear(); selecaoInicial(cats).forEach((v, k) => sel.set(k, v)); mudou(); });
    // com uma pesquisa na tela, "Marcar todas" e "Limpar" valem só para o que está na lista
    $('[data-todas]').addEventListener('click', () => { visiveis().forEach(c => sel.set(c.id, new Set(c.subs.map(s => s.id)))); mudou(); });
    $('[data-limpar]').addEventListener('click', () => { visiveis().forEach(c => sel.delete(c.id)); mudou(); });

    desenharArvore();
    atualizar();
    return { el, atualizar };
  }

  /* ---------- No relatório do Painel (js/relatorio.js) ---------- */

  // devolve a escolha e as folhas que entram no fim do relatório do Painel, para o período que está na tela
  async function detalhe(ctx, info, aoMudar) {
    const per = periodoDoPainel(info);
    const cats = montarCategorias(ctx, per);
    const sel = selecaoInicial(cats);
    let nivel = await lerEscolha(cats, sel);
    const mudou = () => { guardarEscolha(cats, sel, nivel); aoMudar(); };
    const escolha = criarEscolha({ cats, sel, resumo: () => resumoHtml(ctx, per, cats, sel), aoMudar: mudou });
    const niveis = criarNiveis(nivel, v => { nivel = v; mudou(); });
    const el = GS.el('div', 'rc-detalhe');
    el.append(escolha.el);
    el.insertAdjacentHTML('beforeend', '<p class="rc-nivel-rotulo">Lançamentos de cada categoria</p>');
    el.append(niveis.el);
    const opcoes = op => ({ evolucao: true, nivel, comparar: !!op.comparar });
    return {
      el,
      nota: per.nota,
      vazio: !cats.length,
      temEscolha: () => sel.size > 0,
      contar: op => folhasDe(montarDados(ctx, per, cats, sel), opcoes(op), { embutido: true, inicioN: 1, total: 1 }).length,
      folhas: (op, inicioN, total) => folhasDe(montarDados(ctx, per, cats, sel), opcoes(op), { embutido: true, inicioN, total }).join(''),
    };
  }

  /* ---------- Janela ---------- */

  async function abrir(mes) {
    const ctx = await GS.carregarTudo();
    const per = periodoDoMes(mes);
    const cats = montarCategorias(ctx, per);
    if (!cats.length) { GS.toast('Cadastre uma categoria para gerar o relatório.', 'erro'); return; }
    const sel = selecaoInicial(cats);
    const op = { evolucao: true, nivel: await lerEscolha(cats, sel), comparar: false };
    const arquivo = `GSCASH - Categorias - ${nomeMes(mes)} ${mes.slice(0, 4)}`;

    const corpo = GS.el('div', 'rel-corpo');
    corpo.innerHTML = `
      <div class="rel-ops">
        <div>
          <span class="field-label">Período</span>
          <div class="rel-periodo"><strong>${esc(GS.mesAnoDeIso(mes))}</strong><small>o mesmo da tela Categorias</small></div>
        </div>
        <div>
          <span class="field-label">Categorias</span>
          <div data-escolha></div>
        </div>
        <div>
          <span class="field-label">Incluir</span>
          ${opcaoHtml('evolucao', 'Evolução mês a mês', `Barras dos últimos ${MESES_GRAFICO} meses de cada categoria.`)}
          ${opcaoHtml('comparar', 'Comparar com o mês anterior', 'Mostra quanto subiu ou desceu.', { marcada: false })}
          <p class="rc-nivel-rotulo">Lançamentos de cada categoria</p>
          <div data-niveis></div>
        </div>
        <div>
          <span class="field-label">${GS.noDesktop ? 'Será salvo em' : 'Como salvar'}</span>
          <div class="rel-destino"><b data-paginas></b> · ${GS.noDesktop
            ? `Documentos › GSCASH › Relatórios<br><b>${esc(arquivo)}.pdf</b>`
            : 'Abre a janela de impressão: escolha <b>Salvar como PDF</b>.'}</div>
        </div>
      </div>
      <div class="rel-previa" aria-label="Prévia do relatório"></div>`;

    const previa = corpo.querySelector('.rel-previa');
    let modal = null;

    const pintar = () => {
      const tem = sel.size > 0;
      previa.innerHTML = tem ? montarFolhas(montarDados(ctx, per, cats, sel), op) : '<p class="rc-vazio">Escolha uma categoria para ver a prévia.</p>';
      const n = previa.querySelectorAll('.folha').length;
      corpo.querySelector('[data-paginas]').textContent = n ? GS.plural(n, 'página', 'páginas') : 'Sem páginas';
      const botao = modal && modal.foot.querySelector('[data-salvar]');
      if (botao) botao.disabled = !tem;
    };
    const escolha = criarEscolha({ cats, sel, resumo: () => resumoHtml(ctx, per, cats, sel), aoMudar: () => { guardarEscolha(cats, sel, op.nivel); pintar(); } });
    corpo.querySelector('[data-escolha]').append(escolha.el);
    corpo.querySelector('[data-niveis]').append(criarNiveis(op.nivel, v => { op.nivel = v; guardarEscolha(cats, sel, v); pintar(); }).el);
    corpo.querySelectorAll('[data-opcao]').forEach(c => c.addEventListener('change', () => { op[c.dataset.opcao] = c.checked; pintar(); }));

    modal = GS.abrirModal({
      titulo: 'Relatório por categoria',
      corpo,
      tamanho: 'rel rel-cat',
      rodape: `<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
               <button type="button" class="btn btn-primary" data-salvar>${icone('download')}Salvar PDF</button>`,
    });
    pintar();

    const botao = modal.foot.querySelector('[data-salvar]');
    botao.addEventListener('click', async () => {
      botao.disabled = true;
      botao.innerHTML = `${icone('download')}Salvando…`;
      const r = await salvar(montarFolhas(montarDados(ctx, per, cats, sel), op), arquivo);
      botao.disabled = false;
      botao.innerHTML = `${icone('download')}Salvar PDF`;
      if (r.ok) {
        modal.fechar();
        if (r.caminho) avisoSalvo(r.caminho);
      } else if (r.erro) {
        GS.toast(r.erro, 'erro');
      }
    });
  }

  GS.relatorioCategorias = { abrir, detalhe, _teste: { montarCategorias, montarDados, montarFolhas } };
})();
