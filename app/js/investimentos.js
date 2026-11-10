/* =========================================================
   GSCASH — Investimentos (aba Investimentos)
   Cada aplicação é uma carteira do tipo 'investimento' (fora do saldo disponível)
   com o registro de como rende (GS.api.*Investimento). O valor de hoje e o do
   vencimento são estimados pelos índices do Banco Central (js/indices.js).
   ========================================================= */

(function () {
  const { icone, esc } = GS;
  const $ = id => document.getElementById(id);

  // tipos, formas de render e o formulário ficam em js/investimento-form.js (também usado no extrato)
  const { tipoDe, comoRende, pct } = GS.formInvestimento;

  // "1 ano e 4 meses", "3 meses", "12 dias"
  function falta(deIso, ateIso) {
    const de = GS.parseData(deIso), ate = GS.parseData(ateIso);
    let meses = (ate.getFullYear() - de.getFullYear()) * 12 + ate.getMonth() - de.getMonth();
    if (ate.getDate() < de.getDate()) meses--;
    if (meses < 1) return GS.plural(Math.max(1, GS.diasEntre(de, ate)), 'dia', 'dias');
    const anos = Math.floor(meses / 12), resto = meses % 12;
    return [anos && GS.plural(anos, 'ano', 'anos'), resto && GS.plural(resto, 'mês', 'meses')].filter(Boolean).join(' e ');
  }

  let ctx = null;
  let estimativas = new Map();
  let indicesOk = false;

  /* ---------- Desenho ---------- */

  async function desenhar() {
    ctx = await GS.carregarTudo();
    const hojeIso = GS.isoData(GS.hoje());
    const ativos = GS.calc.investimentosAtivos(ctx);

    // índices desde a aplicação mais antiga (ou o último valor informado)
    const datas = ativos.flatMap(c => {
      const inv = ctx.investimento.get(c.id);
      return [inv && inv.valorAtualEm, ...ctx.transacoes.filter(t => t.destinoId === c.id).map(t => t.data)].filter(Boolean);
    });
    try {
      await GS.indices.carregar(datas.sort()[0] || hojeIso);
      indicesOk = true;
    } catch (e) {
      indicesOk = false;
    }

    estimativas = new Map(ativos.map(c => [c.id, GS.indices.estimar(ctx.investimento.get(c.id), c, ctx.transacoes)]));

    // a "Prevista" do vencimento acompanha a estimativa (só grava se mudou)
    let mudou = false;
    for (const c of ativos) {
      const inv = ctx.investimento.get(c.id);
      if (inv && inv.liquidez === 'vencimento' && inv.vencimento > hojeIso && indicesOk) {
        mudou = (await GS.api.preverVencimento(c.id, estimativas.get(c.id).noVencimento).catch(() => false)) || mudou;
      }
    }
    if (mudou) { ctx = await GS.carregarTudo(); }

    desenharResumo(ativos, hojeIso);
    desenharLista(ativos, hojeIso);
    desenharResgatados();
  }

  const vencido = (inv, hojeIso) => inv && inv.liquidez === 'vencimento' && inv.vencimento <= hojeIso;
  const livre = (inv, hojeIso) => !inv || inv.liquidez !== 'vencimento' || vencido(inv, hojeIso);

  function desenharResumo(ativos, hojeIso) {
    const soma = f => ativos.reduce((s, c) => s + f(c, estimativas.get(c.id), ctx.investimento.get(c.id)), 0);
    const total = soma((c, e) => e.hoje);
    const podeHoje = soma((c, e, inv) => (livre(inv, hojeIso) ? e.hoje : 0));
    const rendeu = soma((c, e) => e.ganho);
    const r = indicesOk && GS.indices.resumo();
    const indices = r
      ? `<div class="inv-indices">
           ${r.cdiAno != null ? `<span>CDI <b>${pct(r.cdiAno)}</b> a.a.</span>` : ''}
           ${r.selicMeta != null ? `<span>Selic <b>${pct(r.selicMeta)}</b></span>` : ''}
           ${r.ipcaMes ? `<span>IPCA <b>${pct(r.ipcaMes.valor)}</b> (${GS.mesAnoDeIso(r.ipcaMes.mes).split(' ')[0].slice(0, 3).toLowerCase()})</span>` : ''}
           <span>${r.buscadoEm === hojeIso ? 'atualizado hoje' : `índices de ${GS.dataCurta(GS.parseData(r.buscadoEm))}`}</span>
         </div>`
      : `<p class="inv-aviso">${icone('alert')}Sem os índices do Banco Central agora: os valores com taxa aparecem sem o rendimento. Verifique a internet.</p>`;

    $('resumo').innerHTML = !ativos.length
      ? `<div class="inv-vazio">${icone('trending')}<p><b>Nenhum investimento ainda</b>Cadastre o que você tem aplicado: o GSCASH mostra quanto rende pelo CDI, Selic ou IPCA de hoje e separa esse dinheiro do saldo do dia a dia.</p></div>${r ? indices : ''}`
      : `<span class="label">Total investido</span>
         <p class="mid-value num">${GS.moeda(total)}</p>
         <span class="inv-est">valor estimado de hoje, antes de impostos</span>
         <div class="inv-partes">
           <div><span>Pode resgatar hoje</span><b class="num">${GS.moeda(podeHoje)}</b></div>
           <div><span>Preso até uma data</span><b class="num">${GS.moeda(total - podeHoje)}</b></div>
           <div><span>Rendeu até hoje</span><b class="num ${rendeu >= 0 ? 'pos' : 'neg'}">${rendeu >= 0 ? '+' : '−'}${GS.moeda(Math.abs(rendeu))}</b></div>
         </div>
         ${indices}`;
  }

  function desenharLista(ativos, hojeIso) {
    const ordem = c => { const inv = ctx.investimento.get(c.id); return vencido(inv, hojeIso) ? '0' : inv && inv.vencimento ? '1' + inv.vencimento : '2'; };
    $('aplicacoes').innerHTML = ativos.slice().sort((a, b) => ordem(a).localeCompare(ordem(b))).map(c => {
      const inv = ctx.investimento.get(c.id);
      const e = estimativas.get(c.id);
      const tipo = tipoDe(inv ? inv.tipo : 'outro');
      const semTaxa = !inv || inv.indexador === 'sem_taxa';
      const inicio = ctx.transacoes.filter(t => t.destinoId === c.id).map(t => t.data).sort()[0] || (inv && inv.valorAtualEm);
      let prazo;
      if (vencido(inv, hojeIso)) {
        prazo = `<div class="linha"><span>Venceu em ${GS.dataMedia(GS.parseData(inv.vencimento))}</span><span class="selo info">Confirme o resgate</span></div>`;
      } else if (inv && inv.liquidez === 'vencimento') {
        const total = Math.max(1, GS.diasEntre(GS.parseData(inicio || hojeIso), GS.parseData(inv.vencimento)));
        const passou = Math.min(100, Math.max(0, (GS.diasEntre(GS.parseData(inicio || hojeIso), GS.hoje()) / total) * 100));
        prazo = `
          <div class="linha"><span>${inicio ? `Aplicado em ${GS.dataMedia(GS.parseData(inicio))}` : ''}</span><span class="selo alerta">Até ${GS.dataMedia(GS.parseData(inv.vencimento))}</span></div>
          <div class="bar"><span style="width:${passou}%"></span></div>
          <div class="linha"><span>faltam ${falta(hojeIso, inv.vencimento)}</span><span class="dir">no vencimento<br><b class="num">~${GS.moeda(e.noVencimento || e.hoje)}</b></span></div>`;
      } else {
        prazo = `<div class="linha"><span>${inicio ? `Aplicado em ${GS.dataMedia(GS.parseData(inicio))}` : 'Vinda das suas carteiras'}</span><span class="selo ok">Resgate livre</span></div>`;
      }
      const acao = vencido(inv, hojeIso)
        ? `<button type="button" class="btn btn-primary" data-confirmar="${c.id}">Confirmar resgate</button>`
        : livre(inv, hojeIso) && !semTaxa ? `<button type="button" class="btn btn-outline" data-resgatar="${c.id}">Resgatar</button>`
        : `<button type="button" class="btn btn-outline" data-valor="${c.id}">Atualizar valor</button>`;
      return `
        <section class="card inv-apl" data-id="${c.id}">
          <div class="inv-topo">
            <span class="tile">${icone(tipo.icone)}</span>
            <div class="inv-nome"><b>${esc(c.nome)}</b><small>${esc(inv ? tipo.rotulo : 'Carteira de investimento')} · ${esc(comoRende(inv))}</small></div>
            <div class="inv-valor"><b class="num">${GS.moeda(e.hoje)}</b>${semTaxa
              ? `<small class="neutro">${inv && inv.valorAtualEm ? `informado em ${GS.dataCurta(GS.parseData(inv.valorAtualEm))}` : 'valor informado'}</small>`
              : `<small class="${e.ganho >= 0 ? 'pos' : 'neg'}">${e.ganho >= 0 ? '+' : '−'}${GS.moeda(Math.abs(e.ganho))}</small>`}</div>
          </div>
          <div class="inv-prazo">${prazo}</div>
          <div class="inv-pe">${acao}<button type="button" class="icon-btn" data-menu="${c.id}" aria-label="Mais opções de ${esc(c.nome)}">${icone('more')}</button></div>
        </section>`;
    }).join('');
  }

  function desenharResgatados() {
    const lista = ctx.carteiras.filter(c => c.tipo === 'investimento' && (ctx.investimento.get(c.id) || {}).resgatadoEm);
    $('resgatados').classList.toggle('hidden', !lista.length);
    $('resgatados').innerHTML = lista.length ? `
      <div class="card-head"><h2 class="card-title">Resgatados</h2><span class="card-sub">${GS.plural(lista.length, 'investimento', 'investimentos')}</span></div>
      <ul class="inv-resg">${lista.map(c => `<li><span>${esc(c.nome)}</span><small>resgatado em ${GS.dataMedia(GS.parseData(ctx.investimento.get(c.id).resgatadoEm))}</small>
        <button type="button" class="icon-btn" data-menu="${c.id}" aria-label="Mais opções de ${esc(c.nome)}">${icone('more')}</button></li>`).join('')}</ul>` : '';
  }

  /* ---------- Cadastro e edição ---------- */

  const abrirForm = (carteira = null) => GS.formInvestimento.abrir({
    ctx, carteira, estimadoHoje: carteira ? (estimativas.get(carteira.id) || {}).hoje || 0 : 0,
  });

  /* ---------- Atualizar valor, resgatar, confirmar vencimento ---------- */

  function janelaValor({ titulo, texto, valorInicial, comConta, contaInicial, extra = '', botao, aoConfirmar }) {
    const contas = GS.calc.disponiveis(ctx.carteiras);
    const corpo = GS.el('div', 'inv-janela');
    corpo.innerHTML = `
      <p>${texto}</p>
      <div class="input money"><span class="prefix">R$</span><input data-valor></div>
      ${comConta ? '<div class="field"><span class="field-label">Entra em</span><div data-slot="conta"></div></div>' : ''}
      ${extra}
      <div class="inv-contas" data-contas></div>`;
    const modal = GS.abrirModal({
      titulo, corpo, tamanho: 'sm', rodapeClasse: 'even',
      rodape: `<button type="button" class="btn btn-outline" data-fechar>Cancelar</button><button type="button" class="btn btn-primary" data-ok>${icone('check')}${esc(botao)}</button>`,
    });
    const campo = GS.campoMoeda(corpo.querySelector('[data-valor]'), valorInicial);
    const conta = comConta ? GS.criarSelect({ opcoes: contas.map(c => ({ valor: c.id, rotulo: c.nome, cor: c.cor })), valor: contaInicial || (contas[0] && contas[0].id), rotuloAria: 'Entra em' }) : null;
    if (conta) corpo.querySelector('[data-slot="conta"]').append(conta.el);
    const ok = modal.foot.querySelector('[data-ok]');
    ok.addEventListener('click', async () => {
      GS.salvando(ok, true);
      try {
        await aoConfirmar({ valor: campo.valor, contaId: conta && conta.valor, corpo });
        modal.fechar();
        GS.notificarMudanca();
      } catch (e) {
        GS.toast(e.message, 'erro');
        GS.salvando(ok, false);
      }
    });
    return { corpo, campo };
  }

  function atualizarValor(c) {
    const e = estimativas.get(c.id);
    janelaValor({
      titulo: 'Atualizar valor', botao: 'Salvar',
      texto: `Quanto <b>${esc(c.nome)}</b> vale hoje, segundo o banco ou a corretora? O cálculo segue a partir deste valor.`,
      valorInicial: e ? e.hoje : 0,
      aoConfirmar: async ({ valor }) => { await GS.api.informarValorAtual(c.id, valor, GS.isoData(GS.hoje())); GS.toast('Valor atualizado'); },
    });
  }

  function resgatar(c) {
    const e = estimativas.get(c.id);
    const { corpo, campo } = janelaValor({
      titulo: `Resgatar ${c.nome}`, botao: 'Resgatar', comConta: true,
      texto: `Hoje vale cerca de <b>${GS.moeda(e.hoje)}</b> (antes de impostos). Quanto entrou na conta?`,
      valorInicial: e.hoje,
      extra: '<label class="inv-tudo"><input type="checkbox" data-tudo checked> Resgatei tudo</label>',
      aoConfirmar: async ({ valor, contaId, corpo: c2 }) => {
        const total = c2.querySelector('[data-tudo]').checked;
        const r = await GS.api.resgatarInvestimento(c.id, { valor, destinoId: contaId, total, estimado: e.hoje, data: GS.isoData(GS.hoje()) });
        GS.toast(r.ganho > 0 ? `Resgate salvo · +${GS.moeda(r.ganho)} em Rendimentos` : 'Resgate salvo');
      },
    });
    corpo.querySelector('[data-valor]').addEventListener('input', () => {
      corpo.querySelector('[data-tudo]').checked = campo.valor >= e.hoje - 100;
    });
  }

  function confirmarVencimento(c) {
    const inv = ctx.investimento.get(c.id);
    const prevista = ctx.transacoes.find(t => t.id === `${c.id}-vt`);
    const estimado = prevista ? prevista.valor : estimativas.get(c.id).hoje;
    const contabil = GS.calc.saldoCarteira(c, ctx.transacoes.filter(t => !t.id.startsWith(`${c.id}-v`)), inv.vencimento);
    const destino = ctx.carteira.get(inv.destinoId);
    const { corpo, campo } = janelaValor({
      titulo: `${c.nome} venceu`, botao: 'Confirmar', comConta: true, contaInicial: inv.destinoId,
      texto: `Estimamos <b>${GS.moeda(estimado)}</b> antes de impostos. Quanto entrou na <b>${esc(destino ? destino.nome : 'conta')}</b>?`,
      valorInicial: estimado,
      aoConfirmar: async ({ valor, contaId }) => {
        const r = await GS.api.resgatarInvestimento(c.id, { valor, destinoId: contaId, total: true, data: inv.vencimento });
        GS.toast(r.ganho > 0 ? `Resgate confirmado · +${GS.moeda(r.ganho)} em Rendimentos` : 'Resgate confirmado');
      },
    });
    const pintar = () => {
      const ganho = campo.valor - contabil;
      corpo.querySelector('[data-contas]').innerHTML = `
        <div><span>Volta para a conta</span><b class="num">${GS.moeda(Math.min(campo.valor, contabil))}</b></div>
        <div><span>${ganho >= 0 ? 'Rendimentos (receita)' : 'Perda'}</span><b class="num ${ganho >= 0 ? 'pos' : 'neg'}">${ganho >= 0 ? '+' : '−'}${GS.moeda(Math.abs(ganho))}</b></div>`;
    };
    corpo.querySelector('[data-valor]').addEventListener('input', pintar);
    pintar();
  }

  async function excluir(c) {
    const n = ctx.transacoes.filter(t => (t.carteiraId === c.id || t.destinoId === c.id) && !t.id.startsWith(`${c.id}-v`)).length;
    const ok = await GS.confirmar({
      titulo: 'Excluir investimento?',
      mensagem: `<strong>${esc(c.nome)}</strong> sai do GSCASH${n ? `, com ${GS.plural(n, 'lançamento', 'lançamentos')} dele (aplicação, rendimentos e resgates)` : ''}. O saldo das contas volta a ser como se ele nunca tivesse existido. Não dá para desfazer.`,
    });
    if (!ok) return;
    try {
      await GS.api.excluirInvestimento(c.id);
      GS.toast('Investimento excluído');
      GS.notificarMudanca();
    } catch (e) {
      GS.toast(e.message, 'erro');
    }
  }

  /* ---------- Eventos ---------- */

  $('novaAplicacao').addEventListener('click', () => (GS.somenteLeitura ? GS.toast(GS.TEXTO_SO_LEITURA, 'erro') : abrirForm()));

  document.querySelector('main').addEventListener('click', e => {
    const alvo = e.target.closest('[data-resgatar], [data-valor], [data-confirmar], [data-menu]');
    if (!alvo) return;
    const id = alvo.dataset.resgatar || alvo.dataset.valor || alvo.dataset.confirmar || alvo.dataset.menu;
    const c = ctx.carteira.get(id);
    if (!c) return;
    if (GS.somenteLeitura && !alvo.dataset.menu) return GS.toast(GS.TEXTO_SO_LEITURA, 'erro');
    if (alvo.dataset.resgatar) return resgatar(c);
    if (alvo.dataset.valor) return atualizarValor(c);
    if (alvo.dataset.confirmar) return confirmarVencimento(c);
    const inv = ctx.investimento.get(c.id);
    const ativo = !(inv && inv.resgatadoEm);
    GS.abrirMenu(alvo, [
      ...(ativo ? [
        { rotulo: 'Editar', icone: 'pencil', escrita: true, acao: () => abrirForm(c) },
        { rotulo: 'Atualizar valor', icone: 'trending', escrita: true, acao: () => atualizarValor(c) },
        { rotulo: 'Resgatar', icone: 'arrow-up', escrita: true, acao: () => resgatar(c) },
      ] : []),
      { rotulo: 'Ver lançamentos', icone: 'list', acao: () => { location.href = `transacoes.html?carteira=${encodeURIComponent(c.id)}`; } },
      { rotulo: 'Excluir', icone: 'trash', perigo: true, escrita: true, acao: () => excluir(c) },
    ]);
  });

  GS.iniciarPagina('investimentos', desenhar);
})();
