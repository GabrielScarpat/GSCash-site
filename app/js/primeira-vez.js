/* =========================================================
   GSCASH — primeira abertura do app sem conta
   No app do iPhone e no programa do Windows, a primeira vez que a tela de entrar abre
   num aparelho que nunca viu a apresentação nem entrou em nenhuma conta, o app mostra
   antes a apresentação (inicio.html). Depois disso, abre direto na tela de entrar.
   No navegador não vale: lá a apresentação é a página inicial do site.
   Carregar na tela de entrar depois do js/supabase.js (usa GS.contas).
   ========================================================= */

(function () {
  const CHAVE = 'gscash:viu-inicio';
  const ios = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.getPlatform() === 'ios');
  let desktop = false;
  try { desktop = sessionStorage.getItem('gscash:desktop') === '1'; } catch (e) { /* segue */ }
  if (!ios && !desktop) return;

  // chegou para entrar em outra conta, refazer a senha, criar conta ou por convite: não interrompe
  const p = new URLSearchParams(location.search);
  if (p.has('adicionar') || p.get('reentrar') || p.get('ref') || location.hash) return;
  try { if (localStorage.getItem(CHAVE)) return; } catch (e) { /* segue */ }

  // enquanto decide, a tela de entrar fica escondida (no máximo 1,5 s, para nunca travar)
  const raiz = document.documentElement;
  raiz.style.visibility = 'hidden';
  const mostrar = () => { raiz.style.visibility = ''; };
  const limite = setTimeout(mostrar, 1500);

  const apiDesktop = () => new Promise(resolve => {
    const api = window.pywebview && window.pywebview.api;
    if (api && api.sessao_ler) return resolve(api);
    window.addEventListener('pywebviewready', () => resolve(window.pywebview.api), { once: true });
    setTimeout(() => resolve(null), 1200);
  });

  let indo = false;
  (async () => {
    try {
      // o programa do Windows não guarda o localStorage entre as aberturas: a marca fica no arquivo de sessões
      if (desktop) {
        const api = await apiDesktop();
        if (api && await api.sessao_ler(CHAVE)) return;
      }
      // quem já entrou alguma vez neste aparelho não é "primeira vez"
      const contas = GS.contas ? await GS.contas.listar().catch(() => []) : [];
      if (contas.length) {
        try { localStorage.setItem(CHAVE, '1'); } catch (e) { /* segue */ }
        return;
      }
      indo = true;
      clearTimeout(limite);
      location.replace('inicio.html');   // a apresentação grava a marca ao abrir
    } finally {
      if (!indo) { clearTimeout(limite); mostrar(); }   // indo para a apresentação: a tela de entrar nem aparece
    }
  })();
})();
