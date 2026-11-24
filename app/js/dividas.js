/* =========================================================
   GSCASH — Dívidas (no celular, dentro do "Mais")
   Anota quem deve à pessoa (Me devem) e a quem ela deve (Eu devo).
   · Recebi / Paguei aceitam uma parte; a dívida vai para "Quitadas" quando zera.
   · "Lançar na carteira" cria a receita ou o gasto na categoria "Dívidas",
     para o saldo da carteira continuar certo (GS.api.registrarPagamentoDivida).
   · Celular: um lado por vez (seletor); computador: os dois lado a lado.
   ========================================================= */

(function () {
  const { icone, esc } = GS;
  const $ = id => document.getElementById(id);

  let dividas = [];
  let carteiras = [];
  let lado = lerLado();

  function lerLado() {
    try { return sessionStorage.getItem('gscash:dividas-lado') === 'eu_devo' ? 'eu_devo' : 'me_devem'; } catch (e) { return 'me_devem'; }
  }
  function guardarLado() {
    try { sessionStorage.setItem('gscash:dividas-lado', lado); } catch (e) { /* sem problema */ }
  }

  const pago = d => (d.pagamentos || []).reduce((s, g) => s + g.valor, 0);
  const falta = d => Math.max(0, d.valor - pago(d));
  const quitada = d => falta(d) === 0;
  const hojeIso = () => GS.isoData(GS.hoje());
  const contas = () => carteiras.filter(c => c.tipo !== 'investimento');

  // "Vence em 3 dias", "Atrasada"... (só para quem ainda tem o que pagar)
  function prazo(d) {
    if (!d.vencimento || quitada(d)) return null;
    const dias = GS.diasEntre(GS.hoje(), GS.parseData(d.vencimento));
    if (dias < 0) return ['erro', 'Atrasada'];
    if (dias === 0) return ['alerta', 'Vence hoje'];
    if (dias === 1) return ['alerta', 'Vence amanhã'];
    if (dias <= 7) return ['alerta', `Vence em ${dias} dias`];
    return ['neutro', `Vence ${GS.dataCurta(d.vencimento)}`];
  }

  // atrasadas e as que vencem antes primeiro; sem vencimento, as mais novas
  function ordenar(a, b) {
    const va = a.vencimento || '9999', vb = b.vencimento || '9999';
    if (va !== vb) return va < vb ? -1 : 1;
    return b.data.localeCompare(a.data) || b.criadoEm - a.criadoEm;
  }

  /* ---------- Desenho ---------- */

  async function desenhar() {
    [dividas, carteiras] = await Promise.all([GS.api.listarDividas(), GS.api.listarCarteiras()]);
    const abertas = dividas.filter(d => !quitada(d));
    const soma = l => abertas.filter(d => d.lado === l).reduce((s, d) => s + falta(d), 0);
    const teDevem = soma('me_devem'), voceDeve = soma('eu_devo'), balanco = teDevem - voceDeve;

    if (!dividas.length) {
      $('resumo').innerHTML = '';
      $('lados').hidden = true;
      $('colunas').innerHTML = `
        <div class="div-vazio">
          <span class="ic">${icone('pessoas')}</span>
          <p><b>Nenhuma dívida anotada</b>Anote quem te deve e quem você deve, e marque quando o dinheiro voltar.</p>
          <button type="button" class="btn btn-primary" data-nova>${icone('plus')}Anotar a primeira</button>
        </div>`;
      return;
    }

    $('lados').hidden = false;
    $('resumo').innerHTML = `
      <div class="rec"><small>Te devem</small><b class="num">${GS.moeda(teDevem)}</b></div>
      <div class="dev"><small>Você deve</small><b class="num">${GS.moeda(voceDeve)}</b></div>
      <div class="bal"><small>Balanço</small><b class="num ${balanco < 0 ? 'neg' : balanco > 0 ? 'pos' : ''}">${balanco < 0 ? '− ' : balanco > 0 ? '+ ' : ''}${GS.moeda(Math.abs(balanco))}</b></div>`;

    $('lados').querySelectorAll('[data-lado]').forEach(b => {
      const on = b.dataset.lado === lado;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
      b.querySelector('[data-qtd]').textContent = abertas.filter(d => d.lado === b.dataset.lado).length || '';
    });

    $('colunas').dataset.lado = lado;
    $('colunas').innerHTML = ['me_devem', 'eu_devo'].map(l => coluna(l)).join('');
  }

  function coluna(l) {
    const doLado = dividas.filter(d => d.lado === l);
    const abertas = doLado.filter(d => !quitada(d)).sort(ordenar);
    const pagas = doLado.filter(quitada).sort((a, b) => ultimaData(b).localeCompare(ultimaData(a)));
    const nome = l === 'me_devem' ? 'Me devem' : 'Eu devo';
    return `
      <section class="div-col" data-lado="${l}" aria-label="${nome}">
        <h2 class="div-col-titulo">${nome} <span class="n-apag">${abertas.length || ''}</span></h2>
        <div class="div-lista">${abertas.length ? abertas.map(item).join('')
          : `<p class="div-nada">${l === 'me_devem' ? 'Ninguém te deve nada.' : 'Você não deve nada a ninguém.'}</p>`}</div>
        ${pagas.length ? `<details class="div-quitadas"><summary><span>Quitadas <span class="n-apag">${pagas.length}</span></span>${icone('chevron-down')}</summary>
          <div class="div-lista">${pagas.map(item).join('')}</div></details>` : ''}
      </section>`;
  }

  const ultimaData = d => (d.pagamentos || []).reduce((m, g) => (g.data > m ? g.data : m), d.data);

  function item(d) {
    const p = pago(d);
    const q = quitada(d);
    const est = prazo(d);
    return `
      <button type="button" class="div-item${q ? ' quitada' : ''}" data-id="${esc(d.id)}">
        <span><span class="nome">${esc(d.pessoa)}</span>${d.descricao ? `<span class="desc">${esc(d.descricao)}</span>` : ''}
          ${est ? `<span class="estado-txt ${est[0]}">${est[1]}</span>` : ''}
          ${q ? `<span class="estado-txt ok">${d.lado === 'me_devem' ? 'Recebida' : 'Paga'} em ${GS.dataCurta(ultimaData(d))}</span>` : ''}</span>
        <span class="val"><b class="num">${GS.moeda(q ? d.valor : falta(d))}</b>${p && !q ? `<small class="num">de ${GS.moeda(d.valor)}</small>` : ''}</span>
        ${p && !q ? `<span class="div-barra ${d.lado === 'eu_devo' ? 'deve' : ''}"><i style="width:${Math.round((p / d.valor) * 100)}%"></i></span>` : ''}
      </button>`;
  }

  /* ---------- Toques ---------- */

  $('lados').addEventListener('click', e => {
    const b = e.target.closest('[data-lado]');
    if (!b || b.dataset.lado === lado) return;
    lado = b.dataset.lado;
    guardarLado();
    desenhar();
  });
  $('novaDivida').addEventListener('click', () => abrirForm(null));
  $('colunas').addEventListener('click', e => {
    if (e.target.closest('[data-nova]')) return abrirForm(null);
    const b = e.target.closest('.div-item');
    if (b) abrirDetalhe(b.dataset.id);
  });

  /* ---------- Detalhe ---------- */

  function mostrarDetalhe(id) {
    const d = dividas.find(x => x.id === id);
    if (!d) return;
    const recebe = d.lado === 'me_devem';
    const p = pago(d), f = falta(d), q = quitada(d);
    const nomeConta = cid => (carteiras.find(c => c.id === cid) || {}).nome;
    const hist = [...(d.pagamentos || [])].sort((a, b) => b.data.localeCompare(a.data)).map(g => {
      const conta = g.transacaoId ? nomeConta(transacaoConta(g.transacaoId)) : null;
      return `<li><span>${recebe ? 'Recebi' : 'Paguei'}<small>${GS.dataCurta(g.data)}${conta ? ` · ${recebe ? 'no' : 'do'} ${esc(conta)}` : ''}</small></span>
        <b class="num">${GS.moeda(g.valor)}</b>
        <button type="button" class="icon-btn" data-desfazer="${esc(g.id)}" aria-label="Desfazer este ${recebe ? 'recebimento' : 'pagamento'}" title="Desfazer">${icone('x')}</button></li>`;
    });
    const inicio = d.transacaoId ? nomeConta(transacaoConta(d.transacaoId)) : null;
    hist.push(`<li><span>${recebe ? (d.transacaoId ? 'Emprestei' : 'Dívida anotada') : (d.transacaoId ? 'Peguei emprestado' : 'Dívida anotada')}
      <small>${GS.dataCurta(d.data)}${inicio ? ` · ${recebe ? 'saiu do' : 'entrou no'} ${esc(inicio)}` : ''}</small></span><b class="num">${GS.moeda(d.valor)}</b></li>`);

    const m = GS.abrirModal({
      titulo: d.descricao || 'Dívida',
      tamanho: 'sm div-modal',
      corpo: `
        <div class="div-det-quem"><b>${esc(d.pessoa)}</b>
          <small>${recebe ? 'Te deve' : 'Você deve'} desde ${GS.dataCurta(d.data)}${d.vencimento ? ` · vence ${GS.dataCurta(d.vencimento)}` : ''}</small></div>
        <div class="div-det-valor">
          <div class="l grande"><span>${q ? (recebe ? 'Recebida' : 'Paga') : recebe ? 'Falta receber' : 'Falta pagar'}</span><b class="num">${GS.moeda(q ? d.valor : f)}</b></div>
          ${p && !q ? `<div class="div-barra ${recebe ? '' : 'deve'}"><i style="width:${Math.round((p / d.valor) * 100)}%"></i></div>
            <div class="l"><span>${recebe ? 'Já recebido' : 'Já pago'}</span><b class="num">${GS.moeda(p)} de ${GS.moeda(d.valor)}</b></div>` : ''}
        </div>
        <div class="div-hist"><h3>Histórico</h3><ul>${hist.join('')}</ul></div>
        <div class="div-acoes">
          <button type="button" class="btn btn-outline" data-editar>${icone('pencil')}Editar</button>
          <button type="button" class="btn btn-outline perigo" data-excluir>${icone('trash')}Excluir</button>
        </div>`,
      rodapeClasse: 'um',
      rodape: q ? '<button type="button" class="btn btn-outline btn-lg" data-fechar>Fechar</button>'
        : `<button type="button" class="btn btn-primary btn-lg" data-pagar>${icone('check')}${recebe ? 'Recebi' : 'Paguei'}</button>`,
    });
    m.foot.querySelector('[data-pagar]')?.addEventListener('click', () => { m.fechar(); abrirPagamento(d); });
    m.body.querySelector('[data-editar]').addEventListener('click', () => { m.fechar(); abrirForm(d); });
    m.body.querySelector('[data-excluir]').addEventListener('click', () => { m.fechar(); excluir(d); });
    m.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-desfazer]');
      if (!b) return;
      const ok = await GS.confirmar({
        titulo: `Desfazer este ${recebe ? 'recebimento' : 'pagamento'}?`,
        mensagem: `O valor volta a contar como ${recebe ? 'a receber' : 'a pagar'}. Se ele foi lançado numa carteira, o lançamento também sai.`,
        botao: 'Desfazer',
      });
      if (!ok) return;
      try {
        await GS.api.excluirPagamentoDivida(d.id, b.dataset.desfazer);
        m.fechar();
        GS.toast(`${recebe ? 'Recebimento' : 'Pagamento'} desfeito`);
        GS.notificarMudanca();
      } catch (err) {
        GS.toast(err.message, 'erro');
      }
    });
  }

  // a carteira do lançamento ligado (para o histórico dizer "no Nubank")
  let transacoes = null;
  function transacaoConta(tid) {
    const t = (transacoes || []).find(x => x.id === tid);
    return t ? t.carteiraId : null;
  }
  document.addEventListener('gs:dados', () => { transacoes = null; });
  const carregarTransacoes = async () => { if (!transacoes) transacoes = await GS.api.listarTransacoes(); };
  async function abrirDetalhe(id) {
    await carregarTransacoes().catch(() => {});
    mostrarDetalhe(id);
  }

  /* ---------- Recebi / Paguei ---------- */

  function campoCarteira(valorInicial) {
    const ops = contas().map(c => ({ valor: c.id, rotulo: c.nome, cor: c.cor }));
    return GS.criarSelect({ opcoes: ops, valor: valorInicial || (ops[0] || {}).valor || null, placeholder: 'Escolha a carteira', rotuloAria: 'Carteira' });
  }

  // "Lançar na carteira" (ou "Saiu/Entrou dinheiro da carteira"): a chave e a carteira, que só aparece ligada
  function chaveCarteira(corpo, { titulo, texto, ligada }) {
    const temContas = contas().length > 0;
    const caixa = GS.el('div', '');
    caixa.style.display = 'contents';
    caixa.innerHTML = `
      <div class="chave-linha">
        <div class="chave-texto"><b>${esc(titulo)}</b><small>${esc(temContas ? texto : 'Crie uma carteira em Carteiras para lançar o valor nela.')}</small></div>
        <button type="button" class="switch" role="switch" aria-label="${esc(titulo)}" ${temContas ? '' : 'disabled'}></button>
      </div>
      <div class="field" data-campo-carteira><span class="field-label">Carteira</span><div data-slot></div></div>`;
    corpo.append(caixa);
    const sel = campoCarteira();
    caixa.querySelector('[data-slot]').append(sel.el);
    const chave = caixa.querySelector('.switch');
    let on = temContas && ligada;
    const pintar = () => {
      chave.classList.toggle('on', on);
      chave.setAttribute('aria-checked', String(on));
      caixa.querySelector('[data-campo-carteira]').classList.toggle('hidden', !on);
    };
    chave.addEventListener('click', () => { on = !on; pintar(); });
    pintar();
    return { get carteiraId() { return on ? sel.valor : null; } };
  }

  function abrirPagamento(d) {
    const recebe = d.lado === 'me_devem';
    const f = falta(d);
    const corpo = GS.el('div', '');
    corpo.style.display = 'contents';
    corpo.innerHTML = `
      <div class="field"><label for="divPagoValor">${recebe ? 'Quanto recebeu' : 'Quanto pagou'}</label>
        <div class="input money" data-wrap="valor"><span class="prefix">R$</span><input id="divPagoValor"></div>
        <div class="div-atalhos">
          <button type="button" class="on" data-parte="1">Tudo · ${GS.moedaVisivel(f)}</button>
          ${f >= 2 ? `<button type="button" data-parte="0.5">Metade · ${GS.moedaVisivel(Math.round(f / 2))}</button>` : ''}
        </div></div>
      <div class="field"><span class="field-label">Quando</span><div data-slot="data"></div></div>`;
    const m = GS.abrirModal({
      titulo: `${recebe ? 'Recebi de' : 'Paguei a'} ${d.pessoa}`,
      tamanho: 'sm div-modal',
      corpo,
      rodapeClasse: 'even',
      rodape: `<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
               <button type="button" class="btn btn-primary" data-ok>${icone('check')}Confirmar</button>`,
      avisoDescarte: 'O valor digitado será perdido.',
    });
    const valor = GS.campoMoeda(m.body.querySelector('#divPagoValor'), f);
    const data = GS.campoData(hojeIso());
    m.body.querySelector('[data-slot="data"]').append(data.el);
    const carteira = chaveCarteira(m.body, {
      titulo: 'Lançar na carteira',
      texto: recebe ? 'Entra como receita, na categoria Dívidas.' : 'Sai como gasto, na categoria Dívidas.',
      ligada: true,
    });
    const atalhos = m.body.querySelector('.div-atalhos');
    atalhos.addEventListener('click', e => {
      const b = e.target.closest('[data-parte]');
      if (!b) return;
      valor.valor = Number(b.dataset.parte) === 1 ? f : Math.round(f / 2);
      atalhos.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    });
    m.body.querySelector('#divPagoValor').addEventListener('input', () => {
      atalhos.querySelectorAll('button').forEach(x => x.classList.toggle('on', (Number(x.dataset.parte) === 1 ? f : Math.round(f / 2)) === valor.valor));
    });
    const ok = m.foot.querySelector('[data-ok]');
    ok.addEventListener('click', async () => {
      if (!(valor.valor > 0)) return GS.toast('Informe o valor.', 'erro');
      if (valor.valor > f) return GS.toast(`O valor é maior do que falta (${GS.moedaVisivel(f)}).`, 'erro');
      GS.salvando(ok, true);
      try {
        const nova = await GS.api.registrarPagamentoDivida(d.id, { valor: valor.valor, data: data.valor, carteiraId: carteira.carteiraId });
        m.fechar();
        GS.toast(quitada(nova) ? `Dívida ${recebe ? 'recebida' : 'paga'} por inteiro` : `${recebe ? 'Recebido' : 'Pago'}: ${GS.moedaVisivel(valor.valor)}`);
        GS.notificarMudanca();
      } catch (err) {
        GS.salvando(ok, false);
        GS.toast(err.message, 'erro');
      }
    });
  }

  /* ---------- Nova / editar ---------- */

  function abrirForm(d) {
    const editando = !!d;
    let ladoForm = d ? d.lado : lado;
    let venc = d ? d.vencimento : null;
    const corpo = GS.el('div', '');
    corpo.style.display = 'contents';
    corpo.innerHTML = `
      ${editando ? '' : `<div class="toggle" role="radiogroup" aria-label="Lado da dívida">
        <button type="button" role="radio" data-lado-form="me_devem">${icone('arrow-down')}Me devem</button>
        <button type="button" role="radio" data-lado-form="eu_devo">${icone('arrow-up')}Eu devo</button></div>`}
      <div class="field"><label for="divPessoa">Quem</label>
        <div class="input" data-wrap="pessoa"><input id="divPessoa" maxlength="60" placeholder="Nome da pessoa" autocomplete="off" value="${esc(d ? d.pessoa : '')}"></div>
        <div class="div-sugestoes" data-sugestoes></div></div>
      <div class="row-2">
        <div class="field"><label for="divValor">Valor</label><div class="input money" data-wrap="valor"><span class="prefix">R$</span><input id="divValor"></div></div>
        <div class="field"><span class="field-label">Desde</span><div data-slot="data"></div></div>
      </div>
      <div class="field"><span class="field-label">Vence <span class="opt">(opcional)</span></span><div class="div-venc" data-slot="venc"></div></div>
      <div class="field"><label for="divDesc">Descrição <span class="opt">(opcional)</span></label>
        <div class="input"><input id="divDesc" maxlength="80" placeholder="Ex.: Empréstimo, show, viagem" value="${esc(d ? d.descricao : '')}"></div></div>`;

    const m = GS.abrirModal({
      titulo: editando ? 'Editar dívida' : 'Nova dívida',
      tamanho: 'sm div-modal',
      corpo,
      rodapeClasse: 'even',
      rodape: `<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
               <button type="button" class="btn btn-primary" data-ok>${icone('check')}Salvar</button>`,
      avisoDescarte: 'O que você digitou será perdido.',
    });
    const b = m.body;
    const valor = GS.campoMoeda(b.querySelector('#divValor'), d ? d.valor : 0);
    const data = GS.campoData(d ? d.data : hojeIso());
    b.querySelector('[data-slot="data"]').append(data.el);
    if (editando) data.el.disabled = true;   // a data de início não muda (o lançamento dela, se houve, ficou nela)

    // vencimento opcional: "Sem data" ou o dia, com o "x" para tirar
    const slotVenc = b.querySelector('[data-slot="venc"]');
    function pintarVenc() {
      slotVenc.innerHTML = '';
      if (!venc) {
        const sem = GS.el('button', 'input select-btn', `${icone('calendar')}<span class="muted">Sem data</span>`);
        sem.type = 'button';
        sem.addEventListener('click', () => { venc = GS.isoData(GS.somarDias(GS.hoje(), 30)); pintarVenc(); });
        slotVenc.append(sem);
        return;
      }
      const campo = GS.campoData(venc, v => { venc = v; });
      const tirar = GS.el('button', 'icon-btn', icone('x'));
      tirar.type = 'button';
      tirar.setAttribute('aria-label', 'Tirar o vencimento');
      tirar.addEventListener('click', () => { venc = null; pintarVenc(); });
      slotVenc.append(campo.el, tirar);
      // o campo guarda a data escolhida; lê de volta na hora de salvar
      slotVenc._campo = campo;
    }
    pintarVenc();

    // sugestões com os nomes já usados
    const nomes = [...new Set(dividas.map(x => x.pessoa))];
    const pessoa = b.querySelector('#divPessoa');
    const sug = b.querySelector('[data-sugestoes]');
    const sugerir = () => {
      const t = GS.normalizar(pessoa.value.trim());
      const lista = t ? nomes.filter(n => GS.normalizar(n).includes(t) && GS.normalizar(n) !== t).slice(0, 4) : [];
      sug.innerHTML = lista.map(n => `<button type="button" data-nome="${esc(n)}">${esc(n)}</button>`).join('');
    };
    pessoa.addEventListener('input', sugerir);
    sug.addEventListener('click', e => {
      const x = e.target.closest('[data-nome]');
      if (x) { pessoa.value = x.dataset.nome; sug.innerHTML = ''; }
    });

    // lado (só ao criar) e a chave do dinheiro que já se mexeu
    let carteira = null;
    if (!editando) {
      const pintarLado = () => b.querySelectorAll('[data-lado-form]').forEach(x => {
        const on = x.dataset.ladoForm === ladoForm;
        x.classList.toggle('active', on);
        x.classList.toggle('income', on && ladoForm === 'me_devem');
        x.classList.toggle('expense', on && ladoForm === 'eu_devo');
        x.setAttribute('aria-checked', String(on));
      });
      const chaveHost = GS.el('div', '');
      chaveHost.style.display = 'contents';
      b.append(chaveHost);
      const pintarChave = () => {
        chaveHost.innerHTML = '';
        carteira = chaveCarteira(chaveHost, ladoForm === 'me_devem'
          ? { titulo: 'Saiu dinheiro da carteira', texto: 'Ligue se você emprestou. Para uma conta dividida, deixe desligada.', ligada: false }
          : { titulo: 'Entrou dinheiro na carteira', texto: 'Ligue se pegou emprestado. Para uma conta que alguém pagou por você, deixe desligada.', ligada: false });
      };
      b.querySelector('.toggle').addEventListener('click', e => {
        const x = e.target.closest('[data-lado-form]');
        if (!x || x.dataset.ladoForm === ladoForm) return;
        ladoForm = x.dataset.ladoForm;
        pintarLado();
        pintarChave();
      });
      pintarLado();
      pintarChave();
    }

    const ok = m.foot.querySelector('[data-ok]');
    ok.addEventListener('click', async () => {
      const nome = pessoa.value.trim();
      if (!nome) { pessoa.focus(); return GS.toast('Diga com quem é a dívida.', 'erro'); }
      if (!(valor.valor > 0)) return GS.toast('Informe o valor.', 'erro');
      const vencimento = venc ? slotVenc._campo.valor : null;
      if (vencimento && vencimento < data.valor) return GS.toast('O vencimento não pode ser antes da data da dívida.', 'erro');
      GS.salvando(ok, true);
      try {
        const dados = { pessoa: nome, valor: valor.valor, vencimento, descricao: b.querySelector('#divDesc').value };
        if (editando) await GS.api.atualizarDivida(d.id, dados);
        else {
          await GS.api.criarDivida({ ...dados, lado: ladoForm, data: data.valor, carteiraId: carteira && carteira.carteiraId });
          if (ladoForm !== lado) { lado = ladoForm; guardarLado(); }
        }
        m.fechar();
        GS.toast(editando ? 'Dívida atualizada' : 'Dívida anotada');
        GS.notificarMudanca();
      } catch (err) {
        GS.salvando(ok, false);
        GS.toast(err.message, 'erro');
      }
    });
  }

  /* ---------- Excluir ---------- */

  async function excluir(d) {
    const lancados = [d.transacaoId, ...(d.pagamentos || []).map(g => g.transacaoId)].filter(Boolean).length;
    let comLancamentos = false;
    if (lancados) {
      const escolha = await GS.escolherOpcao({
        titulo: 'Excluir a dívida?',
        texto: `A dívida com <b>${esc(d.pessoa)}</b> tem ${GS.plural(lancados, 'lançamento', 'lançamentos')} nas carteiras.`,
        rotulo: 'O que excluir',
        perigo: true,
        opcoes: [
          { valor: 'so', titulo: 'Só a dívida', dica: 'Os lançamentos ficam nas carteiras (o dinheiro se mexeu de verdade).', botao: 'Excluir' },
          { valor: 'tudo', titulo: 'A dívida e os lançamentos', dica: 'Para quando ela foi anotada por engano.', botao: 'Excluir tudo' },
        ],
      });
      if (!escolha) return;
      comLancamentos = escolha === 'tudo';
    } else if (!await GS.confirmar({ titulo: 'Excluir a dívida?', mensagem: `A dívida com <b>${esc(d.pessoa)}</b> sai da lista.` })) {
      return;
    }
    try {
      await GS.api.excluirDivida(d.id, { comLancamentos });
      GS.toast('Dívida excluída');
      GS.notificarMudanca();
    } catch (err) {
      GS.toast(err.message, 'erro');
    }
  }

  GS.iniciarPagina('dividas', desenhar);
})();
