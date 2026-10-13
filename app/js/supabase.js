/* =========================================================
   GSCASH — conexão com o Supabase e login

   A chave abaixo é a PUBLICÁVEL: foi feita para ficar no código do app.
   Quem protege os dados é a RLS do banco (cada pessoa só enxerga as
   próprias linhas). Nunca coloque aqui a chave "service_role".

   GS.auth.* devolve Promises e já traz mensagens de erro em português.
   Nas páginas do app (tudo menos entrar.html) este arquivo também
   manda para a tela de login quem não estiver logado.
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const SUPABASE_URL = 'https://dlgxytheymnlcnxtbqib.supabase.co';
  const SUPABASE_CHAVE = 'sb_publishable_TfUsoMVnlnPnAe3BzbO8jQ_qfWAHcnI';

  // no app de computador (index.html?desktop=1) o login é guardado pelo Python:
  // o navegador embutido não mantém o localStorage entre as aberturas
  const noDesktop = (() => {
    try {
      if (new URLSearchParams(location.search).has('desktop')) sessionStorage.setItem('gscash:desktop', '1');
      return sessionStorage.getItem('gscash:desktop') === '1';
    } catch (e) {
      return false;
    }
  })();

  const apiDesktop = () => new Promise(resolve => {
    const api = window.pywebview && window.pywebview.api;
    if (api && api.sessao_ler) return resolve(api);
    window.addEventListener('pywebviewready', () => resolve(window.pywebview.api), { once: true });
  });

  const armazenamentoDesktop = {
    getItem: async chave => (await apiDesktop()).sessao_ler(chave),
    setItem: async (chave, valor) => { await (await apiDesktop()).sessao_gravar(chave, valor); },
    removeItem: async chave => { await (await apiDesktop()).sessao_apagar(chave); },
  };

  const cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_CHAVE, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      ...(noDesktop ? { storage: armazenamentoDesktop } : {}),
    },
  });
  GS.supabase = cliente;

  const naTelaDeLogin = /entrar\.html$/i.test(location.pathname);
  // Os links dos e-mails (confirmar conta, nova senha) vão SEMPRE para a página do site
  // (site/, em gscash.com.br): ela abre em qualquer aparelho, inclusive no celular.
  // Precisa ser dito explicitamente: sem isso, o Supabase usa o endereço da página que
  // pediu o e-mail (ex.: localhost) quando ele está na lista de endereços permitidos.
  const SITE_EMAILS = 'https://gscash.com.br/';
  // temHttp só decide se o login com Google pode voltar direto para esta página.
  const temHttp = /^https?:$/.test(location.protocol) && !noDesktop;

  // o Supabase devolve erros em inglês: traduz os mais comuns
  function traduzir(erro) {
    const codigo = erro && erro.code;
    const msg = String((erro && erro.message) || '');
    if (codigo === 'invalid_credentials') return 'E-mail ou senha incorretos.';
    if (codigo === 'email_not_confirmed') return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
    if (codigo === 'user_already_exists' || codigo === 'email_exists') return 'Já existe uma conta com esse e-mail. Tente entrar.';
    if (codigo === 'weak_password') return 'Senha fraca. Use pelo menos 8 caracteres.';
    if (codigo === 'over_request_rate_limit' || codigo === 'over_email_send_rate_limit') return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
    if (codigo === 'validation_failed' && /provider/i.test(msg)) return 'O login com Google ainda não está ativado.';
    if (/failed to fetch|network/i.test(msg)) return 'Sem conexão com a internet.';
    return msg || 'Algo deu errado. Tente de novo.';
  }

  async function executar(promessa) {
    let resp;
    try {
      resp = await promessa;
    } catch (e) {
      throw new Error(traduzir(e));
    }
    if (resp.error) throw new Error(traduzir(resp.error));
    return resp.data;
  }

  // para onde o Supabase deve voltar depois do Google / link de e-mail (só existe com http)
  const voltarPara = () => location.origin + location.pathname.replace(/[^/]*$/, '') + 'index.html';

  // app de computador: endereço local do app.py que recebe a volta do Google (igual ao PORTA_GOOGLE)
  const VOLTA_GOOGLE_DESKTOP = 'http://127.0.0.1:53682/google';

  // cliente só para o login com Google no app de computador (fluxo PKCE). Usa o mesmo
  // armazenamento do cliente principal, então a sessão criada aqui vale para o app todo.
  let pkceCriado = null;
  const clientePkce = () => pkceCriado || (pkceCriado = window.supabase.createClient(SUPABASE_URL, SUPABASE_CHAVE, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storage: armazenamentoDesktop },
  }));

  // o Google precisa estar ligado no Supabase; senão o navegador cairia numa página de erro técnica
  async function googleDisponivel() {
    let ligado = false;
    try {
      const resp = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_CHAVE } });
      ligado = resp.ok && !!((await resp.json()).external || {}).google;
    } catch (e) {
      throw new Error(traduzir(e));
    }
    if (!ligado) throw new Error('O login com Google ainda não está disponível. Use e-mail e senha.');
  }

  GS.auth = {
    // sessão atual (ou null)
    async sessao() {
      const { data } = await cliente.auth.getSession();
      return data.session;
    },

    async entrar(email, senha) {
      const dados = await executar(cliente.auth.signInWithPassword({ email: email.trim(), password: senha }));
      return dados.session;
    },

    // devolve { precisaConfirmar: true } quando o Supabase exige confirmar o e-mail
    async criarConta(email, senha) {
      const dados = await executar(cliente.auth.signUp({ email: email.trim(), password: senha, options: { emailRedirectTo: SITE_EMAILS } }));
      // e-mail já cadastrado: o Supabase não avisa, devolve um usuário sem identidades
      if (dados.user && dados.user.identities && dados.user.identities.length === 0) {
        throw new Error(traduzir({ code: 'user_already_exists' }));
      }
      return { precisaConfirmar: !dados.session };
    },

    // No navegador: vai para o Google e volta para o app.
    // No app de computador: o Google bloqueia login em janelas embutidas, então o login abre
    // no navegador padrão e volta para um endereço local do app.py (fluxo PKCE: o navegador
    // devolve só um código, que vale uma vez e só junto com o segredo guardado aqui).
    // `sinal` (AbortSignal) permite cancelar a espera.
    async entrarComGoogle({ sinal } = {}) {
      await googleDisponivel();
      if (!noDesktop) {
        if (!temHttp) throw new Error('O login com Google só funciona com o app aberto por um endereço http(s).');
        await executar(cliente.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: voltarPara(), queryParams: { prompt: 'select_account' } },
        }));
        return;
      }

      const pkce = clientePkce();
      const dados = await executar(pkce.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: VOLTA_GOOGLE_DESKTOP, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
      }));
      const api = await apiDesktop();
      const inicio = await api.login_google_iniciar(dados.url);
      if (!inicio.ok) throw new Error(inicio.erro);

      try {
        for (;;) {
          if (sinal && sinal.aborted) throw new DOMException('Cancelado', 'AbortError');
          const r = await api.login_google_resultado();
          if (r.estado === 'ok') {
            // a sessão vai para o mesmo armazenamento do app: a próxima página já entra logada
            await executar(pkce.auth.exchangeCodeForSession(r.code));
            return;
          }
          if (r.estado === 'erro') throw new Error(r.erro);
          await new Promise(res => setTimeout(res, 1000));
        }
      } catch (e) {
        await api.login_google_cancelar();
        throw e;
      }
    },

    // o link do e-mail abre a página do site, que pede a nova senha ali mesmo
    async recuperarSenha(email) {
      await executar(cliente.auth.resetPasswordForEmail(email.trim(), { redirectTo: SITE_EMAILS }));
    },

    async definirSenha(senha) {
      await executar(cliente.auth.updateUser({ password: senha }));
    },

    // trocar: a tela de entrada pede a outra conta; nos dois casos ela confirma de qual conta saiu
    async sair({ trocar = false } = {}) {
      try {
        sessionStorage.setItem('gscash:saiu', (GS.usuario && GS.usuario.email) || '');
        if (trocar) sessionStorage.setItem('gscash:trocar', '1');
      } catch (e) { /* sem sessionStorage: só não mostra a confirmação */ }
      await executar(cliente.auth.signOut());
      location.replace('entrar.html');
    },
  };

  /* ---------- Proteção das páginas ---------- */

  if (naTelaDeLogin) return;

  // esconde a página até saber se há login, para não piscar o painel de quem não entrou
  const raiz = document.documentElement;
  raiz.style.visibility = 'hidden';

  const logado = GS.auth.sessao().then(sessao => {
    if (!sessao) {
      location.replace('entrar.html');
      return null;
    }
    GS.usuario = sessao.user;
    raiz.style.visibility = '';
    return sessao.user;
  }).catch(() => {
    location.replace('entrar.html');
    return null;
  });

  // saiu em outra aba, ou a sessão expirou
  cliente.auth.onAuthStateChange(evento => {
    if (evento === 'SIGNED_OUT') location.replace('entrar.html');
  });

  /* ---------- Menu da conta (inicial no topo, como no Google) ---------- */

  const paginaCarregada = new Promise(r => (document.readyState === 'complete' ? r() : window.addEventListener('load', r, { once: true })));

  Promise.all([logado, paginaCarregada]).then(([usuario]) => {
    const acoes = document.querySelector('.topbar-acoes');
    if (!usuario || !acoes || !GS.icone) return;
    const email = usuario.email || '';
    const inicial = (email.trim()[0] || '?').toUpperCase();
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'conta-btn';
    botao.textContent = inicial;
    botao.title = `Sua conta (${email})`;
    botao.setAttribute('aria-label', `Sua conta: ${email}`);
    botao.setAttribute('aria-haspopup', 'dialog');
    botao.setAttribute('aria-expanded', 'false');
    acoes.append(botao);

    let fechar = null;

    function abrir() {
      const cartao = document.createElement('div');
      cartao.className = 'conta-pop';
      cartao.setAttribute('role', 'dialog');
      cartao.setAttribute('aria-label', 'Sua conta');
      cartao.innerHTML = `
        <div class="conta-topo">
          <div class="conta-av" aria-hidden="true">${esc(inicial)}</div>
          <small>Conectado como</small>
          <strong>${esc(email)}</strong>
        </div>
        <hr>
        ${GS.abrirTour ? `<button type="button" class="conta-item" data-tour>${GS.icone('play')}Ver o tour do GSCASH (1 min)</button>` : ''}
        <button type="button" class="conta-item" data-acao="trocar">${GS.icone('transfer')}Trocar de conta</button>
        <button type="button" class="conta-item sair" data-acao="sair">${GS.icone('logout')}Sair da conta</button>
        <p class="conta-nota">Seus dados ficam salvos na sua conta. Ao sair, o GSCASH volta para a tela de entrada.</p>`;
      document.body.append(cartao);

      // alinhado à direita da inicial, sem sair da tela
      const r = botao.getBoundingClientRect();
      cartao.style.top = (r.bottom + 8) + 'px';
      cartao.style.left = Math.max(8, Math.min(r.right - cartao.offsetWidth, window.innerWidth - cartao.offsetWidth - 8)) + 'px';

      const fora = e => { if (!cartao.contains(e.target) && !botao.contains(e.target)) fechar(); };
      const tecla = e => { if (e.key === 'Escape') { e.stopPropagation(); fechar(); botao.focus(); } };
      fechar = () => {
        cartao.remove();
        document.removeEventListener('mousedown', fora, true);
        document.removeEventListener('keydown', tecla, true);
        window.removeEventListener('resize', fechar);
        botao.setAttribute('aria-expanded', 'false');
        fechar = null;
      };

      cartao.addEventListener('click', async e => {
        if (e.target.closest('[data-tour]')) {
          fechar();
          GS.abrirTour();
          return;
        }
        const b = e.target.closest('[data-acao]');
        if (!b) return;
        cartao.querySelectorAll('button').forEach(x => { x.disabled = true; });
        try {
          await GS.auth.sair({ trocar: b.dataset.acao === 'trocar' });
        } catch (err) {
          cartao.querySelectorAll('button').forEach(x => { x.disabled = false; });
          if (GS.toast) GS.toast(err.message, 'erro'); else alert(err.message);
        }
      });

      document.addEventListener('mousedown', fora, true);
      document.addEventListener('keydown', tecla, true);
      window.addEventListener('resize', fechar);
      botao.setAttribute('aria-expanded', 'true');
      cartao.querySelector('.conta-item').focus();
    }

    botao.addEventListener('click', () => (fechar ? fechar() : abrir()));
  });
})();
