/* =========================================================
   GSCASH — Faturas
   URL: ?cartao=ID abre o cartão · ?configurar=1 abre a
   configuração · ?configurar=ID abre o crédito da carteira
   ========================================================= */

(function () {
  const { icone, esc, widgets } = GS;
  const $ = id => document.getElementById(id);

  const url = new URLSearchParams(location.search);
  const estado = { cartaoId: url.get('cartao'), chave: null };
  let ctx = null;

  const nomeMes = chave => GS.mesAnoDeIso(chave).split(' ')[0].toLowerCase();
  const COR_STATUS = { aberta: 'info', fechada: 'alerta', paga: 'ok', vencida: 'erro', futura: 'neutro' };
  const badge = status => `<span class="selo ${COR_STATUS[status]}">${GS.faturas.STATUS[status]}</span>`;

  /* ---------- Desenho ---------- */

  async function desenhar() {
    ctx = await GS.carregarTudo();
    const cartoes = GS.faturas.cartoes(ctx.carteiras);

    if (!cartoes.length) {
      $('cartoes').innerHTML = '';
      $('conteudo').innerHTML = `
        <section class="card">
          ${widgets.vazio('Nenhum cartão de crédito ainda', 'Ligue o crédito em uma carteira para acompanhar as faturas.')}
          <div style="display:flex;justify-content:center;padding-bottom:12px">
            <button type="button" class="btn btn-primary" data-acao="configurar">${icone('card')}Configurar crédito</button>
          </div>
        </section>`;
      return;
    }

    const cartao = cartoes.find(c => c.id === estado.cartaoId) || cartoes[0];
    estado.cartaoId = cartao.id;
    const faturas = GS.faturas.listar(cartao, ctx.transacoes);

    // fatura padrão: a mais antiga que precisa ser paga; senão, a aberta
    if (!faturas.some(f => f.chave === estado.chave)) {
      const pendentes = faturas.filter(f => f.status === 'fechada' || f.status === 'vencida');
      estado.chave = (pendentes.pop() || faturas.find(f => f.atual)).chave;
    }
    const fatura = faturas.find(f => f.chave === estado.chave);

    $('cartoes').innerHTML = cartoes.map(c => {
      const atual = GS.faturas.listar(c, ctx.transacoes).find(f => f.atual);
      const ativo = c.id === cartao.id;
      return `
        <button type="button" class="card-pill ${ativo ? 'on' : ''}" role="tab" aria-selected="${ativo}" data-cartao="${c.id}">
          <span class="dot" style="background:${c.cor}"></span>${esc(c.nome)} <small class="num">${GS.moeda(atual.restante)}</small>
        </button>`;
    }).join('');

    $('conteudo').innerHTML = `
      <div class="fat-grid">
        ${hero(cartao, faturas, fatura)}
        <section class="card">
          <div class="card-head"><h2 class="card-title">Faturas</h2><span class="card-sub">${esc(cartao.nome)}</span></div>
          <ul class="fat-lista">${faturas.slice(0, 14).map(f => itemLista(f, fatura)).join('')}</ul>
        </section>
      </div>
      ${lancamentos(fatura)}`;
  }

  function hero(cartao, faturas, f) {
    const hoje = GS.hoje();
    const i = faturas.indexOf(f);
    const usado = faturas.reduce((s, x) => s + x.restante, 0);
    const limite = cartao.credito.limite;

    const dias = GS.diasEntre(hoje, f.fechamento);
    const fecha = hoje <= f.fechamento
      ? `<small>Fecha em</small><strong>${GS.dataCurta(f.fechamento)} · ${dias === 0 ? 'hoje' : `em ${GS.plural(dias, 'dia', 'dias')}`}</strong>`
      : `<small>Fechou em</small><strong>${GS.dataCurta(f.fechamento)}</strong>`;
    const vence = f.status === 'paga' && f.pagaEm
      ? `<small>Paga em</small><strong>${GS.dataCurta(f.pagaEm)}</strong>`
      : `<small>${hoje > f.vencimento ? 'Venceu em' : 'Vence em'}</small><strong>${GS.dataCurta(f.vencimento)}</strong>`;

    const pagoParcial = f.pago > 0 && f.restante > 0
      ? `<p class="fat-pago num">Pago ${GS.moeda(f.pago)} · falta <strong>${GS.moeda(f.restante)}</strong></p>` : '';

    let acoes = '';
    if (f.status === 'paga' || (f.status === 'aberta' && f.total > 0 && f.restante === 0)) {
      acoes = `<button type="button" class="btn btn-outline" data-acao="desfazer">Desfazer pagamento</button>`;
    } else if (f.status === 'fechada' || f.status === 'vencida') {
      acoes = `<button type="button" class="btn btn-primary btn-pagar" data-acao="pagar">${icone('check')}Pagar fatura</button>`;
    } else if (f.status === 'aberta') {
      acoes = (f.restante > 0 ? `<button type="button" class="btn btn-primary btn-pagar" data-acao="pagar">${icone('check')}Pagar fatura</button>` : '')
        + `<button type="button" class="btn btn-outline" data-acao="adiantar">Adiantar pagamento</button>`;
    } else {
      acoes = `<button type="button" class="btn btn-outline" data-acao="adiantar">Adiantar pagamento</button>`;
    }

    return `
      <section class="card fat-hero">
        <div class="fat-hero-top">
          <h2>Fatura de ${nomeMes(f.chave)} ${badge(f.status)}</h2>
          <div class="period-nav fat-setas">
            <button type="button" class="nav-arrow" data-ir="${i + 1}" ${i + 1 >= faturas.length ? 'disabled' : ''} aria-label="Fatura anterior">${icone('chevron-left')}</button>
            <button type="button" class="nav-arrow" data-ir="${i - 1}" ${i === 0 ? 'disabled' : ''} aria-label="Próxima fatura">${icone('chevron-right')}</button>
          </div>
        </div>
        <p class="label">Total da fatura</p>
        <p class="big-value num" style="margin-top:0">${GS.moeda(f.total)}</p>
        ${pagoParcial}
        <div class="fat-datas">
          <div><span class="tile">${icone('clock')}</span><div>${fecha}</div></div>
          <div><span class="tile">${icone('calendar')}</span><div>${vence}</div></div>
        </div>
        ${limite ? `
        <div class="fat-limite">
          <div class="fat-limite-line"><span>Limite usado</span><span class="num"><strong>${GS.moeda(usado)}</strong> de ${GS.moeda(limite)}</span></div>
          <div class="bar"><span class="${usado / limite >= 0.9 ? 'danger' : ''}" style="width:${Math.min(100, (usado / limite) * 100)}%"></span></div>
          <div class="fat-limite-line"><span class="muted">Inclui parcelas futuras</span><span class="muted num">Disponível ${GS.moeda(Math.max(0, limite - usado))}</span></div>
        </div>` : ''}
        <div class="fat-acoes">${acoes}</div>
      </section>`;
  }

  function itemLista(f, selecionada) {
    let sub;
    if (f.status === 'paga') sub = f.pagaEm ? `paga em ${GS.dataCurta(f.pagaEm)}` : 'paga';
    else if (f.status === 'vencida') sub = `venceu ${GS.dataCurta(f.vencimento)}`;
    else sub = `vence ${GS.dataCurta(f.vencimento)}`;
    return `
      <li class="${f === selecionada ? 'on' : ''}">
        <button type="button" data-chave="${f.chave}" aria-current="${f === selecionada}">
          <span class="mes">${GS.mesAnoDeIso(f.chave)}<small>${sub}</small></span>
          ${badge(f.status)}
          <span class="v num">${GS.moeda(f.total)}</span>
        </button>
      </li>`;
  }

  function lancamentos(f) {
    const linhas = f.itens.map(it => widgets.linhaTransacao(it.transacao, ctx, {
      comData: true,
      comAcoes: true,
      naFatura: true,
      comDescricao: true,
      valor: it.valor,
      parcela: it.total > 1 ? `${it.n}/${it.total}` : null,
    })).join('') + f.pagamentos.map(p => widgets.linhaTransacao(p, ctx, { comData: true, comAcoes: true, naFatura: true, comDescricao: true })).join('');

    return `
      <section class="card tx-card">
        <div class="card-head" style="margin:18px 0 6px">
          <h2 class="card-title">Transações da fatura</h2>
          <span class="card-sub">${GS.plural(f.itens.length, 'transação', 'transações')}</span>
        </div>
        ${linhas ? `<ul class="tx-list">${linhas}</ul>` : widgets.vazio('Nenhuma compra nesta fatura', 'Compras no crédito deste cartão aparecem aqui.')}
      </section>`;
  }

  /* ---------- Pagamento ---------- */

  function abrirPagamento(cartao, f, adiantar) {
    const corpo = GS.el('div', '');
    corpo.style.display = 'contents';
    corpo.innerHTML = `
      <p>${f.restante > 0 ? `Falta pagar <strong class="num">${GS.moeda(f.restante)}</strong> desta fatura.` : 'Esta fatura ainda não tem valor em aberto.'}</p>
      <div class="field">
        <label for="pgValor">Valor</label>
        <div class="input money"><span class="prefix">R$</span><input id="pgValor" placeholder="0,00" autofocus></div>
      </div>
      <div class="field"><span class="field-label">Data do pagamento</span><div data-slot="data"></div></div>
      <div class="field"><span class="field-label">Pagar com</span><div data-slot="conta"></div></div>
      <p class="field-hint">O valor sai do saldo da conta escolhida.</p>`;

    const modal = GS.abrirModal({
      titulo: adiantar ? 'Adiantar pagamento' : `Pagar fatura de ${nomeMes(f.chave)}`,
      corpo,
      rodape: `<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
               <button type="button" class="btn btn-primary" data-salvar>${icone('check')}Confirmar pagamento</button>`,
    });

    const valor = GS.campoMoeda(corpo.querySelector('#pgValor'), adiantar ? 0 : f.restante);
    const data = GS.campoData(GS.isoData(GS.hoje()));
    corpo.querySelector('[data-slot="data"]').append(data.el);
    const conta = GS.criarSelect({
      opcoes: ctx.carteiras.map(c => ({ valor: c.id, rotulo: c.nome, cor: c.cor })),
      valor: cartao.credito.pagarComId && ctx.carteira.has(cartao.credito.pagarComId) ? cartao.credito.pagarComId : cartao.id,
      rotuloAria: 'Pagar com',
    });
    corpo.querySelector('[data-slot="conta"]').append(conta.el);

    modal.foot.querySelector('[data-salvar]').addEventListener('click', async ev => {
      const botao = ev.currentTarget;
      GS.salvando(botao, true);
      try {
        await GS.api.pagarFatura({ cartaoId: cartao.id, fatura: f.chave, valor: valor.valor, data: data.valor, contaId: conta.valor });
        modal.fechar();
        GS.toast('Pagamento registrado');
        GS.notificarMudanca();
      } catch (e) {
        GS.toast(e.message, 'erro');
        GS.salvando(botao, false);
      }
    });
  }

  /* ---------- Configuração do crédito ---------- */

  function abrirConfiguracao() {
    const corpo = GS.el('div', '');
    corpo.style.display = 'contents';
    corpo.innerHTML = `<p>Escolha quais carteiras também funcionam como cartão de crédito.</p><ul class="cfg-lista"></ul>`;
    const lista = corpo.querySelector('ul');

    const modal = GS.abrirModal({
      titulo: 'Configurar crédito',
      corpo,
      tamanho: 'md',
      rodapeClasse: 'even',
      rodape: `<span></span><button type="button" class="btn btn-primary" data-fechar>Concluir</button>`,
      aoFechar: GS.notificarMudanca,
    });

    async function pintar() {
      const carteiras = await GS.api.listarCarteiras();
      lista.innerHTML = carteiras.map(c => {
        const ativo = GS.faturas.temCredito(c);
        const tipo = GS.TIPOS_CARTEIRA[c.tipo] || GS.TIPOS_CARTEIRA.corrente;
        const resumo = ativo
          ? `Fecha dia ${c.credito.diaFechamento} · vence dia ${c.credito.diaVencimento}${c.credito.limite ? ` · limite ${GS.moedaInteira(c.credito.limite)}` : ''}`
          : 'Crédito desligado';
        return `
          <li class="${ativo ? '' : 'off'}">
            ${widgets.tileTingido(c.cor, tipo.icone)}
            <div class="row-body" style="flex:1"><div class="row-title">${esc(c.nome)}</div><small>${resumo}</small></div>
            ${ativo ? `<button type="button" class="icon-btn" data-editar-credito="${c.id}" aria-label="Editar crédito de ${esc(c.nome)}">${icone('pencil')}</button>` : ''}
            <button type="button" class="switch ${ativo ? 'on' : ''}" role="switch" aria-checked="${ativo}" data-switch="${c.id}" aria-label="Crédito em ${esc(c.nome)}"></button>
          </li>`;
      }).join('');
    }

    lista.addEventListener('click', async e => {
      const editar = e.target.closest('[data-editar-credito]');
      const chave = e.target.closest('[data-switch]');
      const carteiras = await GS.api.listarCarteiras();
      if (editar) abrirCredito(carteiras.find(c => c.id === editar.dataset.editarCredito), pintar);
      if (chave) {
        const c = carteiras.find(x => x.id === chave.dataset.switch);
        if (GS.faturas.temCredito(c)) {
          try {
            await GS.api.configurarCredito(c.id, { ativo: false });
            GS.toast(`Crédito desligado em ${c.nome}`);
            pintar();
          } catch (err) {
            GS.toast(err.message, 'erro');
          }
        } else {
          abrirCredito(c, pintar);
        }
      }
    });

    pintar();
    return modal;
  }

  function abrirCredito(carteira, aoSalvar) {
    const atual = carteira.credito || {};
    const dias = Array.from({ length: 31 }, (_, i) => ({ valor: i + 1, rotulo: `Dia ${i + 1}` }));

    const corpo = GS.el('div', '');
    corpo.style.display = 'contents';
    corpo.innerHTML = `
      <div class="field">
        <label for="crLimite">Limite</label>
        <div class="input money"><span class="prefix">R$</span><input id="crLimite" placeholder="0,00" autofocus></div>
      </div>
      <div class="row-2">
        <div class="field"><span class="field-label">Dia de fechamento</span><div data-slot="fech"></div></div>
        <div class="field"><span class="field-label">Dia de vencimento</span><div data-slot="venc"></div></div>
      </div>
      <div class="field">
        <span class="field-label">Como fica o ciclo</span>
        <div class="ciclo"><div class="ciclo-bar"><span data-ciclo-hoje></span></div></div>
        <div class="ciclo-leg"><span data-ciclo-ini></span><span data-ciclo-fim></span></div>
        <p class="field-hint" data-ciclo-texto></p>
      </div>
      <div class="field"><span class="field-label">Pagar a fatura com</span><div data-slot="conta"></div></div>`;

    const modal = GS.abrirModal({
      titulo: `Crédito · ${carteira.nome}`,
      corpo,
      rodape: `<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
               <button type="button" class="btn btn-primary" data-salvar>${icone('check')}Salvar</button>`,
    });

    const limite = GS.campoMoeda(corpo.querySelector('#crLimite'), atual.limite || 0);
    const fech = GS.criarSelect({ opcoes: dias.map(d => ({ ...d, icone: 'clock' })), valor: atual.diaFechamento || 25, aoMudar: ciclo, rotuloAria: 'Dia de fechamento' });
    const venc = GS.criarSelect({ opcoes: dias.map(d => ({ ...d, icone: 'calendar' })), valor: atual.diaVencimento || 5, aoMudar: ciclo, rotuloAria: 'Dia de vencimento' });
    corpo.querySelector('[data-slot="fech"]').append(fech.el);
    corpo.querySelector('[data-slot="venc"]').append(venc.el);

    GS.api.listarCarteiras().then(carteiras => {
      const conta = GS.criarSelect({
        opcoes: carteiras.map(c => ({ valor: c.id, rotulo: c.nome, cor: c.cor })),
        valor: atual.pagarComId && carteiras.some(c => c.id === atual.pagarComId) ? atual.pagarComId : carteira.id,
        rotuloAria: 'Pagar a fatura com',
      });
      corpo.querySelector('[data-slot="conta"]').append(conta.el);
      modal.conta = conta;
    });

    function ciclo() {
      const teste = { credito: { diaFechamento: fech.valor, diaVencimento: venc.valor } };
      const hoje = GS.hoje();
      const chave = GS.faturas.cicloDe(teste, GS.isoData(hoje));
      const d = GS.faturas.datas(teste, chave);
      const total = GS.diasEntre(d.inicio, d.fechamento) + 1;
      const passou = GS.diasEntre(d.inicio, hoje) + 1;
      corpo.querySelector('[data-ciclo-hoje]').style.width = `${Math.min(100, (passou / total) * 100)}%`;
      corpo.querySelector('[data-ciclo-ini]').textContent = GS.dataCurta(d.inicio);
      corpo.querySelector('[data-ciclo-fim]').textContent = `fecha ${GS.dataCurta(d.fechamento)}`;
      const proximoDia = fech.valor >= 31 ? 1 : fech.valor + 1;
      corpo.querySelector('[data-ciclo-texto]').textContent =
        `Compras de ${GS.dataCurta(d.inicio)} a ${GS.dataCurta(d.fechamento)} entram na fatura de ${nomeMes(chave)}, que vence em ${GS.dataMedia(d.vencimento)}. ` +
        `A partir do dia ${proximoDia}, vão para a fatura seguinte.`;
    }
    ciclo();

    modal.foot.querySelector('[data-salvar]').addEventListener('click', async ev => {
      const botao = ev.currentTarget;
      GS.salvando(botao, true);
      try {
        await GS.api.configurarCredito(carteira.id, {
          limite: limite.valor,
          diaFechamento: fech.valor,
          diaVencimento: venc.valor,
          pagarComId: modal.conta ? modal.conta.valor : carteira.id,
        });
        modal.fechar();
        GS.toast(`Crédito de ${carteira.nome} salvo`);
        if (aoSalvar) aoSalvar();
        else GS.notificarMudanca();
      } catch (e) {
        GS.toast(e.message, 'erro');
        GS.salvando(botao, false);
      }
    });
  }

  /* ---------- Eventos ---------- */

  $('configurar').addEventListener('click', abrirConfiguracao);

  $('cartoes').addEventListener('click', e => {
    const b = e.target.closest('[data-cartao]');
    if (!b) return;
    estado.cartaoId = b.dataset.cartao;
    estado.chave = null;
    history.replaceState(null, '', `${location.pathname}?cartao=${encodeURIComponent(estado.cartaoId)}`);
    desenhar();
  });

  $('conteudo').addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.acao === 'configurar') return abrirConfiguracao();

    const cartao = ctx.carteira.get(estado.cartaoId);
    const faturas = cartao ? GS.faturas.listar(cartao, ctx.transacoes) : [];
    const f = faturas.find(x => x.chave === estado.chave);

    if (b.dataset.chave) { estado.chave = b.dataset.chave; return desenhar(); }
    if (b.dataset.ir !== undefined && faturas[Number(b.dataset.ir)]) { estado.chave = faturas[Number(b.dataset.ir)].chave; return desenhar(); }
    if (b.dataset.acao === 'pagar') return abrirPagamento(cartao, f, false);
    if (b.dataset.acao === 'adiantar') return abrirPagamento(cartao, f, true);
    if (b.dataset.acao === 'desfazer') {
      const ok = await GS.confirmar({
        titulo: 'Desfazer pagamento?',
        mensagem: `Os pagamentos da fatura de ${nomeMes(f.chave)} serão removidos e o valor volta para a conta que pagou.`,
        botao: 'Desfazer',
      });
      if (!ok) return;
      try {
        await GS.api.desfazerPagamentos(cartao.id, f.chave);
      } catch (err) {
        return GS.toast(err.message, 'erro');
      }
      GS.avisarExclusao('Pagamento desfeito');
      return GS.notificarMudanca();
    }

    const editar = b.dataset.editar && ctx.transacoes.find(t => t.id === b.dataset.editar);
    if (editar) return GS.abrirFormTransacao(editar);

    const excluir = b.dataset.excluir && ctx.transacoes.find(t => t.id === b.dataset.excluir);
    if (excluir && excluir.recorrenciaId && ctx.transacoes.filter(x => x.recorrenciaId === excluir.recorrenciaId).length > 1) {
      const ids = await GS.escolherExclusaoRecorrente(excluir, ctx.transacoes);
      if (!ids) return;
      try {
        await GS.api.excluirTransacoes(ids);
      } catch (err) {
        return GS.toast(err.message, 'erro');
      }
      GS.avisarExclusao(ids.length === 1 ? 'Compra excluída' : `${ids.length} compras excluídas`);
      return GS.notificarMudanca();
    }
    if (excluir) {
      const pagamento = excluir.tipo === 'pagamento';
      const ok = await GS.confirmar({
        titulo: pagamento ? 'Desfazer pagamento?' : 'Excluir compra?',
        mensagem: pagamento
          ? `O pagamento de ${GS.moeda(excluir.valor)} será removido.`
          : `<strong>${esc(excluir.titulo)}</strong> será removida${excluir.parcelas > 1 ? `, com todas as ${excluir.parcelas} parcelas` : ''}.`,
        botao: pagamento ? 'Desfazer' : 'Excluir',
      });
      if (!ok) return;
      try {
        await GS.api.excluirTransacao(excluir.id);
      } catch (err) {
        return GS.toast(err.message, 'erro');
      }
      GS.avisarExclusao(pagamento ? 'Pagamento desfeito' : 'Compra excluída');
      GS.notificarMudanca();
    }
  });

  GS.iniciarPagina('faturas', desenhar);

  // atalhos pela URL
  const configurar = url.get('configurar');
  if (configurar) {
    GS.api.listarCarteiras().then(carteiras => {
      const alvo = carteiras.find(c => c.id === configurar);
      if (alvo) abrirCredito(alvo);
      else abrirConfiguracao();
    });
  }
})();
