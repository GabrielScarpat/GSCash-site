/* =========================================================
   GSCASH — avisos que aparecem ao entrar no app
   1. Atualização obrigatória (só no celular): se a versão instalada estiver abaixo da mínima publicada
      em gscash.com.br/app/versao-minima.json, uma tela sem fechar leva para a loja.
   2. Convite do Indique e ganhe: uma vez por conta, para quem ainda não ganhou os 6 meses.
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const { icone, esc } = GS;

  /* ---------- 1. atualização obrigatória no celular ----------
     O arquivo fica no site: para obrigar uma atualização basta subir o número e publicar o site,
     sem versão nova do app. Sem internet, o app abre normalmente. */

  const URL_MINIMA = 'https://gscash.com.br/app/versao-minima.json';
  const LOJA = {
    ios: 'itms-apps://apps.apple.com/app/id6827657035',
    android: 'market://details?id=br.com.gscash.app',
  };
  const numeros = v => String(v || '').split('.').map(n => parseInt(n, 10) || 0);
  const menor = (a, b) => {
    const x = numeros(a), y = numeros(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
    }
    return false;
  };

  function telaAtualizar(plataforma) {
    const tela = GS.el('div', 'atualizar-obrigatorio');
    tela.setAttribute('role', 'alertdialog');
    tela.setAttribute('aria-modal', 'true');
    tela.innerHTML = `
      <div class="ao-corpo">
        <span class="ao-icone">${icone('download')}</span>
        <h2>Atualize o GSCASH para continuar</h2>
        <p>Esta versão do app não recebe mais as correções. A atualização é grátis e seus dados continuam na sua conta.</p>
        <button type="button" class="btn btn-primary btn-lg" data-loja>${icone('download')}${plataforma === 'ios' ? 'Atualizar na App Store' : 'Atualizar no Google Play'}</button>
      </div>`;
    // o app abre a loja (App Store ou Google Play) direto na página do GSCASH
    tela.querySelector('[data-loja]').addEventListener('click', () => { window.location.href = LOJA[plataforma]; });
    document.body.append(tela);
    document.documentElement.classList.add('sem-rolagem');
  }

  const versaoConferida = (async () => {
    if (!GS.nativo) return true;
    const plataforma = window.Capacitor.getPlatform();
    if (!LOJA[plataforma]) return true;
    try {
      const [info, minima] = await Promise.all([
        window.Capacitor.registerPlugin('App').getInfo(),
        fetch(`${URL_MINIMA}?t=${Date.now()}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : {})),
      ]);
      if (minima[plataforma] && menor(info.version, minima[plataforma])) {
        telaAtualizar(plataforma);
        return false;
      }
    } catch (e) {
      console.warn('versão mínima', e);  // sem internet: não bloqueia
    }
    return true;
  })();

  /* ---------- 2. convite do Indique e ganhe ----------
     Uma vez por conta neste aparelho, na primeira tela depois de entrar. Não aparece para quem já ganhou,
     nem por cima de outra janela (boas-vindas, aviso da licença...). */

  const VISTO = 'gscash:viu-convite-indique';
  const LINK = 'https://gscash.com.br/?ref=';

  async function convite() {
    if (!(await versaoConferida)) return;
    await GS.usuarioPronto;
    if (!GS.usuario || GS.daConta.ler(VISTO)) return;
    await GS.licenca?.pronta;
    await new Promise(r => setTimeout(r, 1500));
    // outra janela aberta (boas-vindas, prêmio, compra): fica para a próxima tela
    if (document.querySelector('.modal-backdrop, .atualizar-obrigatorio')) return;
    let ind;
    try {
      const { data, error } = await GS.supabase.rpc('minha_indicacao');
      if (error) throw error;
      ind = data;
    } catch (e) {
      console.warn('minha_indicacao', e);
      return;
    }
    if (!ind || !ind.codigo || ind.premio) { GS.daConta.gravar(VISTO, '1'); return; }
    if (document.querySelector('.modal-backdrop')) return;
    GS.daConta.gravar(VISTO, '1');

    const meta = ind.meta || 5;
    const validas = Math.min(ind.validas || 0, meta);
    const link = LINK + ind.codigo;
    const compartilha = !!navigator.share && (GS.nativo || /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent));
    const titulo = 'Indique 5 amigos e ganhe 6 meses grátis';
    const modal = GS.abrirModal({
      titulo,
      tamanho: 'convite-indique',
      corpo: `
        <div class="ci-corpo">
          <span class="ci-icone">${icone('gift')}</span>
          <h2 class="ci-titulo">${titulo}</h2>
          <p>Quando ${meta} amigos criarem a conta pelo seu link e lançarem o primeiro gasto, sua licença ganha 6 meses sem pagar nada.</p>
          ${compartilha ? '' : `<div class="ci-link">${icone('copiar')}<span>${esc(link.replace('https://', ''))}</span><small>seu link</small></div>`}
          <div class="ci-prog"><div class="barra"><i style="width:${Math.round((validas / meta) * 100)}%"></i></div><span><b>${validas} de ${meta}</b> amigos</span></div>
        </div>`,
      rodape: `
        <button type="button" class="btn btn-primary btn-lg" data-acao>${compartilha ? `${icone('compartilhar')}Compartilhar meu link` : `${icone('copiar')}Copiar meu link`}</button>
        <button type="button" class="ci-depois" data-fechar>Agora não</button>`,
      rodapeClasse: 'ci-rodape',
    });
    const botao = modal.foot.querySelector('[data-acao]');
    botao.addEventListener('click', async () => {
      const texto = `Uso o GSCASH para controlar meus gastos. Crie sua conta pelo meu link, são 12 dias grátis para testar (código ${ind.codigo}):`;
      if (compartilha) {
        try { await navigator.share({ title: 'GSCASH', text: texto, url: link }); } catch (e) { /* fechou a janela */ }
        return;
      }
      try {
        await navigator.clipboard.writeText(link);
      } catch (e) {
        const t = GS.el('textarea');
        t.value = link;
        document.body.append(t);
        t.select();
        document.execCommand('copy');
        t.remove();
      }
      botao.innerHTML = `${icone('check')}Link copiado`;
      setTimeout(() => { if (botao.isConnected) botao.innerHTML = `${icone('copiar')}Copiar meu link`; }, 2000);
    });
    botao.focus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', convite);
  else convite();

  GS.avisosApp = { versaoConferida, _testes: { menor } };
})();
