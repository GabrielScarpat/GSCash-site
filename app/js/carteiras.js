/* =========================================================
   GSCASH — Carteiras
   ========================================================= */

(function () {
  const { icone, esc, widgets } = GS;
  const $ = id => document.getElementById(id);

  let ctx = null;
  let mostrarOcultas = false;  // chave "Mostrar ocultas" (volta a desligar ao recarregar a página)

  /* ---------- Desenho ---------- */

  async function desenhar() {
    ctx = await GS.carregarTudo();
    const saldos = new Map(ctx.carteiras.map(c => [c.id, GS.calc.saldoCarteira(c, ctx.transacoes)]));
    const ocultas = ctx.carteiras.filter(c => c.oculta);
    if (!ocultas.length) mostrarOcultas = false;
    // com "Mostrar ocultas" ligado, a lista e o total passam a incluir todas as carteiras
    const lista = mostrarOcultas ? ctx.carteiras : GS.calc.visiveis(ctx.carteiras);
    const total = lista.reduce((s, c) => s + saldos.get(c.id), 0);
    const qtdOcultas = GS.plural(ocultas.length, 'oculta', 'ocultas');

    $('chaveOcultas').classList.toggle('hidden', !ocultas.length);
    $('mostrarOcultas').classList.toggle('on', mostrarOcultas);
    $('mostrarOcultas').setAttribute('aria-checked', mostrarOcultas);

    $('saldoRotulo').textContent = mostrarOcultas ? 'Saldo total de todas as carteiras' : 'Saldo total em carteiras';
    $('saldoTotal').textContent = GS.moeda(total);
    $('qtdCarteiras').textContent = GS.plural(lista.length, 'carteira', 'carteiras')
      + (!ocultas.length ? '' : mostrarOcultas ? ` · inclui ${qtdOcultas}` : ` · ${qtdOcultas}`);

    // distribuição: só carteiras com saldo positivo
    const positivas = lista.filter(c => saldos.get(c.id) > 0);
    const somaPositivas = positivas.reduce((s, c) => s + saldos.get(c.id), 0);
    $('barraCarteiras').innerHTML = positivas.map(c =>
      `<span style="flex-grow:${saldos.get(c.id)};background:${c.cor}" title="${esc(c.nome)}: ${GS.moeda(saldos.get(c.id))}"></span>`).join('');
    $('barraCarteiras').classList.toggle('hidden', !positivas.length);
    $('legendaCarteiras').innerHTML = positivas.map(c => `
      <li><span class="sq" style="background:${c.cor}"></span>${esc(c.nome)}<span class="muted num">${GS.pct(saldos.get(c.id), somaPositivas)}</span></li>`).join('');

    // quanto ficou de fora do total
    const fora = !mostrarOcultas && ocultas.length > 0;
    $('foraTotal').classList.toggle('hidden', !fora);
    $('foraTotal').innerHTML = fora
      ? `${icone('eye-off')}Fora do total: <b>${ocultas.map(c => esc(c.nome)).join(', ')}</b> · <span class="num">${GS.moeda(ocultas.reduce((s, c) => s + saldos.get(c.id), 0))}</span>`
      : '';

    let vazio = '';
    if (!ctx.carteiras.length) vazio = widgets.vazio('Nenhuma carteira cadastrada', 'Crie uma carteira para começar a registrar seus gastos.');
    else if (!lista.length) vazio = widgets.vazio('Todas as carteiras estão ocultas', 'Ligue "Mostrar ocultas" para vê-las.');
    $('carteiras').innerHTML = vazio
      ? `<div class="card">${vazio}</div>`
      : lista.map(c => cartao(c, saldos.get(c.id))).join('');
  }

  // bloco "Crédito" das carteiras com cartão ligado
  function blocoCredito(c) {
    if (!GS.faturas.temCredito(c)) return '';
    const faturas = GS.faturas.listar(c, ctx.transacoes);
    const atual = faturas.find(f => f.atual);
    const usado = faturas.reduce((s, f) => s + f.restante, 0);
    const limite = c.credito.limite;
    const uso = limite ? usado / limite : 0;
    const mes = GS.mesAnoDeIso(atual.chave).split(' ')[0].toLowerCase();
    return `
      <a class="invoice" href="faturas.html?cartao=${encodeURIComponent(c.id)}">
        <div class="invoice-line"><span class="invoice-title">${icone('card')}Crédito · fatura de ${mes}</span><strong class="num">${GS.moeda(atual.restante)}</strong></div>
        ${limite ? `<div class="bar"><span class="${uso >= 0.9 ? 'danger' : ''}" style="width:${Math.min(100, uso * 100)}%"></span></div>` : ''}
        <div class="invoice-line"><span>Fecha em ${GS.dataCurta(atual.fechamento)}</span>${limite ? `<span class="num">${GS.moeda(usado)} / ${GS.moeda(limite)}</span>` : ''}</div>
      </a>`;
  }

  function cartao(c, saldo) {
    const tipo = GS.TIPOS_CARTEIRA[c.tipo] || GS.TIPOS_CARTEIRA.corrente;
    const detalhe = blocoCredito(c);

    return `
      <article class="card wallet ${c.oculta ? 'oculta' : ''}">
        <header class="wallet-head">
          ${widgets.tileTingido(c.cor, tipo.icone, 'lg')}
          <div class="wallet-id">
            <h2 class="wallet-name">${esc(c.nome)}</h2>
            <p class="wallet-type">${tipo.nome}${c.oculta ? '<span class="selo neutro">Oculta</span>' : ''}</p>
          </div>
          <button type="button" class="icon-btn kebab" data-menu="${c.id}" aria-label="Opções de ${esc(c.nome)}">${icone('more')}</button>
        </header>
        <p class="label wallet-label">Saldo disponível</p>
        <p class="wallet-value num ${saldo < 0 ? 'negative' : ''}">${GS.moeda(saldo)}</p>
        <p class="wallet-initial">
          Saldo inicial: <span class="num">${GS.moeda(c.saldoInicial || 0)}</span>
          <button type="button" class="link-btn" data-saldo="${c.id}" aria-label="Alterar saldo inicial de ${esc(c.nome)}">Alterar</button>
        </p>
        ${detalhe}
        <a class="btn btn-outline btn-block wallet-btn" href="transacoes.html?carteira=${encodeURIComponent(c.id)}">
          Ver transações${icone('chevron-right')}
        </a>
      </article>`;
  }

  /* ---------- Formulário (js/carteira-form.js) ---------- */

  const abrirForm = (cart = null) => GS.abrirFormCarteira(cart, { quantas: ctx.carteiras.length });

  /* ---------- Saldo inicial ---------- */

  function abrirSaldoInicial(cart) {
    const movimentos = GS.calc.saldoCarteira({ ...cart, saldoInicial: 0 }, ctx.transacoes);

    const corpo = GS.el('div', '');
    corpo.style.display = 'contents';
    corpo.innerHTML = `
      <p>Quanto havia em <strong>${esc(cart.nome)}</strong> antes da primeira transação no GSCASH.</p>
      <div class="field">
        <label for="saldoIni">Saldo inicial</label>
        <div class="input money"><span class="prefix">R$</span><input id="saldoIni" placeholder="0,00" autofocus></div>
      </div>
      <p class="field-hint" data-previa></p>`;

    const modal = GS.abrirModal({
      titulo: 'Saldo inicial',
      corpo,
      tamanho: 'sm',
      rodapeClasse: 'even',
      rodape: `<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
               <button type="button" class="btn btn-primary" data-salvar>${icone('check')}Salvar</button>`,
    });

    const campo = GS.campoMoeda(corpo.querySelector('#saldoIni'), Math.max(0, cart.saldoInicial || 0));
    const inicial = () => campo.valor;
    const previa = () => {
      corpo.querySelector('[data-previa]').innerHTML =
        `Saldo disponível ficará em <strong class="num">${GS.moeda(inicial() + movimentos)}</strong>.`;
    };
    corpo.querySelector('#saldoIni').addEventListener('input', previa);
    previa();

    const salvar = async () => {
      const botao = modal.foot.querySelector('[data-salvar]');
      GS.salvando(botao, true);
      try {
        await GS.api.atualizarCarteira(cart.id, { ...cart, saldoInicial: inicial() });
        modal.fechar();
        GS.toast('Saldo inicial atualizado');
        GS.notificarMudanca();
      } catch (err) {
        GS.toast(err.message, 'erro');
        GS.salvando(botao, false);
      }
    };
    modal.foot.querySelector('[data-salvar]').addEventListener('click', salvar);
    corpo.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') salvar(); });
  }

  /* ---------- Eventos ---------- */

  $('novaCarteira').addEventListener('click', () => abrirForm());

  $('mostrarOcultas').addEventListener('click', () => {
    mostrarOcultas = !mostrarOcultas;
    desenhar();
  });

  async function alternarOculta(cart) {
    try {
      await GS.api.atualizarCarteira(cart.id, { ...cart, oculta: !cart.oculta });
      GS.toast(cart.oculta ? 'Carteira visível de novo' : 'Carteira ocultada');
      GS.notificarMudanca();
    } catch (err) {
      GS.toast(err.message, 'erro');
    }
  }

  $('carteiras').addEventListener('click', e => {
    const s = e.target.closest('[data-saldo]');
    if (s) return abrirSaldoInicial(ctx.carteira.get(s.dataset.saldo));
    const b = e.target.closest('[data-menu]');
    if (!b) return;
    const cart = ctx.carteira.get(b.dataset.menu);
    GS.abrirMenu(b, [
      { rotulo: 'Novo gasto aqui', icone: 'plus', escrita: true, acao: () => GS.abrirFormTransacao(null, { carteiraId: cart.id }) },
      { rotulo: 'Transferir daqui', icone: 'transfer', escrita: true, acao: () => GS.abrirFormTransferencia(null, { origemId: cart.id }) },
      { rotulo: 'Saldo inicial', icone: 'wallet', escrita: true, acao: () => abrirSaldoInicial(cart) },
      {
        rotulo: cart.oculta ? 'Mostrar carteira' : 'Ocultar carteira',
        icone: cart.oculta ? 'eye' : 'eye-off',
        escrita: true,
        acao: () => alternarOculta(cart),
      },
      {
        rotulo: GS.faturas.temCredito(cart) ? 'Ver fatura' : 'Ativar crédito',
        icone: 'card',
        escrita: !GS.faturas.temCredito(cart),
        acao: () => {
          const id = encodeURIComponent(cart.id);
          location.href = GS.faturas.temCredito(cart) ? `faturas.html?cartao=${id}` : `faturas.html?configurar=${id}`;
        },
      },
      { rotulo: 'Editar', icone: 'pencil', escrita: true, acao: () => abrirForm(cart) },
      {
        rotulo: 'Excluir', icone: 'trash', perigo: true, escrita: true, acao: async () => {
          const usadas = ctx.transacoes.filter(t => t.carteiraId === cart.id).length;
          if (usadas) {
            return GS.toast(`Não dá para excluir: ${GS.plural(usadas, 'transação usa', 'transações usam')} esta carteira.`, 'erro');
          }
          const ok = await GS.confirmar({ titulo: 'Excluir carteira?', mensagem: `A carteira <strong>${esc(cart.nome)}</strong> será removida.` });
          if (!ok) return;
          try {
            await GS.api.excluirCarteira(cart.id);
            GS.avisarExclusao('Carteira excluída');
            GS.notificarMudanca();
          } catch (err) {
            GS.toast(err.message, 'erro');
          }
        },
      },
    ]);
  });

  GS.iniciarPagina('carteiras', desenhar);
})();
