/* =========================================================
   GSCASH — boas-vindas
   · GS.abrirTour()               janela com o vídeo de 1 minuto
   · GS.desenharPrimeirosPassos() cartão do Painel com os 3 passos

   O vídeo fica no site (gscash.com.br), não dentro do app: o
   instalador não cresce e dá para trocar o vídeo sem versão nova.
   Na primeira vez, a janela também pergunta a moeda do app.
   Preferências usadas: boasVindasVista, primeirosPassosDispensado, moeda.
   ========================================================= */

(function () {
  const { icone, esc } = GS;

  const BASE = window.GS_TOUR_BASE || 'https://gscash.com.br/';
  const VIDEO = BASE + 'tour.mp4';
  const CAPA = BASE + 'tour-capa.jpg';
  const DURACAO = '1:03';

  const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';

  // capa com o botão de play; o vídeo só começa quando a pessoa clica (com som)
  function capa(classe) {
    return `<button type="button" class="${classe}" data-tocar aria-label="Assistir ao tour do GSCASH (${DURACAO})">
      <img src="${CAPA}" alt="">
      <span class="tour-play">${PLAY}</span>
      <span class="tour-duracao">${DURACAO}</span>
    </button>`;
  }

  /* ---------- Moeda na primeira vez ---------- */

  const PAISES_EURO = ['AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES'];
  const LINGUAS_EURO = ['de', 'fr', 'it', 'nl', 'fi', 'el', 'sk', 'sl', 'et', 'lv', 'lt'];

  // palpite pela língua do navegador: pt-BR -> real, en-US -> dólar, ja -> iene, Europa -> euro
  function moedaProvavel() {
    if (GS.codigoMoeda !== 'BRL') return GS.codigoMoeda;   // já escolheu antes
    const [lingua, pais] = (navigator.language || 'pt-BR').split('-');
    const P = (pais || '').toUpperCase();
    if (PAISES_EURO.includes(P) || (!P && LINGUAS_EURO.includes(lingua))) return 'EUR';
    if (lingua === 'ja') return 'JPY';
    if (P === 'US' || (lingua === 'en' && !P)) return 'USD';
    return 'BRL';
  }

  const NOME_CURTO = { BRL: 'Real', EUR: 'Euro', USD: 'Dólar', JPY: 'Iene' };

  function escolhaDeMoeda() {
    let escolhida = moedaProvavel();
    const bloco = GS.el('div', 'bv-moeda');
    const desenhar = () => {
      bloco.innerHTML = `
        <div class="bv-titulo"><b>Em qual moeda você registra seus gastos?</b><small>Dá para trocar depois em Configurações.</small></div>
        <div class="bv-lista" role="radiogroup" aria-label="Moeda do app">
          ${Object.entries(GS.MOEDAS).map(([codigo, m]) => `
            <button type="button" class="bv-op${codigo === escolhida ? ' on' : ''}" role="radio" aria-checked="${codigo === escolhida}" data-moeda="${codigo}">
              <span class="simb" aria-hidden="true">${esc(m.sigla)}</span>
              <span class="txt"><b>${NOME_CURTO[codigo]}</b><small class="num">${esc(GS.formatarEm(codigo, 123456))}</small></span>
            </button>`).join('')}
        </div>`;
    };
    bloco.addEventListener('click', e => {
      const b = e.target.closest('[data-moeda]');
      if (b) { escolhida = b.dataset.moeda; desenhar(); }
    });
    desenhar();
    return {
      el: bloco,
      // vale ao fechar a janela (Começar a usar, Ver depois ou o X)
      async aplicar() {
        if (escolhida === GS.codigoMoeda) return;
        GS.definirMoeda(escolhida);
        document.dispatchEvent(new Event('gs:dados'));   // redesenha a tela com a moeda nova
        try {
          await GS.api.salvarPreferencia('moeda', escolhida);
        } catch (err) {
          GS.toast(err.message, 'erro');
        }
      },
    };
  }

  /* ---------- Janela do tour ---------- */

  GS.abrirTour = function ({ primeiraVez = false } = {}) {
    const corpo = GS.el('div', 'tour');
    corpo.innerHTML = `
      <p class="tour-texto">Veja em 1 minuto como anotar seus gastos e entender para onde vai o seu dinheiro.</p>
      <div class="tour-video">${capa('tour-capa')}</div>`;
    const moeda = primeiraVez ? escolhaDeMoeda() : null;
    if (moeda) corpo.append(moeda.el);

    const modal = GS.abrirModal({
      titulo: primeiraVez ? 'Bem-vindo ao GSCASH!' : 'Tour do GSCASH',
      corpo,
      tamanho: 'tour',
      rodapeClasse: 'tour-pe',
      rodape: primeiraVez
        ? `<small>Dá para rever depois pelo menu da sua conta.</small>
           <span class="tour-botoes"><button type="button" class="btn btn-outline" data-fechar>Ver depois</button>
           <button type="button" class="btn btn-primary" data-fechar>Começar a usar</button></span>`
        : '<button type="button" class="btn btn-primary" data-fechar>Fechar</button>',
      aoFechar: () => {
        corpo.querySelector('video')?.pause();
        if (primeiraVez) GS.api.salvarPreferencia('boasVindasVista', true).catch(() => {});
        if (moeda) moeda.aplicar();
      },
    });

    corpo.querySelector('[data-tocar]').addEventListener('click', () => {
      const area = corpo.querySelector('.tour-video');
      area.innerHTML = `<video controls autoplay playsinline poster="${CAPA}" src="${VIDEO}"></video>`;
      area.querySelector('video').addEventListener('error', () => {
        area.innerHTML = `<div class="tour-erro">${icone('alert')}<p><strong>Não foi possível carregar o vídeo agora.</strong> Verifique sua conexão e tente de novo.</p></div>`;
      });
    });
    return modal;
  };

  /* ---------- Primeiros passos (Painel) ---------- */

  // alvo: a <section> do cartão; some quando os passos 1 e 3 estão feitos (o 2 é opcional) ou se a pessoa pulou
  GS.desenharPrimeirosPassos = function (alvo, ctx, prefs) {
    const temCarteira = ctx.carteiras.length > 0;
    const temCartao = GS.faturas.cartoes(ctx.carteiras).length > 0;
    const temLancamento = ctx.transacoes.some(t => t.tipo === 'despesa' || t.tipo === 'receita');
    const temReceita = ctx.transacoes.some(t => t.tipo === 'receita');

    if (prefs.primeirosPassosDispensado || (temCarteira && temLancamento)) {
      alvo.classList.add('hidden');
      alvo.innerHTML = '';
      return;
    }

    const passos = [
      { feito: temCarteira, titulo: 'Cadastre sua primeira carteira', dica: 'Sua conta do banco, a carteira de dinheiro ou a poupança, com o saldo de hoje.', botao: 'Criar carteira', acao: 'carteira', primario: true },
      { feito: temCartao, titulo: 'Tem cartão de crédito? Configure', dica: 'Limite, dia de fechamento e de vencimento. Pode pular.', botao: 'Configurar', acao: 'cartao' },
      { feito: temLancamento, titulo: 'Lance seus gastos', dica: 'Um por um, ou traga o mês inteiro do extrato do banco ou da sua planilha.', botao: 'Novo gasto', acao: 'gasto', primario: true,
        extra: GS.importar && !GS.somenteLeitura ? { botao: 'Importar extrato', acao: 'importar', icone: 'subir' } : null },
      // opcional, como o do cartão: muita gente não sabia que dava para lançar a renda
      { feito: temReceita, titulo: 'Registre o que você recebe', dica: 'Salário, freela, Pix recebido. Se cai todo mês, lance uma vez e marque para repetir.', botao: 'Nova receita', acao: 'receita', primario: true },
    ];
    const feitos = passos.filter(p => p.feito).length;

    alvo.classList.remove('hidden');
    alvo.innerHTML = `
      ${capa('passos-video')}
      <div class="passos-lado">
        <h2 class="passos-titulo">Seus primeiros passos</h2>
        <p class="passos-sub">${feitos} de ${passos.length} concluído${feitos === 1 ? '' : 's'} · leva uns dois minutos</p>
        <div class="bar passos-barra"><span style="width:${(feitos / passos.length) * 100}%"></span></div>
        <ol class="passos-lista">
          ${passos.map((p, i) => `
            <li class="passo ${p.feito ? 'feito' : ''}">
              <span class="passo-n" aria-hidden="true">${p.feito ? icone('check') : i + 1}</span>
              <div class="passo-texto"><strong>${esc(p.titulo)}</strong><small>${esc(p.dica)}</small></div>
              ${p.feito
                ? '<span class="sr-only">Concluído</span>'
                : `<span class="passo-acoes">${p.extra ? `<button type="button" class="btn btn-outline" data-passo="${p.extra.acao}">${icone(p.extra.icone)}${esc(p.extra.botao)}</button>` : ''}<button type="button" class="btn ${p.primario ? 'btn-primary' : 'btn-outline'}" data-passo="${p.acao}">${esc(p.botao)}</button></span>`}
            </li>`).join('')}
        </ol>
        <button type="button" class="link-btn passos-pular" data-pular>Pular por agora</button>
      </div>`;

    alvo.querySelector('[data-tocar]').addEventListener('click', () => GS.abrirTour());
    alvo.querySelectorAll('[data-passo]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.passo === 'carteira') GS.abrirFormCarteira(null, { quantas: ctx.carteiras.length });
      if (b.dataset.passo === 'cartao') location.href = 'faturas.html?configurar=1';
      if (b.dataset.passo === 'gasto') GS.abrirFormTransacao();
      if (b.dataset.passo === 'receita') GS.abrirFormTransacao(null, { tipo: 'receita' });
      if (b.dataset.passo === 'importar') GS.importar.abrir();
    }));
    alvo.querySelector('[data-pular]').addEventListener('click', async () => {
      alvo.classList.add('hidden');
      try {
        await GS.api.salvarPreferencia('primeirosPassosDispensado', true);
        GS.toast('Tudo bem! O tour continua no menu da sua conta.');
      } catch (err) {
        GS.toast(err.message, 'erro');
      }
    });
  };
})();
