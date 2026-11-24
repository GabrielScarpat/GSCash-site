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
    const fundo = el('div', `modal-backdrop${/(^|\s)alerta(\s|$)/.test(tamanho) ? ' tem-alerta' : ''}`);
    fundo.innerHTML = `
      <div class="modal ${tamanho}" role="dialog" aria-modal="true" aria-labelledby="${idTitulo}">
        <div class="modal-alca" aria-hidden="true"></div>
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
    // "digitou" = o que está na janela mudou de verdade. Texto: compara com o valor que o campo tinha
    // ao receber o foco (digitar e apagar não conta). Chaves e opções (sem foco no iPhone): qualquer toque conta.
    let marcou = false;
    let perguntando = false;
    const iniciais = new Map();
    const ehTexto = c => c.matches('textarea, input:not([type=checkbox]):not([type=radio])');
    body.addEventListener('focusin', e => {
      const c = e.target;
      if (c.matches && ehTexto(c) && !iniciais.has(c)) iniciais.set(c, c.value);
    });
    body.addEventListener('input', e => { if (!e.target.matches || !ehTexto(e.target)) marcou = true; });
    body.addEventListener('change', e => { if (e.target.matches && !ehTexto(e.target)) marcou = true; });
    const digitou = () => marcou || [...iniciais].some(([c, v]) => c.isConnected && c.value !== v);

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
        if (!avisoDescarte || !digitou()) return api.fechar();
        perguntando = true;
        const texto = typeof avisoDescarte === 'function' ? avisoDescarte() : avisoDescarte;
        const p = GS.abrirModal({
          titulo: 'Descartar o que você digitou?',
          corpo: `<p>${esc(texto)}</p>`,
          tamanho: 'sm alerta',
          rodapeClasse: 'even',
          rodape: `<button type="button" class="btn btn-outline" data-descartar>Descartar</button>
                   <button type="button" class="btn btn-primary" data-fechar>Continuar</button>`,
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

    arrastarParaFechar(modal, api);

    document.body.append(fundo);
    document.body.style.overflow = 'hidden';
    pilha.push(api);
    requestAnimationFrame(() => {
      fundo.classList.add('show');
      // alerta: se um rótulo não cabe na metade, os botões ficam um em cima do outro (como no iOS)
      if (modal.classList.contains('alerta') && [...foot.children].some(b => b.scrollWidth > b.clientWidth + 1)) {
        foot.classList.add('empilhado');
      }
      const alvo = modal.querySelector('[autofocus]') || modal.querySelector('input:not([type=hidden]):not([type=date])');
      if (alvo && window.matchMedia('(min-width: 761px)').matches) alvo.focus();
    });
    return api;
  };

  // Celular: arrastar a janela para baixo pela alça (ou pelo título) fecha, como no iOS. Passou de 120px,
  // ou foi um puxão rápido: fecha (com o aviso de descartar, se a pessoa digitou algo); senão, volta.
  function arrastarParaFechar(modal, api) {
    const alvos = [modal.querySelector('.modal-alca'), modal.querySelector('.modal-head')];
    let y0 = null, dy = 0, t0 = 0;
    const ini = e => {
      if (e.touches.length !== 1 || modal.classList.contains('alerta') || e.target.closest('button')
        || !matchMedia('(max-width: 640px)').matches) return;
      y0 = e.touches[0].clientY;
      t0 = Date.now();
      dy = 0;
      modal.style.transition = 'none';
    };
    const mover = e => {
      if (y0 === null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      modal.style.transform = dy ? `translateY(${dy}px)` : '';
      e.preventDefault();
    };
    const soltar = () => {
      if (y0 === null) return;
      y0 = null;
      modal.style.transition = '';
      modal.style.transform = '';
      if (dy > 120 || (dy > 40 && Date.now() - t0 < 250)) api.tentarFechar();
    };
    alvos.forEach(a => {
      if (!a) return;
      a.addEventListener('touchstart', ini, { passive: true });
      a.addEventListener('touchmove', mover, { passive: false });
      a.addEventListener('touchend', soltar);
      a.addEventListener('touchcancel', soltar);
    });
  }

  // diálogo de confirmação → Promise<boolean>
  // no celular aparece como alerta no meio da tela, como o do iOS (classe "alerta")
  GS.confirmar = function ({ titulo, mensagem, botao = 'Excluir', perigo = true }) {
    return new Promise(resolve => {
      let resposta = false;
      const rodape = `
        <button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
        <button type="button" class="btn ${perigo ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(botao)}</button>`;
      const m = GS.abrirModal({
        titulo, corpo: `<p>${mensagem}</p>`, rodape, tamanho: 'sm alerta', rodapeClasse: 'even',
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
        // no celular o teclado só abre se a pessoa tocar na busca: abrir sozinho cobria o fim da lista
        if (!toque()) entrada.focus();
      }
      // e o teclado de outro campo (o título, por exemplo) fecha: no iPhone, tocar num botão não tira o foco dele
      if (toque() && document.activeElement && document.activeElement.blur && !raiz.contains(document.activeElement)) document.activeElement.blur();
      rolarAteFoco();
      caberNaTela();
      if (window.visualViewport) ['resize', 'scroll'].forEach(ev => visualViewport.addEventListener(ev, caberNaTela));
      document.addEventListener('mousedown', foraClique, true);
    }

    const toque = () => window.matchMedia && matchMedia('(pointer: coarse)').matches;

    // com o teclado aberto, a lista para logo acima dele (senão as últimas opções ficam escondidas atrás)
    function caberNaTela() {
      lista.style.maxHeight = '';
      const vv = window.visualViewport;
      if (!vv || lista.classList.contains('hidden') || lista.classList.contains('up')) return;
      // o fim do que se vê: o teclado ou, numa janela, os botões do rodapé (que ficam por cima da lista)
      const rodape = raiz.closest('.modal') && raiz.closest('.modal').querySelector('.modal-foot');
      const fimVisivel = Math.min(vv.offsetTop + vv.height, rodape && rodape.offsetHeight ? rodape.getBoundingClientRect().top : Infinity);
      let espaco = Math.floor(fimVisivel - lista.getBoundingClientRect().top - 8);
      // campo lá embaixo, perto do teclado: sobe o campo para o topo da janela antes de medir
      if (espaco < 200 && espaco < lista.offsetHeight) {
        raiz.scrollIntoView({ block: 'start' });
        espaco = Math.floor(fimVisivel - lista.getBoundingClientRect().top - 8);
      }
      if (espaco < lista.offsetHeight) lista.style.maxHeight = `${Math.max(132, espaco)}px`;
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
      if (window.visualViewport) ['resize', 'scroll'].forEach(ev => visualViewport.removeEventListener(ev, caberNaTela));
      lista.style.maxHeight = '';
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

  /* ---------- Escolher entre opções (janela com "bolinhas") ----------
     opcoes: [{ valor, titulo, dica, botao }]; o botão de confirmar mostra o "botao" da escolhida.
     Devolve o valor escolhido (ou null se a pessoa desistir). */

  GS.escolherOpcao = function ({ titulo, texto, rotulo, opcoes, perigo = false }) {
    return new Promise(resolve => {
      let escolha = 0;
      let resposta = null;
      const m = GS.abrirModal({
        titulo,
        tamanho: 'sm',
        corpo: `
          <p>${texto}</p>
          <div class="opcoes-serie" role="radiogroup" aria-label="${esc(rotulo)}">
            ${opcoes.map((o, i) => `
              <button type="button" class="opcao-serie" role="radio" data-i="${i}">
                <span class="opcao-radio" aria-hidden="true"></span>
                <span><strong>${esc(o.titulo)}</strong><small>${esc(o.dica)}</small></span>
              </button>`).join('')}
          </div>`,
        rodape: `<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
                 <button type="button" class="btn ${perigo ? 'btn-danger' : 'btn-primary'}" data-ok></button>`,
        aoFechar: () => resolve(resposta),
      });
      const pintar = () => {
        m.body.querySelectorAll('.opcao-serie').forEach((b, i) => {
          b.classList.toggle('sel', i === escolha);
          b.setAttribute('aria-checked', String(i === escolha));
        });
        m.foot.querySelector('[data-ok]').textContent = opcoes[escolha].botao;
      };
      m.body.addEventListener('click', e => {
        const b = e.target.closest('.opcao-serie');
        if (b) { escolha = Number(b.dataset.i); pintar(); }
      });
      m.foot.querySelector('[data-ok]').addEventListener('click', () => { resposta = opcoes[escolha].valor; m.fechar(); });
      pintar();
      setTimeout(() => m.body.querySelector('.opcao-serie.sel').focus(), 50);
    });
  };

  const NOME_FREQ = { semanal: 'toda semana', mensal: 'todo mês', anual: 'todo ano' };
  const frasesSerie = (t, info) => `<strong>${esc(t.titulo)}</strong> se repete ${NOME_FREQ[info.frequencia]}`
    + (info.semFim ? ', até você cancelar.' : ` (${info.total} vezes).`)
    + ` Esta é de ${esc(GS.dataMedia(t.data))}.`;

  /* ---------- Excluir uma transação recorrente ----------
     Só esta · Esta e as próximas · Só as próximas (fica esta, a série para).
     As que já passaram não são apagadas por aqui: são histórico.
     Devolve o modo de GS.api.excluirDaSerie, 'simples' se não é série (exclusão comum)
     ou null se a pessoa desistir. */

  GS.escolherExclusaoRecorrente = async function (t) {
    const info = await GS.api.infoSerie(t.id);
    if (!info || (info.total < 2 && !info.semFim)) return 'simples';
    const seguintes = info.seguintes;
    const depois = seguintes === 1 ? 'a próxima' : `as próximas ${seguintes}`;
    const opcoes = [{ valor: 'esta', titulo: 'Só esta', dica: info.semFim || seguintes ? 'As outras continuam.' : 'As anteriores continuam.', botao: 'Excluir' }];
    if (seguintes || info.semFim) {
      opcoes.push({ valor: 'esta-e-proximas', titulo: 'Esta e as próximas', dica: seguintes ? `Esta e ${depois}. Para de repetir.` : 'Para de repetir.', botao: `Excluir ${seguintes + 1}` });
      if (seguintes) opcoes.push({ valor: 'so-proximas', titulo: 'Só as próximas', dica: `Esta fica; saem ${depois}. Para de repetir depois desta.`, botao: `Excluir ${seguintes}` });
    }
    return GS.escolherOpcao({
      titulo: 'Excluir transação recorrente?',
      texto: frasesSerie(t, info) + ' As que já passaram ficam no histórico.',
      rotulo: 'O que excluir',
      opcoes,
      perigo: true,
    });
  };

  /* ---------- Salvar a edição de um lançamento recorrente ----------
     Devolve 'esta', 'proximas' ou null se a pessoa desistir. */

  GS.escolherEdicaoRecorrente = function (t, info) {
    if (!info.seguintes) return Promise.resolve('esta');
    const depois = info.seguintes === 1 ? 'a próxima' : `as próximas ${info.seguintes}`;
    return GS.escolherOpcao({
      titulo: 'Salvar em quais?',
      texto: frasesSerie(t, info),
      rotulo: 'Onde salvar',
      opcoes: [
        { valor: 'esta', titulo: 'Só esta', dica: 'As outras ficam como estão.', botao: 'Salvar' },
        { valor: 'proximas', titulo: 'Esta e as próximas', dica: `Muda esta e ${depois}. As anteriores ficam.`, botao: `Salvar ${info.seguintes + 1}` },
      ],
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

  /* ---------- Campo de valor (R$, €, $ ou ¥) ----------
     Digita só números; o valor é guardado em centavos.
     O símbolo escrito no HTML (R$) é trocado pelo da moeda escolhida.
     No iene não há centavos: cada dígito é um iene inteiro. */

  GS.campoMoeda = function (input, centavos = 0) {
    let valor = Math.max(0, Math.round(centavos || 0));
    const moeda = GS.moedaAtual();
    const porDigito = moeda.casas ? 1 : 100;
    const simbolo = input.parentElement.querySelector('.prefix, .prefixo');
    if (simbolo) simbolo.textContent = moeda.simbolo;
    input.placeholder = GS.numero(0);
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
      const digitos = input.value.replace(/\D/g, '').slice(0, moeda.casas ? 11 : 9);
      valor = Number(digitos || 0) * porDigito;
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

  /* ---------- Campo de data (mostra "30 set 2026") ----------
     Tocar no título ("Novembro 2026") troca os dias por duas rodas de rolar, uma de mês e uma de ano,
     para pular para longe sem ir mês por mês. Teclado: nos dias, as setas andam pelos dias, PageUp e
     PageDown trocam o mês e Enter escolhe; nas rodas, cima e baixo mudam o valor, esquerda e direita
     trocam entre mês e ano, e Enter volta para os dias. */

  GS.campoData = function (iso, aoMudar) {
    const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const ALT = 44;   // altura de cada item das rodas (igual ao .roda button do calendario.css)

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
    let modo = 'dias';           // 'dias' ou 'rodas'
    let rodaAtiva = 'mes';       // a roda que as setas do teclado mexem
    let rodas = {};              // { mes, ano }, cada uma com ir(i) e passo(n)
    let anos = [];

    const pintar = () => { rotulo.textContent = GS.dataMedia(atual); };
    const inicioDoMes = d => new Date(d.getFullYear(), d.getMonth(), 1);
    const ultimoDia = (a, m) => new Date(a, m + 1, 0).getDate();

    // anos das rodas: 20 para trás e 10 para frente de hoje, alargado para caber o dia escolhido
    function listaDeAnos() {
      const h = GS.hoje().getFullYear();
      const a = Number(String(atual || '').slice(0, 4)) || h;
      const de = Math.min(h - 20, a), ate = Math.max(h + 10, a);
      return Array.from({ length: ate - de + 1 }, (_, i) => de + i);
    }

    const tituloHtml = () => `
      <button type="button" class="cal-title-btn" data-trocar aria-expanded="${modo === 'rodas'}"
        aria-label="${GS.mesAno(mes)}: escolher mês e ano"><span>${GS.mesAno(mes)}</span>${icone('chevron-down')}</button>`;
    const setasHtml = `
      <div class="cal-nav">
        <button type="button" data-mes="-1" aria-label="Mês anterior">${icone('chevron-left')}</button>
        <button type="button" data-mes="1" aria-label="Próximo mês">${icone('chevron-right')}</button>
      </div>`;

    function desenhar() {
      if (modo === 'rodas') return desenharRodas();
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
        <div class="cal-head" aria-live="polite">${tituloHtml()}${setasHtml}</div>
        <div class="cal-week" aria-hidden="true">${SEMANA.map(s => `<span>${s}</span>`).join('')}</div>
        <div class="cal-grid">${dias}</div>
        <div class="cal-foot">
          <button type="button" class="chip-btn" data-ir="${hoje}">Hoje</button>
          <button type="button" class="chip-btn" data-ir="${GS.isoData(GS.somarDias(GS.hoje(), -1))}">Ontem</button>
        </div>`;
    }

    function desenharRodas() {
      anos = listaDeAnos();
      if (!anos.includes(mes.getFullYear())) mes = new Date(mes.getFullYear() < anos[0] ? anos[0] : anos[anos.length - 1], mes.getMonth(), 1);
      pop.innerHTML = `
        <div class="cal-head" aria-live="polite">${tituloHtml()}${setasHtml}</div>
        <div class="rodas">
          <div class="roda" data-roda="mes" role="listbox" aria-label="Mês">${MESES.map((n, i) =>
            `<button type="button" data-i="${i}" tabindex="-1" role="option">${n[0].toUpperCase() + n.slice(1)}</button>`).join('')}</div>
          <div class="roda" data-roda="ano" role="listbox" aria-label="Ano">${anos.map((a, i) =>
            `<button type="button" data-i="${i}" tabindex="-1" role="option">${a}</button>`).join('')}</div>
        </div>
        <div class="cal-foot"><button type="button" class="btn btn-primary btn-block" data-pronto>Ver os dias</button></div>`;
      rodas = {
        mes: ligarRoda(pop.querySelector('[data-roda="mes"]'), mes.getMonth(), i => { mes = new Date(mes.getFullYear(), i, 1); atualizarTitulo(); }),
        ano: ligarRoda(pop.querySelector('[data-roda="ano"]'), anos.indexOf(mes.getFullYear()), i => { mes = new Date(anos[i], mes.getMonth(), 1); atualizarTitulo(); }),
      };
      marcarRoda();
    }

    function atualizarTitulo() {
      const t = pop && pop.querySelector('[data-trocar]');
      if (!t) return;
      t.querySelector('span').textContent = GS.mesAno(mes);
      t.setAttribute('aria-label', `${GS.mesAno(mes)}: escolher mês e ano`);
    }

    const marcarRoda = () => pop.querySelectorAll('.roda').forEach(r => r.classList.toggle('ativa', r.dataset.roda === rodaAtiva));

    // roda de rolar: o item parado no meio é o escolhido; tocar num item leva ele para o meio
    function ligarRoda(roda, inicial, aoMudarRoda) {
      const itens = [...roda.children];
      let escolhido = inicial, espera, alvo = null, vez = 0;
      const limitar = i => Math.max(0, Math.min(itens.length - 1, i));
      const marcar = i => itens.forEach((b, j) => {
        b.classList.toggle('no-centro', j === i);
        b.setAttribute('aria-selected', j === i);
      });
      roda.scrollTop = inicial * ALT;
      marcar(inicial);

      roda.addEventListener('scroll', () => {
        const i = limitar(Math.round(roda.scrollTop / ALT));
        marcar(i);
        clearTimeout(espera);
        if (alvo !== null) { if (i === alvo) alvo = null; return; }   // girando por seta: não troca no meio do caminho
        espera = setTimeout(() => { if (i !== escolhido) { escolhido = i; aoMudarRoda(i); } }, 80);
      });
      roda.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        e.stopPropagation();
        rodaAtiva = roda.dataset.roda;
        marcarRoda();
        roda.scrollTo({ top: Number(b.dataset.i) * ALT, behavior: 'smooth' });
      });

      return {
        // gira até o item sem avisar de volta (quem chamou já trocou o mês)
        ir(i) {
          escolhido = i;
          const minha = ++vez;   // vários cliques seguidos: só o último vale
          alvo = Math.round(roda.scrollTop / ALT) === i ? null : i;
          roda.scrollTo({ top: i * ALT, behavior: 'smooth' });
          // se a animação não andar (aba em segundo plano, movimento reduzido), pula direto
          setTimeout(() => {
            if (minha !== vez) return;
            if (Math.round(roda.scrollTop / ALT) !== i) roda.scrollTop = i * ALT;
            alvo = null;
            marcar(i);
          }, 450);
        },
        // seta do teclado: um item para cima ou para baixo
        passo(n) {
          const i = limitar(escolhido + n);
          if (i === escolhido) return;
          this.ir(i);
          aoMudarRoda(i);
        },
      };
    }

    function trocarModo(novo) {
      modo = novo;
      rodaAtiva = 'mes';
      if (modo === 'dias') {
        // volta para o mês escolhido nas rodas, com o foco no mesmo dia (ou no último, se o mês for mais curto)
        foco = new Date(mes.getFullYear(), mes.getMonth(), Math.min(foco.getDate(), ultimoDia(mes.getFullYear(), mes.getMonth())));
      }
      desenhar();
      posicionar();
      if (modo === 'dias') focarDia();
      else pop.querySelector('[data-trocar]').focus();
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
      modo = 'dias';
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
        if (b.hasAttribute('data-trocar')) trocarModo(modo === 'dias' ? 'rodas' : 'dias');
        else if (b.hasAttribute('data-pronto')) trocarModo('dias');
        else if (b.dataset.mes) {
          const n = Number(b.dataset.mes);
          mes = new Date(mes.getFullYear(), mes.getMonth() + n, 1);
          if (modo === 'dias') {
            foco = new Date(mes.getFullYear(), mes.getMonth(), Math.min(foco.getDate(), ultimoDia(mes.getFullYear(), mes.getMonth())));
            desenhar();
            pop.querySelector(`[data-mes="${n}"]`).focus();
          } else if (!anos.includes(mes.getFullYear())) {
            mes = new Date(mes.getFullYear(), mes.getMonth() - n, 1);   // fim da lista de anos: fica onde está
          } else {
            rodas.mes.ir(mes.getMonth());
            rodas.ano.ir(anos.indexOf(mes.getFullYear()));
            atualizarTitulo();
          }
        }
        else if (b.dataset.dia) escolher(b.dataset.dia);
        else if (b.dataset.ir) escolher(b.dataset.ir);
      });

      pop.addEventListener('keydown', e => {
        if (modo === 'rodas') {
          const nasSetas = e.target.closest('.cal-nav');
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            rodas[rodaAtiva].passo(e.key === 'ArrowUp' ? -1 : 1);
          } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !nasSetas) {
            e.preventDefault();
            rodaAtiva = e.key === 'ArrowLeft' ? 'mes' : 'ano';
            marcarRoda();
          } else if (e.key === 'Enter' && !nasSetas) {
            e.preventDefault();
            trocarModo('dias');
          }
          return;
        }
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
     Marca o link ativo, liga o botão "Nova transação" e
     redesenha a tela sempre que os dados mudam.      */

  /* ---------- Celular: abas embaixo (vidro, com a "gota" na aba ativa) e "Nova transação" flutuante ----------
     Feitas a partir dos links do menu do topo; o CSS (celular.css) só mostra em telas estreitas. */

  const ICONE_ABA = { painel: 'painel', transacoes: 'list', carteiras: 'carteira', faturas: 'cartao', categorias: 'etiqueta', investimentos: 'trending', dividas: 'pessoas' };
  // telas que no celular ficam dentro da aba "Mais" (no computador continuam no menu do topo)
  const NO_MAIS = { investimentos: 'Aplicações e rendimento', dividas: 'Quem você deve e quem te deve' };

  function barraCelular(pagina) {
    const links = [...document.querySelectorAll('.nav-links a')];
    if (!links.length || document.querySelector('.barra-celular')) return;
    const principais = links.filter(a => !(a.dataset.nav in NO_MAIS));
    const extras = links.filter(a => a.dataset.nav in NO_MAIS);
    const naExtra = extras.find(a => a.dataset.nav === pagina);
    const barra = el('nav', 'barra-celular');
    barra.setAttribute('aria-label', 'Telas do GSCASH');
    const aba = (a, ativa) => `<a class="aba${ativa ? ' on' : ''}" href="${esc(a.getAttribute('href'))}"${ativa ? ' aria-current="page"' : ''}>`
      + `${icone(ICONE_ABA[a.dataset.nav] || 'list')}<span class="nome">${esc(a.textContent.trim())}</span></a>`;
    // a aba Mais: com uma das telas dela aberta, mostra o ícone e o nome dessa tela
    const mais = !extras.length ? '' : naExtra
      ? `<button type="button" class="aba mais on" aria-haspopup="menu" aria-expanded="false" aria-current="page">${icone(ICONE_ABA[naExtra.dataset.nav])}<span class="nome">${esc(naExtra.textContent.trim())}</span></button>`
      : `<button type="button" class="aba mais" aria-haspopup="menu" aria-expanded="false" aria-label="Mais">${icone('mais-h')}<span class="nome">Mais</span></button>`;
    barra.innerHTML = '<span class="gota" aria-hidden="true"></span>' + principais.map(a => aba(a, a.dataset.nav === pagina)).join('') + mais;
    const fab = el('button', 'fab-novo', icone('plus'));
    fab.type = 'button';
    fab.dataset.acao = 'novo-gasto';
    fab.setAttribute('aria-label', 'Nova transação');
    fab.title = 'Nova transação';
    document.body.append(barra, fab);
    if (extras.length) ligarMenuMais(barra.querySelector('.aba.mais'), extras, pagina);

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
      if (!aba || aba.classList.contains('mais')) return;   // o Mais abre o menu (ligarMenuMais)
      if (aba === ativa) e.preventDefault();
      else aba.classList.add('indo');
    });
    // voltou pelo botão "voltar" do navegador: a página reaparece como estava
    window.addEventListener('pageshow', () => barra.querySelectorAll('.indo').forEach(a => a.classList.remove('indo')));
    arrastarEntreTelas(barra);
    ligarBarraNativa(barra, pagina);
  }

  /* ---------- Olho de ocultar valores, no topo de todas as telas ----------
     Fica logo antes do Transferir (no celular, os dois redondos à direita do "Olá"). Um toque troca
     todos os valores do app por "R$ •••••" (GS.oculto); a escolha fica guardada na conta. */
  function olhoDoTopo() {
    const transferir = document.querySelector('.topbar-acoes [data-acao="transferir"]');
    if (!transferir) return null;
    const b = el('button', 'btn btn-outline olho-topo');
    b.type = 'button';
    transferir.before(b);
    const pintar = () => {
      b.innerHTML = icone(GS.oculto ? 'eye-off' : 'eye');
      b.classList.toggle('on', GS.oculto);
      b.setAttribute('aria-pressed', String(GS.oculto));
      b.title = GS.oculto ? 'Mostrar valores' : 'Ocultar valores';
      b.setAttribute('aria-label', b.title);
    };
    b.addEventListener('click', async () => {
      GS.oculto = !GS.oculto;
      pintar();
      GS.notificarMudanca();   // a tela redesenha com os valores escondidos (ou à mostra) na hora
      // se não der para salvar, avisa que a escolha não vai ficar guardada
      try {
        await GS.api.salvarPreferencia('ocultarValores', GS.oculto);
      } catch (err) {
        GS.toast(err.message, 'erro');
      }
    });
    pintar();
    return { pintar };
  }

  /* ---------- Celular: menu da aba Mais ----------
     Sobe de dentro da aba, logo acima da barra, com as telas que não cabem nela (Investimentos e Dívidas).
     Tocar fora fecha; enquanto está aberto, o "+" sai da frente. */
  function ligarMenuMais(botao, extras, pagina) {
    const veu = el('div', 'mais-veu');
    const menu = el('div', 'menu-mais', extras.map(a => {
      const id = a.dataset.nav;
      return `<a role="menuitem" href="${esc(a.getAttribute('href'))}" class="${id === pagina ? 'on' : ''}"${id === pagina ? ' aria-current="page"' : ''}>`
        + `${icone(ICONE_ABA[id])}<span><b>${esc(a.textContent.trim())}</b><small>${esc(NO_MAIS[id])}</small></span></a>`;
    }).join(''));
    menu.setAttribute('role', 'menu');
    document.body.append(veu, menu);
    const raiz = document.documentElement;
    const abrir = aberto => {
      raiz.classList.toggle('mais-aberto', aberto);
      botao.setAttribute('aria-expanded', String(aberto));
      if (aberto) menu.querySelector('a').focus({ preventScroll: true });
    };
    botao.addEventListener('click', () => abrir(!raiz.classList.contains('mais-aberto')));
    veu.addEventListener('click', () => abrir(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && raiz.classList.contains('mais-aberto')) abrir(false); });
    menu.addEventListener('click', e => {
      const a = e.target.closest('a');
      if (!a) return;
      if (a.classList.contains('on')) e.preventDefault();
      abrir(false);
    });
    window.addEventListener('pageshow', () => abrir(false));
  }

  /* ---------- iPhone: barra nativa com o Liquid Glass do iOS 26 ----------
     O vidro do sistema só existe em componente nativo (celular/ios/App/App/BarraNativaPlugin.swift).
     Quando o app do iPhone tem o plugin, a barra e o "+" em HTML ficam invisíveis (seguem na página para o
     arrastar entre telas e para os toques passarem pelo mesmo caminho) e a nativa assume. Versões antigas
     do app, o Android, o site e o Windows não têm o plugin e continuam com a barra em HTML. */
  // símbolos da Apple: só reserva, se a imagem do ícone do GSCASH não sair
  const SIMBOLOS_ABA = {
    painel: ['square.grid.2x2'], transacoes: ['list.bullet'], carteiras: ['wallet.bifold', 'wallet.pass'],
    faturas: ['creditcard'], categorias: ['tag'], investimentos: ['chart.line.uptrend.xyaxis', 'chart.xyaxis.line'],
    dividas: ['person.2'], mais: ['ellipsis'],
  };

  // o ícone de traço do GSCASH (o mesmo do site) desenhado numa imagem PNG de 25pt em 3x, preto sobre
  // transparente: o iPhone pinta com a cor da aba (azul na aberta, cinza nas outras). Devolve o base64.
  function imagemDoIcone(nome) {
    const lado = 75;
    const svg = icone(nome).replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" `).replace(/currentColor/g, '#000');
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        try {
          const tela = document.createElement('canvas');
          tela.width = tela.height = lado;
          tela.getContext('2d').drawImage(img, 0, 0, lado, lado);
          resolve(tela.toDataURL('image/png').split(',')[1]);
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  function ligarBarraNativa(barra, pagina) {
    const C = window.Capacitor;
    if (!GS.nativo || !C || C.getPlatform() !== 'ios' || !C.isPluginAvailable || !C.isPluginAvailable('BarraNativa')) return;
    const nativa = C.registerPlugin('BarraNativa');
    const raiz = document.documentElement;
    raiz.classList.add('barra-nativa');
    const links = [...document.querySelectorAll('.nav-links a')];
    const principais = links.filter(a => !(a.dataset.nav in NO_MAIS));
    const extras = links.filter(a => a.dataset.nav in NO_MAIS);
    const naExtra = extras.find(a => a.dataset.nav === pagina);

    // aba principal tocada: o mesmo caminho do toque na barra HTML; tela do Mais escolhida no menu nativo: abre direto
    nativa.addListener('aba', ({ id }) => {
      const link = links.find(a => a.dataset.nav === id);
      if (!link || id === pagina) return;
      const aba = [...barra.querySelectorAll('a.aba')].find(a => a.getAttribute('href') === link.getAttribute('href'));
      if (aba) aba.click();
      else location.href = link.getAttribute('href');
    });
    nativa.addListener('novo', () => { const fab = document.querySelector('.fab-novo'); if (fab) fab.click(); });
    const nome = a => a.textContent.trim();
    // a aba Mais: com uma tela dela aberta, mostra o ícone e o nome dessa tela (como na barra HTML)
    const mais = extras.length ? { id: 'mais', titulo: naExtra ? nome(naExtra) : 'Mais', icone: naExtra ? ICONE_ABA[naExtra.dataset.nav] : 'mais-h',
      icones: naExtra ? SIMBOLOS_ABA[naExtra.dataset.nav] : SIMBOLOS_ABA.mais } : null;
    const abasNativas = [...principais.map(a => ({ id: a.dataset.nav, titulo: nome(a), icone: ICONE_ABA[a.dataset.nav] || 'list', icones: SIMBOLOS_ABA[a.dataset.nav] || ['circle'] })), ...(mais ? [mais] : [])];
    const menu = extras.map(a => ({ id: a.dataset.nav, titulo: nome(a), subtitulo: NO_MAIS[a.dataset.nav], icone: ICONE_ABA[a.dataset.nav], icones: SIMBOLOS_ABA[a.dataset.nav] || ['circle'] }));
    // o nome aparece só na aba aberta, como na barra do site no celular (o plugin cuida disso)
    Promise.all([...abasNativas, ...menu].map(x => imagemDoIcone(x.icone))).then(imagens => nativa.mostrar({
      abas: abasNativas.map((x, i) => ({ id: x.id, titulo: x.titulo, imagem: imagens[i], icones: x.icones })),
      ativa: naExtra ? 'mais' : pagina,
      // o Mais não troca de tela: abre o menu de vidro com estas opções (a da tela aberta fica marcada)
      menu: { id: 'mais', aberta: naExtra ? pagina : null, itens: menu.map((x, i) => ({ id: x.id, titulo: x.titulo, subtitulo: x.subtitulo, imagem: imagens[abasNativas.length + i], icones: x.icones })) },
      botao: true,
      nomeSoNaAberta: true,
    })).then(() => {
      // a página já abriu com uma janela (o tour, por exemplo): a barra começa escondida
      if (document.querySelector('.modal-backdrop')) nativa.ocultar({ oculta: true }).catch(() => {});
    }).catch(() => raiz.classList.remove('barra-nativa'));   // sem a barra nativa, a de HTML volta

    // janela aberta na página (Nova transação, confirmações...): a barra nativa sai da frente
    let aberta = false;
    new MutationObserver(() => {
      const agora = !!document.querySelector('.modal-backdrop');
      if (agora === aberta) return;
      aberta = agora;
      nativa.ocultar({ oculta: agora }).catch(() => {});
    }).observe(document.body, { childList: true });
  }

  /* ---------- Celular: arrastar o dedo para o lado troca de tela ----------
     Para a esquerda vai para a aba seguinte da barra; para a direita, a anterior. A tela acompanha
     o dedo e só troca se o gesto for claramente para o lado. Fica de fora quando há janela aberta,
     quando o dedo começa num campo ou em algo que rola para o lado (chips, tabelas) e perto das
     bordas (onde o sistema tem o gesto de voltar). */
  function arrastarEntreTelas(barra) {
    // o Mais só entra quando é a tela aberta (arrastar até ele abriria o menu, não uma tela)
    const abas = [...barra.querySelectorAll('.aba')].filter(a => !a.classList.contains('mais') || a.classList.contains('on'));
    const atual = abas.findIndex(a => a.classList.contains('on'));
    const conteudo = document.querySelector('main');
    if (atual < 0 || !conteudo) return;

    const BORDA = 24, TRAVA = 10, TROCA = 0.28;   // TROCA: fração da largura da tela
    let ini = null;   // { x, y, t, eixo: null | 'x' | 'y' }

    const rolaDeLado = alvo => {
      for (let e = alvo; e && e !== document.body; e = e.parentElement) {
        if (e.scrollWidth > e.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(e).overflowX)) return true;
      }
      return false;
    };
    const mover = (dx, animar) => {
      conteudo.style.transition = animar ? 'transform .2s ease, opacity .2s ease' : 'none';
      conteudo.style.transform = dx ? `translateX(${dx}px)` : '';
      conteudo.style.opacity = dx ? String(1 - Math.min(Math.abs(dx) / innerWidth, 0.5)) : '';
    };

    document.addEventListener('touchstart', e => {
      ini = null;
      if (e.touches.length !== 1 || !barra.offsetWidth) return;   // barra escondida = computador
      const t = e.touches[0];
      if (t.clientX < BORDA || t.clientX > innerWidth - BORDA) return;
      const alvo = e.target;
      if (document.querySelector('.modal-backdrop') || alvo.closest('input, textarea, select, [contenteditable], .barra-celular, [data-sem-arrastar]') || rolaDeLado(alvo)) return;
      ini = { x: t.clientX, y: t.clientY, t: Date.now(), eixo: null };
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (!ini) return;
      const t = e.touches[0];
      const dx = t.clientX - ini.x, dy = t.clientY - ini.y;
      if (!ini.eixo) {
        if (Math.abs(dx) < TRAVA && Math.abs(dy) < TRAVA) return;
        ini.eixo = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y';
      }
      if (ini.eixo !== 'x') return;
      e.preventDefault();   // enquanto arrasta para o lado, a página não rola
      const destino = abas[atual + (dx < 0 ? 1 : -1)];
      mover(destino ? dx * 0.45 : dx * 0.12, false);   // sem tela para aquele lado: só resiste
    }, { passive: false });

    const soltar = e => {
      if (!ini || ini.eixo !== 'x') { ini = null; return; }
      const dx = (e.changedTouches[0]?.clientX ?? ini.x) - ini.x;
      const rapido = Math.abs(dx) > 50 && Date.now() - ini.t < 300;
      const destino = abas[atual + (dx < 0 ? 1 : -1)];
      ini = null;
      if (destino && (Math.abs(dx) > innerWidth * TROCA || rapido)) {
        mover(Math.sign(dx) * innerWidth * 0.3, true);
        destino.click();   // o mesmo caminho do toque na aba (realce "indo" e transição)
      } else {
        mover(0, true);
      }
    };
    document.addEventListener('touchend', soltar);
    document.addEventListener('touchcancel', soltar);
    // voltou para esta tela pelo "voltar": ela aparece no lugar
    window.addEventListener('pageshow', () => mover(0, false));
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
    const olho = olhoDoTopo();

    document.querySelectorAll('.nav-links a').forEach(a => {
      const ativo = a.dataset.nav === pagina;
      a.classList.toggle('active', ativo);
      if (ativo) a.setAttribute('aria-current', 'page');
    });

    document.querySelectorAll('[data-acao="novo-gasto"]').forEach(b =>
      b.addEventListener('click', () => GS.abrirFormTransacao()));
    document.querySelectorAll('[data-acao="transferir"]').forEach(b =>
      b.addEventListener('click', () => GS.abrirFormTransferencia()));

    // carrega as preferências (ex.: valores ocultos, moeda) e a licença antes do primeiro desenho
    const preparar = Promise.all([
      GS.api.obterPreferencias().then(p => { GS.oculto = !!p.ocultarValores; GS.definirMoeda(p.moeda); }),
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

    const rodar = () => preparar.then(() => { if (olho) olho.pintar(); }).then(desenhar).then(() => {
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
    // Antes os dados ficavam no localStorage, e outra aba que mexesse neles fazia esta recarregar.
    // Hoje eles ficam no banco, e o localStorage só guarda coisas do aparelho (lista de contas,
    // convites vistos), regravadas a cada abertura: recarregar por elas fazia duas abas abertas
    // se recarregarem uma à outra sem parar. Troca de conta em outra aba já chega por
    // onAuthStateChange (js/supabase.js).
    rodar();
  };
})();
