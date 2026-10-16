/* =========================================================
   GSCASH — licença anual, ligada à conta
   A situação vem do banco (rpc minha_licenca) e a ativação passa pela
   Edge Function "ativar-licenca", que confere a chave e a prende à conta
   (uma chave, uma conta). Vale igual no navegador e no app de computador.

   Situações:
   · teste        — conta nova, nos 7 dias grátis (faixa azul)
   · teste-acabou — sem chave depois do teste: só leitura (faixa vermelha)
   · ativa / vencendo (30 dias ou menos) / vencida (só leitura)
   O banco também recusa gravar sem licença: aqui é só a parte visível.
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const { icone, esc } = GS;

  // preço anual em promoção (centavos)
  const PRECO_DE = 7000;
  const PRECO_POR = 5000;
  const fmtPreco = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const preco = centavos => fmtPreco.format(centavos / 100);  // não usa GS.moeda: o preço aparece mesmo com valores ocultos


  // botões que gravam algo: no modo só leitura ficam travados
  // (a mesma lista está em css/licenca.css)
  const ESCRITA = [
    '[data-acao="novo-gasto"]', '[data-acao="transferir"]',
    '[data-acao="configurar"]', '[data-acao="pagar"]', '[data-acao="adiantar"]', '[data-acao="desfazer"]',
    '#novaCarteira', '#novaCategoria', '#definirOrcamento', '#configurar',
    '[data-editar]', '[data-excluir]', '[data-editar-credito]', '[data-switch]', 'button[data-saldo]', '[data-orcamento]',
    '[data-passo]', '#importar', '[data-importar]',
  ].join(',');

  let info = { estado: 'livre' };

  const data = d => GS.dataMedia(d);  // 5 out 2027 (texto "2027-10-05" ou Date)
  const dias = n => (n === 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias`);
  const DIA = 86400000;
  const entreDatas = (de, ate) => Math.round((Date.parse(ate) - Date.parse(de)) / DIA);

  /* ---------- situação da conta ---------- */

  async function lerSituacao() {
    const { data: s, error } = await GS.supabase.rpc('minha_licenca');
    if (error) throw error;
    if (s.validade) {
      const faltam = entreDatas(s.hoje, s.validade);
      return {
        estado: faltam < 0 ? 'vencida' : faltam <= 30 ? 'vencendo' : 'ativa',
        nome: s.nome, validade: s.validade, dias: faltam,
      };
    }
    const testeAte = new Date(s.teste_ate);  // data e hora: 7 dias depois de criar a conta
    const restante = testeAte - Date.now();
    return restante > 0
      ? { estado: 'teste', testeAte, dias: Math.ceil(restante / DIA) }
      : { estado: 'teste-acabou', testeAte };
  }

  // chama a Edge Function; devolve { nome, validade } ou lança o erro em português
  async function enviarChave(chave) {
    const { data: r, error } = await GS.supabase.functions.invoke('ativar-licenca', { body: { chave } });
    if (!error) return r;
    let msg = 'Não foi possível ativar agora. Verifique a conexão e tente de novo.';
    try { msg = (await error.context.json()).erro || msg; } catch (e) { /* sem corpo: fica a mensagem padrão */ }
    throw new Error(msg);
  }

  const pronta = (async () => {
    try {
      info = await lerSituacao();
      // app de computador: a chave que já estava neste computador passa para a conta, sozinha
      if (GS.noDesktop && (info.estado === 'teste' || info.estado === 'teste-acabou')) {
        const local = await (await GS.apiDesktop()).chave_local();
        if (local) {
          try {
            const r = await enviarChave(local);
            info = await lerSituacao();
            setTimeout(() => GS.toast(`A licença deste computador agora está na sua conta (até ${data(r.validade)})`), 800);
          } catch (e) {
            console.warn('Não foi possível ligar a licença deste computador à conta', e);
          }
        }
      }
    } catch (e) {
      // sem internet ou erro: não trava nada aqui (o banco continua conferindo ao gravar)
      console.error('Falha ao ler a licença', e);
      info = { estado: 'livre' };
    }

    GS.somenteLeitura = info.estado === 'vencida' || info.estado === 'teste-acabou';
    if (info.estado === 'teste-acabou') GS.TEXTO_SO_LEITURA = 'Seu teste grátis acabou: o GSCASH está em modo só leitura.';

    if (info.estado === 'teste') faixaTeste();
    else if (info.estado === 'teste-acabou') travar();
    else if (info.estado === 'vencida') travar();
    else if (info.estado === 'vencendo') avisoVencendo();

    // veio do botão "Quero comprar" do site (app/?comprar, guardado por supabase.js até depois do login)
    try {
      if (sessionStorage.getItem('gscash:comprar') && info.estado !== 'livre') {
        sessionStorage.removeItem('gscash:comprar');
        setTimeout(comprar, 400);
      }
    } catch (e) { /* sem sessionStorage: segue sem abrir */ }
    return info;
  })();

  /* ---------- janela "Comprar licença" (Pix ou cartão, pelo Mercado Pago) ----------
     1. resumo e forma de pagamento
     2. Pix: QR code e copia e cola, conferindo o pagamento a cada 4 s
        cartão: formulário do próprio Mercado Pago (Card Payment Brick), à vista
     3. pronto. Quem libera a licença é a Edge Function "pix", quando o Mercado Pago aprova. */

  const noCelular = () => matchMedia('(max-width: 640px)').matches;
  const hora = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const MSG_PIX = 'Não foi possível gerar o Pix agora. Verifique a conexão e tente de novo.';
  const MSG_CARTAO = 'Não foi possível pagar com cartão agora. Verifique a conexão e tente de novo.';

  async function pedirPagamento(corpo, msgPadrao = MSG_PIX) {
    const { data: r, error } = await GS.supabase.functions.invoke('pix', { body: corpo });
    if (!error) return r;
    let msg = msgPadrao;
    try { msg = (await error.context.json()).erro || msg; } catch (e) { /* sem corpo: fica a mensagem padrão */ }
    throw new Error(msg);
  }

  // SDK do Mercado Pago (monta o formulário do cartão): só carrega quando a pessoa escolhe cartão.
  // Os números do cartão ficam nos campos do Mercado Pago; o GSCASH só recebe um token de uso único.
  let sdkMP = null;
  function carregarSdkMP() {
    if (!sdkMP) {
      sdkMP = new Promise((ok, falha) => {
        const s = document.createElement('script');
        s.src = 'https://sdk.mercadopago.com/js/v2';
        s.onload = ok;
        s.onerror = () => {
          sdkMP = null;
          s.remove();
          falha(new Error(MSG_CARTAO));
        };
        document.head.append(s);
      });
    }
    return sdkMP;
  }

  // o formulário do Mercado Pago com as cores do GSCASH
  function estiloCartao() {
    const cor = nome => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
    return {
      theme: 'default',
      customVariables: {
        baseColor: cor('--primary'),
        textPrimaryColor: cor('--text'),
        textSecondaryColor: cor('--text-2'),
        formBackgroundColor: cor('--surface'),
        inputBackgroundColor: '#ffffff',
        outlinePrimaryColor: cor('--border-strong'),
        outlineSecondaryColor: cor('--border'),
        errorColor: cor('--danger'),
        successColor: cor('--success'),
        borderRadiusSmall: '10px',
        borderRadiusMedium: '12px',
        borderRadiusLarge: '14px',
        formPadding: '0px',
      },
    };
  }

  async function copiar(botao, texto) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch (e) {
      const t = GS.el('textarea');
      t.value = texto;
      document.body.append(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    if (botao.dataset.textoOriginal === undefined) botao.dataset.textoOriginal = botao.innerHTML;
    botao.innerHTML = `${icone('check')}Copiado`;
    botao.classList.add('copiado');
    clearTimeout(botao._volta);
    botao._volta = setTimeout(() => {
      botao.innerHTML = botao.dataset.textoOriginal;
      botao.classList.remove('copiado');
    }, 2000);
  }

  function abrirCompra() {
    const renovando = info.estado === 'ativa' || info.estado === 'vencendo';
    // 1 ano somado ao que ainda falta (ou a partir de hoje)
    const base = renovando ? GS.parseData(info.validade) : GS.hoje();
    const novaValidade = new Date(base.getFullYear() + 1, base.getMonth(), base.getDate());
    const meta = (GS.usuario && GS.usuario.user_metadata) || {};
    const email = (GS.usuario && GS.usuario.email) || '';
    // o nome da licença ("Licenciado para ...") vem da conta: nome do Google/cadastro ou o e-mail
    const nome = info.nome || String(meta.full_name || meta.name || '').trim() || email;

    let fechado = false;
    let espera;
    let pagAtual = null;  // pagamento que está sendo conferido: { id, forma }
    let brick = null;     // formulário do cartão montado
    let forma = 'pix';
    const desmontar = () => {
      try { brick?.unmount(); } catch (e) { /* já saiu da tela */ }
      brick = null;
    };
    const modal = GS.abrirModal({
      titulo: 'Comprar licença',
      corpo: '',
      aoFechar: () => {
        fechado = true;
        clearTimeout(espera);
        desmontar();
        document.removeEventListener('visibilitychange', aoVoltar);
      },
    });
    const titulo = t => { modal.el.querySelector('.modal-title').textContent = t; };
    const rodape = (html, um) => {
      modal.foot.className = `modal-foot${um ? ' um' : ''}`;
      modal.foot.innerHTML = html;
      modal.foot.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => modal.fechar()));
    };
    const girando = (botao, texto) => {
      const original = botao.innerHTML;
      botao.disabled = true;
      botao.innerHTML = `<span class="roda-botao" aria-hidden="true"></span>${texto}`;
      return () => { botao.disabled = false; botao.innerHTML = original; };
    };

    /* 1. resumo e forma de pagamento */
    const opcao = (f, ic, nomeForma, detalhe) => `
      <button type="button" class="opcao-serie" role="radio" data-forma="${f}">
        <span class="opcao-radio"></span><span class="ic">${icone(ic)}</span>
        <span class="txt"><strong>${nomeForma}</strong><small>${detalhe}</small></span>
      </button>`;
    function mostrarResumo() {
      desmontar();
      clearTimeout(espera);
      pagAtual = null;
      titulo('Comprar licença');
      modal.body.innerHTML = `
        <div class="compra-plano">
          <div class="topo"><b>GSCASH · 1 ano</b><span class="selo-promo">Promoção</span></div>
          <span class="preco num"><s>${preco(PRECO_DE)}</s>${preco(PRECO_POR)}<small>por ano</small></span>
          <ul>
            <li>${icone('check')}Todos os recursos, sem limite de lançamentos</li>
            <li>${icone('check')}Vale no navegador e no programa para Windows</li>
            <li>${icone('check')}Ativa na hora, assim que o pagamento for aprovado</li>
          </ul>
        </div>
        ${renovando
          ? `<div class="compra-renova">${icone('clock')}<span>Sua licença vale até <b>${data(info.validade)}</b>. Com a renovação, passa a valer até <b>${data(novaValidade)}</b>.</span></div>`
          : `<div class="compra-conta"><span>Para a conta</span><b>${esc(email)}</b></div>`}
        <div class="compra-forma" role="radiogroup" aria-labelledby="compraForma">
          <span class="titulo" id="compraForma">Forma de pagamento</span>
          ${opcao('pix', 'pix', 'Pix', 'QR code ou copia e cola')}
          ${opcao('cartao', 'cartao', 'Cartão de crédito', `À vista, ${preco(PRECO_POR)}`)}
        </div>
        <div class="compra-seguro">${icone('lock')}Pagamento processado pelo Mercado Pago</div>`;
      rodape(`<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
              <button type="button" class="btn btn-primary" data-pagar></button>`);
      const botao = modal.foot.querySelector('[data-pagar]');
      const marcar = f => {
        forma = f;
        modal.body.querySelectorAll('.compra-forma .opcao-serie').forEach(b => {
          b.classList.toggle('sel', b.dataset.forma === f);
          b.setAttribute('aria-checked', b.dataset.forma === f);
        });
        botao.innerHTML = f === 'pix' ? `${icone('pix')}Pagar com Pix` : `${icone('cartao')}Continuar`;
      };
      modal.body.querySelector('.compra-forma').addEventListener('click', e => {
        const b = e.target.closest('.opcao-serie');
        if (b) marcar(b.dataset.forma);
      });
      marcar(forma);
      botao.addEventListener('click', () => (forma === 'pix' ? gerar(botao) : mostrarCartao(botao)));
      setTimeout(() => botao.focus(), 50);
    }

    async function gerar(botao) {
      const volta = girando(botao, 'Gerando o Pix…');
      try {
        const pix = await pedirPagamento({ acao: 'criar', nome });
        if (!fechado) mostrarPix(pix);
      } catch (e) {
        volta();
        GS.toast(e.message, 'erro');
      }
    }

    /* 2. Pix: no celular a pessoa paga no mesmo aparelho, então o "copiar" vem primeiro e o QR fica guardado */
    function mostrarPix(pix) {
      desmontar();
      pagAtual = { id: pix.id, forma: 'pix' };
      titulo('Pague com Pix');
      const qr = `<div class="pix-qr"><img alt="QR code do Pix" src="data:image/png;base64,${pix.qr_base64}"></div>`;
      const esperando = texto => `<div class="pix-esperando"><span class="pix-giro" aria-hidden="true"></span><span><b>Esperando o pagamento</b>${texto}</span></div>`;
      modal.body.innerHTML = `<div class="pix-valor"><small>Valor</small><b class="num">${preco(Math.round(pix.valor * 100))}</b></div>` + (noCelular()
        ? `<button type="button" class="btn btn-primary pix-copiar-grande" data-copiar>${icone('copiar')}Copiar código Pix</button>
           <ol class="pix-passos"><li><span class="n">1</span>Toque em copiar.</li><li><span class="n">2</span>No app do seu banco, escolha Pix copia e cola e cole o código.</li></ol>
           ${esperando('Volte para cá depois de pagar: a licença ativa sozinha.')}
           <details class="pix-dobra"><summary>Mostrar QR code</summary>${qr}</details>`
        : `${qr}
           <ol class="pix-passos"><li><span class="n">1</span>Abra o app do seu banco e escolha pagar com Pix.</li><li><span class="n">2</span>Aponte a câmera para o QR code ou cole o código abaixo.</li></ol>
           <div class="pix-copia"><code>${esc(pix.qr_code)}</code><button type="button" class="btn btn-outline" data-copiar>${icone('copiar')}Copiar</button></div>
           ${esperando('A licença ativa sozinha quando o Pix cair. Pode deixar esta janela aberta.')}
           <div class="pix-validade">Este código vale até ${hora(pix.expira_em)}.</div>`);
      modal.body.querySelector('[data-copiar]').addEventListener('click', e => copiar(e.currentTarget, pix.qr_code));
      rodape('<button type="button" class="btn btn-outline" data-fechar>Pagar depois</button>', true);
      clearTimeout(espera);
      espera = setTimeout(vigiar, 4000);
    }

    // pergunta ao servidor se o pagamento já foi aprovado (a cada 4 s, e na hora em que a pessoa volta do app do banco)
    async function vigiar() {
      clearTimeout(espera);
      if (fechado || !pagAtual) return;
      const atual = pagAtual;
      try {
        const r = await pedirPagamento({ acao: 'conferir', id: atual.id });
        if (fechado || pagAtual !== atual) return;
        if (r.status === 'aprovado') return mostrarPronto(r, atual.forma);
        if (r.status === 'expirado') {
          return atual.forma === 'pix' ? mostrarVencido() : mostrarRecusado('O Mercado Pago não aprovou o pagamento.');
        }
      } catch (e) {
        // sem internet por um instante: tenta de novo
      }
      if (!fechado && pagAtual === atual) espera = setTimeout(vigiar, 4000);
    }
    function aoVoltar() {
      if (document.visibilityState === 'visible') vigiar();
    }
    document.addEventListener('visibilitychange', aoVoltar);

    function mostrarVencido() {
      pagAtual = null;
      titulo('Pague com Pix');
      modal.body.innerHTML = `
        <div class="ativ-ok pix-vencido">
          <span class="ic">${icone('clock')}</span>
          <h3 class="ativ-titulo">Este código venceu</h3>
          <p>O código Pix vale por 30 minutos. Gere um novo para pagar.</p>
        </div>`;
      rodape(`<button type="button" class="btn btn-outline" data-fechar>Fechar</button>
              <button type="button" class="btn btn-primary" data-pagar>${icone('pix')}Gerar outro Pix</button>`);
      modal.foot.querySelector('[data-pagar]').addEventListener('click', e => gerar(e.currentTarget));
    }

    /* 2. cartão: o formulário é do Mercado Pago; o botão de pagar é o nosso, no rodapé */
    async function mostrarCartao(botao) {
      const volta = girando(botao, 'Abrindo…');
      let inicio;
      try {
        [inicio] = await Promise.all([pedirPagamento({ acao: 'cartao-inicio' }, MSG_CARTAO), carregarSdkMP()]);
      } catch (e) {
        volta();
        return GS.toast(e.message, 'erro');
      }
      if (fechado) return;
      desmontar();
      pagAtual = null;
      const valor = preco(Math.round(inicio.valor * 100));
      titulo('Pague com cartão');
      modal.body.innerHTML = `
        <div class="cartao-valor"><span>GSCASH · 1 ano, à vista</span><b class="num">${valor}</b></div>
        <div class="cartao-form" id="compraCartao"></div>
        <div class="cartao-carregando"><span class="pix-giro" aria-hidden="true"></span>Carregando o formulário…</div>
        <div class="compra-seguro">${icone('lock')}Os dados do cartão vão direto para o Mercado Pago</div>`;
      rodape(`<button type="button" class="btn btn-outline" data-voltar>Voltar</button>
              <button type="button" class="btn btn-primary" data-pagar disabled>${icone('lock')}Pagar ${valor}</button>`);
      modal.foot.querySelector('[data-voltar]').addEventListener('click', mostrarResumo);
      const pagar = modal.foot.querySelector('[data-pagar]');
      const caixa = modal.body.querySelector('#compraCartao');

      let montado;
      try {
        const mp = new window.MercadoPago(inicio.chave_publica, { locale: 'pt-BR' });
        montado = await mp.bricks().create('cardPayment', 'compraCartao', {
          initialization: { amount: inicio.valor, payer: { email } },
          customization: {
            visual: { hidePaymentButton: true, hideFormTitle: true, style: estiloCartao() },
            paymentMethods: { minInstallments: 1, maxInstallments: 1, types: { excluded: ['debit_card'] } },
          },
          callbacks: {
            onReady: () => {
              modal.body.querySelector('.cartao-carregando')?.remove();
              pagar.disabled = false;
            },
            onSubmit: () => Promise.resolve(),  // não é usado: quem paga é o botão do rodapé
            onError: erro => console.error('Formulário do cartão (Mercado Pago)', erro),
          },
        });
      } catch (e) {
        console.error('Não foi possível montar o formulário do cartão', e);
        if (fechado || !caixa.isConnected) return;
        GS.toast(MSG_CARTAO, 'erro');
        return mostrarResumo();
      }
      // a pessoa voltou ou fechou enquanto o formulário carregava
      if (fechado || !caixa.isConnected) {
        try { montado.unmount(); } catch (e) { /* já saiu */ }
        return;
      }
      brick = montado;
      pagar.addEventListener('click', () => pagarCartao(pagar));
    }

    async function pagarCartao(botao) {
      if (!brick) return;
      let dados = null;
      try {
        dados = await brick.getFormData();
      } catch (e) {
        console.warn('Formulário do cartão incompleto', e);
      }
      if (!dados || !dados.token) return;  // o próprio formulário aponta o que falta preencher
      const voltar = modal.foot.querySelector('[data-voltar]');
      voltar.disabled = true;
      const volta = girando(botao, 'Processando…');
      try {
        const r = await pedirPagamento({
          acao: 'cartao', nome,
          token: dados.token, payment_method_id: dados.payment_method_id, issuer_id: dados.issuer_id, payer: dados.payer,
        }, MSG_CARTAO);
        if (fechado) return;
        if (r.status === 'aprovado') return mostrarPronto(r, 'cartao');
        if (r.status === 'analise') return mostrarAnalise(r.id);
        return mostrarRecusado(r.motivo);
      } catch (e) {
        volta();
        voltar.disabled = false;
        GS.toast(e.message, 'erro');
      }
    }

    // às vezes o Mercado Pago confere o pagamento antes de aprovar: a licença ativa sozinha depois
    function mostrarAnalise(id) {
      desmontar();
      pagAtual = { id, forma: 'cartao' };
      titulo('Pagamento em análise');
      modal.body.innerHTML = `
        <div class="ativ-ok cartao-analise">
          <span class="ic">${icone('clock')}</span>
          <h3 class="ativ-titulo">Quase lá</h3>
          <p>O Mercado Pago está conferindo o pagamento. Costuma levar poucos minutos.</p>
          <p class="pix-validade">A licença ativa sozinha quando ele aprovar. Pode fechar esta janela.</p>
        </div>`;
      rodape('<button type="button" class="btn btn-outline" data-fechar>Fechar</button>', true);
      clearTimeout(espera);
      espera = setTimeout(vigiar, 4000);
    }

    function mostrarRecusado(motivo) {
      desmontar();
      pagAtual = null;
      titulo('Pague com cartão');
      modal.body.innerHTML = `
        <div class="ativ-ok cartao-recusado">
          <span class="ic">${icone('alert')}</span>
          <h3 class="ativ-titulo">O cartão foi recusado</h3>
          <p>${esc(motivo || 'O banco do cartão não autorizou a compra.')} Nada foi cobrado.</p>
          <p class="pix-validade">Tente outro cartão ou pague com Pix.</p>
        </div>`;
      rodape(`<button type="button" class="btn btn-outline" data-pix>${icone('pix')}Pagar com Pix</button>
              <button type="button" class="btn btn-primary" data-cartao>Tentar outro cartão</button>`);
      modal.foot.querySelector('[data-pix]').addEventListener('click', e => gerar(e.currentTarget));
      const outro = modal.foot.querySelector('[data-cartao]');
      outro.addEventListener('click', () => mostrarCartao(outro));
      outro.focus();
    }

    /* 3. pronto */
    function mostrarPronto(r, formaPaga) {
      desmontar();
      pagAtual = null;
      titulo('Licença ativa');
      const cartao = formaPaga === 'cartao';
      modal.body.innerHTML = `
        <div class="ativ-ok">
          <span class="ic">${icone('check')}</span>
          <h3 class="ativ-titulo">Pagamento ${cartao ? 'aprovado' : 'confirmado'}, ${esc(r.nome.split(' ')[0])}!</h3>
          <p>Licença ativada para <b>${esc(r.nome)}</b>.<br>Ela vale até <b>${data(r.validade)}</b>, no computador e no navegador.</p>
          <p class="pix-validade">${cartao ? 'Na fatura do cartão aparece como GSCASH.' : 'O comprovante fica no app do seu banco.'}</p>
        </div>`;
      rodape(`<button type="button" class="btn btn-primary" data-continuar>Continuar${icone('arrow-right')}</button>`, true);
      const continuar = modal.foot.querySelector('[data-continuar]');
      continuar.addEventListener('click', () => location.reload());
      continuar.focus();
    }

    mostrarResumo();
  }

  // no app do iPhone a Apple exige a compra pela própria Apple (In-App Purchase, etapa seguinte):
  // até lá o Pix não aparece lá dentro
  const comprar = () => (GS.nativo
    ? (GS.compraApple ? GS.compraApple.abrir() : GS.toast('A compra pelo app do iPhone chega em breve.'))
    : abrirCompra());

  /* ---------- campo da chave ---------- */

  function campoChave() {
    const campo = GS.el('div', 'field');
    campo.innerHTML = `
      <label for="chaveLicenca">Chave de licença</label>
      <div class="input chave-campo"><textarea id="chaveLicenca" rows="3" spellcheck="false" autocomplete="off" placeholder="GSC1-…"></textarea></div>`;
    const texto = campo.querySelector('textarea');
    const erro = msg => {
      campo.querySelector('.field-error')?.remove();
      campo.querySelector('.input').classList.toggle('invalid', !!msg);
      if (msg) campo.append(GS.el('span', 'field-error', `${icone('alert')}${esc(msg)}`));
    };
    texto.addEventListener('input', () => erro(null));
    return { el: campo, texto, erro };
  }

  /* ---------- janela "Ativar licença" ---------- */

  function abrirAtivacao() {
    const corpo = GS.el('div', 'ativ-corpo');
    corpo.innerHTML = `
      <p>Cole abaixo a chave de licença que você recebeu. Ela fica ligada à sua conta e vale no computador e no navegador.</p>
      <div data-slot="campo"></div>
      <div class="comprar">
        <div class="comprar-topo"><b>Ainda não tem uma chave?</b><span class="selo-promo">Promoção</span></div>
        <div class="comprar-linha">
          <span class="preco num"><s>${preco(PRECO_DE)}</s>${preco(PRECO_POR)}<small>por ano</small></span>
          <button type="button" class="btn btn-outline" data-comprar>Quero comprar</button>
        </div>
        <p>Pague por Pix ou cartão aqui mesmo: a licença ativa na hora.</p>
      </div>`;
    const campo = campoChave();
    corpo.querySelector('[data-slot="campo"]').replaceWith(campo.el);

    const modal = GS.abrirModal({
      titulo: info.estado === 'teste' || info.estado === 'teste-acabou' ? 'Ativar licença' : 'Inserir nova chave',
      corpo,
      rodape: `<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
               <button type="button" class="btn btn-primary" data-ativar>${icone('key')}Ativar</button>`,
      avisoDescarte: 'A chave que você colou ainda não foi ativada.',
    });
    corpo.querySelector('[data-comprar]').addEventListener('click', () => { modal.fechar(); comprar(); });

    const botao = modal.foot.querySelector('[data-ativar]');
    const enviar = async () => {
      const chave = campo.texto.value.trim();
      if (!chave) {
        campo.erro('Cole a chave de licença que você recebeu.');
        return campo.texto.focus();
      }
      GS.salvando(botao, true);
      let r;
      try {
        r = await enviarChave(chave);
      } catch (e) {
        GS.salvando(botao, false);
        campo.erro(e.message);
        return campo.texto.focus();
      }
      const primeiro = r.nome.split(' ')[0];
      corpo.innerHTML = `
        <div class="ativ-ok">
          <span class="ic">${icone('check')}</span>
          <h3 class="ativ-titulo">Tudo certo, ${esc(primeiro)}!</h3>
          <p>Licença ativada para <b>${esc(r.nome)}</b>.<br>Ela vale até <b>${data(r.validade)}</b>, no computador e no navegador.</p>
        </div>`;
      modal.foot.innerHTML = `<button type="button" class="btn btn-primary" data-continuar>Continuar${icone('arrow-right')}</button>`;
      const continuar = modal.foot.querySelector('[data-continuar]');
      continuar.addEventListener('click', () => location.reload());
      continuar.focus();
    };
    botao.addEventListener('click', enviar);
    campo.texto.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
    });
    setTimeout(() => campo.texto.focus(), 50);
  }

  /* ---------- janela "Licença" (link no rodapé) ---------- */

  function abrirJanela() {
    const conta = (GS.usuario && GS.usuario.email) || '';
    let linhas;
    if (info.estado === 'teste' || info.estado === 'teste-acabou') {
      const prazo = info.estado === 'teste' ? `faltam ${GS.plural(info.dias, 'dia', 'dias')}` : 'acabou';
      linhas = `
        <div><span>Situação</span><span class="selo-licenca ${info.estado === 'teste' ? 'teste' : 'vencida'}">${info.estado === 'teste' ? 'Teste grátis' : 'Teste acabou'}</span></div>
        <div><span>Conta</span><b>${esc(conta)}</b></div>
        <div><span>Teste até</span><b>${data(info.testeAte)} <small>· ${prazo}</small></b></div>`;
    } else {
      const [selo, classe] = {
        ativa: ['Ativa', 'ativa'],
        vencendo: ['Vence em breve', 'vencendo'],
        vencida: ['Vencida', 'vencida'],
      }[info.estado];
      const prazo = info.dias >= 0
        ? (info.dias === 0 ? 'vence hoje' : `faltam ${GS.plural(info.dias, 'dia', 'dias')}`)
        : `venceu há ${GS.plural(-info.dias, 'dia', 'dias')}`;
      linhas = `
        <div><span>Situação</span><span class="selo-licenca ${classe}">${selo}</span></div>
        <div><span>Licenciado para</span><b>${esc(info.nome)}</b></div>
        <div><span>Conta</span><b>${esc(conta)}</b></div>
        <div><span>Válida até</span><b>${data(info.validade)} <small>· ${prazo}</small></b></div>`;
    }
    const emTeste = info.estado === 'teste' || info.estado === 'teste-acabou';
    const modal = GS.abrirModal({
      titulo: 'Licença',
      corpo: `<div class="lic-info">${linhas}</div>`,
      rodape: `<button type="button" class="btn btn-outline" data-fechar>Fechar</button>
               <button type="button" class="btn btn-primary" data-ativar>${icone('key')}${emTeste ? 'Ativar chave' : 'Trocar chave'}</button>`,
    });
    modal.foot.querySelector('[data-ativar]').addEventListener('click', () => {
      modal.fechar();
      abrirAtivacao();
    });
  }

  /* ---------- faixas de aviso ---------- */

  function faixa(classe, html) {
    document.querySelector('.faixa-licenca')?.remove();
    const el = GS.el('div', `faixa-licenca ${classe}`, html);
    el.setAttribute('role', 'status');
    const topo = document.querySelector('.topbar');
    topo ? topo.after(el) : document.body.prepend(el);
    el.querySelector('[data-comprar]')?.addEventListener('click', comprar);
    return el;
  }

  // o ícone do Pix só onde a compra é por Pix
  const IC_COMPRA = GS.nativo ? '' : icone('pix');

  const ATE = iso => data(iso).split(' ').slice(0, 2).join(' ');  // "19 out"

  // teste grátis: faixa azul em todas as páginas
  // (as faixas só oferecem comprar; quem tem uma chave ativa pelo link "Licença" do rodapé)
  function faixaTeste() {
    faixa('teste', `
      <span class="ic">${icone('clock')}</span>
      <span class="longo"><strong>Teste grátis: ${info.dias === 1 ? 'falta 1 dia' : `faltam ${info.dias} dias`}</strong> (até ${ATE(info.testeAte)}). Depois, ative sua licença para continuar lançando.</span>
      <span class="curto"><strong>Teste grátis:</strong> ${GS.plural(info.dias, 'dia', 'dias')}</span>
      <div class="acoes"><button type="button" class="btn btn-primary" data-comprar>${IC_COMPRA}Quero comprar</button></div>`);
  }

  // faltam 30 dias ou menos: avisa uma vez por dia
  async function avisoVencendo() {
    const hoje = GS.isoData(GS.hoje());
    const prefs = await GS.api.obterPreferencias().catch(() => ({}));
    if (prefs.licencaAvisoDispensado === hoje) return;
    const el = faixa('vencendo', `
      <span class="ic">${icone('clock')}</span>
      <span>Sua licença vence <strong>${dias(info.dias)}</strong> (${data(info.validade)}). Renove para continuar lançando seus gastos.</span>
      <div class="acoes">
        <button type="button" class="btn btn-outline" data-depois>Agora não</button>
        <button type="button" class="btn btn-primary" data-comprar>${IC_COMPRA}Renovar</button>
      </div>`);
    el.querySelector('[data-depois]').addEventListener('click', () => {
      GS.api.salvarPreferencia('licencaAvisoDispensado', hoje).catch(err => GS.toast(err.message, 'erro'));
      el.remove();
    });
  }

  // vencida ou teste acabou: só leitura (os dados continuam visíveis e o relatório funciona)
  function travar() {
    document.documentElement.classList.add('somente-leitura');
    if (info.estado === 'teste-acabou') {
      faixa('vencida', `
        <span class="ic">${icone('lock')}</span>
        <span><strong>Seu teste grátis acabou.</strong> Seus dados continuam aqui: ative sua licença para voltar a lançar e editar.</span>
        <div class="acoes"><button type="button" class="btn btn-primary" data-comprar>${IC_COMPRA}Quero comprar</button></div>`);
    } else {
      faixa('vencida', `
        <span class="ic">${icone('lock')}</span>
        <span><strong>Licença vencida em ${data(info.validade)}.</strong> O GSCASH está em modo só leitura: você vê seus dados e gera relatórios, mas não lança nem edita.</span>
        <div class="acoes"><button type="button" class="btn btn-primary" data-comprar>${IC_COMPRA}Renovar</button></div>`);
    }
    document.addEventListener('click', e => {
      if (!e.target.closest(ESCRITA)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      GS.toast(GS.TEXTO_SO_LEITURA, 'erro');
    }, true);
  }

  /* ---------- rodapé ---------- */

  // "Licenciado para Maria Silva até 5 out 2027 · Licença" / "Teste grátis até 19 out · Licença"
  function rodapeHtml() {
    const i = info;
    const texto = {
      teste: () => `Teste grátis até ${ATE(i.testeAte)}`,
      'teste-acabou': () => 'Teste grátis encerrado',
      ativa: () => `Licenciado para ${esc(i.nome)} até ${data(i.validade)}`,
      vencendo: () => `Licenciado para ${esc(i.nome)} até ${data(i.validade)}`,
      vencida: () => `Licença vencida em ${data(i.validade)}`,
    }[i.estado]?.();
    if (!texto) return '';
    return `<span>${texto}</span><span class="sep">·</span><button type="button" class="link-btn" data-licenca>Licença</button><span class="sep">·</span>`;
  }

  GS.licenca = { pronta, rodapeHtml, abrirJanela, abrirAtivacao, abrirCompra: comprar };
})();
