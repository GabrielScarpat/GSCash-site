/* =========================================================
   GSCASH — Categorias
   ========================================================= */

(function () {
  const { icone, esc, widgets } = GS;
  const $ = id => document.getElementById(id);

  let ctx = null;
  let porSubcategoria = new Map();
  const abertas = new Set(); // categorias com o detalhe por subcategoria aberto
  const destacadas = new Set(); // recém-baixadas do pacote, em destaque por alguns segundos

  // mês exibido ('AAAA-MM'); aceita ?mes= na URL
  const mesUrl = new URLSearchParams(location.search).get('mes');
  let mesSel = /^\d{4}-\d{2}$/.test(mesUrl || '') ? mesUrl : GS.isoMes(GS.hoje());

  const nomeMes = iso => GS.mesAnoDeIso(iso).split(' ')[0].toLowerCase();
  const textoMes = () => (mesSel === GS.isoMes(GS.hoje()) ? 'este mês' : `em ${nomeMes(mesSel)}`);

  function irParaMes(iso) {
    mesSel = iso;
    const p = new URLSearchParams(location.search);
    if (iso === GS.isoMes(GS.hoje())) p.delete('mes'); else p.set('mes', iso);
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
    desenhar();
  }

  /* ---------- Desenho ---------- */

  async function desenhar() {
    ctx = await GS.carregarTudo();
    const [ano, mes] = mesSel.split('-').map(Number);
    const ini = mesSel + '-01';
    const fim = GS.isoData(new Date(ano, mes, 0));
    $('mesRotulo').textContent = GS.mesAnoDeIso(mesSel);

    const doMes = ctx.transacoes.filter(t => t.data >= ini && t.data <= fim);
    const porCategoria = new Map(GS.calc.agrupar(doMes, 'categoriaId').map(g => [g.id, g]));
    const gasto = id => (porCategoria.get(id) || { total: 0, quantidade: 0 });
    porSubcategoria = new Map(GS.calc.agrupar(doMes.filter(t => t.subcategoriaId), 'subcategoriaId').map(g => [g.id, g]));

    const despesas = ctx.categorias.filter(c => (c.tipo || 'despesa') === 'despesa')
      .sort((a, b) => gasto(b.id).total - gasto(a.id).total);
    const receitas = ctx.categorias.filter(c => c.tipo === 'receita')
      .sort((a, b) => gasto(b.id).total - gasto(a.id).total);
    const totalDespesas = despesas.reduce((s, c) => s + gasto(c.id).total, 0);

    $('distMes').textContent = GS.mesAnoDeIso(mesSel);
    $('orcMes').textContent = GS.mesAnoDeIso(mesSel);

    // rosca
    const itens = despesas.filter(c => gasto(c.id).total > 0)
      .map(c => ({ rotulo: c.nome, valor: gasto(c.id).total, cor: c.cor }));
    $('distribuicao').innerHTML = itens.length
      ? `<div class="donut-wrap">${widgets.rosca(itens, totalDespesas)}${widgets.legenda(itens, totalDespesas)}</div>`
      : widgets.vazio(`Nenhum gasto em ${nomeMes(mesSel)}`);

    // orçamentos
    const comOrcamento = despesas.filter(c => c.orcamento > 0);
    const semOrcamento = despesas.filter(c => !(c.orcamento > 0));
    $('orcamentos').innerHTML = (comOrcamento.length
      ? comOrcamento.map(c => {
          const g = gasto(c.id).total;
          const uso = g / c.orcamento;
          const nivel = uso >= 0.9 ? 'danger' : uso >= 0.75 ? 'warning' : '';
          const passou = g > c.orcamento
            ? `<span class="budget-over">${GS.moeda(g - c.orcamento)} acima do orçamento</span>` : '';
          return `
            <li class="budget">
              <div class="budget-line">
                <span class="tile sm">${icone(c.icone)}</span>
                <span class="budget-name">${esc(c.nome)}</span>
                <span class="num budget-val"><strong>${GS.moeda(g)}</strong> / ${GS.moeda(c.orcamento)}</span>
                <button type="button" class="icon-btn" data-orcamento="${c.id}" aria-label="Editar orçamento de ${esc(c.nome)}">${icone('pencil')}</button>
              </div>
              <div class="bar"><span class="${nivel}" style="width:${Math.min(100, uso * 100)}%"></span></div>
              ${passou}
            </li>`;
        }).join('')
      : widgets.vazio('Nenhum orçamento definido', 'Defina um limite mensal para acompanhar seus gastos.'))
      + (semOrcamento.length
        ? `<li class="budget-add"><button type="button" class="link-btn" id="definirOrcamento">${icone('plus')}Definir orçamento</button></li>`
        : '');

    // listas
    $('totalCategorias').textContent = GS.plural(despesas.length, 'categoria', 'categorias');
    $('listaDespesas').innerHTML = despesas.length
      ? despesas.map(c => linhaCategoria(c, gasto(c.id), totalDespesas)).join('')
      : widgets.vazio('Nenhuma categoria de despesa');

    $('cardReceitas').classList.toggle('hidden', !receitas.length);
    $('totalReceitas').textContent = GS.plural(receitas.length, 'categoria', 'categorias');
    $('listaReceitas').innerHTML = receitas.map(c => linhaCategoria(c, gasto(c.id))).join('');
  }

  function linhaCategoria(c, g, total) {
    const receita = c.tipo === 'receita';
    const subs = c.subcategorias || [];
    const aberta = abertas.has(c.id);
    return `
      <li class="row-item ${destacadas.has(c.id) ? 'destaque' : ''}">
        ${widgets.tileTingido(c.cor, c.icone)}
        <div class="row-body">
          <div class="row-title">${esc(c.nome)}</div>
          <div class="row-sub">${GS.plural(g.quantidade, 'transação', 'transações')} ${textoMes()}${subs.length ? ` · ${GS.plural(subs.length, 'subcategoria', 'subcategorias')}` : ''}</div>
        </div>
        <div class="row-values num">
          <strong class="${receita && g.total ? 'income' : ''}">${receita && g.total ? '+' : ''}${GS.moeda(g.total)}</strong>
          ${receita ? '' : `<span>${GS.pct(g.total, total)}</span>`}
        </div>
        <button type="button" class="icon-btn expandir ${aberta ? 'aberta' : ''}" data-expandir="${c.id}" aria-expanded="${aberta}" aria-label="Subcategorias de ${esc(c.nome)}">${icone('chevron-down')}</button>
        <button type="button" class="icon-btn kebab" data-menu="${c.id}" aria-label="Opções de ${esc(c.nome)}">${icone('more')}</button>
      </li>
      ${aberta ? detalheSubcategorias(c, g) : ''}`;
  }

  // quanto foi para cada subcategoria no mês (com o mesmo alinhamento da linha da categoria)
  function detalheSubcategorias(c, g) {
    const receita = c.tipo === 'receita';
    const linhas = c.subcategorias
      .map(s => ({ id: s.id, nome: s.nome, ...(porSubcategoria.get(s.id) || { total: 0, quantidade: 0 }) }))
      .sort((a, b) => b.total - a.total);
    const semTotal = g.total - linhas.reduce((n, l) => n + l.total, 0);
    const semQtd = g.quantidade - linhas.reduce((n, l) => n + l.quantidade, 0);
    if (semQtd > 0) linhas.push({ id: null, nome: 'Sem subcategoria', total: semTotal, quantidade: semQtd });

    const vazia = c.subcategorias.length
      ? ''
      : `<li><div class="sub-item sem"><span class="tile" aria-hidden="true"></span><div class="row-body"><div class="row-sub">Nenhuma subcategoria ainda.${GS.somenteLeitura ? '' : ' Crie a primeira:'}</div></div></div></li>`;
    // com a licença vencida o app fica só leitura: sem o campo de criar
    const campoNova = GS.somenteLeitura ? '' : `
      <li><form class="sub-item sub-nova" data-nova-sub="${c.id}" novalidate>
        <span class="tile" aria-hidden="true"></span>
        <input maxlength="40" placeholder="Nova subcategoria (ex.: Mercado)" aria-label="Nova subcategoria em ${esc(c.nome)}">
        <button type="submit" class="btn btn-primary">${icone('plus')}Adicionar</button>
      </form></li>`;

    return `
      <li class="sub-detalhe"><ul class="sub-lista">${vazia}${linhas.map(l => {
        const miolo = `
          <span class="tile" aria-hidden="true"></span>
          <div class="row-body">
            <div class="sub-nome">${esc(l.nome)}</div>
            <div class="row-sub">${l.quantidade ? GS.plural(l.quantidade, 'transação', 'transações') : `nada ${textoMes()}`}</div>
          </div>
          <div class="bar sub-bar"><span style="width:${g.total ? (l.total / g.total) * 100 : 0}%;background:${c.cor}"></span></div>
          <div class="row-values num">
            <strong class="${receita && l.total ? 'income' : ''}">${receita && l.total ? '+' : ''}${GS.moeda(l.total)}</strong>
            <span>${GS.pct(l.total, g.total)}</span>
          </div>
          <span class="icon-btn vazio" aria-hidden="true"></span><span class="icon-btn vazio" aria-hidden="true"></span>`;
        return l.id
          ? `<li><a class="sub-item" href="transacoes.html?categoria=${encodeURIComponent(l.id)}&mes=${mesSel}" title="Ver transações de ${esc(l.nome)}">${miolo}</a></li>`
          : `<li><div class="sub-item sem">${miolo}</div></li>`;
      }).join('')}${campoNova}</ul></li>`;
  }

  /* ---------- Formulário de categoria ---------- */

  function abrirForm(cat = null) {
    const editando = !!cat;
    let tipo = cat ? (cat.tipo || 'despesa') : 'despesa';
    let iconeSel = cat ? cat.icone : 'tag';
    let corSel = cat ? cat.cor : GS.CORES[ctx.categorias.length % GS.CORES.length];

    const corpo = GS.el('div', '');
    corpo.style.display = 'contents';
    corpo.innerHTML = `
      ${editando ? '' : `
      <div class="field">
        <span class="field-label">Tipo</span>
        <div class="toggle" role="group" aria-label="Tipo">
          <button type="button" data-tipo="despesa">${icone('arrow-down')}Despesa</button>
          <button type="button" data-tipo="receita">${icone('arrow-up')}Receita</button>
        </div>
      </div>`}
      <div class="field">
        <label for="catNome">Nome</label>
        <div class="input" data-wrap="nome"><input id="catNome" maxlength="40" placeholder="Ex.: Pets, Viagens, Presentes" value="${esc(cat ? cat.nome : '')}"></div>
      </div>
      <div class="field">
        <label for="catSub">Subcategorias <span class="opt">(opcional)</span></label>
        <div class="chips-edit" data-subs>
          <input id="catSub" maxlength="40" placeholder="Adicionar e apertar Enter" autocomplete="off">
        </div>
      </div>
      <div class="field">
        <span class="field-label">Ícone</span>
        <div class="icon-pick" role="radiogroup" aria-label="Ícone">
          ${GS.ICONES_CATEGORIA.map(n => `<button type="button" role="radio" data-icone="${n}" aria-label="${n}">${icone(n)}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <span class="field-label">Cor</span>
        <div class="swatches" role="radiogroup" aria-label="Cor">
          ${GS.CORES.map(c => `<button type="button" role="radio" class="swatch" data-cor="${c}" style="background:${c}" aria-label="Cor ${c}"></button>`).join('')}
        </div>
      </div>
      <div class="field" data-campo-orc>
        <label for="catOrc">Orçamento mensal <span class="opt">(opcional)</span></label>
        <div class="input money"><span class="prefix">R$</span><input id="catOrc" placeholder="0,00"></div>
      </div>`;

    const modal = GS.abrirModal({
      avisoDescarte: editando ? 'As alterações ainda não foram salvas.' : 'A categoria que você estava preenchendo ainda não foi criada.',
      titulo: editando ? 'Editar categoria' : 'Nova categoria',
      corpo,
      rodape: `<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
               <button type="button" class="btn btn-primary" data-salvar>${icone('check')}${editando ? 'Salvar alterações' : 'Criar categoria'}</button>`,
    });

    const orc = GS.campoMoeda(corpo.querySelector('#catOrc'), cat ? cat.orcamento : 0);

    function pintar() {
      corpo.querySelectorAll('[data-tipo]').forEach(b => {
        const ativo = b.dataset.tipo === tipo;
        b.classList.toggle('active', ativo);
        b.classList.toggle('expense', ativo && tipo === 'despesa');
        b.classList.toggle('income', ativo && tipo === 'receita');
      });
      corpo.querySelectorAll('[data-icone]').forEach(b => {
        b.classList.toggle('active', b.dataset.icone === iconeSel);
        b.setAttribute('aria-checked', b.dataset.icone === iconeSel);
      });
      corpo.querySelectorAll('[data-cor]').forEach(b => {
        b.classList.toggle('active', b.dataset.cor === corSel);
        b.setAttribute('aria-checked', b.dataset.cor === corSel);
      });
      corpo.querySelector('[data-campo-orc]').classList.toggle('hidden', tipo === 'receita');
    }

    /* subcategorias: Enter adiciona, clique no nome renomeia, × remove (só vale ao salvar) */
    const subs = cat ? (cat.subcategorias || []).map(s => ({ ...s })) : [];
    const caixaSubs = corpo.querySelector('[data-subs]');
    const novaSub = corpo.querySelector('#catSub');
    const repetida = (nome, ignorar = -1) => subs.some((s, i) => i !== ignorar && s.nome.toLowerCase() === nome.toLowerCase());

    function erroSub(msg) {
      const campo = caixaSubs.closest('.field');
      campo.querySelector('.field-error')?.remove();
      caixaSubs.classList.toggle('invalid', !!msg);
      if (msg) campo.append(GS.el('span', 'field-error', esc(msg)));
    }

    function pintarSubs() {
      caixaSubs.querySelectorAll('.chip-edit').forEach(c => c.remove());
      subs.forEach((s, i) => caixaSubs.insertBefore(GS.el('span', 'chip-edit', `
        <button type="button" class="chip-nome" data-renomear="${i}" title="Renomear">${esc(s.nome)}</button>
        <button type="button" class="chip-x" data-remover="${i}" aria-label="Remover ${esc(s.nome)}">${icone('x')}</button>`), novaSub));
    }

    // devolve false se o texto digitado não pôde entrar (repetido)
    function adicionarSub() {
      const nome = novaSub.value.trim();
      if (!nome) return true;
      if (repetida(nome)) { erroSub('Essa subcategoria já existe.'); return false; }
      subs.push({ nome });
      novaSub.value = '';
      erroSub('');
      pintarSubs();
      return true;
    }

    function renomearSub(i) {
      const chip = caixaSubs.querySelectorAll('.chip-edit')[i];
      chip.classList.add('editando');
      chip.innerHTML = `<input maxlength="40" value="${esc(subs[i].nome)}" aria-label="Renomear subcategoria">`;
      const campo = chip.querySelector('input');
      const ajustar = () => { campo.style.width = Math.max(4, campo.value.length + 1) + 'ch'; };
      let feito = false;
      const terminar = gravar => {
        if (feito) return;
        feito = true;
        const nome = campo.value.trim();
        if (gravar && nome && repetida(nome, i)) GS.toast('Essa subcategoria já existe.', 'erro');
        else if (gravar && nome) subs[i].nome = nome;
        pintarSubs();
      };
      campo.addEventListener('input', ajustar);
      campo.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        terminar(e.key === 'Enter');
        novaSub.focus();
      });
      campo.addEventListener('blur', () => terminar(true));
      ajustar();
      campo.focus();
      campo.select();
    }

    caixaSubs.addEventListener('click', e => {
      const remover = e.target.closest('[data-remover]');
      const renomear = e.target.closest('[data-renomear]');
      if (remover) { subs.splice(Number(remover.dataset.remover), 1); pintarSubs(); novaSub.focus(); }
      else if (renomear) renomearSub(Number(renomear.dataset.renomear));
      else if (e.target === caixaSubs) novaSub.focus();
    });
    novaSub.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !novaSub.value.trim()) return;
      e.preventDefault();
      e.stopPropagation(); // Enter aqui adiciona; não salva a categoria
      adicionarSub();
    });
    novaSub.addEventListener('input', () => erroSub(''));
    pintarSubs();

    corpo.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tipo) tipo = b.dataset.tipo;
      if (b.dataset.icone) iconeSel = b.dataset.icone;
      if (b.dataset.cor) corSel = b.dataset.cor;
      pintar();
    });
    pintar();

    const salvar = async () => {
      const nome = corpo.querySelector('#catNome').value.trim();
      const wrap = corpo.querySelector('[data-wrap="nome"]');
      wrap.closest('.field').querySelector('.field-error')?.remove();
      wrap.classList.toggle('invalid', !nome);
      if (!nome) {
        wrap.closest('.field').append(GS.el('span', 'field-error', 'Dê um nome para a categoria.'));
        corpo.querySelector('#catNome').focus();
        return;
      }
      if (!adicionarSub()) return novaSub.focus();
      const dados = {
        nome,
        icone: iconeSel,
        cor: corSel,
        orcamento: tipo === 'despesa' ? orc.valor : null,
        subcategorias: subs.map(s => ({ id: s.id, nome: s.nome })),
      };
      const botao = modal.foot.querySelector('[data-salvar]');
      GS.salvando(botao, true);
      try {
        if (editando) await GS.api.atualizarCategoria(cat.id, dados);
        else await GS.api.criarCategoria({ ...dados, tipo });
        modal.fechar();
        GS.toast(editando ? 'Categoria atualizada' : 'Categoria criada');
        GS.notificarMudanca();
      } catch (err) {
        GS.toast(err.message, 'erro');
        GS.salvando(botao, false);
      }
    };
    modal.foot.querySelector('[data-salvar]').addEventListener('click', salvar);
    corpo.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') salvar(); });
  }

  /* ---------- Orçamento ---------- */

  function abrirOrcamento(cat = null) {
    const semOrcamento = ctx.categorias.filter(c => (c.tipo || 'despesa') === 'despesa' && !(c.orcamento > 0));
    const corpo = GS.el('div', '');
    corpo.style.display = 'contents';
    corpo.innerHTML = `
      ${cat ? '' : '<div class="field"><span class="field-label">Categoria</span><div data-slot="cat"></div></div>'}
      <div class="field">
        <label for="orcValor">Limite mensal${cat ? ` para <strong>${esc(cat.nome)}</strong>` : ''}</label>
        <div class="input money"><span class="prefix">R$</span><input id="orcValor" placeholder="0,00" autofocus></div>
      </div>`;

    let seletor = null;
    if (!cat) {
      seletor = GS.criarSelect({
        opcoes: semOrcamento.map(c => ({ valor: c.id, rotulo: c.nome, icone: c.icone })),
        valor: semOrcamento[0] ? semOrcamento[0].id : null,
        rotuloAria: 'Categoria',
      });
      corpo.querySelector('[data-slot="cat"]').append(seletor.el);
    }

    const modal = GS.abrirModal({
      titulo: cat ? 'Editar orçamento' : 'Definir orçamento',
      corpo,
      tamanho: 'sm',
      rodapeClasse: 'even',
      rodape: `${cat
        ? '<button type="button" class="btn btn-outline" data-remover>Remover</button>'
        : '<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>'}
        <button type="button" class="btn btn-primary" data-salvar>${icone('check')}Salvar</button>`,
    });

    const valor = GS.campoMoeda(corpo.querySelector('#orcValor'), cat ? cat.orcamento : 0);

    const gravar = async v => {
      const id = cat ? cat.id : seletor.valor;
      if (!id) return;
      const botao = modal.foot.querySelector(v ? '[data-salvar]' : '[data-remover]');
      GS.salvando(botao, true);
      try {
        await GS.api.atualizarCategoria(id, { orcamento: v });
      } catch (err) {
        GS.salvando(botao, false);
        return GS.toast(err.message, 'erro');
      }
      modal.fechar();
      GS.toast(v ? 'Orçamento salvo' : 'Orçamento removido');
      GS.notificarMudanca();
    };

    modal.foot.querySelector('[data-salvar]').addEventListener('click', () => {
      if (valor.valor <= 0) return GS.toast('Informe um valor maior que zero.', 'erro');
      gravar(valor.valor);
    });
    modal.foot.querySelector('[data-remover]')?.addEventListener('click', () => gravar(null));
  }

  /* ---------- Categorias sugeridas (pacote) ---------- */

  async function abrirSugeridas() {
    let pacote;
    try {
      pacote = await GS.api.pacoteSugerido();
    } catch (err) {
      return GS.toast(err.message, 'erro');
    }

    // compara cada categoria do pacote com as do usuário, pelo nome
    const itens = pacote.map(p => {
      const sua = ctx.categorias.find(c => GS.normalizar(c.nome).trim() === GS.normalizar(p.nome).trim());
      const tem = sua ? (sua.subcategorias || []).map(s => GS.normalizar(s.nome).trim()) : [];
      const faltam = p.subcategorias.filter(s => !tem.includes(GS.normalizar(s).trim()));
      return { ...p, sua, faltam, completa: !!sua && !faltam.length };
    });

    const item = (it, i) => {
      const selo = !it.sua ? '<span class="selo-pac nova">Nova</span>'
        : it.completa ? '<span class="selo-pac tem">Você já tem tudo</span>'
        : `<span class="selo-pac junta">Junta com a sua · +${it.faltam.length}</span>`;
      const chips = it.subcategorias.map(s => it.faltam.includes(s)
        ? `<span class="pac-sub ${it.sua ? 'mais' : ''}">${it.sua ? '+ ' : ''}${esc(s)}</span>`
        : `<span class="pac-sub ja">${esc(s)}</span>`).join('');
      return `
        <li><label class="pac-item ${it.completa ? 'off' : ''}">
          <input type="checkbox" data-i="${i}" ${it.completa ? 'disabled' : 'checked'}>
          <span class="pac-caixa">${icone('check')}</span>
          <span class="tile sm">${icone(it.icone)}</span>
          <span class="pac-corpo">
            <span class="pac-linha"><span class="pac-nome">${esc(it.nome)}</span>${selo}</span>
            <span class="pac-subs">${chips}</span>
          </span>
        </label></li>`;
    };
    const grupo = tipo => itens.map(item).filter((_, i) => itens[i].tipo === tipo).join('');

    const corpo = GS.el('div', '');
    corpo.style.display = 'contents';
    corpo.innerHTML = `
      <div class="pacote-head">
        <span class="tile">${icone('download')}</span>
        <div><strong>Pacote do dia a dia</strong><small>Feito a partir dos gastos mais comuns de quem está começando a vida financeira.</small></div>
      </div>
      <div class="pac-legenda"><span><span class="pac-sub mais">verde</span> entra agora</span><span><span class="pac-sub ja">tracejada</span> você já tem</span></div>
      <div class="pac-grupo"><span>Despesas</span><button type="button" class="link-btn" data-todas>Desmarcar todas</button></div>
      <ul class="pac-lista">${grupo('despesa')}</ul>
      <div class="pac-grupo"><span>Receitas</span></div>
      <ul class="pac-lista">${grupo('receita')}</ul>
      <p class="pac-resumo" data-resumo></p>`;

    const modal = GS.abrirModal({
      titulo: 'Categorias sugeridas',
      corpo,
      tamanho: 'lg',
      rodape: `<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
               <button type="button" class="btn btn-primary" data-salvar>${icone('download')}Adicionar</button>`,
    });
    const botao = modal.foot.querySelector('[data-salvar]');
    const marcados = () => [...corpo.querySelectorAll('.pac-item input:checked')].map(inp => itens[inp.dataset.i]);
    const despesasLivres = () => [...corpo.querySelectorAll('.pac-item input:not(:disabled)')]
      .filter(inp => itens[inp.dataset.i].tipo === 'despesa');

    function resumir() {
      const escolhidos = marcados();
      const cats = escolhidos.filter(it => !it.sua).length;
      const subs = escolhidos.reduce((n, it) => n + it.faltam.length, 0);
      const partes = [];
      if (cats) partes.push(`<strong>${GS.plural(cats, 'categoria nova', 'categorias novas')}</strong>`);
      if (subs) partes.push(`<strong>${GS.plural(subs, 'subcategoria', 'subcategorias')}</strong>`);
      corpo.querySelector('[data-resumo]').innerHTML = itens.every(it => it.completa)
        ? 'Você já tem tudo deste pacote.'
        : partes.length
          ? `${cats + subs === 1 ? 'Vai entrar' : 'Vão entrar'} ${partes.join(' e ')}. Nada do que você já tem muda.`
          : 'Nada marcado.';
      botao.disabled = !(cats || subs);
      const todas = despesasLivres().every(inp => inp.checked);
      corpo.querySelector('[data-todas]').textContent = todas ? 'Desmarcar todas' : 'Marcar todas';
    }

    corpo.addEventListener('change', resumir);
    corpo.querySelector('[data-todas]').addEventListener('click', () => {
      const lista = despesasLivres();
      const marcar = !lista.every(inp => inp.checked);
      lista.forEach(inp => { inp.checked = marcar; });
      resumir();
    });
    resumir();

    botao.addEventListener('click', async () => {
      GS.salvando(botao, true);
      try {
        const r = await GS.api.baixarPacote(marcados().map(it => it.nome));
        modal.fechar();
        const partes = [];
        if (r.novas.length) partes.push(GS.plural(r.novas.length, 'categoria', 'categorias'));
        if (r.subcategorias) partes.push(GS.plural(r.subcategorias, 'subcategoria', 'subcategorias'));
        GS.toast(`${partes.join(' e ')} ${r.novas.length + r.subcategorias === 1 ? 'adicionada' : 'adicionadas'}`);
        r.novas.forEach(id => destacadas.add(id));
        setTimeout(() => {
          destacadas.clear();
          document.querySelectorAll('.row-item.destaque').forEach(li => li.classList.remove('destaque'));
        }, 4000);
        GS.notificarMudanca();
      } catch (err) {
        GS.toast(err.message, 'erro');
        GS.salvando(botao, false);
      }
    });
  }

  /* ---------- Eventos ---------- */

  $('novaCategoria').addEventListener('click', () => abrirForm());
  $('baixarSugeridas').addEventListener('click', abrirSugeridas);

  const somarMes = n => { const [a, m] = mesSel.split('-').map(Number); return GS.isoMes(new Date(a, m - 1 + n, 1)); };
  $('mesAnterior').addEventListener('click', () => irParaMes(somarMes(-1)));
  $('mesProximo').addEventListener('click', () => irParaMes(somarMes(1)));

  let seletor = null;
  $('mesBotao').addEventListener('click', () => {
    if ($('mesBotao').classList.contains('open') && seletor) return seletor.fechar();
    const comDados = new Set(ctx.transacoes.filter(t => t.tipo !== 'pagamento').map(t => t.data.slice(0, 7)));
    seletor = GS.abrirSeletorMes({ ancora: $('mesBotao'), valor: mesSel, comDados, aoEscolher: irParaMes });
  });

  $('orcamentos').addEventListener('click', e => {
    const b = e.target.closest('[data-orcamento]');
    if (b) abrirOrcamento(ctx.categoria.get(b.dataset.orcamento));
    if (e.target.closest('#definirOrcamento')) abrirOrcamento();
  });

  // abre o detalhe da categoria com o cursor no campo de nova subcategoria
  async function abrirNovaSubcategoria(id) {
    abertas.add(id);
    await desenhar();
    document.querySelector(`[data-nova-sub="${CSS.escape(id)}"] input`)?.focus();
  }

  document.querySelector('main').addEventListener('submit', async e => {
    const form = e.target.closest('[data-nova-sub]');
    if (!form) return;
    e.preventDefault();
    const id = form.dataset.novaSub;
    const campo = form.querySelector('input');
    const nome = campo.value.trim();
    if (!nome) return campo.focus();
    const cat = ctx.categoria.get(id);
    if ((cat.subcategorias || []).some(s => GS.normalizar(s.nome).trim() === GS.normalizar(nome))) {
      GS.toast('Essa subcategoria já existe.', 'erro');
      return campo.select();
    }
    GS.salvando(form.querySelector('button'), true);
    try {
      await GS.api.criarSubcategoria(id, nome);
      GS.toast(`Subcategoria "${nome}" criada`);
      await abrirNovaSubcategoria(id); // continua aberta, pronta para a próxima
    } catch (err) {
      GS.toast(err.message, 'erro');
      GS.salvando(form.querySelector('button'), false);
    }
  });

  document.querySelector('main').addEventListener('click', async e => {
    const expandir = e.target.closest('[data-expandir]');
    if (expandir) {
      const id = expandir.dataset.expandir;
      if (abertas.has(id)) abertas.delete(id); else abertas.add(id);
      await desenhar();
      document.querySelector(`[data-expandir="${CSS.escape(id)}"]`)?.focus();
      return;
    }
    const b = e.target.closest('[data-menu]');
    if (!b) return;
    const cat = ctx.categoria.get(b.dataset.menu);
    GS.abrirMenu(b, [
      { rotulo: 'Ver transações', icone: 'list', acao: () => { location.href = `transacoes.html?categoria=${encodeURIComponent(cat.id)}&mes=${mesSel}`; } },
      { rotulo: 'Nova subcategoria', icone: 'plus', escrita: true, acao: () => abrirNovaSubcategoria(cat.id) },
      { rotulo: 'Editar', icone: 'pencil', escrita: true, acao: () => abrirForm(cat) },
      {
        rotulo: 'Excluir', icone: 'trash', perigo: true, escrita: true, acao: async () => {
          const usadas = ctx.transacoes.filter(t => t.categoriaId === cat.id).length;
          if (usadas) {
            return GS.toast(`Não dá para excluir: ${GS.plural(usadas, 'transação usa', 'transações usam')} esta categoria.`, 'erro');
          }
          const ok = await GS.confirmar({ titulo: 'Excluir categoria?', mensagem: `A categoria <strong>${esc(cat.nome)}</strong> será removida.` });
          if (!ok) return;
          try {
            await GS.api.excluirCategoria(cat.id);
            GS.avisarExclusao('Categoria excluída');
            GS.notificarMudanca();
          } catch (err) {
            GS.toast(err.message, 'erro');
          }
        },
      },
    ]);
  });

  GS.iniciarPagina('categorias', desenhar);
})();
