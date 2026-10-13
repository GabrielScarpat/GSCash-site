/* =========================================================
   GSCASH — tela de abertura
   Só no app de computador, quando a janela abre (index.html?desktop=1).
   Fica na tela enquanto os dados carregam e por pelo menos 1 s.
   ========================================================= */

(function () {
  if (!new URLSearchParams(location.search).has('desktop')) return;

  const tela = document.createElement('div');
  tela.className = 'abertura';
  tela.setAttribute('role', 'status');
  tela.innerHTML = `
    <div class="abertura-marca">
      <svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
        <path class="metade-cima" d="M30 117A86 86 0 0 1 202 117Z"/>
        <path class="metade-baixo" d="M54 135H226A86 86 0 0 1 54 135Z"/>
      </svg>
      GSCASH
    </div>
    <span class="abertura-msg">Abrindo suas contas…</span>`;
  document.body.prepend(tela);

  const esperar = ms => new Promise(r => setTimeout(r, ms));
  const paginaPronta = new Promise(r => (document.readyState === 'complete' ? r() : window.addEventListener('load', r, { once: true })));
  const apiPronta = new Promise(r => {
    if (window.pywebview && window.pywebview.api) return r();
    window.addEventListener('pywebviewready', r, { once: true });
  });

  // nunca prende o usuário: some no máximo em 5 s
  Promise.race([Promise.all([esperar(1000), paginaPronta, apiPronta]), esperar(5000)]).then(() => {
    tela.classList.add('saindo');
    setTimeout(() => tela.remove(), 400);
  });
})();
