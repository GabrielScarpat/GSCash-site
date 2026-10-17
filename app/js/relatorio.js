/* =========================================================
   GSCASH — relatório do período em PDF (Painel › Relatório)

   Usa o período que está selecionado no Painel. Monta folhas A4
   (as mesmas na prévia e no PDF) e salva:
   · no app de computador: o Python grava direto em
     Documentos\GSCASH\Relatórios, sem a janela de impressão;
   · no navegador: abre a impressão (Salvar como PDF).
   O CSS de impressão (relatorio.css) imprime só #relatorio-impressao.
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const { icone, esc } = GS;

  // o relatório mostra os valores mesmo com "Ocultar valores" ligado no Painel
  const moeda = GS.moedaVisivel;
  const pct = (parte, total) => (total > 0 ? Math.round((parte / total) * 100) : 0);

  const LINHAS_POR_FOLHA = 30;  // lançamentos por folha na lista
  const MAX_CATEGORIAS = 9;     // o resto vira "Outras categorias"
  const MAX_CARTEIRAS = 5;

  const nomeMes = d => GS.mesAno(d).split(' ')[0];           // "Outubro"
  const diaDeMes = d => `${d.getDate()} de ${nomeMes(d).toLowerCase()}`;  // "31 de outubro"

  // "1 a 31 de outubro", "1 de janeiro a 31 de dezembro", "20 de dez. 2025 a 3 de jan. 2026"
  function intervalo(a, b) {
    if (GS.diasEntre(a, b) === 0) return diaDeMes(a);
    if (a.getFullYear() !== b.getFullYear()) return `${GS.dataMedia(a)} a ${GS.dataMedia(b)}`;
    if (a.getMonth() === b.getMonth()) return `${a.getDate()} a ${diaDeMes(b)}`;
    return `${diaDeMes(a)} a ${diaDeMes(b)}`;
  }

  // como chamar o período anterior nas comparações
  function nomeAnterior(modo, anterior) {
    if (modo === 'mes') { const n = nomeMes(anterior.inicio).toLowerCase(); return { igual: `igual a ${n}`, que: `que ${n}`, em: `em ${n}` }; }
    if (modo === 'ano') { const n = anterior.inicio.getFullYear(); return { igual: `igual a ${n}`, que: `que ${n}`, em: `em ${n}` }; }
    return { igual: 'igual ao período anterior', que: 'que o período anterior', em: 'no período anterior' };
  }

  // "8% a menos que setembro" (verde quando é bom, vermelho quando é ruim)
  function comparar(atual, anterior, nome, maisEhBom) {
    if (!anterior) return atual ? { texto: `sem transações ${nome.em}`, classe: '' } : { texto: '', classe: '' };
    if (atual === anterior) return { texto: nome.igual, classe: '' };
    const mais = atual > anterior;
    const p = Math.max(1, Math.round(Math.abs(atual - anterior) / anterior * 100));
    return { texto: `<b>${p}% a ${mais ? 'mais' : 'menos'}</b> ${nome.que}`, classe: mais === maisEhBom ? 'bom' : 'ruim' };
  }

  // maiores grupos + "Outras" com o que sobrar
  function principais(grupos, max) {
    if (grupos.length <= max) return grupos;
    const resto = grupos.slice(max - 1);
    return [...grupos.slice(0, max - 1), { id: null, outras: resto.length, total: resto.reduce((s, g) => s + g.total, 0) }];
  }

  /* ---------- Dados ---------- */

  function montarDados(ctx, { periodo: p, anterior, modo, rotulo }) {
    const hoje = GS.hoje();
    const hojeIso = GS.isoData(hoje);
    const ini = GS.isoData(p.inicio);
    // como no Painel: só conta o que já aconteceu
    const ateHoje = GS.isoData(p.fim) > hojeIso;
    const fimData = ateHoje ? hoje : p.fim;
    const fim = GS.isoData(fimData);
    const vazio = ini > fim;

    const despesas = vazio ? [] : GS.calc.despesasNoPeriodo(ctx.transacoes, ini, fim);
    const receitas = vazio ? [] : GS.calc.receitasNoPeriodo(ctx.transacoes, ini, fim);
    const saiu = GS.calc.somar(despesas);
    const entrou = GS.calc.somar(receitas);

    const aIni = GS.isoData(anterior.inicio);
    const aFim = GS.isoData(anterior.fim);
    const nome = nomeAnterior(modo, anterior);

    // como no Painel: carteiras ocultas não entram no saldo
    const visiveis = GS.calc.visiveis(ctx.carteiras);
    const ocultas = ctx.carteiras.length - visiveis.length;
    const saldo = visiveis.reduce((s, c) => s + GS.calc.saldoCarteira(c, ctx.transacoes, vazio ? hojeIso : fim), 0);

    // faturas que fecham ou vencem dentro do período
    const cartoes = GS.faturas.cartoes(ctx.carteiras);
    const faturas = cartoes.flatMap(cartao => GS.faturas.listar(cartao, ctx.transacoes, hoje)
      .filter(f => f.total > 0 && ((f.vencimento >= p.inicio && f.vencimento <= p.fim) || (f.fechamento >= p.inicio && f.fechamento <= p.fim)))
      .map(f => ({ ...f, cartao })))
      .sort((a, b) => a.vencimento - b.vencimento || a.cartao.nome.localeCompare(b.cartao.nome));

    const lancamentos = [...despesas, ...receitas]
      .sort((a, b) => a.data.localeCompare(b.data) || (a.criadoEm || 0) - (b.criadoEm || 0));

    const kicker = modo === 'mes' ? 'Relatório do mês' : modo === 'ano' ? 'Relatório do ano' : 'Relatório do período';
    const titulo = modo === 'mes' ? `${nomeMes(p.inicio)} de ${p.inicio.getFullYear()}` : rotulo;
    const arquivo = modo === 'mes' ? `GSCASH - ${nomeMes(p.inicio)} ${p.inicio.getFullYear()}`
      : modo === 'ano' ? `GSCASH - ${p.inicio.getFullYear()}`
      : `GSCASH - ${GS.isoData(p.inicio)} a ${GS.isoData(p.fim)}`;

    return {
      modo, ctx, hoje, ateHoje, vazio, fimData, kicker, titulo, arquivo,
      sub: `${intervalo(p.inicio, vazio ? p.fim : fimData)}${ateHoje && !vazio ? ' (até hoje)' : ''} · gerado em ${GS.dataMedia(hoje)}`,
      tituloCurto: titulo,
      entrou, saiu, saldo, visiveis: visiveis.length, ocultas,
      comparar: {
        entrou: comparar(entrou, GS.calc.somar(GS.calc.receitasNoPeriodo(ctx.transacoes, aIni, aFim)), nome, true),
        saiu: comparar(saiu, GS.calc.somar(GS.calc.despesasNoPeriodo(ctx.transacoes, aIni, aFim)), nome, false),
      },
      categorias: principais(GS.calc.agrupar(despesas, 'categoriaId'), MAX_CATEGORIAS),
      carteiras: principais(GS.calc.agrupar(despesas, 'carteiraId'), MAX_CARTEIRAS),
      maiores: [...despesas].sort((a, b) => b.valor - a.valor).slice(0, 5),
      temCartao: cartoes.length > 0,
      faturas,
      lancamentos,
    };
  }

  /* ---------- Folhas ---------- */

  const marca = '<div class="f-marca"><i></i>GSCASH</div>';

  function rodapeFolha(n, total) {
    return `<div class="f-foot"><span class="f-mini"><i></i>Gerado pelo GSCASH</span><span>Página ${n} de ${total}</span></div>`;
  }

  function folhaResumo(d, op, n, total) {
    const { ctx } = d;
    const sobrou = d.entrou - d.saiu;
    const cmp = c => (op.comparar && c.texto ? `<span class="${c.classe}">${c.texto}</span>` : '');
    const vazioSec = texto => `<p class="f-vazio">${texto}</p>`;

    // gastos por categoria (orçamento é mensal: só aparece no relatório do mês)
    const comOrcamento = d.modo === 'mes';
    const maiorCat = d.categorias[0] ? d.categorias[0].total : 0;
    const linhaCategoria = g => {
      const c = g.outras ? null : ctx.categoria.get(g.id);
      const nomeCat = g.outras ? `Outras categorias (${g.outras})` : (c ? c.nome : 'Sem categoria');
      let orc = '';
      if (comOrcamento && c && c.orcamento > 0) {
        orc = g.total > c.orcamento
          ? `<td class="r f-lim passou">passou ${moeda(g.total - c.orcamento)} do limite</td>`
          : `<td class="r f-lim">${pct(g.total, c.orcamento)}% de ${moeda(c.orcamento)}</td>`;
      } else if (comOrcamento) {
        orc = `<td class="r f-lim">${g.outras ? '' : 'sem limite'}</td>`;
      }
      return `<tr><td>${esc(nomeCat)}</td><td><div class="f-barra"><i style="width:${maiorCat ? (g.total / maiorCat) * 100 : 0}%"></i></div></td>
        <td class="r">${moeda(g.total)}</td><td class="r">${pct(g.total, d.saiu)}%</td>${orc}</tr>`;
    };
    const categorias = d.categorias.length ? `
      <table class="f-tab">
        <thead><tr><th style="width:26%">Categoria</th><th></th><th class="r" style="width:15%">Valor</th><th class="r" style="width:7%">%</th>${comOrcamento ? '<th class="r" style="width:24%">Orçamento</th>' : ''}</tr></thead>
        <tbody>${d.categorias.map(linhaCategoria).join('')}</tbody>
        <tfoot><tr><td>Total</td><td></td><td class="r">${moeda(d.saiu)}</td><td class="r">100%</td>${comOrcamento ? '<td></td>' : ''}</tr></tfoot>
      </table>` : vazioSec('Nenhum gasto neste período.');

    const maiorCart = d.carteiras[0] ? d.carteiras[0].total : 0;
    const carteiras = d.carteiras.length ? `
      <table class="f-tab"><tbody>${d.carteiras.map(g => {
        const c = g.outras ? null : ctx.carteira.get(g.id);
        const nomeC = g.outras ? `Outras (${g.outras})` : (c ? c.nome : 'Carteira removida');
        return `<tr><td style="width:32%">${esc(nomeC)}</td><td><div class="f-barra"><i style="width:${maiorCart ? (g.total / maiorCart) * 100 : 0}%"></i></div></td><td class="r" style="width:36%">${moeda(g.total)}</td></tr>`;
      }).join('')}</tbody></table>` : vazioSec('Nenhum gasto neste período.');

    const maiores = d.maiores.length ? `
      <table class="f-tab"><tbody>${d.maiores.map(t =>
        `<tr><td>${esc(t.titulo)} <span class="f-lim">· ${GS.dataCurta(t.data)}</span></td><td class="r">${moeda(t.valor)}</td></tr>`).join('')}
      </tbody></table>` : vazioSec('Nenhum gasto neste período.');

    const faturas = !op.faturas ? '' : `
      <div class="f-sec">
        <h3>Faturas de cartão <span>que fecham ou vencem no período</span></h3>
        ${d.faturas.length ? `
        <table class="f-tab">
          <thead><tr><th>Cartão</th><th>Fatura</th><th>Fecha</th><th>Vence</th><th class="r">Valor</th><th class="r">Situação</th></tr></thead>
          <tbody>${d.faturas.map(f => `
            <tr><td>${esc(f.cartao.nome)}</td><td>${GS.mesAnoDeIso(f.chave)}</td><td>${GS.dataCurta(f.fechamento)}</td><td>${GS.dataCurta(f.vencimento)}</td>
              <td class="r">${moeda(f.total)}</td><td class="r"><span class="f-selo ${f.status}">${GS.faturas.STATUS[f.status]}</span></td></tr>`).join('')}
          </tbody>
        </table>` : vazioSec('Nenhuma fatura fecha ou vence neste período.')}
      </div>`;

    const saldoTexto = d.ateHoje || d.vazio
      ? `Saldo hoje (${diaDeMes(d.hoje)})`
      : `Saldo em ${diaDeMes(d.fimData)}${d.fimData.getFullYear() !== d.hoje.getFullYear() ? ` de ${d.fimData.getFullYear()}` : ''}`;

    return `
      <article class="folha">
        <div class="f-head">
          ${marca}
          <div class="f-tit"><small>${d.kicker}</small><strong>${esc(d.titulo)}</strong><span>${d.sub}</span></div>
        </div>

        <div class="f-kpis">
          <div class="f-kpi"><small><i class="entrou"></i>Entrou</small><strong>${moeda(d.entrou)}</strong>${cmp(d.comparar.entrou)}</div>
          <div class="f-kpi"><small><i class="saiu"></i>Saiu</small><strong>${moeda(d.saiu)}</strong>${cmp(d.comparar.saiu)}</div>
          <div class="f-kpi"><small><i class="sobrou"></i>${sobrou < 0 ? 'Faltou' : 'Sobrou'}</small>
            <strong class="${sobrou < 0 ? 'ruim' : 'bom'}">${moeda(Math.abs(sobrou))}</strong>
            <span>${d.entrou > 0 ? `${pct(Math.abs(sobrou), d.entrou)}% do que entrou` : ''}</span></div>
        </div>
        <p class="f-saldo">${saldoTexto}: <b>${moeda(d.saldo)}</b> em ${GS.plural(d.visiveis, 'carteira', 'carteiras')}${d.ocultas
          ? ` (${GS.plural(d.ocultas, 'carteira oculta fica', 'carteiras ocultas ficam')} de fora)` : ''}.</p>

        <div class="f-sec">
          <h3>Gastos por categoria <span>% do que saiu${comOrcamento ? ' · limite do orçamento' : ''}</span></h3>
          ${categorias}
        </div>

        <div class="f-2col">
          <div class="f-sec"><h3>Por carteira <span>de onde saiu</span></h3>${carteiras}</div>
          <div class="f-sec"><h3>Maiores gastos</h3>${maiores}</div>
        </div>

        ${faturas}

        ${rodapeFolha(n, total)}
      </article>`;
  }

  function folhasLista(d, inicioN, total) {
    const { ctx } = d;
    const linhas = d.lancamentos.map(t => {
      const receita = t.tipo === 'receita';
      const cat = ctx.categoria.get(t.categoriaId);
      const sub = ctx.subcategoria.get(t.subcategoriaId);
      const cart = ctx.carteira.get(t.carteiraId);
      return `<tr><td>${GS.dataCurta(t.data)}</td><td>${esc(t.titulo)}</td><td>${esc(cat ? cat.nome : 'Sem categoria')}${sub && sub.nome !== t.titulo ? ` › ${esc(sub.nome)}` : ''}</td>
        <td>${esc(cart ? cart.nome : '—')}${t.forma === 'credito' ? ' <span class="f-lim">· crédito</span>' : ''}</td>
        <td class="r ${receita ? 'bom' : 'ruim'}">${receita ? '+' : '−'} ${moeda(t.valor)}</td></tr>`;
    });
    const sobrou = d.entrou - d.saiu;
    const totais = `
      <table class="f-tab f-totais"><tbody>
        <tr><td>Entrou</td><td class="r bom">+ ${moeda(d.entrou)}</td></tr>
        <tr><td>Saiu</td><td class="r ruim">− ${moeda(d.saiu)}</td></tr>
        <tr><td>${sobrou < 0 ? 'Faltou' : 'Sobrou'}</td><td class="r">${moeda(Math.abs(sobrou))}</td></tr>
      </tbody></table>`;

    const blocos = [];
    for (let i = 0; i < linhas.length; i += LINHAS_POR_FOLHA) blocos.push(linhas.slice(i, i + LINHAS_POR_FOLHA));
    // os totais ocupam umas 4 linhas: se não couberem na última folha, vão para uma nova
    const ultimaCheia = blocos.length && blocos[blocos.length - 1].length > LINHAS_POR_FOLHA - 4;

    const folhas = blocos.map((bloco, i) => {
      const ultima = i === blocos.length - 1;
      return `
        <article class="folha">
          <div class="f-head p2">${marca}<div class="f-tit"><strong>${esc(d.tituloCurto)} · transações</strong></div></div>
          <div class="f-sec">
            <table class="f-tab">
              <thead><tr><th style="width:11%">Data</th><th>Descrição</th><th style="width:20%">Categoria</th><th style="width:19%">Carteira</th><th class="r" style="width:17%">Valor</th></tr></thead>
              <tbody>${bloco.join('')}</tbody>
            </table>
            ${ultima && !ultimaCheia ? totais : ''}
          </div>
          ${rodapeFolha(inicioN + i, total)}
        </article>`;
    });
    if (ultimaCheia) {
      folhas.push(`
        <article class="folha">
          <div class="f-head p2">${marca}<div class="f-tit"><strong>${esc(d.tituloCurto)} · transações</strong></div></div>
          <div class="f-sec">${totais}</div>
          ${rodapeFolha(inicioN + folhas.length, total)}
        </article>`);
    }
    return folhas;
  }

  // quantas folhas a lista ocupa (para numerar "Página x de y")
  function contarFolhasLista(d) {
    if (!d.lancamentos.length) return 0;
    const blocos = Math.ceil(d.lancamentos.length / LINHAS_POR_FOLHA);
    const naUltima = d.lancamentos.length - (blocos - 1) * LINHAS_POR_FOLHA;
    return blocos + (naUltima > LINHAS_POR_FOLHA - 4 ? 1 : 0);
  }

  function montarFolhas(d, op) {
    const comLista = op.lista && d.lancamentos.length > 0;
    const total = 1 + (comLista ? contarFolhasLista(d) : 0);
    return folhaResumo(d, op, 1, total) + (comLista ? folhasLista(d, 2, total).join('') : '');
  }

  /* ---------- Janela (prévia e opções) ---------- */

  function opcaoHtml(chave, titulo, texto, { marcada = true, desativada = false } = {}) {
    return `
      <label class="rel-opcao ${desativada ? 'off' : ''}">
        <input type="checkbox" data-opcao="${chave}" ${marcada && !desativada ? 'checked' : ''} ${desativada ? 'disabled' : ''}>
        <span class="rel-caixa">${icone('check')}</span>
        <span><b>${titulo}</b><small>${texto}</small></span>
      </label>`;
  }

  async function abrir(info) {
    const ctx = await GS.carregarTudo();
    const d = montarDados(ctx, info);
    const n = d.lancamentos.length;
    const op = { comparar: true, faturas: d.temCartao, lista: n > 0 };
    const anterior = nomeAnterior(info.modo, info.anterior);

    const corpo = GS.el('div', 'rel-corpo');
    corpo.innerHTML = `
      <div class="rel-ops">
        <div>
          <span class="field-label">Período</span>
          <div class="rel-periodo"><strong>${esc(info.rotulo)}</strong><small>o mesmo selecionado no Painel</small></div>
        </div>
        <div>
          <span class="field-label">Incluir</span>
          ${opcaoHtml('comparar', 'Comparar com o período anterior', `Mostra quanto subiu ou desceu ${anterior.que.replace(/^que /, 'em relação a ').replace('a o período', 'ao período')}.`)}
          ${d.temCartao ? opcaoHtml('faturas', 'Faturas de cartão', 'Faturas que fecham ou vencem no período.') : ''}
          ${opcaoHtml('lista', 'Lista de transações', n ? `Uma página a mais com ${n === 1 ? 'a transação' : `todas as ${n} transações`} do período.` : 'Nenhuma transação neste período.', { desativada: !n })}
        </div>
        <div>
          <span class="field-label">${GS.noDesktop ? 'Será salvo em' : 'Como salvar'}</span>
          <div class="rel-destino">${GS.noDesktop
            ? `Documentos › GSCASH › Relatórios<br><b>${esc(d.arquivo)}.pdf</b>`
            : 'Abre a janela de impressão: escolha <b>Salvar como PDF</b>.'}</div>
        </div>
      </div>
      <div class="rel-previa" aria-label="Prévia do relatório"></div>`;

    const previa = corpo.querySelector('.rel-previa');
    const pintar = () => { previa.innerHTML = montarFolhas(d, op); };
    pintar();
    corpo.querySelectorAll('[data-opcao]').forEach(c => c.addEventListener('change', () => {
      op[c.dataset.opcao] = c.checked;
      pintar();
    }));

    const modal = GS.abrirModal({
      titulo: 'Relatório',
      corpo,
      tamanho: 'rel',
      rodape: `<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
               <button type="button" class="btn btn-primary" data-salvar>${icone('download')}Salvar PDF</button>`,
    });

    const botao = modal.foot.querySelector('[data-salvar]');
    botao.addEventListener('click', async () => {
      botao.disabled = true;
      botao.innerHTML = `${icone('download')}Salvando…`;
      const r = await salvar(montarFolhas(d, op), d.arquivo);
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

  /* ---------- Salvar ---------- */

  async function salvar(folhas, arquivo) {
    document.getElementById('relatorio-impressao')?.remove();
    const area = GS.el('div', '', folhas);
    area.id = 'relatorio-impressao';
    document.body.append(area);
    try {
      if (!GS.noDesktop) {
        window.print();  // o navegador oferece "Salvar como PDF"
        return { ok: true };
      }
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const api = await GS.apiDesktop();
      return await api.salvar_relatorio(arquivo);
    } catch (e) {
      console.error(e);
      return { ok: false, erro: 'Não foi possível salvar o relatório.' };
    } finally {
      area.remove();
    }
  }

  // aviso com "Mostrar na pasta" e "Abrir"
  function avisoSalvo(caminho) {
    document.querySelector('.rel-aviso')?.remove();
    const pasta = caminho.split(/[\\/]/).slice(-3).join('\\');
    const aviso = GS.el('div', 'rel-aviso');
    aviso.setAttribute('role', 'status');
    aviso.innerHTML = `
      <span class="ok">${icone('check')}</span>
      <div>Relatório salvo<small title="${esc(caminho)}">${esc(pasta)}</small></div>
      <button type="button" class="btn btn-fantasma" data-pasta>Mostrar na pasta</button>
      <button type="button" class="btn btn-primary" data-abrir>Abrir</button>
      <button type="button" class="rel-aviso-x" aria-label="Fechar aviso">${icone('x')}</button>`;
    document.body.append(aviso);

    const fechar = () => aviso.remove();
    const tempo = setTimeout(fechar, 12000);
    aviso.querySelector('.rel-aviso-x').addEventListener('click', fechar);
    aviso.querySelector('[data-pasta]').addEventListener('click', async () => {
      (await GS.apiDesktop()).mostrar_relatorio(caminho);
    });
    aviso.querySelector('[data-abrir]').addEventListener('click', async () => {
      clearTimeout(tempo);
      fechar();
      (await GS.apiDesktop()).abrir_relatorio(caminho);
    });
  }

  GS.relatorio = { abrir };
})();
