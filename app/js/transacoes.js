/* =========================================================
   GSCASH — Transações
   Aceita filtros pela URL: ?categoria=ID&carteira=ID&mes=AAAA-MM
   (categoria aceita o id de uma categoria ou de uma subcategoria)
   ========================================================= */

(function () {
  const { esc, widgets } = GS;
  const $ = id => document.getElementById(id);
  const POR_PAGINA = 8;

  const url = new URLSearchParams(location.search);
  const estado = {
    busca: '',
    categoria: url.get('categoria') || 'todas',
    carteira: url.get('carteira') || 'todas',
    mes: url.get('mes') || (url.has('categoria') || url.has('carteira') ? 'todos' : GS.isoMes(GS.hoje())),
    limite: POR_PAGINA,
  };

  let ctx = null;

  /* ---------- Filtros ---------- */

  const aoFiltrar = campo => valor => {
    estado[campo] = valor;
    estado.limite = POR_PAGINA;
    atualizarUrl();
    contarFiltros();
    desenharLista();
  };

  const filtroCategoria = GS.criarSelect({ valor: estado.categoria, aoMudar: aoFiltrar('categoria'), rotuloAria: 'Filtrar por categoria', busca: true });
  const filtroCarteira = GS.criarSelect({ valor: estado.carteira, aoMudar: aoFiltrar('carteira'), rotuloAria: 'Filtrar por carteira' });
  const filtroMes = GS.criarSelect({ valor: estado.mes, aoMudar: aoFiltrar('mes'), rotuloAria: 'Filtrar por mês' });
  $('filtroCategoria').append(filtroCategoria.el);
  $('filtroCarteira').append(filtroCarteira.el);
  $('filtroMes').append(filtroMes.el);

  // celular: só a busca fica à mostra; categoria, carteira e mês ficam atrás de "Filtros"
  // (o número diz quantos estão ligados). No computador o botão não aparece.
  const secaoFiltros = document.querySelector('.filters');
  const botaoFiltros = GS.el('button', 'btn btn-outline filtros-btn', `${GS.icone('filtro')}Filtros<span class="n" hidden></span>`);
  botaoFiltros.type = 'button';
  botaoFiltros.setAttribute('aria-expanded', 'false');
  secaoFiltros.querySelector('.filter-search').after(botaoFiltros);
  botaoFiltros.addEventListener('click', () => {
    botaoFiltros.setAttribute('aria-expanded', String(secaoFiltros.classList.toggle('abertos')));
  });
  function contarFiltros() {
    const n = [estado.categoria !== 'todas', estado.carteira !== 'todas', estado.mes !== GS.isoMes(GS.hoje())].filter(Boolean).length;
    const selo = botaoFiltros.querySelector('.n');
    selo.textContent = n;
    selo.hidden = !n;
  }

  $('busca').addEventListener('input', e => {
    estado.busca = e.target.value;
    estado.limite = POR_PAGINA;
    desenharLista();
  });

  function atualizarUrl() {
    const p = new URLSearchParams();
    if (estado.categoria !== 'todas') p.set('categoria', estado.categoria);
    if (estado.carteira !== 'todas') p.set('carteira', estado.carteira);
    if (estado.mes !== GS.isoMes(GS.hoje())) p.set('mes', estado.mes);
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
  }

  function montarOpcoesFiltros() {
    filtroCategoria.definirOpcoes([
      { valor: 'todas', rotulo: 'Todas' },
      ...ctx.categorias.flatMap(c => [
        { valor: c.id, rotulo: c.nome, icone: c.icone },
        ...(c.subcategorias || []).map(s => ({ valor: s.id, rotulo: s.nome, pai: c.nome })),
      ]),
    ], ctx.categoria.has(estado.categoria) || ctx.subcategoria.has(estado.categoria) ? estado.categoria : 'todas');

    filtroCarteira.definirOpcoes([
      { valor: 'todas', rotulo: 'Todas' },
      ...ctx.carteiras.map(c => ({ valor: c.id, rotulo: c.nome, cor: c.cor })),
    ], ctx.carteira.has(estado.carteira) ? estado.carteira : 'todas');

    const meses = new Set(ctx.transacoes.map(t => t.data.slice(0, 7)));
    meses.add(GS.isoMes(GS.hoje()));
    if (estado.mes !== 'todos') meses.add(estado.mes);
    filtroMes.definirOpcoes([
      { valor: 'todos', rotulo: 'Todos os meses' },
      ...[...meses].sort().reverse().map(m => ({ valor: m, rotulo: GS.mesAnoDeIso(m) })),
    ], estado.mes);

    estado.categoria = filtroCategoria.valor;
    estado.carteira = filtroCarteira.valor;
    contarFiltros();
  }

  /* ---------- Lista ---------- */

  function filtrar() {
    const termo = GS.normalizar(estado.busca.trim());
    // busca por valor: "R$ 1.234,5", "1.234,5 €", "$1,234.5" -> "1234.5" (a vírgula e o ponto dependem da moeda)
    const decimal = GS.numero(0).includes(',') ? ',' : '.';
    const termoValor = estado.busca.trim().replace(/R\$|US\$|[$€¥\s]/g, '')
      .split(decimal === ',' ? '.' : ',').join('').replace(decimal, '.');

    return ctx.transacoes.filter(t => {
      if (estado.categoria !== 'todas' && t.categoriaId !== estado.categoria && t.subcategoriaId !== estado.categoria) return false;
      if (estado.carteira !== 'todas' && t.carteiraId !== estado.carteira && t.cartaoId !== estado.carteira && t.destinoId !== estado.carteira) return false;
      if (estado.mes !== 'todos' && !t.data.startsWith(estado.mes)) return false;
      if (!termo) return true;
      const cat = ctx.categoria.get(t.categoriaId);
      const sub = ctx.subcategoria.get(t.subcategoriaId);
      const texto = GS.normalizar(`${t.titulo} ${t.descricao} ${cat ? cat.nome : ''} ${sub ? sub.nome : ''}`);
      if (texto.includes(termo)) return true;
      return termoValor !== '' && !isNaN(termoValor) && (t.valor / 100).toFixed(2).startsWith(termoValor);
    });
  }

  function desenharLista() {
    const filtradas = GS.calc.ordenarRecentes(filtrar());
    const visiveis = filtradas.slice(0, estado.limite);

    // resumo do cabeçalho
    const despesas = filtradas.filter(t => t.tipo === 'despesa');
    const receitas = filtradas.filter(t => t.tipo === 'receita');
    let resumo = `${GS.plural(filtradas.length, 'transação', 'transações')} · ${GS.moeda(GS.calc.somar(despesas))}`;
    if (receitas.length) resumo += ` · +${GS.moeda(GS.calc.somar(receitas))} em receitas`;
    $('resumo').textContent = resumo;

    if (!filtradas.length) {
      const temFiltro = estado.busca || estado.categoria !== 'todas' || estado.carteira !== 'todas';
      const nenhuma = !ctx.transacoes.some(t => t.tipo === 'despesa' || t.tipo === 'receita');
      if (nenhuma && !temFiltro && GS.importar && !GS.somenteLeitura) {
        $('lista').innerHTML = `
          <div class="vazio-importar">
            <span class="ic">${GS.icone('subir')}</span>
            <strong>Nenhuma transação ainda</strong>
            <p>Lance um gasto agora ou traga tudo de uma vez: extrato do banco (OFX, CSV ou PDF), fatura do cartão ou sua planilha.</p>
            <div class="acoes">
              <button type="button" class="btn btn-outline" data-vazio-importar>${GS.icone('subir')}Importar extrato ou planilha</button>
              <button type="button" class="btn btn-primary" data-vazio-novo>${GS.icone('plus')}Novo gasto</button>
            </div>
          </div>`;
        $('lista').querySelector('[data-vazio-importar]').addEventListener('click', () => GS.importar.abrir());
        $('lista').querySelector('[data-vazio-novo]').addEventListener('click', () => GS.abrirFormTransacao());
        $('rodapeLista').innerHTML = '';
        return;
      }
      $('lista').innerHTML = widgets.vazio(
        'Nenhuma transação encontrada',
        temFiltro ? 'Tente mudar os filtros ou a busca.' : 'Registre um gasto pelo botão "Novo gasto".'
      );
      $('rodapeLista').innerHTML = '';
      return;
    }

    // agrupa por dia (o total do dia considera todas as transações daquele dia no filtro)
    const totalDia = new Map();
    // pagamentos de fatura e transferências não contam como gasto do dia
    filtradas.forEach(t => {
      if (t.tipo === 'pagamento' || t.tipo === 'transferencia') return;
      totalDia.set(t.data, (totalDia.get(t.data) || 0) + (t.tipo === 'receita' ? -t.valor : t.valor));
    });

    let html = '';
    let diaAtual = null;
    visiveis.forEach(t => {
      if (t.data !== diaAtual) {
        if (diaAtual) html += '</ul>';
        diaAtual = t.data;
        const total = totalDia.get(t.data);
        html += `
          <div class="day-head">
            <span>${GS.dataLonga(t.data)}</span>
            <span class="num ${total < 0 ? 'income' : ''}">${total === undefined ? '' : `${total < 0 ? '+' : ''}${GS.moeda(Math.abs(total))}`}</span>
          </div>
          <ul class="tx-list">`;
      }
      html += widgets.linhaTransacao(t, ctx, { comAcoes: true });
    });
    html += '</ul>';
    $('lista').innerHTML = html;

    $('rodapeLista').innerHTML = `
      <span class="muted">Mostrando ${visiveis.length} de ${filtradas.length}</span>
      ${visiveis.length < filtradas.length ? '<button type="button" class="btn btn-outline" id="carregarMais">Carregar mais</button>' : ''}`;
  }

  /* ---------- Ações ---------- */

  $('lista').addEventListener('click', async e => {
    const editar = e.target.closest('[data-editar]');
    const excluir = e.target.closest('[data-excluir]');
    if (editar) {
      const t = ctx.transacoes.find(x => x.id === editar.dataset.editar);
      if (t) GS.abrirFormTransacao(t);
    }
    if (excluir) {
      const t = ctx.transacoes.find(x => x.id === excluir.dataset.excluir);
      if (!t) return;
      // recorrente: escolhe só esta, esta e as próximas, ou todas
      if (t.recorrenciaId && ctx.transacoes.filter(x => x.recorrenciaId === t.recorrenciaId).length > 1) {
        const ids = await GS.escolherExclusaoRecorrente(t, ctx.transacoes);
        if (!ids) return;
        try {
          await GS.api.excluirTransacoes(ids);
        } catch (err) {
          return GS.toast(err.message, 'erro');
        }
        GS.avisarExclusao(ids.length === 1 ? 'Transação excluída' : `${ids.length} transações excluídas`);
        return GS.notificarMudanca();
      }
      const ok = await GS.confirmar({
        titulo: t.tipo === 'pagamento' ? 'Desfazer pagamento?' : t.tipo === 'transferencia' ? 'Excluir transferência?' : t.tipo === 'receita' ? 'Excluir receita?' : 'Excluir gasto?',
        mensagem: t.tipo === 'pagamento'
          ? `O pagamento <strong>${esc(t.titulo)}</strong> (${GS.moeda(t.valor)}) será removido e a fatura volta a ficar em aberto.`
          : t.tipo === 'transferencia'
          ? `A transferência de ${GS.moeda(t.valor)} (${GS.dataMedia(t.data)}) será removida e o valor volta para a carteira de origem.`
          : `<strong>${esc(t.titulo)}</strong> (${GS.moeda(t.valor)}, ${GS.dataMedia(t.data)}) será removida.`,
        botao: t.tipo === 'pagamento' ? 'Desfazer' : 'Excluir',
      });
      if (!ok) return;
      try {
        await GS.api.excluirTransacao(t.id);
      } catch (err) {
        return GS.toast(err.message, 'erro');
      }
      GS.avisarExclusao(t.tipo === 'pagamento' ? 'Pagamento desfeito' : t.tipo === 'transferencia' ? 'Transferência excluída' : t.tipo === 'receita' ? 'Receita excluída' : 'Gasto excluído');
      GS.notificarMudanca();
    }
  });

  $('rodapeLista').addEventListener('click', e => {
    if (e.target.id !== 'carregarMais') return;
    estado.limite += POR_PAGINA;
    desenharLista();
  });

  async function desenhar() {
    ctx = await GS.carregarTudo();
    montarOpcoesFiltros();
    desenharLista();
  }

  GS.iniciarPagina('transacoes', desenhar);
})();
