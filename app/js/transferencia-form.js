/* =========================================================
   GSCASH — janela "Transferir entre contas"
   Abre pelo botão "Transferir" do topo, pela página Carteiras
   e ao editar uma transferência.
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const { icone, esc } = GS;

  const REPETICOES = [
    { valor: 'nao', rotulo: 'Não repetir' },
    { valor: 'semanal', rotulo: 'Toda semana' },
    { valor: 'mensal', rotulo: 'Todo mês' },
    { valor: 'anual', rotulo: 'Todo ano' },
  ];

  // transferencia: existente para editar (opcional) · padroes: { origemId, destinoId }
  GS.abrirFormTransferencia = async function (transferencia = null, padroes = {}) {
    const ctx = await GS.carregarTudo();
    const carteiras = ctx.carteiras;
    const editando = !!transferencia;

    if (carteiras.length < 2) {
      const m = GS.abrirModal({
        titulo: 'Transferir entre contas',
        tamanho: 'sm',
        rodapeClasse: 'even',
        corpo: `<p>Para transferir você precisa de pelo menos duas carteiras.</p>`,
        rodape: `<button type="button" class="btn btn-outline" data-fechar>Fechar</button>
                 <a class="btn btn-primary" href="carteiras.html">${icone('plus')}Criar carteira</a>`,
      });
      return m;
    }

    // saldos sem contar a própria transferência que está sendo editada
    const outras = editando ? ctx.transacoes.filter(t => t.id !== transferencia.id) : ctx.transacoes;
    const saldo = id => GS.calc.saldoCarteira(ctx.carteira.get(id), outras);

    let origemId = transferencia ? transferencia.carteiraId : (padroes.origemId || carteiras[0].id);
    let destinoId = transferencia ? transferencia.destinoId
      : (padroes.destinoId || (carteiras.find(c => c.id !== origemId) || {}).id);

    const corpo = GS.el('div', '');
    corpo.style.display = 'contents';
    corpo.innerHTML = `
      <label class="valor-transf" for="tfValor">
        <span class="prefixo">R$</span><input id="tfValor" placeholder="0,00" aria-label="Valor da transferência">
      </label>
      <span class="field-error erro-valor-transf hidden" data-erro-valor></span>

      <div class="contas-transf">
        <div class="conta-transf" data-lado="origem">
          <small>De</small>
          <div class="cab"><span data-tile></span><div data-slot="origem"></div></div>
          <span class="saldo-transf num" data-saldo></span>
        </div>
        <button type="button" class="seta-transf" data-inverter title="Inverter" aria-label="Inverter origem e destino">${icone('arrow-right')}</button>
        <div class="conta-transf" data-lado="destino">
          <small>Para</small>
          <div class="cab"><span data-tile></span><div data-slot="destino"></div></div>
          <span class="saldo-transf num" data-saldo></span>
        </div>
      </div>
      <span class="field-error hidden" data-erro-contas></span>

      <div class="row-2">
        <div class="field"><span class="field-label">Data</span><div data-slot="data"></div></div>
        ${editando ? '' : '<div class="field"><span class="field-label">Repetir</span><div data-slot="repetir"></div></div>'}
      </div>

      <div class="recurring-box hidden" data-recbox>
        <div class="field">
          <label for="tfVezes">Quantas vezes</label>
          <div class="input"><input id="tfVezes" type="number" min="2" max="120" value="12"></div>
        </div>
        <p class="hint" data-rechint style="align-self:end"></p>
      </div>

      <div class="field">
        <label for="tfDesc">Descrição <span class="opt">(opcional)</span></label>
        <div class="input"><input id="tfDesc" maxlength="200" placeholder="Ex.: Guardar para a viagem" value="${esc(transferencia ? transferencia.descricao : '')}"></div>
      </div>`;

    const modal = GS.abrirModal({
      avisoDescarte: editando ? 'As alterações ainda não foram salvas.' : 'A transferência que você estava preenchendo ainda não foi feita.',
      titulo: editando ? 'Editar transferência' : 'Transferir entre contas',
      corpo,
      tamanho: 'lg transf',
      rodape: `<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
               <button type="button" class="btn btn-primary" data-salvar>${icone('check')}<span data-rotulo-salvar></span></button>`,
    });
    const $ = sel => corpo.querySelector(sel);

    /* campos */
    const inputValor = $('#tfValor');
    const valor = GS.campoMoeda(inputValor, transferencia ? transferencia.valor : 0);

    const opcoes = carteiras.map(c => ({ valor: c.id, rotulo: c.nome, cor: c.cor }));
    const origem = GS.criarSelect({ opcoes, valor: origemId, rotuloAria: 'Carteira de origem', aoMudar: v => { origemId = v; pintar(); } });
    const destino = GS.criarSelect({ opcoes, valor: destinoId, rotuloAria: 'Carteira de destino', aoMudar: v => { destinoId = v; pintar(); } });
    $('[data-slot="origem"]').append(origem.el);
    $('[data-slot="destino"]').append(destino.el);

    const data = GS.campoData(transferencia ? transferencia.data : GS.isoData(GS.hoje()), atualizarDica);
    $('[data-slot="data"]').append(data.el);

    let repetir = null;
    if (!editando) {
      repetir = GS.criarSelect({
        opcoes: REPETICOES,
        valor: 'nao',
        rotuloAria: 'Repetir',
        aoMudar: () => { $('[data-recbox]').classList.toggle('hidden', repetir.valor === 'nao'); atualizarDica(); },
      });
      $('[data-slot="repetir"]').append(repetir.el);
      $('#tfVezes').addEventListener('input', atualizarDica);
    }

    const vezes = () => Math.max(2, Math.min(120, Math.floor(Number($('#tfVezes').value)) || 2));

    function atualizarDica() {
      if (!repetir || repetir.valor === 'nao') return;
      const nomes = { semanal: 'toda semana', mensal: 'todo mês', anual: 'todo ano' };
      $('[data-rechint]').textContent = `Serão ${vezes()} transferências, ${nomes[repetir.valor]}, a partir de ${GS.dataMedia(data.valor)}.`;
    }

    // ajusta a largura do campo de valor ao número digitado
    function larguraValor() {
      inputValor.style.width = `${Math.max(4, (inputValor.value || inputValor.placeholder).length) + 0.5}ch`;
    }

    function pintar() {
      const v = valor.valor;
      corpo.querySelectorAll('.conta-transf').forEach(card => {
        const lado = card.dataset.lado;
        const id = lado === 'origem' ? origemId : destinoId;
        const c = ctx.carteira.get(id);
        const tipo = GS.TIPOS_CARTEIRA[c.tipo] || GS.TIPOS_CARTEIRA.corrente;
        card.querySelector('[data-tile]').innerHTML = GS.widgets.tileTingido(c.cor, tipo.icone, 'sm');
        const antes = saldo(id);
        const depois = lado === 'origem' ? antes - v : antes + v;
        card.querySelector('[data-saldo]').innerHTML = v
          ? `${GS.moeda(antes)} → <strong class="${depois < 0 ? 'negativo' : ''}">${GS.moeda(depois)}</strong>`
          : `Saldo: ${GS.moeda(antes)}`;
      });
      const mesma = origemId === destinoId;
      const erro = $('[data-erro-contas]');
      erro.textContent = mesma ? 'Escolha carteiras diferentes.' : '';
      erro.classList.toggle('hidden', !mesma);
      modal.foot.querySelector('[data-rotulo-salvar]').textContent =
        editando ? 'Salvar alterações' : (v ? `Transferir ${GS.moeda(v)}` : 'Transferir');
      larguraValor();
    }

    inputValor.addEventListener('input', () => {
      if (valor.valor > 0) $('[data-erro-valor]').classList.add('hidden');
      pintar();
    });

    $('[data-inverter]').addEventListener('click', () => {
      [origemId, destinoId] = [destinoId, origemId];
      origem.valor = origemId;
      destino.valor = destinoId;
      pintar();
    });

    pintar();
    setTimeout(() => inputValor.focus(), 60);

    /* envio */
    const botaoSalvar = modal.foot.querySelector('[data-salvar]');

    async function salvar() {
      // os erros aparecem embaixo do próprio campo, como no Novo gasto
      const erroValor = $('[data-erro-valor]');
      erroValor.textContent = 'Informe o valor da transferência.';
      erroValor.classList.toggle('hidden', valor.valor > 0);
      if (valor.valor <= 0) {
        inputValor.focus();
        return;
      }
      if (origemId === destinoId) return; // o aviso embaixo das carteiras já está na tela
      const dados = {
        valor: valor.valor,
        data: data.valor,
        origemId,
        destinoId,
        descricao: $('#tfDesc').value,
      };
      if (repetir && repetir.valor !== 'nao') dados.recorrencia = { frequencia: repetir.valor, vezes: vezes() };

      GS.salvando(botaoSalvar, true);
      try {
        if (editando) {
          await GS.api.atualizarTransferencia(transferencia.id, dados);
          GS.toast('Transferência atualizada');
        } else {
          const criadas = await GS.api.criarTransferencia(dados);
          GS.toast(criadas.length > 1 ? `${criadas.length} transferências criadas` : 'Transferência feita');
        }
        modal.fechar();
        GS.notificarMudanca();
      } catch (e) {
        GS.toast(e.message, 'erro');
        GS.salvando(botaoSalvar, false);
      }
    }

    botaoSalvar.addEventListener('click', salvar);
    corpo.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); salvar(); }
    });
    return modal;
  };

  // editar uma transferência pelo mesmo caminho das outras transações
  const abrirTransacao = GS.abrirFormTransacao;
  GS.abrirFormTransacao = function (transacao = null, padroes = {}) {
    if (transacao && transacao.tipo === 'transferencia') return GS.abrirFormTransferencia(transacao);
    return abrirTransacao(transacao, padroes);
  };
})();
