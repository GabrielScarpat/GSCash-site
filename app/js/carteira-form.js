/* =========================================================
   GSCASH — formulário de carteira (nova ou editar)
   Usado na tela Carteiras e, no "Novo gasto", para criar a
   primeira carteira sem sair do formulário.

   GS.abrirFormCarteira(cart, { quantas, aoSalvar })
     cart     — carteira para editar (null = nova)
     quantas  — quantas carteiras já existem (escolhe a cor inicial)
     aoSalvar — recebe a carteira salva (ex.: para já deixá-la escolhida)
   ========================================================= */

(function () {
  const { icone, esc } = GS;

  GS.abrirFormCarteira = function (cart = null, { quantas = 0, aoSalvar } = {}) {
    const editando = !!cart;
    let corSel = cart ? cart.cor : GS.CORES[(quantas * 3) % GS.CORES.length];
    let oculta = !!(cart && cart.oculta);

    const corpo = GS.el('div', '');
    corpo.style.display = 'contents';
    corpo.innerHTML = `
      <div class="field">
        <label for="cartNome">Nome</label>
        <div class="input" data-wrap="nome"><input id="cartNome" maxlength="40" placeholder="Ex.: Nubank, Carteira, Poupança" value="${esc(cart ? cart.nome : '')}"></div>
      </div>
      <div class="field"><span class="field-label">Tipo</span><div data-slot="tipo"></div></div>
      <div class="field">
        <label for="cartSaldo">Saldo inicial</label>
        <div class="input money"><span class="prefix">R$</span><input id="cartSaldo" placeholder="0,00"></div>
        <span class="field-hint">Quanto já havia nesta conta antes de usar o GSCASH. O cartão de crédito se configura em Faturas.</span>
      </div>
      <div class="chave-linha">
        <div class="chave-texto"><b>Ocultar carteira</b><small>Some da lista de carteiras e não entra no saldo.</small></div>
        <button type="button" class="switch" role="switch" data-oculta aria-label="Ocultar carteira"></button>
      </div>
      <div class="field">
        <span class="field-label">Cor</span>
        <div class="swatches" role="radiogroup" aria-label="Cor">
          ${GS.CORES.map(c => `<button type="button" role="radio" class="swatch" data-cor="${c}" style="background:${c}" aria-label="Cor ${c}"></button>`).join('')}
        </div>
      </div>`;

    const modal = GS.abrirModal({
      avisoDescarte: editando ? 'As alterações ainda não foram salvas.' : 'A carteira que você estava preenchendo ainda não foi criada.',
      titulo: editando ? 'Editar carteira' : 'Nova carteira',
      corpo,
      rodape: `<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
               <button type="button" class="btn btn-primary" data-salvar>${icone('check')}${editando ? 'Salvar alterações' : 'Criar carteira'}</button>`,
    });

    const tipo = GS.criarSelect({
      opcoes: Object.entries(GS.TIPOS_CARTEIRA).map(([valor, t]) => ({ valor, rotulo: t.nome, icone: t.icone })),
      valor: cart ? cart.tipo : 'corrente',
      rotuloAria: 'Tipo de carteira',
    });
    corpo.querySelector('[data-slot="tipo"]').append(tipo.el);

    const saldo = GS.campoMoeda(corpo.querySelector('#cartSaldo'), Math.max(0, cart ? cart.saldoInicial : 0));

    function pintar() {
      corpo.querySelectorAll('[data-cor]').forEach(b => {
        b.classList.toggle('active', b.dataset.cor === corSel);
        b.setAttribute('aria-checked', b.dataset.cor === corSel);
      });
      const chave = corpo.querySelector('[data-oculta]');
      chave.classList.toggle('on', oculta);
      chave.setAttribute('aria-checked', oculta);
    }

    corpo.addEventListener('click', e => {
      const b = e.target.closest('[data-cor]');
      if (b) { corSel = b.dataset.cor; pintar(); }
      if (e.target.closest('[data-oculta]')) { oculta = !oculta; pintar(); }
    });
    pintar();

    const botao = modal.foot.querySelector('[data-salvar]');
    const salvar = async () => {
      const nome = corpo.querySelector('#cartNome').value.trim();
      const wrap = corpo.querySelector('[data-wrap="nome"]');
      wrap.closest('.field').querySelector('.field-error')?.remove();
      wrap.classList.toggle('invalid', !nome);
      if (!nome) {
        wrap.closest('.field').append(GS.el('span', 'field-error', 'Dê um nome para a carteira.'));
        corpo.querySelector('#cartNome').focus();
        return;
      }
      const dados = {
        nome,
        tipo: tipo.valor,
        cor: corSel,
        saldoInicial: saldo.valor,
        oculta,
      };
      GS.salvando(botao, true);
      try {
        const salva = editando ? await GS.api.atualizarCarteira(cart.id, dados) : await GS.api.criarCarteira(dados);
        modal.fechar();
        GS.toast(editando ? 'Carteira atualizada' : 'Carteira criada');
        GS.notificarMudanca();
        if (aoSalvar) aoSalvar(salva);
      } catch (err) {
        GS.toast(err.message, 'erro');
        GS.salvando(botao, false);
      }
    };
    botao.addEventListener('click', salvar);
    corpo.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') salvar(); });
    corpo.querySelector('#cartNome').focus();
  };
})();
