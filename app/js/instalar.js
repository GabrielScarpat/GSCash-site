/* =========================================================
   GSCASH — instalar no celular (ícone na tela inicial, tela cheia)
   O site já é instalável (manifest.webmanifest). Aqui ficam só o convite
   no Painel, o item do menu da conta e as instruções:
   · Android: a janela de instalação do próprio navegador (beforeinstallprompt);
     sem ela, o passo a passo pelo menu ⋮
   · iPhone/iPad: a Apple não deixa o site instalar sozinho, então o passo a
     passo pelo Compartilhar > Adicionar à Tela de Início
   Nada aparece no computador, no programa para Windows nem no app já instalado.
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const { icone, esc } = GS;
  const ua = navigator.userAgent;
  const ehIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);  // iPad se apresenta como Mac
  const ehCelular = ehIos || /Android|Mobi/i.test(ua);
  const instalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  const DISPENSADO = 'gscash:instalar-depois';  // quando a pessoa fechou o convite (some por 30 dias)
  const JA_INSTALOU = 'gscash:instalado';
  const DIAS_30 = 30 * 86400000;
  const ler = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sem localStorage: segue */ } };

  // aberto pelo ícone da tela inicial: lembra (no Android o navegador e o app dividem o localStorage)
  if (instalado()) gravar(JA_INSTALOU, '1');

  const disponivel = () => ehCelular && !GS.noDesktop && !instalado() && !ler(JA_INSTALOU);

  // Android/Chrome: guarda a janela de instalação para abrir no toque em "Instalar"
  let pedido = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    pedido = e;
  });
  window.addEventListener('appinstalled', () => {
    gravar(JA_INSTALOU, '1');
    document.querySelector('.convite-app')?.remove();
  });

  const LOGO = '<svg viewBox="0 0 256 256" fill="#F3EFE4" aria-hidden="true"><path d="M30 117A86 86 0 0 1 202 117Z"/><path d="M54 135H226A86 86 0 0 1 54 135Z"/></svg>';

  function passos(lista, dica) {
    return lista.map((p, i) => `<div class="instalar-passo"><span class="n">${i + 1}</span><span>${p}</span></div>`).join('')
      + `<p class="instalar-dica">${esc(dica)}</p>`;
  }
  const ic = nome => `<span class="instalar-ic">${icone(nome)}</span>`;

  function instrucoes() {
    const safari = !/CriOS|FxiOS|EdgiOS/.test(ua);
    const corpo = ehIos
      ? passos([
        `Toque em ${ic('compartilhar')} <b>Compartilhar</b>, ${safari ? 'na barra do Safari' : 'ao lado do endereço do site'}.`,
        `Role e toque em ${ic('mais-quadrado')} <b>Adicionar à Tela de Início</b>.`,
        'Toque em <b>Adicionar</b>, no canto de cima.',
      ], 'Pronto: o GSCASH aparece na tela inicial. Você continua conectado na mesma conta.')
      : passos([
        `Toque em ${ic('more')} no canto de cima do navegador.`,
        'Toque em <b>Instalar app</b> (em alguns celulares, <b>Adicionar à tela inicial</b>).',
        'Confirme em <b>Instalar</b>.',
      ], 'Pronto: o GSCASH aparece na tela inicial. Você continua conectado na mesma conta.');
    GS.abrirModal({
      titulo: ehIos ? 'Instalar no iPhone' : 'Instalar no celular',
      corpo: `<div class="instalar-passos">${corpo}</div>`,
      rodape: '<button type="button" class="btn btn-primary" data-fechar>Entendi</button>',
      rodapeClasse: 'um',
    });
  }

  async function abrir() {
    if (pedido) {
      const p = pedido;
      pedido = null;  // cada janela de instalação só pode ser usada uma vez
      p.prompt();
      const { outcome } = await p.userChoice;
      if (outcome === 'accepted') {
        gravar(JA_INSTALOU, '1');
        document.querySelector('.convite-app')?.remove();
      }
      return;
    }
    instrucoes();
  }

  // convite no Painel (só no celular, pelo navegador; o X esconde por 30 dias)
  function convite() {
    const dispensado = Number(ler(DISPENSADO) || 0);
    if (!disponivel() || Date.now() - dispensado < DIAS_30) return;
    const lugar = document.querySelector('main .container');
    if (!lugar || !document.getElementById('primeirosPassos')) return;  // só no Painel
    const el = GS.el('div', 'convite-app');
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Instalar o GSCASH');
    el.innerHTML = `
      <span class="icone-app">${LOGO}</span>
      <span class="txt"><b>Instale o GSCASH</b><small>Abre da tela inicial, em tela cheia, como um app.</small></span>
      <button type="button" class="btn btn-primary" data-instalar>Instalar</button>
      <button type="button" class="convite-fechar" aria-label="Agora não">${icone('x')}</button>`;
    el.querySelector('[data-instalar]').addEventListener('click', abrir);
    el.querySelector('.convite-fechar').addEventListener('click', () => {
      gravar(DISPENSADO, String(Date.now()));
      el.remove();
    });
    lugar.prepend(el);
  }

  GS.instalar = { disponivel, abrir };
  convite();
})();
