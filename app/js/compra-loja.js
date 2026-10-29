/* =========================================================
   GSCASH — compra da licença pela loja do celular (só nos apps)
   Dentro do app a Apple e o Google exigem o sistema de compras deles. O
   produto é 1 ano que não renova sozinho (br.com.gscash.app.licenca1ano).
   1. resumo com o preço vindo da loja  2. tela da loja (Face ID, digital)
   3. o recibo vai para a Edge Function da loja ("apple" ou "google"), que
      confere com ela e grava 1 ano de licença na conta; só então a compra
      é encerrada no celular. Se a internet cair no meio, a compra fica
      guardada e é confirmada na próxima abertura do app.
   No Android o produto é "item único consumível": consumir a compra
   depois de liberar a licença é o que permite comprar de novo na renovação.
   No navegador e no Windows continua o Pix (licenca.js).
   ========================================================= */

window.GS = window.GS || {};

(function () {
  if (!GS.nativo) return;
  const { icone, esc } = GS;
  const Compras = window.Capacitor.registerPlugin('NativePurchases');
  const PRODUTO = 'br.com.gscash.app.licenca1ano';
  const android = window.Capacitor.getPlatform() === 'android';
  // o que muda de uma loja para a outra
  const LOJA = android
    ? { nome: 'Google Play', quem: 'O Google', na: 'no Google Play', funcao: 'google', conta: 'a sua conta Google', celular: 'no Android', recibo: 'O recibo chega no seu e-mail do Google Play.', abrindo: 'Abrindo o Google Play…' }
    : { nome: 'App Store', quem: 'A Apple', na: 'na App Store', funcao: 'apple', conta: 'a sua conta da App Store', celular: 'no iPhone', recibo: 'O recibo chega no seu e-mail da Apple.', abrindo: 'Abrindo a App Store…' };
  const TIPO = android ? { productType: 'inapp' } : {};
  const data = d => GS.dataMedia(d);

  // a compra só é encerrada depois que o servidor liberou a licença
  const pronto = Compras.configure({ autoFinishTransactions: false }).catch(e => console.warn('compras: configurar', e));

  const nomeDaConta = () => {
    const meta = (GS.usuario && GS.usuario.user_metadata) || {};
    return String(meta.full_name || meta.name || '').trim() || (GS.usuario && GS.usuario.email) || '';
  };

  // manda o recibo ao servidor; erro com .definitivo quando não adianta tentar de novo
  async function confirmar(transacao, nome) {
    // iPhone: recibo assinado (JWS). Android: código da compra, que o servidor confere no Google Play
    const recibo = android ? { token: transacao.purchaseToken } : { jws: transacao.jwsRepresentation };
    if (!Object.values(recibo)[0]) throw new Error(`${LOJA.quem} não mandou o recibo desta compra. Tente "Restaurar compra".`);
    const { data: r, error } = await GS.supabase.functions.invoke(LOJA.funcao, {
      body: { acao: 'confirmar', ...recibo, nome },
    });
    if (error) {
      const status = error.context && error.context.status;
      // recibo recusado ou de outra conta: encerra no celular para não ficar tentando para sempre
      // (409 = pagamento pendente no Google: não encerra, a compra é confirmada quando sair da fila)
      const definitivo = status >= 400 && status < 500 && status !== 401 && status !== 409;
      let msg = 'Não foi possível confirmar a compra agora. Ela fica guardada e é confirmada na próxima vez que você abrir o app.';
      if (definitivo) try { msg = (await error.context.json()).erro || msg; } catch (e) { /* sem corpo: fica a padrão */ }
      const erro = new Error(msg);
      erro.definitivo = definitivo;
      if (erro.definitivo) await encerrar(transacao);
      throw erro;
    }
    await encerrar(transacao);
    return r;
  }
  const encerrar = t => (android
    ? Compras.consumePurchase({ purchaseToken: t.purchaseToken })
    : Compras.finishTransaction({ transactionId: t.transactionId })
  ).catch(e => console.warn('compras: encerrar', e));

  /* ---------- compras que ficaram pela metade ---------- */

  let recuperando = null;
  async function recuperar(lista) {
    const nossas = lista.filter(t => t.productIdentifier === PRODUTO);
    let ultima = null;
    for (const t of nossas) {
      try { ultima = await confirmar(t, nomeDaConta()); } catch (e) { console.warn('compras: recuperar', e); }
    }
    if (ultima) {
      GS.toast(`Sua compra pelo ${LOJA.nome} foi confirmada. Licença válida até ${data(ultima.validade)}.`);
      setTimeout(() => location.reload(), 2500);
    }
  }
  GS.licenca.pronta.then(async () => {
    await pronto;
    if (!GS.usuario) return;
    const { transactions } = await Compras.getUnfinishedTransactions();
    if (transactions.length) recuperando = recuperar(transactions);
  }).catch(e => console.warn('compras: pendentes', e));
  // compra aprovada depois (ex.: "Pedir para comprar" da família, ou pagamento pendente no Google) chega por aqui
  Compras.addListener('transactionUpdated', t => { if (GS.usuario) recuperar([t]); });

  /* ---------- janela "Comprar licença" ---------- */

  async function abrir() {
    const info = await GS.licenca.pronta;
    const renovando = info.estado === 'ativa' || info.estado === 'vencendo';
    const base = renovando ? GS.parseData(info.validade) : GS.hoje();
    const novaValidade = new Date(base.getFullYear() + 1, base.getMonth(), base.getDate());
    const email = (GS.usuario && GS.usuario.email) || '';
    const nome = info.nome || nomeDaConta();

    const modal = GS.abrirModal({ titulo: 'Comprar licença', corpo: '' });
    const titulo = t => { modal.el.querySelector('.modal-title').textContent = t; };
    const rodape = (html, um) => {
      modal.foot.className = `modal-foot${um ? ' um' : ''}`;
      modal.foot.innerHTML = html;
      modal.foot.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => modal.fechar()));
    };
    const girando = (botao, texto) => {
      const original = botao.innerHTML;
      modal.el.querySelectorAll('button').forEach(b => { b.disabled = true; });
      botao.innerHTML = `<span class="roda-botao" aria-hidden="true"></span>${esc(texto)}`;
      return () => {
        modal.el.querySelectorAll('button').forEach(b => { b.disabled = false; });
        botao.innerHTML = original;
      };
    };

    modal.body.innerHTML = `<div class="compra-carregando"><span class="roda-botao" aria-hidden="true"></span>Buscando o preço ${LOJA.na}…</div>`;
    rodape('<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>', true);

    let produto = null;
    try {
      await pronto;
      const { products } = await Compras.getProducts({ productIdentifiers: [PRODUTO], ...TIPO });
      produto = products && products[0];
    } catch (e) {
      console.warn('compras: produto', e);
    }
    if (!produto) {
      modal.body.innerHTML = `<div class="lembrete-aviso">${icone('alert')}<span>Não conseguimos falar com ${LOJA.nome === 'Google Play' ? 'o' : 'a'} ${LOJA.nome} agora. Verifique a internet e tente de novo.</span></div>`;
      return;
    }

    /* 1. resumo */
    modal.body.innerHTML = `
      <div class="compra-plano">
        <div class="topo"><b>GSCASH · 1 ano</b></div>
        <span class="preco num">${esc(produto.priceString)}<small>por ano</small></span>
        <ul>
          <li>${icone('check')}Todos os recursos, sem limite de lançamentos</li>
          <li>${icone('check')}Vale ${LOJA.celular}, no navegador e no Windows</li>
          <li>${icone('check')}Ativa na hora, assim que ${LOJA.quem === 'O Google' ? 'o Google' : 'a Apple'} confirmar</li>
          <li>${icone('check')}Não renova sozinha: nada é cobrado de novo</li>
        </ul>
      </div>
      ${renovando
        ? `<div class="compra-renova">${icone('clock')}<span>Sua licença vale até <b>${data(info.validade)}</b>. Com a renovação, passa a valer até <b>${data(novaValidade)}</b>.</span></div>`
        : `<div class="compra-conta"><span>Para a conta</span><b>${esc(email)}</b></div>`}
      <div class="compra-seguro">${icone('lock')}Pagamento feito ${LOJA.quem === 'O Google' ? 'pelo Google' : 'pela Apple'}, com ${LOJA.conta}</div>
      <p class="compra-restaurar">Já pagou e a licença não ativou? <button type="button" class="link-btn" data-restaurar>Restaurar compra</button></p>`;
    rodape(`<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
            <button type="button" class="btn btn-primary" data-comprar>Comprar · ${esc(produto.priceString)}</button>`);

    const botao = modal.foot.querySelector('[data-comprar]');
    botao.addEventListener('click', async () => {
      const voltar = girando(botao, LOJA.abrindo);
      let transacao;
      try {
        transacao = await Compras.purchaseProduct({
          productIdentifier: PRODUTO,
          ...TIPO,
          isConsumable: false,              // Android: quem consome é o encerrar(), depois que o servidor liberou
          appAccountToken: GS.usuario.id,   // a compra fica presa a esta conta do GSCASH
          autoAcknowledgePurchases: false,
          quantity: 1,
        });
      } catch (e) {
        voltar();
        const msg = String((e && e.message) || e);
        // fechou a tela da loja (ou a loja desistiu sozinha): fica no resumo, com um aviso curto;
        // se a loja respondeu outra coisa, o texto dela vai junto (é o que diz por que não concluiu)
        const detalhe = msg === 'User cancelled' ? '' : ` (${msg})`;
        if (/cancel/i.test(msg)) return GS.toast(`Compra cancelada. Nada foi cobrado.${detalhe}`);
        // a loja diz que a licença já foi paga e não foi ativada (ex.: o servidor estava fora do ar): confirma a compra de antes
        if (/already|owned/i.test(msg)) {
          GS.toast('Você já pagou por esta licença. Vamos ativá-la agora.');
          modal.body.querySelector('[data-restaurar]').click();
          return;
        }
        GS.toast(/pending/i.test(msg)
          ? 'A compra está esperando aprovação (por exemplo, de quem organiza a família). A licença ativa sozinha quando for aprovada.'
          : `${LOJA.nome === 'Google Play' ? 'O' : 'A'} ${LOJA.nome} não concluiu a compra. Nada foi cobrado; tente de novo.${detalhe}`, /pending/i.test(msg) ? undefined : 'erro');
        return;
      }
      botao.innerHTML = '<span class="roda-botao" aria-hidden="true"></span>Ativando a licença…';
      try {
        mostrarPronto(await confirmar(transacao, nome));
      } catch (e) {
        voltar();
        GS.toast(e.message, 'erro');
      }
    });

    modal.body.querySelector('[data-restaurar]').addEventListener('click', async e => {
      const link = e.currentTarget;
      const voltar = girando(link, 'Procurando suas compras…');
      try {
        if (recuperando) await recuperando;
        await Compras.restorePurchases().catch(() => {});  // sincroniza com a loja
        const { purchases } = await Compras.getPurchases({ appAccountToken: GS.usuario.id, ...TIPO });
        const nossas = (purchases || []).filter(t => t.productIdentifier === PRODUTO);
        let r = null;
        for (const t of nossas) r = await confirmar(t, nome);
        if (r) return mostrarPronto(r, true);
        voltar();
        GS.toast(`Não encontramos nenhuma compra do GSCASH nesta conta ${android ? 'Google' : 'da Apple'}.`, 'erro');
      } catch (err) {
        voltar();
        GS.toast(err.message, 'erro');
      }
    });

    /* 3. pronto */
    function mostrarPronto(r, restaurada) {
      titulo('Licença ativa');
      modal.body.innerHTML = `
        <div class="ativ-ok">
          <span class="ic">${icone('check')}</span>
          <h3 class="ativ-titulo">${restaurada ? 'Compra restaurada' : 'Compra confirmada'}, ${esc(String(r.nome).split(' ')[0])}!</h3>
          <p>Licença ativada para <b>${esc(r.nome)}</b>.<br>Ela vale até <b>${data(r.validade)}</b>, ${LOJA.celular}, no navegador e no Windows.</p>
          <p class="pix-validade">${LOJA.recibo}</p>
        </div>`;
      rodape(`<button type="button" class="btn btn-primary" data-continuar>Continuar${icone('arrow-right')}</button>`, true);
      const continuar = modal.foot.querySelector('[data-continuar]');
      continuar.addEventListener('click', () => location.reload());
      continuar.focus();
    }
  }

  GS.compraLoja = { abrir };
})();
