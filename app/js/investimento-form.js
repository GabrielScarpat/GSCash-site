/* =========================================================
   GSCASH — formulário de investimento
   Usado em dois lugares:
   · aba Investimentos (js/investimentos.js): nova aplicação e editar
   · revisão do extrato (js/importar.js): investimento que aparece pela primeira
     vez; o valor e a data vêm do extrato e o formulário só devolve os dados
   As prévias de rendimento usam js/indices.js (se a página tiver carregado).
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const { icone, esc } = GS;

  const TIPOS = [
    { valor: 'cdb', rotulo: 'CDB', icone: 'trending', indexador: 'cdi_pct', taxa: 100 },
    { valor: 'lci_lca', rotulo: 'LCI / LCA', icone: 'trending', indexador: 'cdi_pct', taxa: 90 },
    { valor: 'tesouro', rotulo: 'Tesouro', icone: 'bank', indexador: 'selic', taxa: 0 },
    { valor: 'poupanca', rotulo: 'Poupança', icone: 'piggy', indexador: 'poupanca', taxa: 0, liquidez: 'diaria' },
    { valor: 'fundos', rotulo: 'Fundos / Ações', icone: 'briefcase', indexador: 'sem_taxa', taxa: 0, liquidez: 'diaria' },
    { valor: 'outro', rotulo: 'Outro', icone: 'trending', indexador: 'cdi_pct', taxa: 100 },
  ];
  const tipoDe = v => TIPOS.find(t => t.valor === v) || TIPOS[TIPOS.length - 1];

  const INDEXADORES = [
    { valor: 'cdi_pct', rotulo: '% do CDI', sufixo: '%', com: true },
    { valor: 'cdi_mais', rotulo: 'CDI + taxa', sufixo: '% a.a.', com: true },
    { valor: 'prefixado', rotulo: 'Prefixado', sufixo: '% a.a.', com: true },
    { valor: 'ipca_mais', rotulo: 'IPCA + taxa', sufixo: '% a.a.', com: true },
    { valor: 'selic', rotulo: 'Selic (Tesouro Selic)' },
    { valor: 'poupanca', rotulo: 'Poupança (regra oficial)' },
    { valor: 'sem_taxa', rotulo: 'Sem taxa (atualizo à mão)' },
  ];
  const indexadorDe = v => INDEXADORES.find(i => i.valor === v) || INDEXADORES[INDEXADORES.length - 1];

  const pct = n => `${GS.numero(Math.round(n * 100))}%`.replace(/,00%$/, '%');
  const taxaTexto = n => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

  // "110% do CDI", "IPCA + 6,2% a.a.", "regra oficial"…
  function comoRende(inv) {
    if (!inv) return 'sem taxa';
    const t = taxaTexto(inv.taxa);
    switch (inv.indexador) {
      case 'cdi_pct': return `${t}% do CDI`;
      case 'cdi_mais': return `CDI + ${t}% a.a.`;
      case 'prefixado': return `Prefixado ${t}% a.a.`;
      case 'ipca_mais': return `IPCA + ${t}% a.a.`;
      case 'selic': return 'Selic';
      case 'poupanca': return 'regra oficial';
      default: return 'sem taxa';
    }
  }

  /* opções:
       ctx            GS.carregarTudo()
       carteira       editar este investimento (a carteira dele)
       estimadoHoje   valor de hoje (prévia do vencimento ao editar)
       extrato        { titulo, linhas, total, data, conta, sugestao: { nome, tipo, indexador, taxa, liquidez } }
                      -> modo da revisão do extrato: não grava; chama aoUsar(dados)
       aoUsar(dados), aoNaoE()                                                    */
  function abrir({ ctx, carteira = null, estimadoHoje = 0, extrato = null, aoUsar, aoNaoE } = {}) {
    const editando = !!carteira;
    const doExtrato = !!extrato;
    const inv = carteira ? ctx.investimento.get(carteira.id) : null;
    const sug = extrato ? extrato.sugestao : null;
    const contas = GS.calc.disponiveis(ctx.carteiras).concat(ctx.carteiras.filter(c => c.oculta && c.tipo !== 'investimento'));
    let tipo = inv ? inv.tipo : sug ? sug.tipo : 'cdb';
    let liquidez = inv ? inv.liquidez : sug ? sug.liquidez : 'vencimento';
    const hojeIso = GS.isoData(GS.hoje());
    const indices = GS.indices;
    if (indices && !indices.dados) indices.carregar(extrato ? extrato.data : hojeIso).then(() => atualizarPrevias()).catch(() => {});

    const corpo = GS.el('form', 'modal-body-form inv-form');
    corpo.noValidate = true;
    corpo.style.display = 'contents';
    corpo.innerHTML = `
      ${doExtrato ? `<div class="inv-origem"><span>No extrato: <b>${esc(extrato.titulo)}</b></span>
        <span>${GS.plural(extrato.linhas, 'linha', 'linhas')} · ${GS.moeda(extrato.total)} ${extrato.saindo ? 'saindo da' : 'voltando para a'} ${esc(extrato.conta.nome)}</span></div>` : ''}
      <div class="field"><span class="field-label">Tipo</span>
        <div class="inv-chips" role="radiogroup" aria-label="Tipo">${TIPOS.map(t => `<button type="button" role="radio" data-tipo="${t.valor}">${esc(t.rotulo)}</button>`).join('')}</div></div>
      <div class="field"><label for="invNome">Nome</label>
        <div class="input" data-wrap="nome"><input id="invNome" maxlength="60" placeholder="Ex.: CDB Inter, Tesouro Selic 2029" value="${esc(carteira ? carteira.nome : sug ? sug.nome : '')}"></div></div>
      ${editando || doExtrato ? '' : `
      <div class="row-2">
        <div class="field"><label for="invValor">Valor aplicado</label><div class="input money" data-wrap="valor"><span class="prefix">R$</span><input id="invValor"></div></div>
        <div class="field"><span class="field-label">Data</span><div data-slot="data"></div></div>
      </div>
      <div class="field"><span class="field-label">Saiu de</span><div data-slot="origem"></div>
        <span class="field-hint" data-dica-origem></span></div>`}
      <div class="recurring-box inv-bloco">
        <div class="field"><span class="field-label">Quanto rende</span>
          <div class="inv-rende"><div data-slot="indexador"></div>
            <div class="input inv-taxa" data-wrap="taxa"><input id="invTaxa" inputmode="decimal" placeholder="0"><span class="prefix" data-sufixo></span></div></div></div>
        <p class="hint" data-previa-taxa></p>
      </div>
      <div class="recurring-box inv-bloco">
        <div class="field"><span class="field-label">Quando fica disponível para resgate</span>
          <div class="toggle" role="group" aria-label="Quando fica disponível">
            <button type="button" data-liq="diaria">A qualquer momento</button>
            <button type="button" data-liq="vencimento">Em uma data</button>
          </div></div>
        <div class="row-2" data-linha-venc>
          <div class="field"><span class="field-label">Data</span><div data-slot="venc"></div></div>
          <div class="field"><span class="field-label">Volta para</span><div data-slot="destino"></div></div>
        </div>
        <p class="hint" data-previa-venc></p>
      </div>
      ${doExtrato ? `<p class="inv-aprende">${icone('brilho')}<span>Nas próximas importações, linhas como <b>“${esc(extrato.titulo)}”</b> vão direto para este investimento, sem perguntar de novo.</span></p>
        <button type="button" class="link-btn inv-nao-e" data-nao-e>Não é investimento (lançar como ${extrato.saindo ? 'gasto' : 'receita'})</button>` : ''}`;

    const rotuloSalvar = doExtrato ? 'Salvar e usar' : editando ? 'Salvar alterações' : 'Salvar aplicação';
    const rodape = `<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
      <button type="button" class="btn btn-primary" data-salvar>${icone('check')}${rotuloSalvar}</button>`;
    const modal = GS.abrirModal({
      titulo: doExtrato ? 'Investimento novo' : editando ? 'Editar investimento' : 'Nova aplicação',
      corpo, rodape, tamanho: 'lg inv-modal',
    });
    const q = s => corpo.querySelector(s);

    const valor = editando || doExtrato ? null : GS.campoMoeda(q('#invValor'), 0);
    const data = editando || doExtrato ? null : GS.campoData(hojeIso, atualizarPrevias);
    if (data) q('[data-slot="data"]').append(data.el);
    const origem = editando || doExtrato ? null : GS.criarSelect({
      opcoes: [...contas.map(c => ({ valor: c.id, rotulo: c.nome, cor: c.cor })), { valor: '', rotulo: 'Já estava investido (não mexe nas contas)', apagado: true }],
      valor: contas[0] ? contas[0].id : '', rotuloAria: 'Saiu de', aoMudar: atualizarPrevias,
    });
    if (origem) q('[data-slot="origem"]').append(origem.el);

    const indexador = GS.criarSelect({
      opcoes: INDEXADORES.map(i => ({ valor: i.valor, rotulo: i.rotulo })),
      valor: inv ? inv.indexador : sug ? sug.indexador : tipoDe(tipo).indexador,
      rotuloAria: 'Como rende', aoMudar: () => { pintarTaxa(); atualizarPrevias(); },
    });
    q('[data-slot="indexador"]').append(indexador.el);
    q('#invTaxa').value = taxaTexto(inv ? inv.taxa : sug ? sug.taxa : tipoDe(tipo).taxa);
    q('#invTaxa').addEventListener('input', atualizarPrevias);

    const base = extrato ? GS.parseData(extrato.data) : GS.hoje();
    const venc = GS.campoData(inv && inv.vencimento ? inv.vencimento : GS.isoData(new Date(base.getFullYear() + 2, base.getMonth(), base.getDate())), atualizarPrevias);
    q('[data-slot="venc"]').append(venc.el);
    const destino = GS.criarSelect({
      opcoes: contas.map(c => ({ valor: c.id, rotulo: c.nome, cor: c.cor })),
      valor: (inv && inv.destinoId) || (extrato && extrato.conta.id) || (contas[0] && contas[0].id),
      rotuloAria: 'Volta para', aoMudar: atualizarPrevias,
    });
    q('[data-slot="destino"]').append(destino.el);

    const taxa = () => Number(String(q('#invTaxa').value).replace(/\./g, '').replace(',', '.')) || 0;

    function pintarTipo() {
      corpo.querySelectorAll('[data-tipo]').forEach(b => { const on = b.dataset.tipo === tipo; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    }
    function pintarTaxa() {
      const i = indexadorDe(indexador.valor);
      q('[data-wrap="taxa"]').classList.toggle('hidden', !i.com);
      q('[data-sufixo]').textContent = i.sufixo || '';
    }
    function pintarLiquidez() {
      corpo.querySelectorAll('[data-liq]').forEach(b => { const on = b.dataset.liq === liquidez; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
      q('[data-linha-venc]').classList.toggle('hidden', liquidez !== 'vencimento');
      atualizarPrevias();
    }
    function atualizarPrevias() {
      const i = indexador.valor;
      const anual = indices && indices.dados ? indices.taxaAnual(i, taxa()) : null;
      const r = indices && indices.dados ? indices.resumo() : null;
      let texto = '';
      if (i === 'sem_taxa') texto = 'Sem cálculo automático: use “Atualizar valor” quando quiser registrar quanto ele vale.';
      else if (anual == null) texto = 'Sem os índices do Banco Central agora (verifique a internet).';
      else if (i === 'cdi_pct' && r) texto = `Hoje o CDI está em <b>${pct(r.cdiAno)} ao ano</b>: este investimento rende cerca de <b>${pct(anual)} ao ano</b>.`;
      else texto = `Hoje isso dá cerca de <b>${pct(anual)} ao ano</b>.`;
      q('[data-previa-taxa]').innerHTML = texto;

      if (origem) {
        q('[data-dica-origem]').textContent = origem.valor ? 'Sai como transferência, não como gasto.' : 'O valor entra como já investido; nenhuma conta muda.';
      }
      let previa = '';
      if (liquidez === 'vencimento' && i !== 'sem_taxa' && indices && indices.dados) {
        const valorBase = editando ? estimadoHoje : doExtrato ? (extrato.saindo ? extrato.total : 0) : valor.valor;
        const de = editando ? hojeIso : doExtrato ? extrato.data : data.valor;
        const f = indices.fator({ indexador: i, taxa: taxa() }, de, venc.valor);
        const conta = (contas.find(c => c.id === destino.valor) || {}).nome || 'conta';
        if (valorBase > 0 && venc.valor > de) previa = `Em <b>${GS.dataMedia(GS.parseData(venc.valor))}</b>, cerca de <b>${GS.moeda(Math.round(valorBase * f))}</b> (antes de impostos) aparece como <b>Prevista</b> na ${esc(conta)}. Nesse dia, você confirma quanto entrou de verdade.`;
      } else if (liquidez === 'vencimento') {
        previa = 'Nesse dia, o GSCASH pergunta quanto entrou na conta.';
      }
      q('[data-previa-venc]').innerHTML = previa;
    }

    corpo.querySelectorAll('[data-tipo]').forEach(b => b.addEventListener('click', () => {
      tipo = b.dataset.tipo;
      const t = tipoDe(tipo);
      indexador.definirOpcoes(INDEXADORES.map(i => ({ valor: i.valor, rotulo: i.rotulo })), t.indexador);
      q('#invTaxa').value = taxaTexto(t.taxa);
      if (t.liquidez) liquidez = t.liquidez;
      pintarTipo(); pintarTaxa(); pintarLiquidez();
    }));
    corpo.querySelectorAll('[data-liq]').forEach(b => b.addEventListener('click', () => { liquidez = b.dataset.liq; pintarLiquidez(); }));
    if (valor) q('#invValor').addEventListener('input', atualizarPrevias);
    q('[data-nao-e]')?.addEventListener('click', () => { modal.fechar(); if (aoNaoE) aoNaoE(); });

    pintarTipo(); pintarTaxa(); pintarLiquidez();

    const botao = modal.foot.querySelector('[data-salvar]');
    botao.addEventListener('click', async () => {
      const dados = {
        nome: q('#invNome').value.trim(), tipo, indexador: indexador.valor, taxa: taxa(), liquidez,
        vencimento: liquidez === 'vencimento' ? venc.valor : null, destinoId: destino.valor,
      };
      if (doExtrato) {
        // não grava ainda (vai junto com a importação): só confere o básico aqui
        const comTaxa = indexadorDe(dados.indexador).com;
        const erro = !dados.nome ? 'Dê um nome ao investimento.'
          : comTaxa && !(dados.taxa > 0) ? 'Informe quanto o investimento rende.'
          : liquidez === 'vencimento' && !(dados.vencimento > extrato.data) ? 'A data de resgate precisa ser depois do extrato.'
          : null;
        if (erro) return GS.toast(erro, 'erro');
        modal.fechar();
        if (aoUsar) aoUsar(dados);
        return;
      }
      if (!editando) Object.assign(dados, { valor: valor.valor, data: data.valor, origemId: origem.valor || null });
      GS.salvando(botao, true);
      try {
        if (editando) await GS.api.atualizarInvestimento(carteira.id, dados);
        else await GS.api.criarInvestimento(dados);
        GS.toast(editando ? 'Investimento atualizado' : 'Aplicação salva');
        modal.fechar();
        GS.notificarMudanca();
      } catch (e) {
        GS.toast(e.message, 'erro');
        GS.salvando(botao, false);
      }
    });
  }

  GS.formInvestimento = { TIPOS, INDEXADORES, tipoDe, indexadorDe, comoRende, pct, taxaTexto, abrir };
})();
