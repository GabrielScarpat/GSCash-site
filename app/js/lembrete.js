/* =========================================================
   GSCASH — lembrete diário às 19h (notificação no celular ou no navegador)
   Quem manda é o servidor (Edge Function "lembrete"): às 19h de Brasília, se a
   pessoa ainda não lançou nada no dia. Aqui ficam a janela "Lembrete diário"
   (menu da conta), o convite no Painel do app instalado e o service worker (sw.js).
   · iPhone: a Apple só deixa o GSCASH instalado na tela inicial receber notificação.
   · Programa para Windows: fica de fora (o navegador embutido não recebe notificação).
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const { icone, esc } = GS;
  const ua = navigator.userAgent;
  const ehIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const instalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const temPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
  const suportado = temPush && !GS.noDesktop;
  // no iPhone pelo Safari não dá, mas o item aparece para explicar e levar à instalação
  const visivel = () => !GS.noDesktop && (suportado || (ehIos && !instalado()));

  const CONVITE_VISTO = 'gscash:lembrete-convite';
  const ler = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* segue */ } };

  // o service worker só recebe notificações (não guarda nada em cache)
  const registro = suportado ? navigator.serviceWorker.register('sw.js').catch(e => { console.warn('sw.js', e); return null; }) : Promise.resolve(null);

  async function inscricaoAtual() {
    const reg = await registro;
    if (!reg || Notification.permission !== 'granted') return null;
    return reg.pushManager.getSubscription();
  }

  async function pedir(corpo) {
    const { data: r, error } = await GS.supabase.functions.invoke('lembrete', { body: corpo });
    if (!error) return r;
    let msg = 'Não foi possível falar com o servidor agora. Tente de novo em instantes.';
    try { msg = (await error.context.json()).erro || msg; } catch (e) { /* fica a padrão */ }
    throw new Error(msg);
  }

  // chave pública (texto base64url) -> bytes, como o PushManager pede
  function bytes(base64url) {
    const b = atob(base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - base64url.length % 4) % 4));
    return Uint8Array.from(b, c => c.charCodeAt(0));
  }

  async function ligar() {
    const permissao = await Notification.requestPermission();
    if (permissao !== 'granted') return false;
    const reg = await registro || await navigator.serviceWorker.ready;
    const { chave } = await pedir({ acao: 'chave' });
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(chave) });
    await pedir({ acao: 'ligar', inscricao: sub.toJSON() });
    return true;
  }

  async function desligar() {
    const sub = await inscricaoAtual();
    if (!sub) return;
    await pedir({ acao: 'desligar', endpoint: sub.endpoint });
    await sub.unsubscribe();
  }

  /* ---------- janela "Lembrete diário" ---------- */

  const EXPLICA = 'Todo dia às 19h, uma notificação lembra você de lançar os gastos. Nos dias em que você já lançou algo, ela não chega.';

  async function abrirJanela() {
    const modal = GS.abrirModal({ titulo: 'Lembrete diário', corpo: '' });
    const rodape = html => {
      modal.foot.innerHTML = html;
      modal.foot.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => modal.fechar()));
    };
    const ocupado = (botao, texto) => {
      botao.disabled = true;
      botao.innerHTML = `<span class="roda-botao" aria-hidden="true"></span>${esc(texto)}`;
    };

    // iPhone pelo Safari: só funciona instalado
    if (!suportado) {
      modal.body.innerHTML = `<div class="lembrete-aviso">${icone('alert')}<span>No iPhone, as notificações só funcionam com o GSCASH <b>instalado na tela inicial</b>. Instale e ative o lembrete pelo app.</span></div>`;
      rodape(`<button type="button" class="btn btn-outline" data-fechar>Fechar</button>
              <button type="button" class="btn btn-primary" data-instalar>Como instalar</button>`);
      modal.foot.querySelector('[data-instalar]').addEventListener('click', () => { modal.fechar(); GS.instalar?.abrir(); });
      return;
    }

    function bloqueado() {
      modal.body.innerHTML = `<div class="lembrete-aviso">${icone('alert')}<span>As notificações do GSCASH estão <b>bloqueadas</b> neste aparelho. Libere nas configurações do navegador (ou do celular) e tente de novo.</span></div>`;
      rodape('<button type="button" class="btn btn-primary" data-fechar>Entendi</button>');
      modal.foot.className = 'modal-foot um';
    }

    function desligadoTela() {
      modal.foot.className = 'modal-foot';
      modal.body.innerHTML = `<p>${EXPLICA}</p>`;
      rodape(`<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
              <button type="button" class="btn btn-primary" data-ligar>${icone('sino')}Ativar lembrete</button>`);
      modal.foot.querySelector('[data-ligar]').addEventListener('click', async e => {
        const b = e.currentTarget;
        ocupado(b, 'Ativando…');
        try {
          if (!(await ligar())) return bloqueado();
          gravar(CONVITE_VISTO, '1');
          document.querySelector('.convite-lembrete')?.remove();
          ligadoTela();
          GS.toast('Lembrete ligado. Mandamos uma notificação de teste.');
        } catch (err) {
          console.error('Falha ao ligar o lembrete', err);
          desligadoTela();
          GS.toast(err.message || 'Não foi possível ligar o lembrete agora.', 'erro');
        }
      });
    }

    function ligadoTela() {
      modal.foot.className = 'modal-foot even';
      modal.body.innerHTML = `
        <div class="lembrete-ligado">${icone('check')}Ligado: todo dia às 19h, neste aparelho</div>
        <p>${EXPLICA}</p>`;
      rodape(`<button type="button" class="btn btn-outline" data-desligar>Desligar</button>
              <button type="button" class="btn btn-primary" data-fechar>Fechar</button>`);
      modal.foot.querySelector('[data-desligar]').addEventListener('click', async e => {
        ocupado(e.currentTarget, 'Desligando…');
        try {
          await desligar();
          desligadoTela();
          GS.toast('Lembrete desligado neste aparelho.');
        } catch (err) {
          ligadoTela();
          GS.toast(err.message, 'erro');
        }
      });
    }

    if (Notification.permission === 'denied') return bloqueado();
    (await inscricaoAtual()) ? ligadoTela() : desligadoTela();
  }

  /* ---------- convite no Painel (uma vez, só no app instalado) ---------- */

  async function convite() {
    if (!suportado || !instalado() || ler(CONVITE_VISTO) || Notification.permission === 'denied') return;
    const lugar = document.querySelector('main .container');
    if (!lugar || !document.getElementById('primeirosPassos')) return;  // só no Painel
    if (await inscricaoAtual()) return;
    const el = GS.el('div', 'convite-app convite-lembrete');
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Lembrete diário');
    el.innerHTML = `
      <span class="icone-sino">${icone('sino')}</span>
      <span class="txt"><b>Quer um lembrete às 19h?</b><small>Uma notificação para não esquecer de lançar os gastos.</small></span>
      <button type="button" class="btn btn-primary" data-ativar>Ativar</button>
      <button type="button" class="convite-fechar" aria-label="Agora não">${icone('x')}</button>`;
    el.querySelector('[data-ativar]').addEventListener('click', abrirJanela);
    el.querySelector('.convite-fechar').addEventListener('click', () => {
      gravar(CONVITE_VISTO, '1');
      el.remove();
    });
    lugar.prepend(el);
  }

  /* ---------- tocou na notificação: abre direto o Novo gasto ---------- */

  const params = new URLSearchParams(location.search);
  if (params.has('novo')) {
    params.delete('novo');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
    const abrirNovo = () => document.querySelector('[data-acao="novo-gasto"]')?.click();
    document.readyState === 'complete' ? setTimeout(abrirNovo, 600) : window.addEventListener('load', () => setTimeout(abrirNovo, 600), { once: true });
  }

  GS.lembrete = { visivel, abrir: abrirJanela };
  convite();
})();
