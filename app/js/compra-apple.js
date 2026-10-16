/* =========================================================
   GSCASH — compra da licença pela Apple (só no app do iPhone)
   Dentro do app a Apple exige o sistema de compras dela. O produto é
   1 ano que não renova sozinho (br.com.gscash.app.licenca1ano).
   1. resumo com o preço vindo da Apple  2. tela da Apple (Face ID)
   3. o recibo assinado vai para a Edge Function "apple", que confere
      com a Apple e grava 1 ano de licença na conta; só então a compra
      é encerrada no iPhone. Se a internet cair no meio, a compra fica
      guardada e é confirmada na próxima abertura do app.
   No navegador e no Windows continua o Pix (licenca.js).
   ========================================================= */

window.GS = window.GS || {};

(function () {
  if (!GS.nativo) return;
  const { icone, esc } = GS;
  const Compras = window.Capacitor.registerPlugin('NativePurchases');
  const PRODUTO = 'br.com.gscash.app.licenca1ano';
  const data = d => GS.dataMedia(d);

  // a compra só é encerrada depois que o servidor liberou a licença
  const pronto = Compras.configure({ autoFinishTransactions: false }).catch(e => console.warn('compras: configurar', e));

  const nomeDaConta = () => {
    const meta = (GS.usuario && GS.usuario.user_metadata) || {};
    return String(meta.full_name || meta.name || '').trim() || (GS.usuario && GS.usuario.email) || '';
  };

  // manda o recibo ao servidor; erro com .definitivo quando não adianta tentar de novo
  async function confirmar(transacao, nome) {
    if (!transacao.jwsRepresentation) throw new Error('A Apple não mandou o recibo desta compra. Tente "Restaurar compra".');
    const { data: r, error } = await GS.supabase.functions.invoke('apple', {
      body: { acao: 'confirmar', jws: transacao.jwsRepresentation, nome },
    });
    if (error) {
      const status = error.context && error.context.status;
      // recibo recusado ou de outra conta: encerra no iPhone para não ficar tentando para sempre
      const definitivo = status >= 400 && status < 500 && status !== 401;
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
  const encerrar = t => Compras.finishTransaction({ transactionId: t.transactionId }).catch(e => console.warn('compras: encerrar', e));

  /* ---------- compras que ficaram pela metade ---------- */

  let recuperando = null;
  async function recuperar(lista) {
    const nossas = lista.filter(t => t.productIdentifier === PRODUTO);
    let ultima = null;
    for (const t of nossas) {
      try { ultima = await confirmar(t, nomeDaConta()); } catch (e) { console.warn('compras: recuperar', e); }
    }
    if (ultima) {
      GS.toast(`Sua compra pela Apple foi confirmada. Licença válida até ${data(ultima.validade)}.`);
      setTimeout(() => location.reload(), 2500);
    }
  }
  GS.licenca.pronta.then(async () => {
    await pronto;
    if (!GS.usuario) return;
    const { transactions } = await Compras.getUnfinishedTransactions();
    if (transactions.length) recuperando = recuperar(transactions);
  }).catch(e => console.warn('compras: pendentes', e));
  // compra aprovada depois (ex.: "Pedir para comprar" da família) chega por aqui
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

    modal.body.innerHTML = '<div class="compra-carregando"><span class="roda-botao" aria-hidden="true"></span>Buscando o preço na App Store…</div>';
    rodape('<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>', true);

    let produto = null;
    try {
      await pronto;
      const { products } = await Compras.getProducts({ productIdentifiers: [PRODUTO] });
      produto = products && products[0];
    } catch (e) {
      console.warn('compras: produto', e);
    }
    if (!produto) {
      modal.body.innerHTML = `<div class="lembrete-aviso">${icone('alert')}<span>Não conseguimos falar com a App Store agora. Verifique a internet e tente de novo.</span></div>`;
      return;
    }

    /* 1. resumo */
    modal.body.innerHTML = `
      <div class="compra-plano">
        <div class="topo"><b>GSCASH · 1 ano</b></div>
        <span class="preco num">${esc(produto.priceString)}<small>por ano</small></span>
        <ul>
          <li>${icone('check')}Todos os recursos, sem limite de lançamentos</li>
          <li>${icone('check')}Vale no iPhone, no navegador e no Windows</li>
          <li>${icone('check')}Ativa na hora, assim que a Apple confirmar</li>
          <li>${icone('check')}Não renova sozinha: nada é cobrado de novo</li>
        </ul>
      </div>
      ${renovando
        ? `<div class="compra-renova">${icone('clock')}<span>Sua licença vale até <b>${data(info.validade)}</b>. Com a renovação, passa a valer até <b>${data(novaValidade)}</b>.</span></div>`
        : `<div class="compra-conta"><span>Para a conta</span><b>${esc(email)}</b></div>`}
      <div class="compra-seguro">${icone('lock')}Pagamento feito pela Apple, com a sua conta da App Store</div>
      <p class="compra-restaurar">Já pagou e a licença não ativou? <button type="button" class="link-btn" data-restaurar>Restaurar compra</button></p>`;
    rodape(`<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
            <button type="button" class="btn btn-primary" data-comprar>Comprar · ${esc(produto.priceString)}</button>`);

    const botao = modal.foot.querySelector('[data-comprar]');
    botao.addEventListener('click', async () => {
      const voltar = girando(botao, 'Abrindo a App Store…');
      let transacao;
      try {
        transacao = await Compras.purchaseProduct({
          productIdentifier: PRODUTO,
          appAccountToken: GS.usuario.id,   // a compra fica presa a esta conta do GSCASH
          autoAcknowledgePurchases: false,
          quantity: 1,
        });
      } catch (e) {
        voltar();
        const msg = String((e && e.message) || e);
        if (/cancel/i.test(msg)) return;  // fechou a tela da Apple: fica no resumo, sem aviso
        GS.toast(/pending/i.test(msg)
          ? 'A compra está esperando aprovação (por exemplo, de quem organiza a família). A licença ativa sozinha quando for aprovada.'
          : 'A App Store não concluiu a compra. Nada foi cobrado; tente de novo.', /pending/i.test(msg) ? undefined : 'erro');
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
        await Compras.restorePurchases().catch(() => {});  // sincroniza com a App Store
        const { purchases } = await Compras.getPurchases({ appAccountToken: GS.usuario.id });
        const nossas = (purchases || []).filter(t => t.productIdentifier === PRODUTO);
        let r = null;
        for (const t of nossas) r = await confirmar(t, nome);
        if (r) return mostrarPronto(r, true);
        voltar();
        GS.toast('Não encontramos nenhuma compra do GSCASH nesta conta da Apple.', 'erro');
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
          <p>Licença ativada para <b>${esc(r.nome)}</b>.<br>Ela vale até <b>${data(r.validade)}</b>, no iPhone, no navegador e no Windows.</p>
          <p class="pix-validade">O recibo chega no seu e-mail da Apple.</p>
        </div>`;
      rodape(`<button type="button" class="btn btn-primary" data-continuar>Continuar${icone('arrow-right')}</button>`, true);
      const continuar = modal.foot.querySelector('[data-continuar]');
      continuar.addEventListener('click', () => location.reload());
      continuar.focus();
    }
  }

  GS.compraApple = { abrir };
})();
