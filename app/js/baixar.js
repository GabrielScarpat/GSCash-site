/* =========================================================
   GSCASH — "Baixar para Windows" (tela de entrar e rodapé do navegador)
   No Windows o link baixa o instalador da última versão publicada.
   Em outro aparelho, um aviso explica que por enquanto só existe para
   Windows e que dá para continuar pelo navegador.
   Dentro do programa instalado o link não aparece.
   ========================================================= */

window.GS = window.GS || {};

(function () {
  // false esconde os links (ex.: se a Release mais nova não servir para quem vem do site).
  // Ligado desde a 2.0.0, a primeira versão com conta e teste grátis.
  const INSTALADOR_PRONTO = true;

  // sempre o instalador da versão mais nova (publicar.bat cria a Release com este arquivo)
  const URL_INSTALADOR = 'https://github.com/GabrielScarpat/GSCash-versoes/releases/latest/download/Instalar-GSCASH.exe';

  const ICONE_BAIXAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>';
  const ICONE_COMPUTADOR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>';

  // o supabase.js marca a sessão quando a página roda dentro do programa
  const noPrograma = (() => {
    try { return sessionStorage.getItem('gscash:desktop') === '1'; } catch (e) { return false; }
  })();

  // nome do aparelho para o aviso; 'Windows' quando dá para instalar
  function plataforma() {
    const ua = navigator.userAgent;
    const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    if (/iPhone|iPod/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua) || (/Mac/.test(p) && navigator.maxTouchPoints > 1)) return 'iPad';  // o iPad se apresenta como Mac
    if (/Android/.test(ua)) return 'Android';
    if (/CrOS/.test(ua) || /Chrome OS/i.test(p)) return 'Chromebook';
    if (/Windows/.test(ua) && !/Windows Phone/.test(ua)) return 'Windows';
    if (/Mac/.test(p) || /Macintosh/.test(ua)) return 'Mac';
    if (/Linux/.test(ua + p)) return 'Linux';
    return null;
  }

  // estilo da janela aqui mesmo: ela aparece na tela de entrar, no app e na página do site,
  // que têm folhas de estilo diferentes
  const ESTILO = `
    .aviso-baixar { width: min(400px, calc(100% - 32px)); padding: 28px 24px 22px; border: 0; border-radius: 22px;
      background: #FDFCF8; color: #1B1B19; text-align: center; box-shadow: 0 24px 60px rgba(28, 26, 20, .22);
      font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .aviso-baixar::backdrop { background: rgba(27, 27, 25, .42); }
    .aviso-baixar .ic { display: grid; place-items: center; width: 56px; height: 56px; margin: 0 auto 14px; border-radius: 16px;
      background: #E3EAF2; color: #1D3A5E; }
    .aviso-baixar .ic svg { width: 28px; height: 28px; }
    .aviso-baixar h2 { margin: 0 0 8px; font-size: 18px; line-height: 1.3; text-wrap: balance; }
    .aviso-baixar p { margin: 0 auto 10px; max-width: 280px; color: #4A4740; font-size: 15px; line-height: 1.5; text-wrap: balance; }
    .aviso-baixar p.sub { margin-bottom: 20px; color: #7A766B; font-size: 14px; }
    .aviso-baixar button { width: 100%; height: 44px; border: 0; border-radius: 12px; background: #1D3A5E; color: #fff;
      font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; }
    .aviso-baixar button:hover { background: #16304F; }`;

  function avisar(nome) {
    if (!document.getElementById('estiloAvisoBaixar')) {
      const estilo = document.createElement('style');
      estilo.id = 'estiloAvisoBaixar';
      estilo.textContent = ESTILO;
      document.head.append(estilo);
    }
    const caixa = document.createElement('dialog');
    caixa.className = 'aviso-baixar';
    caixa.setAttribute('aria-labelledby', 'avisoBaixarTitulo');
    caixa.innerHTML = `
      <div class="ic">${ICONE_COMPUTADOR}</div>
      <h2 id="avisoBaixarTitulo">Ainda não temos o programa para ${nome || 'o seu aparelho'}</h2>
      <p>Infelizmente, por enquanto o GSCASH só pode ser instalado no Windows.</p>
      <p class="sub">Você pode continuar usando por aqui, no navegador, com a mesma conta e os mesmos dados.</p>
      <button type="button">Entendi</button>`;
    document.body.append(caixa);
    const fechar = () => caixa.close();
    caixa.querySelector('button').addEventListener('click', fechar);
    caixa.addEventListener('click', e => { if (e.target === caixa) fechar(); });  // clique fora da caixa
    caixa.addEventListener('close', () => caixa.remove());
    caixa.showModal();
  }

  document.addEventListener('click', e => {
    if (!e.target.closest('[data-baixar]')) return;
    const nome = plataforma();
    if (nome === 'Windows') return;  // segue o link: o navegador baixa o instalador
    e.preventDefault();
    avisar(nome);
  });

  // links já escritos na página inicial do site (site/index.html): somem dentro do programa
  if (noPrograma || !INSTALADOR_PRONTO) {
    const esconder = () => document.querySelectorAll('[data-baixar]').forEach(a => { a.hidden = true; });
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', esconder) : esconder();
  }

  // link pronto para pôr na página (vazio dentro do programa)
  const linkHtml = () => (noPrograma || !INSTALADOR_PRONTO ? '' : `<a class="link-btn" href="${URL_INSTALADOR}" data-baixar>${ICONE_BAIXAR}Baixar para Windows</a>`);

  GS.baixar = { linkHtml };
})();
