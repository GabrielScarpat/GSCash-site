/* =========================================================
   GSCASH — relatório por categoria em PDF (Categorias › Relatório)

   A pessoa escolhe categorias e subcategorias; cada categoria vira uma seção
   (total, evolução de 6 meses, subcategorias e lançamentos). O período é o mês
   que está na tela Categorias. A janela, a prévia, o A4 e o salvar são os do
   relatório do Painel (js/relatorio.js).
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const { icone, esc } = GS;
  const { salvar, avisoSalvo, opcaoHtml, comparar, nomeAnterior, rodapeFolha, marca, moeda, pct } = GS.relatorio._comum;

  const SEM_SUB = '__sem';           // lançamentos da categoria que não têm subcategoria
  const MESES_GRAFICO = 6;
  // alturas aproximadas (px) para repartir o conteúdo nas folhas A4 (a folha tem 1123 px)
  const ORCAMENTO_1 = 640;           // primeira folha: cabeçalho e resumo ocupam uma parte
  const ORCAMENTO_N = 830;
  const H = { cabecalho: 46, grafico: 104, tabHead: 30, tabLinha: 29, tabFim: 38, linhaLanc: 29, lancExtra: 15, espaco: 22 };

  const nomeMes = iso => GS.mesAnoDeIso(iso).split(' ')[0];

  /* ---------- Dados ---------- */

  const mesesAte = (mesIso, n) => {
    const [a, m] = mesIso.split('-').map(Number);
    return Array.from({ length: n }, (_, i) => GS.isoMes(new Date(a, m - 1 - (n - 1 - i), 1)));
  };
  const fimDoMes = mesIso => { const [a, m] = mesIso.split('-').map(Number); return GS.isoData(new Date(a, m, 0)); };

  // por categoria: o que existe (subcategorias com valor) para a lista de escolha
  function montarCategorias(ctx, mes) {
    const ini = `${mes}-01`, fim = fimDoMes(mes);
    const janela = mesesAte(mes, MESES_GRAFICO);
    const desde = `${janela[0]}-01`;
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
      return { id: c.id, nome: c.nome, tipo, total: GS.calc.somar(doMes), qtd: doMes.length, subs };
    }).sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'despesa' ? -1 : 1) || b.total - a.total || a.nome.localeCompare(b.nome));
  }

  const dentro = (sel, cat, t) => {
    const subs = sel.get(cat.id);
    if (!subs) return false;
    if (!cat.subs.length) return true;
    const sid = cat.subs.some(s => s.id === t.subcategoriaId) ? t.subcategoriaId : SEM_SUB;
    return subs.has(sid);
  };

  function montarDados(ctx, mes, cats, sel) {
    const ini = `${mes}-01`, fim = fimDoMes(mes);
    const janela = mesesAte(mes, MESES_GRAFICO);
    const [a, m] = mes.split('-').map(Number);
    const antes = GS.isoMes(new Date(a, m - 2, 1));
    const doMesTodas = ctx.transacoes.filter(t => t.data >= ini && t.data <= fim);
    const saiuMes = GS.calc.somar(doMesTodas.filter(t => t.tipo === 'despesa'));
    const entrouMes = GS.calc.somar(doMesTodas.filter(t => t.tipo === 'receita'));

    const secoes = cats.filter(c => sel.has(c.id)).map(c => {
      const todas = ctx.transacoes.filter(t => t.tipo === c.tipo && t.categoriaId === c.id && dentro(sel, c, t));
      const mesLanc = todas.filter(t => t.data >= ini && t.data <= fim).sort((x, y) => x.data.localeCompare(y.data) || (x.criadoEm || 0) - (y.criadoEm || 0));
      const total = GS.calc.somar(mesLanc);
      const anterior = GS.calc.somar(todas.filter(t => t.data.slice(0, 7) === antes));
      const barras = janela.map(j => ({ mes: j, total: GS.calc.somar(todas.filter(t => t.data.slice(0, 7) === j)) }));
      const escolhidas = sel.get(c.id);
      const subs = c.subs.filter(s => escolhidas.has(s.id)).map(s => ({
        ...s, total: GS.calc.somar(mesLanc.filter(t => (c.subs.some(x => x.id === t.subcategoriaId) ? t.subcategoriaId : SEM_SUB) === s.id)),
      })).sort((x, y) => y.total - x.total);
      return { cat: c, total, anterior, barras, subs, lancamentos: mesLanc, parcial: c.subs.length ? `${escolhidas.size} de ${c.subs.length} subcategorias` : '' };
    });
    return { mes, secoes, saiuMes, entrouMes, antes };
  }

  /* ---------- Folhas ---------- */

  function montarFolhas(d, op) {
    const lancTotal = d.secoes.reduce((s, x) => s + x.lancamentos.length, 0);
    const saiu = d.secoes.filter(s => s.cat.tipo === 'despesa').reduce((s, x) => s + x.total, 0);
    const entrou = d.secoes.filter(s => s.cat.tipo === 'receita').reduce((s, x) => s + x.total, 0);
    const hoje = GS.hoje();
    const titulo = `${nomeMes(d.mes)} de ${d.mes.slice(0, 4)}`;
    const [a, m] = d.mes.split('-').map(Number);
    const nome = nomeAnterior('mes', { inicio: new Date(a, m - 2, 1) });

    /* itens: blocos inteiros ou linhas de tabela (que podem passar para a folha seguinte) */
    const itens = [];
    d.secoes.forEach(s => {
      const c = s.cat;
      const base = c.tipo === 'despesa' ? d.saiuMes : d.entrouMes;
      const cmp = op.comparar ? comparar(s.total, s.anterior, nome, c.tipo === 'receita') : null;
      const maior = Math.max(...s.barras.map(b => b.total), 1);
      const grafico = op.evolucao ? `
        <div class="f-mini-grafico">${s.barras.map((b, i) => `<i class="${i === s.barras.length - 1 ? 'atual' : ''}" style="height:${Math.max(b.total ? 6 : 0, (b.total / maior) * 100)}%" title="${esc(moeda(b.total))}"></i>`).join('')}</div>
        <div class="f-mini-leg">${s.barras.map(b => `<span>${nomeMes(b.mes).slice(0, 3)}</span>`).join('')}</div>` : '';
      itens.push({
        h: H.espaco + H.cabecalho + (op.evolucao ? H.grafico : 0),
        html: `<div class="f-cat"><h3>${esc(c.nome)}${s.parcial ? ` <em>${s.parcial}</em>` : ''}
          <span>${moeda(s.total)}${base ? ` · ${pct(s.total, base)}% ${c.tipo === 'despesa' ? 'do que saiu' : 'do que entrou'}` : ''}${cmp && cmp.texto ? ` · <b class="${cmp.classe}">${cmp.texto}</b>` : ''}</span></h3>${grafico}</div>`,
      });
      if (!s.lancamentos.length) {
        itens.push({ h: H.tabLinha, html: '<p class="f-vazio">Sem lançamentos neste mês.</p>' });
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
      if (op.lista) {
        const comSub = c.subs.length > 0;
        const grupo = `l${c.id}`;
        s.lancamentos.forEach(t => {
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
    let atual = [], usado = 0, limite = ORCAMENTO_1;
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

    const total = paginas.length;
    return paginas.map((lista, n) => `
      <article class="folha">
        ${n === 0 ? `
        <div class="f-head">${marca}<div class="f-tit"><small>Relatório por categoria</small><strong>${esc(titulo)}</strong><span>${GS.mesAnoDeIso(d.mes)} · gerado em ${GS.dataMedia(hoje)}</span></div></div>
        <div class="f-kpis">
          <div class="f-kpi"><small><i class="saiu"></i>Saiu (categorias escolhidas)</small><strong>${moeda(saiu)}</strong><span>${d.saiuMes ? `${pct(saiu, d.saiuMes)}% do que saiu no mês` : ''}</span></div>
          <div class="f-kpi"><small><i class="entrou"></i>Entrou (categorias escolhidas)</small><strong>${moeda(entrou)}</strong><span>${d.entrouMes ? `${pct(entrou, d.entrouMes)}% do que entrou no mês` : ''}</span></div>
          <div class="f-kpi"><small>Lançamentos</small><strong>${lancTotal}</strong><span>${GS.plural(d.secoes.length, 'categoria', 'categorias')}</span></div>
        </div>` : `<div class="f-head p2">${marca}<div class="f-tit"><strong>${esc(titulo)} · por categoria</strong></div></div>`}
        <div class="f-sec">${corpoDe(lista)}</div>
        ${rodapeFolha(n + 1, total)}
      </article>`).join('');
  }

  /* ---------- Janela ---------- */

  function linhaCategoria(c, sel, abertas) {
    const marcadas = sel.get(c.id);
    const todas = c.subs.length ? c.subs.map(s => s.id) : [];
    const estado = !marcadas ? 'nao' : (!c.subs.length || todas.every(id => marcadas.has(id))) ? 'sim' : 'meio';
    const aberta = abertas.has(c.id);
    const subs = c.subs.length && aberta ? `<div class="rc-subs">${c.subs.map(s => `
        <label class="rc-sub"><input type="checkbox" data-sub="${esc(c.id)}" data-id="${esc(s.id)}" ${marcadas && marcadas.has(s.id) ? 'checked' : ''}>
          <span class="rel-caixa">${icone('check')}</span><span class="nome">${esc(s.nome)}</span><span class="valor">${s.total ? moeda(s.total) : '—'}</span></label>`).join('')}</div>` : '';
    return `
      <div class="rc-cat ${estado}">
        <label class="rc-linha"><input type="checkbox" data-cat="${esc(c.id)}" ${estado !== 'nao' ? 'checked' : ''}>
          <span class="rel-caixa ${estado === 'meio' ? 'meio' : ''}">${estado === 'meio' ? icone('traco') : icone('check')}</span>
          <span class="nome">${esc(c.nome)}</span><span class="valor">${c.total ? moeda(c.total) : '—'}</span></label>
        ${c.subs.length ? `<button type="button" class="rc-seta ${aberta ? 'aberta' : ''}" data-abrir="${esc(c.id)}" aria-expanded="${aberta}" aria-label="${aberta ? 'Esconder' : 'Ver'} subcategorias de ${esc(c.nome)}">${icone('chevron-down')}</button>` : '<span class="rc-seta vazia"></span>'}
      </div>${subs}`;
  }

  async function abrir(mes) {
    const ctx = await GS.carregarTudo();
    const cats = montarCategorias(ctx, mes);
    if (!cats.length) { GS.toast('Cadastre uma categoria para gerar o relatório.', 'erro'); return; }
    // começa com todas as categorias que tiveram movimento no mês
    const sel = new Map();
    cats.filter(c => c.qtd > 0).forEach(c => sel.set(c.id, new Set(c.subs.map(s => s.id))));
    const abertas = new Set();
    const op = { evolucao: true, lista: true, comparar: false };
    const arquivo = `GSCASH - Categorias - ${nomeMes(mes)} ${mes.slice(0, 4)}`;

    const corpo = GS.el('div', 'rel-corpo');
    corpo.innerHTML = `
      <div class="rel-ops">
        <div>
          <span class="field-label">Período</span>
          <div class="rel-periodo"><strong>${esc(GS.mesAnoDeIso(mes))}</strong><small>o mesmo da tela Categorias</small></div>
        </div>
        <div>
          <div class="rc-topo"><span class="field-label">Categorias</span>
            <span><button type="button" class="link-btn" data-todas>Marcar todas</button> · <button type="button" class="link-btn" data-limpar>Limpar</button></span></div>
          <div class="rc-arvore" data-arvore></div>
          <p class="rc-resumo" data-resumo></p>
        </div>
        <div>
          <span class="field-label">Incluir</span>
          ${opcaoHtml('evolucao', 'Evolução mês a mês', `Barras dos últimos ${MESES_GRAFICO} meses de cada categoria.`)}
          ${opcaoHtml('lista', 'Lista de lançamentos', 'Todos os lançamentos de cada categoria escolhida, com a descrição.')}
          ${opcaoHtml('comparar', 'Comparar com o mês anterior', 'Mostra quanto subiu ou desceu.', { marcada: false })}
        </div>
        <div>
          <span class="field-label">${GS.noDesktop ? 'Será salvo em' : 'Como salvar'}</span>
          <div class="rel-destino">${GS.noDesktop
            ? `Documentos › GSCASH › Relatórios<br><b>${esc(arquivo)}.pdf</b>`
            : 'Abre a janela de impressão: escolha <b>Salvar como PDF</b>.'}</div>
        </div>
      </div>
      <div class="rel-previa" aria-label="Prévia do relatório"></div>`;

    const arvore = corpo.querySelector('[data-arvore]');
    const previa = corpo.querySelector('.rel-previa');
    const resumo = corpo.querySelector('[data-resumo]');
    let modal = null;

    const desenharArvore = () => {
      const grupos = [['despesa', 'Gastos'], ['receita', 'Receitas']];
      arvore.innerHTML = grupos.map(([tipo, rotulo]) => {
        const lista = cats.filter(c => c.tipo === tipo);
        return lista.length ? `<div class="rc-grupo">${rotulo}</div>${lista.map(c => linhaCategoria(c, sel, abertas)).join('')}` : '';
      }).join('');
    };
    const pintar = () => {
      const escolhidas = cats.filter(c => sel.has(c.id));
      const lancs = escolhidas.reduce((n, c) => n + montarDados(ctx, mes, cats, new Map([[c.id, sel.get(c.id)]])).secoes[0].lancamentos.length, 0);
      const parciais = escolhidas.filter(c => c.subs.length && sel.get(c.id).size < c.subs.length).length;
      resumo.innerHTML = escolhidas.length
        ? `<b>${GS.plural(escolhidas.length, 'categoria', 'categorias')}</b>${parciais ? ` · ${parciais === 1 ? '1 com' : `${parciais} com`} subcategorias de fora` : ''} · ${GS.plural(lancs, 'lançamento', 'lançamentos')}`
        : 'Marque pelo menos uma categoria.';
      previa.innerHTML = escolhidas.length ? montarFolhas(montarDados(ctx, mes, cats, sel), op) : '<p class="rc-vazio">Marque uma categoria para ver a prévia.</p>';
      const botao = modal && modal.foot.querySelector('[data-salvar]');
      if (botao) botao.disabled = !escolhidas.length;
    };

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
      desenharArvore(); pintar();
    });
    arvore.addEventListener('click', e => {
      const b = e.target.closest('[data-abrir]');
      if (!b) return;
      abertas.has(b.dataset.abrir) ? abertas.delete(b.dataset.abrir) : abertas.add(b.dataset.abrir);
      desenharArvore();
    });
    corpo.querySelector('[data-todas]').addEventListener('click', () => {
      cats.forEach(c => sel.set(c.id, new Set(c.subs.map(s => s.id)))); desenharArvore(); pintar();
    });
    corpo.querySelector('[data-limpar]').addEventListener('click', () => { sel.clear(); desenharArvore(); pintar(); });
    corpo.querySelectorAll('[data-opcao]').forEach(c => c.addEventListener('change', () => { op[c.dataset.opcao] = c.checked; pintar(); }));

    modal = GS.abrirModal({
      titulo: 'Relatório por categoria',
      corpo,
      tamanho: 'rel rel-cat',
      rodape: `<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
               <button type="button" class="btn btn-primary" data-salvar>${icone('download')}Salvar PDF</button>`,
    });
    desenharArvore();
    pintar();

    const botao = modal.foot.querySelector('[data-salvar]');
    botao.addEventListener('click', async () => {
      botao.disabled = true;
      botao.innerHTML = `${icone('download')}Salvando…`;
      const r = await salvar(montarFolhas(montarDados(ctx, mes, cats, sel), op), arquivo);
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

  GS.relatorioCategorias = { abrir, _teste: { montarCategorias, montarDados, montarFolhas } };
})();
