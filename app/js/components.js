/* =========================================================
   GSCASH — componentes de interface reutilizáveis
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const { icone, esc } = GS;

  function el(tag, classe, html) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  GS.el = el;

  // avisa todas as telas que os dados mudaram
  GS.notificarMudanca = () => document.dispatchEvent(new CustomEvent('gs:dados'));

  /* ---------- Toast ---------- */

  // opcoes.desfazer: mostra o botão "Desfazer" (o aviso fica 6 s) e chama a função ao clicar
  GS.toast = function (mensagem, tipo = 'ok', opcoes = {}) {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) {
      wrap = el('div', 'toast-wrap');
      wrap.setAttribute('role', 'status');
      wrap.setAttribute('aria-live', 'polite');
      document.body.append(wrap);
    }
    const t = el('div', 'toast', icone(tipo === 'erro' ? 'alert' : 'check') + `<span>${esc(mensagem)}</span>`);
    if (tipo === 'erro') t.querySelector('svg').style.color = '#F2A097';
    if (opcoes.desfazer) {
      const b = el('button', 'toast-acao', 'Desfazer');
      b.type = 'button';
      b.addEventListener('click', () => { t.remove(); opcoes.desfazer(); });
      t.append(b);
    }
    wrap.append(t);
    setTimeout(() => t.remove(), opcoes.desfazer ? 6000 : 3200);
  };

  // aviso de exclusão com "Desfazer" (usa a última exclusão guardada em data.js)
  GS.avisarExclusao = function (mensagem) {
    GS.toast(mensagem, 'ok', {
      desfazer: async () => {
        try {
          await GS.api.desfazerExclusao();
          GS.toast('Pronto, voltou para o lugar');
          GS.notificarMudanca();
        } catch (err) {
          GS.toast(err.message, 'erro');
        }
      },
    });
  };

  /* ---------- Modal ---------- */

  const pilha = [];

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && pilha.length) {
      e.preventDefault();
      pilha[pilha.length - 1].tentarFechar();
    }
  });

  // avisoDescarte (texto ou função): se a pessoa já digitou algo, Esc, X ou clique fora
  // perguntam antes de fechar. Salvar e "Cancelar" ([data-fechar]) fecham direto.
  GS.abrirModal = function ({ titulo, corpo, rodape, tamanho = '', rodapeClasse = '', aoFechar, avisoDescarte }) {
    const idTitulo = 'm' + Math.random().toString(36).slice(2, 8);
    const fundo = el('div', 'modal-backdrop');
    fundo.innerHTML = `
      <div class="modal ${tamanho}" role="dialog" aria-modal="true" aria-labelledby="${idTitulo}">
        <div class="modal-head">
          <h2 class="modal-title" id="${idTitulo}">${esc(titulo)}</h2>
          <button type="button" class="modal-close" aria-label="Fechar">${icone('x')}</button>
        </div>
        <div class="modal-body"></div>
        <div class="modal-foot ${rodapeClasse}"></div>
      </div>`;

    const modal = fundo.querySelector('.modal');
    const body = fundo.querySelector('.modal-body');
    const foot = fundo.querySelector('.modal-foot');
    typeof corpo === 'string' ? (body.innerHTML = corpo) : corpo && body.append(corpo);
    typeof rodape === 'string' ? (foot.innerHTML = rodape) : rodape && foot.append(rodape);

    const focoAnterior = document.activeElement;
    let fechado = false;
    let digitou = false;
    let perguntando = false;
    body.addEventListener('input', () => { digitou = true; });

    const api = {
      el: modal,
      body,
      foot,
      fechar() {
        if (fechado) return;
        fechado = true;
        pilha.splice(pilha.indexOf(api), 1);
        fundo.classList.remove('show');
        setTimeout(() => {
          fundo.remove();
          if (!pilha.length) document.body.style.overflow = '';
        }, 180);
        if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
        if (aoFechar) aoFechar();
      },
      tentarFechar() {
        if (fechado || perguntando) return;
        if (!avisoDescarte || !digitou) return api.fechar();
        perguntando = true;
        const texto = typeof avisoDescarte === 'function' ? avisoDescarte() : avisoDescarte;
        const p = GS.abrirModal({
          titulo: 'Descartar o que você digitou?',
          corpo: `<p>${esc(texto)}</p>`,
          tamanho: 'sm',
          rodapeClasse: 'even',
          rodape: `<button type="button" class="btn btn-outline" data-descartar>Descartar</button>
                   <button type="button" class="btn btn-primary" data-fechar>Continuar editando</button>`,
          aoFechar: () => { perguntando = false; },
        });
        p.foot.querySelector('[data-descartar]').addEventListener('click', () => { p.fechar(); api.fechar(); });
        setTimeout(() => p.foot.querySelector('[data-fechar]').focus(), 50);
      },
    };

    fundo.addEventListener('mousedown', e => { if (e.target === fundo) api.tentarFechar(); });
    fundo.querySelector('.modal-close').addEventListener('click', () => api.tentarFechar());
    foot.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => api.fechar()));

    // mantém o foco dentro do modal
    modal.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const focaveis = [...modal.querySelectorAll('button, input, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter(x => !x.disabled && x.offsetParent !== null);
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    });

    document.body.append(fundo);
    document.body.style.overflow = 'hidden';
    pilha.push(api);
    requestAnimationFrame(() => {
      fundo.classList.add('show');
      const alvo = modal.querySelector('[autofocus]') || modal.querySelector('input:not([type=hidden]):not([type=date])');
      if (alvo && window.matchMedia('(min-width: 761px)').matches) alvo.focus();
    });
    return api;
  };

  // diálogo de confirmação → Promise<boolean>
  GS.confirmar = function ({ titulo, mensagem, botao = 'Excluir', perigo = true }) {
    return new Promise(resolve => {
      let resposta = false;
      const rodape = `
        <button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
        <button type="button" class="btn ${perigo ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(botao)}</button>`;
      const m = GS.abrirModal({
        titulo, corpo: `<p>${mensagem}</p>`, rodape, tamanho: 'sm', rodapeClasse: 'even',
        aoFechar: () => resolve(resposta),
      });
      m.foot.querySelector('[data-ok]').addEventListener('click', () => { resposta = true; m.fechar(); });
      setTimeout(() => m.foot.querySelector('[data-ok]').focus(), 50);
    });
  };

  /* ---------- Select customizado ----------
     opcoes: [{ valor, rotulo, icone?, cor?, pai?, apagado? }]
       pai:      nome do grupo; a opção aparece recuada na lista e como "Pai › Rótulo" no botão
       apagado:  rótulo em cinza (ex.: "Nenhuma")
     busca:      ao abrir, a caixa vira um campo de texto que filtra a lista
     criar(texto): com busca, oferece "Criar “texto”" quando nada tem esse nome;
                   devolve (ou promete) a nova opção { valor, rotulo }, ou null   */

  GS.criarSelect = function ({ opcoes = [], valor = null, placeholder = 'Selecione', aoMudar, rotuloAria, busca = false, criar = null }) {
    const raiz = el('div', 'select');
    const botao = el('button', 'input select-btn');
    botao.type = 'button';
    botao.setAttribute('aria-haspopup', 'listbox');
    botao.setAttribute('aria-expanded', 'false');
    if (rotuloAria) botao.setAttribute('aria-label', rotuloAria);
    const lista = el('ul', 'select-menu hidden');
    lista.setAttribute('role', 'listbox');
    raiz.append(botao, lista);

    // com busca, um campo de texto toma o lugar do botão enquanto a lista está aberta
    let campo = null;
    let entrada = null;
    if (busca) {
      campo = el('div', 'input select-btn select-busca open hidden', `<input type="text" autocomplete="off" spellcheck="false"><span class="chev">${icone('chevron-down')}</span>`);
      entrada = campo.querySelector('input');
      entrada.setAttribute('role', 'combobox');
      entrada.setAttribute('aria-expanded', 'true');
      entrada.setAttribute('aria-autocomplete', 'list');
      if (rotuloAria) entrada.setAttribute('aria-label', rotuloAria);
      raiz.insertBefore(campo, lista);
    }

    let atual = valor;
    let foco = -1;
    let termo = '';
    let itens = []; // o que aparece na lista: { o } ou { criar: texto }

    const marcador = o => (o.icone ? icone(o.icone) : o.cor ? `<span class="dot" style="background:${o.cor}"></span>` : '');
    const caminho = o => `<span class="caminho">${esc(o.pai)}${icone('chevron-right')}${esc(o.rotulo)}</span>`;
    const rotulo = o => `<span class="${o.apagado ? 'muted' : ''}">${esc(o.rotulo)}</span>`;

    function pintarBotao() {
      const o = opcoes.find(x => x.valor === atual);
      botao.innerHTML = `
        <span class="select-value">${o ? marcador(o) + (o.pai ? caminho(o) : rotulo(o)) : `<span class="muted">${esc(placeholder)}</span>`}</span>
        <span class="chev">${icone('chevron-down')}</span>`;
    }

    function filtrar() {
      const t = GS.normalizar(termo.trim());
      // na busca, opções apagadas ("Nenhuma") saem para o Enter pegar o primeiro resultado de verdade
      itens = opcoes.filter(o => !t || (!o.apagado && GS.normalizar(`${o.pai || ''} ${o.rotulo}`).includes(t))).map(o => ({ o }));
      if (criar && t && !opcoes.some(o => !o.apagado && GS.normalizar(o.rotulo) === t)) itens.push({ criar: termo.trim() });
    }

    function pintarLista() {
      const buscando = !!termo.trim();
      lista.innerHTML = itens.length
        ? itens.map((it, k) => {
            const classe = k === foco ? 'focus' : '';
            if (it.criar) return `<li role="option" data-k="${k}" class="criar ${classe}">${icone('plus')}<span>Criar “${esc(it.criar)}”</span></li>`;
            const o = it.o;
            // na busca, a opção de um grupo mostra o caminho inteiro em vez de ficar recuada
            const recuo = o.pai && !buscando;
            return `
              <li role="option" data-k="${k}" aria-selected="${o.valor === atual}" class="${recuo ? 'recuo' : ''} ${classe}">
                ${marcador(o)}${o.pai && buscando ? caminho(o) : rotulo(o)}
              </li>`;
          }).join('')
        : '<li class="vazio">Nada encontrado</li>';
    }

    function rolarAteFoco() {
      const li = lista.querySelector(`[data-k="${foco}"]`);
      if (li) li.scrollIntoView({ block: 'nearest' });
    }

    function abrir() {
      termo = '';
      filtrar();
      foco = Math.max(0, itens.findIndex(it => it.o && it.o.valor === atual));
      pintarLista();
      lista.classList.remove('hidden', 'up');
      botao.classList.add('open');
      botao.setAttribute('aria-expanded', 'true');
      const r = raiz.getBoundingClientRect();
      const limite = (botao.closest('.modal') || document.documentElement).getBoundingClientRect().bottom;
      if (Math.min(limite, window.innerHeight) - r.bottom < 220 && r.top > 260) lista.classList.add('up');
      if (busca) {
        const o = opcoes.find(x => x.valor === atual);
        entrada.value = '';
        entrada.placeholder = o && !o.apagado ? o.rotulo : (criar ? 'Buscar ou criar…' : 'Buscar…');
        botao.classList.add('hidden');
        campo.classList.remove('hidden');
        entrada.focus();
      }
      rolarAteFoco();
      document.addEventListener('mousedown', foraClique, true);
    }

    function fechar() {
      lista.classList.add('hidden');
      botao.classList.remove('open');
      botao.setAttribute('aria-expanded', 'false');
      if (busca) {
        const tinhaFoco = campo.contains(document.activeElement);
        campo.classList.add('hidden');
        botao.classList.remove('hidden');
        if (tinhaFoco) botao.focus();
      }
      document.removeEventListener('mousedown', foraClique, true);
    }

    const aberto = () => !lista.classList.contains('hidden');
    const foraClique = e => { if (!raiz.contains(e.target)) fechar(); };

    function buscar(texto) {
      termo = texto;
      filtrar();
      foco = itens.length ? 0 : -1;
      pintarLista();
      lista.scrollTop = 0;
    }

    async function escolher(k) {
      const it = itens[k];
      if (!it) return;
      let o = it.o;
      if (it.criar) {
        fechar();
        botao.focus();
        o = await Promise.resolve(criar(it.criar)).catch(() => null);
        if (!o) return;
        if (!opcoes.some(x => x.valor === o.valor)) opcoes = [...opcoes, o];
      }
      const mudou = o.valor !== atual;
      atual = o.valor;
      pintarBotao();
      fechar();
      botao.focus();
      if (mudou && aoMudar) aoMudar(atual);
    }

    // teclas com a lista aberta (no botão, ou no campo de busca)
    function teclaAberta(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); botao.focus(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); foco = Math.min(itens.length - 1, foco + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); foco = Math.max(0, foco - 1); }
      // stopPropagation: o Enter que escolhe não pode também enviar o formulário
      else if (e.key === 'Enter' || (e.key === ' ' && !busca)) { e.preventDefault(); e.stopPropagation(); escolher(foco); return; }
      else if (e.key === 'Tab') { if (!busca) fechar(); return; }
      else return;
      pintarLista();
      rolarAteFoco();
    }

    botao.addEventListener('click', () => (aberto() ? fechar() : abrir()));
    lista.addEventListener('click', e => {
      const li = e.target.closest('li[data-k]');
      if (li) escolher(Number(li.dataset.k));
    });

    botao.addEventListener('keydown', e => {
      if (aberto()) return teclaAberta(e);
      if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); abrir(); }
      // com busca, já começar a digitar com a caixa fechada abre a lista filtrando
      else if (busca && e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        abrir();
        entrada.value = e.key;
        buscar(e.key);
      }
    });

    if (busca) {
      entrada.addEventListener('keydown', teclaAberta);
      entrada.addEventListener('input', () => buscar(entrada.value));
      // Tab ou clique fora: fecha sem tirar o foco de onde ele foi
      entrada.addEventListener('blur', () => { if (aberto()) fechar(); });
      // clicar na lista ou na borda do campo não pode tirar o foco do texto
      lista.addEventListener('mousedown', e => e.preventDefault());
      campo.addEventListener('mousedown', e => {
        if (e.target === entrada) return;
        e.preventDefault();
        if (e.target.closest('.chev')) { fechar(); botao.focus(); }
      });
    }

    pintarBotao();

    return {
      el: raiz,
      botao,
      get valor() { return atual; },
      set valor(v) { atual = v; pintarBotao(); },
      definirOpcoes(novas, novoValor) {
        opcoes = novas;
        atual = novoValor !== undefined ? novoValor : (opcoes.some(o => o.valor === atual) ? atual : null);
        pintarBotao();
      },
    };
  };

  /* ---------- Excluir uma transação recorrente ----------
     Pergunta se é só esta, esta e as próximas, ou todas da série.
     Devolve os ids a excluir (ou null se a pessoa desistir). */

  GS.escolherExclusaoRecorrente = function (t, todas) {
    const serie = todas.filter(x => x.recorrenciaId === t.recorrenciaId)
      .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
    const proximas = serie.filter(x => x.data >= t.data);
    const outras = serie.length - 1;
    const opcoes = [{ titulo: 'Só esta', dica: outras === 1 ? 'A outra continua.' : `As outras ${outras} continuam.`, ids: [t.id] }];
    if (proximas.length > 1 && proximas.length < serie.length) {
      opcoes.push({ titulo: 'Esta e as próximas', dica: `${proximas.length} transações, de ${GS.dataMedia(t.data)} em diante.`, ids: proximas.map(x => x.id) });
    }
    opcoes.push({ titulo: `Todas as ${serie.length}`, dica: 'Inclusive as que já passaram.', ids: serie.map(x => x.id) });
    const numero = t.parcela || serie.indexOf(t) + 1;

    return new Promise(resolve => {
      let escolha = 0;
      let resposta = null;
      const m = GS.abrirModal({
        titulo: 'Excluir transação recorrente?',
        tamanho: 'sm',
        corpo: `
          <p><strong>${esc(t.titulo)}</strong> se repete ${serie.length} vezes. Esta é a ${numero}ª (${esc(GS.dataMedia(t.data))}).</p>
          <div class="opcoes-serie" role="radiogroup" aria-label="O que excluir">
            ${opcoes.map((o, i) => `
              <button type="button" class="opcao-serie" role="radio" data-i="${i}">
                <span class="opcao-radio" aria-hidden="true"></span>
                <span><strong>${esc(o.titulo)}</strong><small>${esc(o.dica)}</small></span>
              </button>`).join('')}
          </div>`,
        rodape: `<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
                 <button type="button" class="btn btn-danger" data-ok></button>`,
        aoFechar: () => resolve(resposta),
      });
      const pintar = () => {
        m.body.querySelectorAll('.opcao-serie').forEach((b, i) => {
          b.classList.toggle('sel', i === escolha);
          b.setAttribute('aria-checked', String(i === escolha));
        });
        m.foot.querySelector('[data-ok]').textContent = opcoes[escolha].ids.length === 1 ? 'Excluir' : `Excluir ${opcoes[escolha].ids.length}`;
      };
      m.body.addEventListener('click', e => {
        const b = e.target.closest('.opcao-serie');
        if (b) { escolha = Number(b.dataset.i); pintar(); }
      });
      m.foot.querySelector('[data-ok]').addEventListener('click', () => { resposta = opcoes[escolha].ids; m.fechar(); });
      pintar();
      setTimeout(() => m.body.querySelector('.opcao-serie.sel').focus(), 50);
    });
  };

  /* ---------- Botão de salvar ocupado ----------
     Enquanto grava: desativado, com uma rodinha e "Salvando…".
     GS.salvando(botao, false) devolve o texto original (ex.: depois de um erro). */

  GS.salvando = function (botao, ligado) {
    if (!botao) return;
    if (ligado) {
      if (botao.dataset.textoOriginal === undefined) botao.dataset.textoOriginal = botao.innerHTML;
      botao.disabled = true;
      botao.classList.add('salvando');
      botao.innerHTML = '<span class="roda-botao" aria-hidden="true"></span>Salvando…';
    } else if (botao.dataset.textoOriginal !== undefined) {
      botao.innerHTML = botao.dataset.textoOriginal;
      delete botao.dataset.textoOriginal;
      botao.disabled = false;
      botao.classList.remove('salvando');
    }
  };

  /* ---------- Menu de contexto (⋮) ----------
     itens: [{ rotulo, icone, perigo?, escrita?, acao }]
     escrita: grava algo; com a licença vencida aparece travado  */

  let menuAberto = null;

  GS.abrirMenu = function (ancora, itens) {
    if (menuAberto) menuAberto();
    const menu = el('div', 'menu');
    menu.setAttribute('role', 'menu');
    const travado = it => it.escrita && GS.somenteLeitura;
    menu.innerHTML = itens.map((it, i) => travado(it)
      ? `<button type="button" role="menuitem" data-i="${i}" class="travado" aria-disabled="true">${icone('lock')}${esc(it.rotulo)}</button>`
      : `<button type="button" role="menuitem" data-i="${i}" class="${it.perigo ? 'danger' : ''}">${icone(it.icone)}${esc(it.rotulo)}</button>`
    ).join('');
    document.body.append(menu);

    const r = ancora.getBoundingClientRect();
    const larg = menu.offsetWidth;
    const alt = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(r.right - larg, window.innerWidth - larg - 8)) + 'px';
    menu.style.top = (r.bottom + alt + 6 > window.innerHeight ? r.top - alt - 6 : r.bottom + 6) + 'px';

    const fechar = () => {
      menu.remove();
      document.removeEventListener('mousedown', fora, true);
      document.removeEventListener('keydown', tecla, true);
      window.removeEventListener('scroll', fechar, true);
      window.removeEventListener('resize', fechar);
      menuAberto = null;
    };
    const fora = e => { if (!menu.contains(e.target) && e.target !== ancora && !ancora.contains(e.target)) fechar(); };
    const tecla = e => { if (e.key === 'Escape') { e.stopPropagation(); fechar(); ancora.focus(); } };

    menu.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      fechar();
      const it = itens[Number(b.dataset.i)];
      if (travado(it)) return GS.toast(GS.TEXTO_SO_LEITURA, 'erro');
      it.acao();
    });

    document.addEventListener('mousedown', fora, true);
    document.addEventListener('keydown', tecla, true);
    window.addEventListener('scroll', fechar, true);
    window.addEventListener('resize', fechar);
    menu.querySelector('button').focus();
    menuAberto = fechar;
  };

  /* ---------- Campo de valor (R$) ----------
     Digita só números; o valor é guardado em centavos. */

  GS.campoMoeda = function (input, centavos = 0) {
    let valor = Math.max(0, Math.round(centavos || 0));
    const pintar = () => {
      input.value = valor ? GS.numero(valor) : '';
      input.classList.toggle('zerado', !valor);
    };
    // o valor é digitado da direita para a esquerda (centavos primeiro),
    // então o cursor fica sempre no fim do número
    const cursorNoFim = () => {
      if (document.activeElement !== input) return;
      if (input.selectionStart !== input.selectionEnd) return; // deixa a seleção (ex.: Ctrl+A) em paz
      const fim = input.value.length;
      input.setSelectionRange(fim, fim);
    };

    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('autocomplete', 'off');
    input.addEventListener('input', () => {
      const digitos = input.value.replace(/\D/g, '').slice(0, 11);
      valor = Number(digitos || 0);
      pintar();
      cursorNoFim();
    });
    input.addEventListener('focus', () => setTimeout(cursorNoFim));
    input.addEventListener('mouseup', cursorNoFim);
    input.addEventListener('keydown', e => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(e.key) && !e.shiftKey) {
        e.preventDefault();
        const fim = input.value.length;
        input.setSelectionRange(fim, fim);
      }
    });
    pintar();
    return {
      get valor() { return valor; },
      set valor(v) { valor = Math.max(0, Math.round(v || 0)); pintar(); },
    };
  };

  /* ---------- Campo de data (mostra "30 set 2026") ---------- */

  GS.campoData = function (iso, aoMudar) {
    const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

    const botao = el('button', 'input select-btn');
    botao.type = 'button';
    botao.setAttribute('aria-haspopup', 'dialog');
    botao.setAttribute('aria-expanded', 'false');
    botao.innerHTML = `${icone('calendar')}<span class="data-rotulo"></span>`;
    const rotulo = botao.querySelector('.data-rotulo');

    let atual = iso;
    let mes = null;   // primeiro dia do mês exibido
    let foco = null;  // dia com foco do teclado
    let pop = null;

    const pintar = () => { rotulo.textContent = GS.dataMedia(atual); };
    const inicioDoMes = d => new Date(d.getFullYear(), d.getMonth(), 1);

    function desenhar() {
      const hoje = GS.isoData(GS.hoje());
      const inicio = GS.somarDias(mes, -mes.getDay());
      const focoIso = GS.isoData(foco);
      const dias = Array.from({ length: 42 }, (_, i) => {
        const d = GS.somarDias(inicio, i);
        const diaIso = GS.isoData(d);
        const cls = ['cal-day',
          d.getMonth() !== mes.getMonth() && 'out',
          diaIso === hoje && 'today',
          diaIso === atual && 'sel'].filter(Boolean).join(' ');
        return `<button type="button" class="${cls}" data-dia="${diaIso}" tabindex="${diaIso === focoIso ? 0 : -1}"
          aria-label="${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}" aria-pressed="${diaIso === atual}">${d.getDate()}</button>`;
      }).join('');

      pop.innerHTML = `
        <div class="cal-head">
          <span class="cal-title" aria-live="polite">${GS.mesAno(mes)}</span>
          <div class="cal-nav">
            <button type="button" data-mes="-1" aria-label="Mês anterior">${icone('chevron-left')}</button>
            <button type="button" data-mes="1" aria-label="Próximo mês">${icone('chevron-right')}</button>
          </div>
        </div>
        <div class="cal-week" aria-hidden="true">${SEMANA.map(s => `<span>${s}</span>`).join('')}</div>
        <div class="cal-grid">${dias}</div>
        <div class="cal-foot">
          <button type="button" class="chip-btn" data-ir="${hoje}">Hoje</button>
          <button type="button" class="chip-btn" data-ir="${GS.isoData(GS.somarDias(GS.hoje(), -1))}">Ontem</button>
        </div>`;
    }

    function posicionar() {
      const r = botao.getBoundingClientRect();
      const larg = pop.offsetWidth;
      const alt = pop.offsetHeight;
      const cabeAbaixo = r.bottom + 8 + alt <= window.innerHeight - 8;
      pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - larg - 8)) + 'px';
      pop.style.top = (cabeAbaixo ? r.bottom + 8 : Math.max(8, r.top - alt - 8)) + 'px';
    }

    function focarDia() {
      const b = pop && pop.querySelector(`[data-dia="${GS.isoData(foco)}"]`);
      if (b) b.focus();
    }

    function irPara(d, focar = true) {
      foco = d;
      if (d.getMonth() !== mes.getMonth() || d.getFullYear() !== mes.getFullYear()) mes = inicioDoMes(d);
      desenhar();
      if (focar) focarDia();
    }

    function escolher(diaIso) {
      const mudou = diaIso !== atual;
      atual = diaIso;
      pintar();
      fechar();
      botao.focus();
      if (mudou && aoMudar) aoMudar(atual);
    }

    function abrir() {
      if (pop) return;
      // sempre abre no dia de hoje (o dia escolhido continua marcado)
      foco = GS.hoje();
      mes = inicioDoMes(foco);
      pop = el('div', 'cal-pop');
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', 'Escolher data');
      document.body.append(pop);
      desenhar();
      posicionar();
      focarDia();
      botao.classList.add('open');
      botao.setAttribute('aria-expanded', 'true');

      pop.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.mes) {
          mes = new Date(mes.getFullYear(), mes.getMonth() + Number(b.dataset.mes), 1);
          foco = new Date(mes.getFullYear(), mes.getMonth(), Math.min(foco.getDate(), new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()));
          desenhar();
          pop.querySelector(`[data-mes="${b.dataset.mes}"]`).focus();
        }
        if (b.dataset.dia) escolher(b.dataset.dia);
        if (b.dataset.ir) escolher(b.dataset.ir);
      });

      pop.addEventListener('keydown', e => {
        if (!e.target.dataset.dia) return;
        const passos = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (passos[e.key]) { e.preventDefault(); irPara(GS.somarDias(foco, passos[e.key])); }
        else if (e.key === 'PageUp' || e.key === 'PageDown') {
          e.preventDefault();
          const n = e.key === 'PageUp' ? -1 : 1;
          irPara(new Date(foco.getFullYear(), foco.getMonth() + n, Math.min(foco.getDate(), 28)));
        }
      });

      document.addEventListener('mousedown', fora, true);
      document.addEventListener('keydown', tecla, true);
      window.addEventListener('resize', fechar);
      window.addEventListener('scroll', aoRolar, true);
    }

    function fechar() {
      if (!pop) return;
      pop.remove();
      pop = null;
      botao.classList.remove('open');
      botao.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', fora, true);
      document.removeEventListener('keydown', tecla, true);
      window.removeEventListener('resize', fechar);
      window.removeEventListener('scroll', aoRolar, true);
    }

    const fora = e => { if (!pop.contains(e.target) && !botao.contains(e.target)) fechar(); };
    const aoRolar = e => { if (!pop.contains(e.target)) posicionar(); };
    const tecla = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); botao.focus(); }
      else if (e.key === 'Tab' && pop.contains(document.activeElement)) {
        // mantém o Tab circulando dentro do calendário
        const focaveis = [...pop.querySelectorAll('button:not([tabindex="-1"])')];
        const i = focaveis.indexOf(document.activeElement);
        e.preventDefault();
        e.stopPropagation();
        focaveis[(i + (e.shiftKey ? -1 : 1) + focaveis.length) % focaveis.length].focus();
      }
    };

    botao.addEventListener('click', () => (pop ? fechar() : abrir()));
    botao.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' && !pop) { e.preventDefault(); abrir(); }
    });
    pintar();

    return {
      el: botao,
      get valor() { return atual; },
      set valor(v) { atual = v; pintar(); },
    };
  };

  /* ---------- Seletor de mês (ano em cima, 12 meses em grade) ----------
     opcoes: { ancora, valor: 'AAAA-MM', comDados: Set<'AAAA-MM'>, aoEscolher(mesIso) } */

  GS.abrirSeletorMes = function ({ ancora, valor, comDados = new Set(), aoEscolher }) {
    const CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const hoje = GS.hoje();
    const mesAtual = GS.isoMes(hoje);
    const passado = GS.isoMes(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1));
    let ano = Number(valor.slice(0, 4));

    document.querySelector('.mes-pop')?.remove();
    const pop = el('div', 'mes-pop');
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Escolher mês');
    document.body.append(pop);

    function desenhar() {
      pop.innerHTML = `
        <div class="cal-head">
          <span class="cal-title" aria-live="polite">${ano}</span>
          <div class="cal-nav">
            <button type="button" data-ano="-1" aria-label="Ano anterior">${icone('chevron-left')}</button>
            <button type="button" data-ano="1" aria-label="Próximo ano">${icone('chevron-right')}</button>
          </div>
        </div>
        <div class="mes-grid">${CURTOS.map((nome, i) => {
          const iso = `${ano}-${String(i + 1).padStart(2, '0')}`;
          const cls = [iso === valor && 'sel', iso === mesAtual && 'hoje', !comDados.has(iso) && 'vazio'].filter(Boolean).join(' ');
          return `<button type="button" class="${cls}" data-mes="${iso}" aria-pressed="${iso === valor}" aria-label="${GS.mesAnoDeIso(iso)}">${nome}</button>`;
        }).join('')}</div>
        <div class="cal-foot">
          <button type="button" class="chip-btn" data-mes="${mesAtual}">Este mês</button>
          <button type="button" class="chip-btn" data-mes="${passado}">Mês passado</button>
        </div>`;
    }

    function posicionar() {
      const r = ancora.getBoundingClientRect();
      const larg = pop.offsetWidth;
      const alt = pop.offsetHeight;
      const centro = r.left + r.width / 2 - larg / 2;
      pop.style.left = Math.max(8, Math.min(centro, window.innerWidth - larg - 8)) + 'px';
      pop.style.top = (r.bottom + 8 + alt <= window.innerHeight - 8 ? r.bottom + 8 : Math.max(8, r.top - alt - 8)) + 'px';
    }

    function fechar(focar = true) {
      pop.remove();
      ancora.classList.remove('open');
      ancora.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', fora, true);
      document.removeEventListener('keydown', tecla, true);
      window.removeEventListener('resize', fecharSemFoco);
      window.removeEventListener('scroll', posicionar, true);
      if (focar) ancora.focus();
    }
    const fecharSemFoco = () => fechar(false);
    const fora = e => { if (!pop.contains(e.target) && !ancora.contains(e.target)) fechar(false); };
    const tecla = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); } };

    pop.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.ano) {
        ano += Number(b.dataset.ano);
        desenhar();
        pop.querySelector(`[data-ano="${b.dataset.ano}"]`).focus();
      }
      if (b.dataset.mes) {
        fechar();
        aoEscolher(b.dataset.mes);
      }
    });

    desenhar();
    posicionar();
    ancora.classList.add('open');
    ancora.setAttribute('aria-expanded', 'true');
    (pop.querySelector('.mes-grid .sel') || pop.querySelector('.mes-grid button')).focus();

    document.addEventListener('mousedown', fora, true);
    document.addEventListener('keydown', tecla, true);
    window.addEventListener('resize', fecharSemFoco);
    window.addEventListener('scroll', posicionar, true);
    return { fechar };
  };

  /* ---------- Página ----------
     Marca o link ativo, liga o botão "Novo gasto" e
     redesenha a tela sempre que os dados mudam.      */

  /* ---------- Celular: abas embaixo (vidro, com a "gota" na aba ativa) e "Novo gasto" flutuante ----------
     Feitas a partir dos links do menu do topo; o CSS (celular.css) só mostra em telas estreitas. */

  const ICONE_ABA = { painel: 'painel', transacoes: 'list', carteiras: 'carteira', faturas: 'cartao', categorias: 'etiqueta' };

  function barraCelular(pagina) {
    const links = [...document.querySelectorAll('.nav-links a')];
    if (!links.length || document.querySelector('.barra-celular')) return;
    const barra = el('nav', 'barra-celular');
    barra.setAttribute('aria-label', 'Telas do GSCASH');
    barra.innerHTML = '<span class="gota" aria-hidden="true"></span>' + links.map(a => {
      const ativa = a.dataset.nav === pagina;
      return `<a class="aba${ativa ? ' on' : ''}" href="${esc(a.getAttribute('href'))}"${ativa ? ' aria-current="page"' : ''}>`
        + `${icone(ICONE_ABA[a.dataset.nav] || 'list')}<span class="nome">${esc(a.textContent.trim())}</span></a>`;
    }).join('');
    const fab = el('button', 'fab-novo', icone('plus'));
    fab.type = 'button';
    fab.dataset.acao = 'novo-gasto';
    fab.setAttribute('aria-label', 'Novo gasto');
    fab.title = 'Novo gasto';
    document.body.append(barra, fab);

    // a gota fica embaixo da aba aberta. A passagem de uma aba para outra é feita pelo navegador
    // (transição entre páginas, em celular.css): a gota só escorre quando a tela nova já está
    // desenhada, em vez de andar antes e a página demorar a chegar.
    const gota = barra.querySelector('.gota');
    const ativa = barra.querySelector('.aba.on');
    const acomodar = () => {
      if (!ativa || !barra.offsetWidth) return;   // offsetWidth 0 = escondida (computador)
      gota.style.transform = `translateX(${ativa.offsetLeft}px)`;
      gota.style.width = `${ativa.offsetWidth}px`;
    };
    acomodar();   // já no primeiro desenho da página
    if (document.fonts) document.fonts.ready.then(acomodar);
    window.addEventListener('resize', acomodar);
    // a aba tocada responde na hora, enquanto a próxima tela carrega
    barra.addEventListener('click', e => {
      const aba = e.target.closest('.aba');
      if (aba === ativa) e.preventDefault();
      else if (aba) aba.classList.add('indo');
    });
    // voltou pelo botão "voltar" do navegador: a página reaparece como estava
    window.addEventListener('pageshow', () => barra.querySelectorAll('.indo').forEach(a => a.classList.remove('indo')));
  }

  // celular: o lápis e a lixeira das linhas somem (celular.css) e tocar na linha abre as mesmas ações
  document.addEventListener('click', e => {
    if (!matchMedia('(max-width: 640px)').matches) return;
    const linha = e.target.closest('.tx');
    const acoes = linha && linha.querySelector('.tx-actions');
    if (!acoes || acoes.contains(e.target)) return;
    const botoes = [...acoes.querySelectorAll('button')];
    if (!botoes.length) return;
    const titulo = linha.querySelector('.tx-title')?.textContent.trim() || 'Transação';
    const corpo = el('div', 'acoes-linha', botoes.map((b, i) => {
      const rotulo = (b.getAttribute('aria-label') || '').replace(` ${titulo}`, '');
      return `<button type="button" class="btn btn-outline btn-block${b.classList.contains('danger') ? ' perigo' : ''}" data-i="${i}">${b.innerHTML}${esc(rotulo)}</button>`;
    }).join(''));
    const modal = GS.abrirModal({ titulo, corpo, tamanho: 'sm acoes' });
    corpo.addEventListener('click', ev => {
      const escolhido = ev.target.closest('[data-i]');
      if (!escolhido) return;
      modal.fechar();
      botoes[Number(escolhido.dataset.i)].click();   // o mesmo caminho do lápis/lixeira (inclusive a trava do só leitura)
    });
  });

  GS.iniciarPagina = function (pagina, desenhar) {
    document.querySelectorAll('[data-icon]').forEach(s => { s.outerHTML = icone(s.dataset.icon); });
    barraCelular(pagina);

    document.querySelectorAll('.nav-links a').forEach(a => {
      const ativo = a.dataset.nav === pagina;
      a.classList.toggle('active', ativo);
      if (ativo) a.setAttribute('aria-current', 'page');
    });

    document.querySelectorAll('[data-acao="novo-gasto"]').forEach(b =>
      b.addEventListener('click', () => GS.abrirFormTransacao()));
    document.querySelectorAll('[data-acao="transferir"]').forEach(b =>
      b.addEventListener('click', () => GS.abrirFormTransferencia()));

    // carrega as preferências (ex.: valores ocultos) e a licença antes do primeiro desenho
    const preparar = Promise.all([
      GS.api.obterPreferencias().then(p => { GS.oculto = !!p.ocultarValores; }),
      GS.licenca && GS.licenca.pronta,
    ]).catch(() => {});

    // primeira carga: os dados vêm da nuvem. Até chegarem, os cartões viram blocos
    // animados e um aviso diz o que está acontecendo (em vez da tela vazia)
    const main = document.querySelector('main');
    const aviso = el('div', 'carregando-aviso');
    aviso.setAttribute('role', 'status');
    aviso.innerHTML = '<span class="carregando-roda" aria-hidden="true"></span>Carregando suas contas…';
    (main.querySelector('.container') || main).prepend(aviso);
    main.classList.add('carregando');

    function problema(titulo, texto) {
      aviso.className = 'carregando-aviso problema';
      aviso.innerHTML = `<span><strong>${esc(titulo)}</strong> ${esc(texto)}</span>
        <button type="button" class="btn btn-outline">Tentar de novo</button>`;
      aviso.querySelector('button').addEventListener('click', () => location.reload());
    }
    const lento = setTimeout(() => problema('Está demorando mais que o normal.', 'Verifique sua conexão com a internet.'), 8000);
    let primeira = true;

    const rodar = () => preparar.then(desenhar).then(() => {
      if (!primeira) return;
      primeira = false;
      clearTimeout(lento);
      main.classList.remove('carregando');
      aviso.remove();
    }).catch(err => {
      console.error(err);
      if (primeira) {
        clearTimeout(lento);
        problema('Não foi possível carregar seus dados.', 'Verifique sua conexão com a internet.');
        return;
      }
      GS.toast('Não foi possível carregar os dados.', 'erro');
    });

    document.addEventListener('gs:dados', rodar);
    // outra aba alterou os dados
    window.addEventListener('storage', e => { if (e.key && e.key.startsWith('gscash')) location.reload(); });
    rodar();
  };
})();
