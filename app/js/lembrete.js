/* =========================================================
   GSCASH — lembrete diário às 19h (notificação no celular ou no navegador)
   Quem manda é o servidor (Edge Function "lembrete"): às 19h de Brasília, se a
   pessoa ainda não lançou nada no dia. Aqui ficam a chave em Configurações ›
   Notificações, a janela "Lembrete diário", o convite no Painel do app instalado
   e o service worker (sw.js).
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
  // no navegador: notificação enviada pelo servidor (Web Push)
  const pushDaWeb = temPush && !GS.noDesktop && !GS.nativo;
  // no app do iPhone: o próprio celular agenda as notificações das 19h (LocalNotifications)
  const suportado = pushDaWeb || GS.nativo;
  // no iPhone pelo Safari não dá, mas o item aparece para explicar e levar à instalação
  const visivel = () => !GS.noDesktop && (suportado || (ehIos && !instalado()));

  const CONVITE_VISTO = 'gscash:lembrete-convite';
  // o convite e o lembrete do iPhone são de cada conta (js/supabase.js: GS.daConta)
  const ler = k => GS.daConta.ler(k);
  const gravar = (k, v) => GS.daConta.gravar(k, v);

  // o service worker só recebe notificações (não guarda nada em cache)
  const registro = pushDaWeb ? navigator.serviceWorker.register('sw.js').catch(e => { console.warn('sw.js', e); return null; }) : Promise.resolve(null);

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

  /* ---------- app do iPhone: notificações agendadas no próprio celular ----------
     Ficam agendadas as 19h dos próximos 14 dias; a cada vez que o app é aberto ou
     sai da tela, a lista é refeita. Se já houve lançamento hoje, a de hoje sai da lista
     (como o servidor faz no navegador). Quem passar 14 dias sem abrir para de receber. */

  const LN = GS.nativo ? window.Capacitor.registerPlugin('LocalNotifications') : null;
  const LIGADO_AQUI = 'gscash:lembrete-app';
  const ID_BASE = 1900;
  const DIAS = 14;
  const TITULO = 'Lançou seus gastos de hoje?';
  const CORPO = 'Toque para anotar em segundos.';

  async function lancouHoje() {
    try {
      const h = new Date();
      const inicio = new Date(h.getFullYear(), h.getMonth(), h.getDate()).getTime();
      return (await GS.api.listarTransacoes()).some(t => t.criadoEm >= inicio);
    } catch (e) {
      return false;
    }
  }

  async function agendarNoApp() {
    const { notifications: pendentes } = await LN.getPending();
    const nossas = pendentes.filter(n => n.id >= ID_BASE && n.id < ID_BASE + DIAS);
    if (nossas.length) await LN.cancel({ notifications: nossas.map(n => ({ id: n.id })) });
    if (ler(LIGADO_AQUI) !== '1') return;
    const agora = new Date();
    const pularHoje = await lancouHoje();
    const lista = [];
    for (let i = 0; i < DIAS; i++) {
      const at = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + i, 19, 0, 0);
      if (at <= agora || (i === 0 && pularHoje)) continue;
      lista.push({ id: ID_BASE + i, title: TITULO, body: CORPO, schedule: { at, allowWhileIdle: true }, extra: { novo: 1 } });
    }
    if (lista.length) await LN.schedule({ notifications: lista });
  }

  const noApp = LN && {
    async negado() { return (await LN.checkPermissions()).display === 'denied'; },
    async ligado() { return ler(LIGADO_AQUI) === '1' && (await LN.checkPermissions()).display === 'granted'; },
    async ligar() {
      if ((await LN.requestPermissions()).display !== 'granted') return false;
      gravar(LIGADO_AQUI, '1');
      await agendarNoApp();
      return true;
    },
    async desligar() {
      gravar(LIGADO_AQUI, '0');
      await agendarNoApp();
    },
  };

  const naWeb = {
    async negado() { return Notification.permission === 'denied'; },
    async ligado() {
      const sub = await inscricaoAtual();
      if (!sub) return false;
      // o aparelho avisa uma conta só: se outra conta ligou o lembrete aqui, para esta ele está desligado
      const { data, error } = await GS.supabase.from('lembretes').select('endpoint').eq('endpoint', sub.endpoint).maybeSingle();
      return error ? true : !!data;
    },
    ligar,
    desligar,
  };

  const motor = GS.nativo ? noApp : naWeb;

  if (GS.nativo) {
    const refazer = () => agendarNoApp().catch(e => console.warn('lembrete: agendar', e));
    GS.usuarioPronto.then(refazer);
    // saiu do app (talvez depois de lançar algo): tira o lembrete de hoje se não precisa mais
    document.addEventListener('visibilitychange', () => { if (document.hidden) refazer(); });
    // tocou na notificação: abre direto o Novo gasto
    LN.addListener('localNotificationActionPerformed', e => {
      const n = e && e.notification;
      if (n && n.extra && n.extra.novo) location.href = 'index.html?novo=1';
    });
  }

  /* ---------- janela "Lembrete diário" ---------- */

  const EXPLICA = 'Todo dia às 19h, uma notificação lembra você de lançar os gastos. Nos dias em que você já lançou algo, ela não chega.';
  const AVISO_LIGADO = () => (GS.nativo ? 'Lembrete ligado: todo dia às 19h.' : 'Lembrete ligado. Mandamos uma notificação de teste.');

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
      const onde = GS.nativo ? 'em <b>Ajustes &gt; Notificações &gt; GSCASH</b>' : 'nas configurações do navegador (ou do celular)';
      modal.body.innerHTML = `<div class="lembrete-aviso">${icone('alert')}<span>As notificações do GSCASH estão <b>bloqueadas</b> neste aparelho. Libere ${onde} e tente de novo.</span></div>`;
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
          if (!(await motor.ligar())) return bloqueado();
          gravar(CONVITE_VISTO, '1');
          document.querySelector('.convite-lembrete')?.remove();
          ligadoTela();
          GS.toast(AVISO_LIGADO());
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
          await motor.desligar();
          desligadoTela();
          GS.toast('Lembrete desligado neste aparelho.');
        } catch (err) {
          ligadoTela();
          GS.toast(err.message, 'erro');
        }
      });
    }

    if (await motor.negado()) return bloqueado();
    (await motor.ligado()) ? ligadoTela() : desligadoTela();
  }

  /* ---------- convite no Painel (uma vez, só no app instalado) ---------- */

  async function convite() {
    await GS.usuarioPronto;
    if (!suportado || !(GS.nativo || instalado()) || ler(CONVITE_VISTO)) return;
    const lugar = document.querySelector('main .container');
    if (!lugar || !document.getElementById('primeirosPassos')) return;  // só no Painel
    if (await motor.negado() || await motor.ligado()) return;
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

  /* ---------- chave em Configurações ----------
     Liga ou desliga direto (o navegador ou o iPhone pedem a permissão na hora).
     Se as notificações estiverem bloqueadas, abre a janela que explica como liberar.
     Devolve se ficou ligado. */

  async function definir(ligar) {
    if (!ligar) {
      await motor.desligar();
      GS.toast('Lembrete desligado neste aparelho.');
      return false;
    }
    if (await motor.negado() || !(await motor.ligar())) {
      abrirJanela();
      return false;
    }
    gravar(CONVITE_VISTO, '1');
    GS.toast(AVISO_LIGADO());
    return true;
  }

  GS.lembrete = { visivel, suportado, abrir: abrirJanela, ligado: () => motor.ligado(), definir };
  convite();
})();
