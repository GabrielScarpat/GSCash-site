/* =========================================================
   GSCASH — modal "Novo gasto" / "Nova receita" (e "Editar …")
   Disponível em todas as telas pelo botão "Novo gasto".
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const { icone, esc } = GS;

  const FREQUENCIAS = [
    { valor: 'semanal', rotulo: 'Toda semana' },
    { valor: 'mensal', rotulo: 'Todo mês' },
    { valor: 'anual', rotulo: 'Todo ano' },
  ];

  const MAX_PARCELAS = 12;

  // transacao: objeto existente para editar (opcional)
  // padroes:   valores iniciais para uma nova transação (opcional)
  GS.abrirFormTransacao = async function (transacao = null, padroes = {}) {
    if (transacao && transacao.tipo === 'pagamento') {
      GS.toast('Pagamentos de fatura não podem ser editados.', 'erro');
      return;
    }
    const [categorias, carteiras] = await Promise.all([GS.api.listarCategorias(), GS.api.listarCarteiras()]);
    const cartoes = GS.faturas.cartoes(carteiras);
    const editando = !!transacao;
    const t = transacao || {
      tipo: 'despesa',
      titulo: '',
      descricao: '',
      valor: 0,
      data: GS.isoData(GS.hoje()),
      categoriaId: null,
      carteiraId: carteiras[0] ? carteiras[0].id : null,
      forma: 'debito',
      parcelas: 1,
      ...padroes,
    };
    let recorrente = false;

    const subcategoriasDe = id => ((categorias.find(c => c.id === id) || {}).subcategorias || []);
    // título igual ao nome da subcategoria = o usuário não escreveu um; o campo começa vazio
    const subInicial = subcategoriasDe(t.categoriaId).find(s => s.id === t.subcategoriaId);
    const tituloInicial = subInicial && t.titulo === subInicial.nome ? '' : t.titulo;

    const corpo = GS.el('form', 'modal-body-form');
    corpo.noValidate = true;
    corpo.style.display = 'contents';
    corpo.innerHTML = `
      ${editando ? '' : `
      <div class="toggle" role="group" aria-label="Frequência">
        <button type="button" data-rec="0" class="active" aria-pressed="true">${icone('clock')}Única</button>
        <button type="button" data-rec="1" aria-pressed="false">${icone('repeat')}Recorrente</button>
      </div>`}

      <div class="recurring-box hidden" data-recbox>
        <div class="field"><span class="field-label">Repetir</span><div data-slot="freq"></div></div>
        <div class="field">
          <label for="txVezes">Quantas vezes</label>
          <div class="input"><input id="txVezes" type="number" min="2" max="120" value="12"></div>
        </div>
        <p class="hint" data-rechint></p>
      </div>

      <div class="field">
        <span class="field-label">Tipo</span>
        <div class="toggle" role="group" aria-label="Tipo">
          <button type="button" data-tipo="despesa">${icone('arrow-down')}Despesa</button>
          <button type="button" data-tipo="receita">${icone('arrow-up')}Receita</button>
        </div>
      </div>

      <div class="row-2 empilhar">
        <div class="field"><span class="field-label">Categoria</span><div data-slot="categoria"></div></div>
        <div class="field"><span class="field-label">Subcategoria <span class="opt">(opcional)</span></span><div data-slot="subcategoria"></div></div>
      </div>

      <div class="field">
        <label for="txTitulo" data-rotulo-titulo>Título</label>
        <div class="input" data-wrap="titulo"><input id="txTitulo" maxlength="80" placeholder="Ex.: Almoço, Uber, Mercado" value="${esc(tituloInicial)}" autofocus></div>
        <span class="field-hint hidden" data-dica-titulo></span>
      </div>

      <div class="field">
        <label for="txDesc">Descrição <span class="opt">(opcional)</span></label>
        <div class="input"><input id="txDesc" maxlength="200" placeholder="Adicione detalhes, se quiser" value="${esc(t.descricao)}"></div>
      </div>

      <div class="row-2">
        <div class="field">
          <label for="txValor">Valor</label>
          <div class="input money" data-wrap="valor"><span class="prefix">R$</span><input id="txValor" placeholder="0,00"></div>
        </div>
        <div class="field"><span class="field-label">Data</span><div data-slot="data"></div></div>
      </div>

      <div class="field" data-campo-forma>
        <span class="field-label">Forma de pagamento</span>
        <div class="toggle" role="group" aria-label="Forma de pagamento">
          <button type="button" data-forma="debito">${icone('wallet')}Débito</button>
          <button type="button" data-forma="credito">${icone('card')}Crédito</button>
        </div>
      </div>

      <div class="row-2" data-linha-carteira>
        <div class="field"><span class="field-label" data-rotulo-carteira>Carteira</span><div data-slot="carteira"></div>
          <div class="sem-carteira hidden" data-sem-carteira>
            <p>Você ainda não tem nenhuma carteira. Ela diz de onde saiu o dinheiro deste gasto.</p>
            <button type="button" class="btn btn-primary" data-criar-carteira>${icone('plus')}Criar minha primeira carteira</button>
          </div>
        </div>
        <div class="field" data-campo-parcelas><span class="field-label">Parcelas</span><div data-slot="parcelas"></div></div>
      </div>

      <div class="aviso-credito hidden" data-sem-cartao>
        ${icone('alert')}
        <span>Nenhuma carteira tem crédito ativo. <a class="link-btn" href="faturas.html?configurar=1">Configurar crédito</a></span>
      </div>

      <div class="info-fatura hidden" data-info-fatura>
        ${icone('calendar')}
        <div><strong data-info-titulo></strong><span data-info-texto></span></div>
      </div>
    `;

    const rodape = `
      <button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
      <button type="button" class="btn btn-primary" data-salvar>${icone('check')}<span data-rotulo-salvar>${editando ? 'Salvar alterações' : 'Salvar gasto'}</span></button>`;

    const modal = GS.abrirModal({
      titulo: 'Novo gasto', corpo, rodape, tamanho: 'lg form-gasto',
      avisoDescarte: () => (editando ? 'As alterações ainda não foram salvas.'
        : tipo === 'receita' ? 'A receita que você estava preenchendo ainda não foi salva.'
        : 'O gasto que você estava preenchendo ainda não foi salvo.'),
    });
    const $ = sel => corpo.querySelector(sel);

    // celular (celular.css): Única/Recorrente e a descrição ficam atrás de "Mais opções"
    // (o resto fica à vista). Editando um lançamento recorrente ou com descrição, começa aberto.
    const janela = corpo.closest('.modal');
    [$('[data-rec]') && $('[data-rec]').parentElement, $('[data-recbox]'), $('#txDesc').closest('.field')]
      .forEach(c => c && c.classList.add('so-mais'));
    const botaoMais = GS.el('button', 'mais-opcoes', `${icone('chevron-down')}<span>Mais opções</span><small>repetir, descrição</small>`);
    botaoMais.type = 'button';
    botaoMais.setAttribute('aria-expanded', 'false');
    corpo.append(botaoMais);
    const abrirMais = aberto => {
      janela.classList.toggle('mais-aberto', aberto);
      botaoMais.setAttribute('aria-expanded', String(aberto));
      botaoMais.querySelector('span').textContent = aberto ? 'Menos opções' : 'Mais opções';
    };
    botaoMais.addEventListener('click', () => abrirMais(!janela.classList.contains('mais-aberto')));
    abrirMais(!!(t.recorrenciaId || t.descricao));

    /* campos */
    const valor = GS.campoMoeda($('#txValor'), t.valor);
    const data = GS.campoData(t.data, () => { atualizarDica(); atualizarFatura(); });
    $('[data-slot="data"]').append(data.el);

    const opcoesCategoria = tipo => categorias
      .filter(c => (c.tipo || 'despesa') === tipo)
      .map(c => ({ valor: c.id, rotulo: c.nome, icone: c.icone }));

    const categoria = GS.criarSelect({
      opcoes: opcoesCategoria(t.tipo),
      valor: t.categoriaId,
      placeholder: 'Escolha uma categoria',
      rotuloAria: 'Categoria',
      busca: true,
      aoMudar: trocarSubcategorias,
    });
    $('[data-slot="categoria"]').append(categoria.el);
    if (!categoria.valor) categoria.definirOpcoes(opcoesCategoria(t.tipo), (opcoesCategoria(t.tipo)[0] || {}).valor ?? null);

    const opcoesSubcategoria = () => [
      { valor: null, rotulo: 'Nenhuma', apagado: true },
      ...subcategoriasDe(categoria.valor).map(s => ({ valor: s.id, rotulo: s.nome })),
    ];

    const subcategoria = GS.criarSelect({
      opcoes: opcoesSubcategoria(),
      valor: subInicial ? subInicial.id : null,
      placeholder: 'Nenhuma',
      rotuloAria: 'Subcategoria',
      busca: true,
      aoMudar: pintarTitulo,
      // digitou um nome que não existe: cria a subcategoria ali mesmo
      criar: async nome => {
        try {
          const s = await GS.api.criarSubcategoria(categoria.valor, nome);
          const cat = categorias.find(c => c.id === categoria.valor);
          cat.subcategorias = [...(cat.subcategorias || []).filter(x => x.id !== s.id), s];
          GS.toast('Subcategoria criada');
          GS.notificarMudanca();
          return { valor: s.id, rotulo: s.nome };
        } catch (e) {
          GS.toast(e.message, 'erro');
          return null;
        }
      },
    });
    $('[data-slot="subcategoria"]').append(subcategoria.el);

    const nomeSubcategoria = () => (subcategoriasDe(categoria.valor).find(s => s.id === subcategoria.valor) || {}).nome || '';

    function trocarSubcategorias() {
      subcategoria.definirOpcoes(opcoesSubcategoria(), null);
      pintarTitulo();
    }

    // com subcategoria o título fica opcional: em branco, o gasto leva o nome dela
    function pintarTitulo() {
      const nome = nomeSubcategoria();
      $('[data-rotulo-titulo]').innerHTML = nome ? 'Título <span class="opt">(opcional)</span>' : 'Título';
      $('#txTitulo').placeholder = nome || 'Ex.: Almoço, Uber, Mercado';
      $('[data-dica-titulo]').textContent = nome ? `Se ficar em branco, aparece como “${nome}”.` : '';
      $('[data-dica-titulo]').classList.toggle('hidden', !nome);
      if (nome) erro($('[data-wrap="titulo"]'), '');
    }
    pintarTitulo();

    const carteira = GS.criarSelect({
      opcoes: [],
      valor: t.carteiraId,
      placeholder: 'Escolha uma carteira',
      rotuloAria: 'Carteira ou cartão',
      aoMudar: atualizarFatura,
    });
    $('[data-slot="carteira"]').append(carteira.el);

    const parcelas = GS.criarSelect({ opcoes: [], valor: t.parcelas || 1, rotuloAria: 'Parcelas', aoMudar: atualizarFatura });
    $('[data-slot="parcelas"]').append(parcelas.el);

    const frequencia = GS.criarSelect({ opcoes: FREQUENCIAS, valor: 'mensal', aoMudar: atualizarDica, rotuloAria: 'Repetir' });
    $('[data-slot="freq"]').append(frequencia.el);
    $('#txVezes').addEventListener('input', atualizarDica);

    let tipo = t.tipo;
    let forma = t.tipo === 'despesa' && t.forma === 'credito' ? 'credito' : 'debito';

    /* tipo */
    function pintarTipo() {
      corpo.querySelectorAll('[data-tipo]').forEach(b => {
        const ativo = b.dataset.tipo === tipo;
        b.classList.toggle('active', ativo);
        b.classList.toggle('expense', ativo && tipo === 'despesa');
        b.classList.toggle('income', ativo && tipo === 'receita');
        b.setAttribute('aria-pressed', ativo);
      });
      // "transação" é o nome geral; aqui a janela diz o que a pessoa está fazendo
      const receita = tipo === 'receita';
      modal.el.querySelector('.modal-title').textContent = editando
        ? (receita ? 'Editar receita' : 'Editar gasto')
        : (receita ? 'Nova receita' : 'Novo gasto');
      if (!editando) modal.foot.querySelector('[data-rotulo-salvar]').textContent = receita ? 'Salvar receita' : 'Salvar gasto';
    }
    corpo.querySelectorAll('[data-tipo]').forEach(b => b.addEventListener('click', () => {
      if (tipo === b.dataset.tipo) return;
      tipo = b.dataset.tipo;
      const opcoes = opcoesCategoria(tipo);
      categoria.definirOpcoes(opcoes, opcoes[0] ? opcoes[0].valor : null);
      trocarSubcategorias();
      pintarTipo();
      pintarForma();
    }));

    /* forma de pagamento (débito / crédito) */
    const credito = () => tipo === 'despesa' && forma === 'credito';

    function opcoesParcelas() {
      const v = valor.valor;
      return Array.from({ length: MAX_PARCELAS }, (_, i) => {
        const n = i + 1;
        if (n === 1) return { valor: 1, rotulo: v ? `À vista · ${GS.moeda(v)}` : 'À vista' };
        return { valor: n, rotulo: v ? `${n}x de ${GS.moeda(Math.floor(v / n))}` : `${n}x` };
      });
    }

    function pintarForma() {
      corpo.querySelectorAll('[data-forma]').forEach(b => {
        const ativo = b.dataset.forma === forma;
        b.classList.toggle('active', ativo);
        b.classList.toggle('credit', ativo && forma === 'credito');
        b.setAttribute('aria-pressed', ativo);
      });
      $('[data-campo-forma]').classList.toggle('hidden', tipo !== 'despesa');

      const lista = credito() ? cartoes : carteiras;
      const atual = lista.some(c => c.id === carteira.valor) ? carteira.valor : (lista[0] ? lista[0].id : null);
      carteira.definirOpcoes(lista.map(c => ({ valor: c.id, rotulo: c.nome, cor: c.cor })), atual);
      // ainda sem nenhuma carteira: no lugar da lista vazia, o convite para criar a primeira
      const semCarteira = !credito() && !carteiras.length;
      carteira.el.classList.toggle('hidden', semCarteira);
      $('[data-sem-carteira]').classList.toggle('hidden', !semCarteira);

      $('[data-rotulo-carteira]').textContent = credito() ? 'Cartão' : 'Carteira';
      const comParcelas = credito() && !recorrente;
      $('[data-campo-parcelas]').classList.toggle('hidden', !comParcelas);
      $('[data-linha-carteira]').classList.toggle('single', !comParcelas);
      $('[data-linha-carteira]').classList.toggle('hidden', credito() && !cartoes.length);
      $('[data-sem-cartao]').classList.toggle('hidden', !(credito() && !cartoes.length));
      parcelas.definirOpcoes(opcoesParcelas(), parcelas.valor || 1);
      atualizarFatura();
    }

    corpo.querySelectorAll('[data-forma]').forEach(b => b.addEventListener('click', () => {
      if (forma === b.dataset.forma) return;
      forma = b.dataset.forma;
      pintarForma();
    }));

    // aviso "Entra na fatura de outubro"
    function atualizarFatura() {
      const caixa = $('[data-info-fatura]');
      const cartao = cartoes.find(c => c.id === carteira.valor);
      if (!credito() || !cartao) { caixa.classList.add('hidden'); return; }
      const chave = GS.faturas.cicloDe(cartao, data.valor);
      const { fechamento, vencimento } = GS.faturas.datas(cartao, chave);
      const nomeMes = k => GS.mesAnoDeIso(k).split(' ')[0].toLowerCase();
      const n = recorrente ? 1 : (parcelas.valor || 1);
      let texto = `Fecha em ${GS.dataCurta(fechamento)} · vence em ${GS.dataCurta(vencimento)}`;
      if (n > 1) texto += ` · última parcela em ${nomeMes(GS.faturas.somarMeses(chave, n - 1))}`;
      $('[data-info-titulo]').textContent = `Entra na fatura de ${nomeMes(chave)}`;
      $('[data-info-texto]').textContent = texto;
      caixa.classList.remove('hidden');
    }

    $('#txValor').addEventListener('input', () => parcelas.definirOpcoes(opcoesParcelas(), parcelas.valor || 1));

    /* única / recorrente */
    corpo.querySelectorAll('[data-rec]').forEach(b => b.addEventListener('click', () => {
      recorrente = b.dataset.rec === '1';
      corpo.querySelectorAll('[data-rec]').forEach(x => {
        x.classList.toggle('active', x === b);
        x.setAttribute('aria-pressed', x === b);
      });
      $('[data-recbox]').classList.toggle('hidden', !recorrente);
      atualizarDica();
      pintarForma();
    }));

    function vezes() {
      return Math.max(2, Math.min(120, Math.floor(Number($('#txVezes').value)) || 2));
    }

    function atualizarDica() {
      if (!recorrente) return;
      const n = vezes();
      const inicio = GS.parseData(data.valor);
      let fim;
      if (frequencia.valor === 'semanal') fim = GS.somarDias(inicio, 7 * (n - 1));
      else if (frequencia.valor === 'anual') fim = new Date(inicio.getFullYear() + n - 1, inicio.getMonth(), inicio.getDate());
      else {
        const mes = new Date(inicio.getFullYear(), inicio.getMonth() + n - 1, 1);
        const ultimoDia = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
        fim = new Date(mes.getFullYear(), mes.getMonth(), Math.min(inicio.getDate(), ultimoDia));
      }
      $('[data-rechint]').textContent = `Serão criadas ${n} transações, de ${GS.dataMedia(inicio)} até ${GS.dataMedia(fim)}.`;
    }

    pintarTipo();
    pintarForma();

    // cria a carteira por cima deste formulário e volta com ela escolhida (o que já foi digitado fica)
    $('[data-criar-carteira]').addEventListener('click', () => GS.abrirFormCarteira(null, {
      quantas: carteiras.length,
      aoSalvar: nova => {
        carteiras.push(nova);
        pintarForma();
        erro(carteira.botao, '');
      },
    }));

    /* validação e envio */
    function erro(wrap, msg) {
      const alvo = wrap.closest('.field');
      alvo.querySelector('.field-error')?.remove();
      wrap.classList.toggle('invalid', !!msg);
      if (msg) alvo.append(GS.el('span', 'field-error', esc(msg)));
    }

    function validar() {
      const titulo = $('#txTitulo').value.trim() || nomeSubcategoria();
      erro($('[data-wrap="titulo"]'), titulo ? '' : 'Dê um nome ou escolha uma subcategoria.');
      erro($('[data-wrap="valor"]'), valor.valor > 0 ? '' : 'Informe um valor maior que zero.');
      erro(categoria.botao, categoria.valor ? '' : 'Escolha uma categoria.');
      erro(carteira.botao, carteira.valor ? '' : credito() ? 'Escolha um cartão.' : carteiras.length ? 'Escolha uma carteira.' : 'Crie uma carteira para continuar.');
      const ok = titulo && valor.valor > 0 && categoria.valor && carteira.valor;
      if (!ok) corpo.querySelector('.invalid')?.querySelector('input, button')?.focus?.();
      return ok;
    }

    $('#txTitulo').addEventListener('input', e => e.target.value.trim() && erro($('[data-wrap="titulo"]'), ''));
    $('#txValor').addEventListener('input', () => valor.valor > 0 && erro($('[data-wrap="valor"]'), ''));

    const botaoSalvar = modal.foot.querySelector('[data-salvar]');

    async function salvar() {
      if (!validar()) return;
      const dados = {
        tipo,
        titulo: $('#txTitulo').value,
        descricao: $('#txDesc').value,
        valor: valor.valor,
        data: data.valor,
        categoriaId: categoria.valor,
        subcategoriaId: subcategoria.valor,
        carteiraId: carteira.valor,
        forma: credito() ? 'credito' : 'debito',
        parcelas: credito() && !recorrente ? parcelas.valor : 1,
      };
      if (recorrente) dados.recorrencia = { frequencia: frequencia.valor, vezes: vezes() };

      GS.salvando(botaoSalvar, true);
      try {
        if (editando) {
          await GS.api.atualizarTransacao(transacao.id, dados);
          GS.toast(tipo === 'receita' ? 'Receita atualizada' : 'Gasto atualizado');
        } else {
          const criadas = await GS.api.criarTransacao(dados);
          GS.toast(tipo === 'receita'
            ? (criadas.length > 1 ? `${criadas.length} receitas salvas` : 'Receita salva')
            : (criadas.length > 1 ? `${criadas.length} gastos salvos` : 'Gasto salvo'));
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
  };
})();
