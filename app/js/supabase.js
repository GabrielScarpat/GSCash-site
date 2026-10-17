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
      // app/?comprar (botão do site): lembra até a pessoa entrar, e licenca.js abre a compra
      if (new URLSearchParams(location.search).has('comprar')) sessionStorage.setItem('gscash:comprar', '1');
      return sessionStorage.getItem('gscash:desktop') === '1';
    } catch (e) {
      return false;
    }
  })();

  // dentro do app do iPhone (Capacitor): sem convite de instalar, sem Windows, sem Pix
  GS.nativo = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

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
    if (codigo === 'mfa_verification_failed' || codigo === 'mfa_challenge_expired') return 'Código incorreto ou vencido. Confira o app e tente de novo.';
    if (codigo === 'insufficient_aal') return 'Confirme com o código do app autenticador antes.';
    if (/failed to fetch|network/i.test(msg)) return 'Sem conexão com a internet.';
    return msg || 'Algo deu errado. Tente de novo.';
  }

  // o erro sai traduzido, mas guarda o código do Supabase e, se houver, quantos segundos esperar
  function erroDe(e) {
    const erro = new Error(traduzir(e));
    erro.codigo = e && e.code;
    const espera = String((e && e.message) || '').match(/after (\d+) seconds?/i);
    if (espera) erro.segundos = Number(espera[1]);
    return erro;
  }

  async function executar(promessa) {
    let resp;
    try {
      resp = await promessa;
    } catch (e) {
      throw erroDe(e);
    }
    if (resp.error) throw erroDe(resp.error);
    return resp.data;
  }

  // para onde o Supabase deve voltar depois do Google / link de e-mail (só existe com http)
  const voltarPara = () => location.origin + location.pathname.replace(/[^/]*$/, '') + 'index.html';

  // app de computador: endereço local do app.py que recebe a volta do Google (igual ao PORTA_GOOGLE)
  const VOLTA_GOOGLE_DESKTOP = 'http://127.0.0.1:53682/google';

  // app do iPhone: o Safari do sistema devolve o login para este endereço, que abre o app
  // (o mesmo esquema está no Info.plist e na lista de endereços permitidos do Supabase)
  const VOLTA_APP = 'br.com.gscash.app://login';

  // cliente só para o login externo no app de computador e no app do iPhone (fluxo PKCE).
  // Usa o mesmo armazenamento do cliente principal, então a sessão criada aqui vale para o app todo.
  let pkceCriado = null;
  const clientePkce = () => pkceCriado || (pkceCriado = window.supabase.createClient(SUPABASE_URL, SUPABASE_CHAVE, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, ...(noDesktop ? { storage: armazenamentoDesktop } : {}) },
  }));

  // app do iPhone: abre o login no Safari do sistema (o Google não aceita login dentro do app)
  // e espera o iOS devolver br.com.gscash.app://login?code=... ; fechar o Safari cancela
  async function entrarNoApp(provedor, extras, sinal) {
    const pkce = clientePkce();
    const dados = await executar(pkce.auth.signInWithOAuth({
      provider: provedor,
      options: { redirectTo: VOLTA_APP, skipBrowserRedirect: true, ...extras },
    }));
    const App = window.Capacitor.registerPlugin('App');
    const Browser = window.Capacitor.registerPlugin('Browser');
    const ouvintes = [];
    const codigo = await new Promise((ok, falha) => {
      const cancelar = () => falha(new DOMException('Cancelado', 'AbortError'));
      ouvintes.push(App.addListener('appUrlOpen', ({ url }) => {
        if (!String(url).startsWith(VOLTA_APP)) return;
        const q = new URLSearchParams(String(url).split('?')[1]?.split('#')[0] || '');
        if (q.get('code')) ok(q.get('code'));
        else falha(new Error(q.get('error_description') || `Não foi possível entrar com ${NOMES[provedor]}.`));
      }));
      ouvintes.push(Browser.addListener('browserFinished', cancelar));
      if (sinal) sinal.addEventListener('abort', cancelar, { once: true });
      Browser.open({ url: dados.url, presentationStyle: 'popover' }).catch(falha);
    }).finally(async () => {
      for (const o of ouvintes) (await o).remove();
      Browser.close().catch(() => {});  // o Safari não fecha sozinho quando devolve o código
    });
    // a sessão vai para o mesmo armazenamento do app: a próxima página já entra logada
    await executar(pkce.auth.exchangeCodeForSession(codigo));
  }

  // quais logins externos estão ligados no Supabase (Google, Apple); lido uma vez por página
  const NOMES = { google: 'Google', apple: 'Apple' };
  let provedores = null;
  function provedoresLigados() {
    if (!provedores) {
      provedores = fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_CHAVE } })
        .then(r => (r.ok ? r.json() : {}))
        .then(j => j.external || {})
        .catch(e => { provedores = null; throw new Error(traduzir(e)); });
    }
    return provedores;
  }

  // o provedor precisa estar ligado no Supabase; senão o navegador cairia numa página de erro técnica
  async function provedorDisponivel(provedor) {
    const ligados = await provedoresLigados();
    if (!ligados[provedor]) throw new Error(`O login com ${NOMES[provedor]} ainda não está disponível. Use e-mail e senha.`);
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

    // manda de novo o link de confirmação de uma conta criada com e-mail e senha
    async reenviarConfirmacao(email) {
      await executar(cliente.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: SITE_EMAILS } }));
    },

    provedoresLigados,

    // No navegador: vai para o Google (ou a Apple) e volta para o app.
    // No app de computador: o Google bloqueia login em janelas embutidas, então o login abre
    // no navegador padrão e volta para um endereço local do app.py (fluxo PKCE: o navegador
    // devolve só um código, que vale uma vez e só junto com o segredo guardado aqui).
    // `sinal` (AbortSignal) permite cancelar a espera.
    noDesktop,

    entrarComGoogle(opcoes) { return GS.auth.entrarCom('google', opcoes); },

    // provedor: 'google' ou 'apple' (a volta no app de computador usa o mesmo endereço local)
    async entrarCom(provedor, { sinal } = {}) {
      await provedorDisponivel(provedor);
      // o Google deixa escolher a conta toda vez; a Apple não tem essa opção
      const extras = provedor === 'google' ? { queryParams: { prompt: 'select_account' } } : {};
      if (GS.nativo) return entrarNoApp(provedor, extras, sinal);
      if (!noDesktop) {
        if (!temHttp) throw new Error(`O login com ${NOMES[provedor]} só funciona com o app aberto por um endereço http(s).`);
        await executar(cliente.auth.signInWithOAuth({ provider: provedor, options: { redirectTo: voltarPara(), ...extras } }));
        // o navegador já está indo para o provedor: quem chamou não deve navegar para outro lugar
        return { saiuDaPagina: true };
      }

      const pkce = clientePkce();
      const dados = await executar(pkce.auth.signInWithOAuth({
        provider: provedor,
        options: { redirectTo: VOLTA_GOOGLE_DESKTOP, skipBrowserRedirect: true, ...extras },
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

    /* Verificação em duas etapas (MFA do Supabase, com app autenticador / TOTP).
       Depois da senha (ou do Google/Apple) a sessão é "aal1"; quem ligou a verificação só
       vira "aal2" depois do código do celular, e o banco só entrega os dados com aal2. */
    duasEtapas: {
      // true quando a pessoa ligou a verificação e esta sessão ainda não passou pelo código.
      // servidor: confere a lista de verificações no Supabase (ligada há pouco em outro aparelho)
      async precisaCodigo({ servidor = false } = {}) {
        if (servidor) await cliente.auth.refreshSession().catch(() => {});
        const { data } = await cliente.auth.mfa.getAuthenticatorAssuranceLevel();
        return !!data && data.currentLevel === 'aal1' && data.nextLevel === 'aal2';
      },

      // a verificação ligada (ou null), pela sessão guardada neste aparelho
      async fator() {
        const dados = await executar(cliente.auth.mfa.listFactors());
        return dados.totp[0] || null;
      },

      // confere o código de 6 dígitos; a sessão passa a valer como aal2
      async confirmar(codigo, fatorId) {
        const id = fatorId || ((await GS.auth.duasEtapas.fator()) || {}).id;
        if (!id) throw new Error('A verificação em duas etapas não está ligada nesta conta.');
        await executar(cliente.auth.mfa.challengeAndVerify({ factorId: id, code: String(codigo).trim() }));
      },

      // passo 1 de ligar: cria a verificação (ainda sem valer) e devolve o QR code e a chave
      async comecar() {
        // uma tentativa anterior que não foi até o fim fica pendente e impediria criar outra
        const lista = await executar(cliente.auth.mfa.listFactors());
        for (const f of lista.all.filter(f => f.status !== 'verified')) {
          await executar(cliente.auth.mfa.unenroll({ factorId: f.id }));
        }
        const d = await executar(cliente.auth.mfa.enroll({ factorType: 'totp', issuer: 'GSCASH', friendlyName: 'GSCASH' }));
        return { id: d.id, qr: d.totp.qr_code, chave: d.totp.secret, endereco: d.totp.uri };
      },

      // passo 2 de ligar: o código confirma que o app ficou certo; devolve os 8 códigos de recuperação
      async terminar(fatorId, codigo) {
        await GS.auth.duasEtapas.confirmar(codigo, fatorId);
        return executar(cliente.rpc('gerar_codigos_recuperacao'));
      },

      // gerar novos códigos de recuperação (os antigos deixam de valer); pede o código do celular antes
      async novosCodigos(codigo) {
        await GS.auth.duasEtapas.confirmar(codigo);
        return executar(cliente.rpc('gerar_codigos_recuperacao'));
      },

      async infoCodigos() {
        return executar(cliente.rpc('codigos_recuperacao_info'));
      },

      // desligar: pede o código do celular antes, para ninguém desligar com o aparelho da pessoa desbloqueado
      async desligar(codigo) {
        const f = await GS.auth.duasEtapas.fator();
        if (!f) return;
        await GS.auth.duasEtapas.confirmar(codigo, f.id);
        await executar(cliente.auth.mfa.unenroll({ factorId: f.id }));
        await cliente.auth.refreshSession().catch(() => {});
      },

      // perdeu o celular: um código de recuperação desliga a verificação e a pessoa entra só com a senha
      async usarCodigoRecuperacao(codigo) {
        const r = await executar(cliente.rpc('usar_codigo_recuperacao', { p_codigo: String(codigo) }));
        if (!r || !r.ok) throw new Error((r && r.erro) || 'Não foi possível usar o código.');
        // a sessão guardada ainda lembra da verificação: renova para ela saber que foi desligada
        await executar(cliente.auth.refreshSession());
      },
    },

    // trocar: a tela de entrada pede a outra conta; nos dois casos ela confirma de qual conta saiu
    async sair({ trocar = false } = {}) {
      try {
        sessionStorage.removeItem('gscash:copia');   // a cópia dos dados desta aba (data.js)
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

  const logado = GS.auth.sessao().then(async sessao => {
    // sem login, ou com a verificação em duas etapas ligada e o código ainda não digitado
    if (!sessao || await GS.auth.duasEtapas.precisaCodigo()) {
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

  // conta do dono do app: vê o item "Painel do GSCASH" (o servidor confere de novo antes de mostrar os números)
  const DONO = 'gabrielscarpat123@gmail.com';

  const paginaCarregada = new Promise(r => (document.readyState === 'complete' ? r() : window.addEventListener('load', r, { once: true })));

  Promise.all([logado, paginaCarregada]).then(([usuario]) => {
    const acoes = document.querySelector('.topbar-acoes');
    if (!usuario || !acoes || !GS.icone) return;
    const email = usuario.email || '';
    const meta = usuario.user_metadata || {};
    const nomeCompleto = String(meta.full_name || meta.name || '').trim();
    const inicial = ((nomeCompleto || email).trim()[0] || '?').toUpperCase();
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

    // celular: "Olá, Gabriel" ao lado da inicial (nome do Google ou o começo do e-mail)
    const nome = (nomeCompleto || email.split('@')[0] || '').split(/\s+/)[0];
    const ola = document.createElement('span');
    ola.className = 'ola';
    ola.innerHTML = `<small>Olá,</small><b>${esc(nome ? nome[0].toUpperCase() + nome.slice(1) : 'tudo bem?')}</b>`;
    acoes.append(ola);

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
        ${email === DONO ? `<a class="conta-item" href="admin.html">${GS.icone('painel')}Painel do GSCASH</a>` : ''}
        ${GS.abrirTour ? `<button type="button" class="conta-item" data-tour>${GS.icone('play')}Ver o tour do GSCASH (1 min)</button>` : ''}
        ${GS.instalar && GS.instalar.disponivel() ? `<button type="button" class="conta-item instalar" data-instalar>${GS.icone('download')}Instalar o app no celular</button>` : ''}
        ${GS.importar ? `<button type="button" class="conta-item" data-importar>${GS.icone('subir')}Importar extrato ou planilha</button>` : ''}
        ${GS.lembrete && GS.lembrete.visivel() ? `<button type="button" class="conta-item lembrete" data-lembrete>${GS.icone('sino')}Lembrete diário</button>` : ''}
        <a class="conta-item" href="configuracoes.html">${GS.icone('engrenagem')}Configurações</a>
        <button type="button" class="conta-item" data-acao="trocar">${GS.icone('transfer')}Trocar de conta</button>
        <button type="button" class="conta-item sair" data-acao="sair">${GS.icone('logout')}Sair da conta</button>
        <p class="conta-nota">Seus dados ficam salvos na sua conta. Ao sair, o GSCASH volta para a tela de entrada.</p>
        ${GS.excluirConta ? '<button type="button" class="conta-excluir" data-excluir-conta>Excluir minha conta</button>' : ''}`;
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
        if (e.target.closest('[data-instalar]')) {
          fechar();
          GS.instalar.abrir();
          return;
        }
        if (e.target.closest('[data-excluir-conta]')) {
          fechar();
          GS.excluirConta.abrir();
          return;
        }
        if (e.target.closest('[data-importar]')) {
          fechar();
          GS.importar.abrir();
          return;
        }
        if (e.target.closest('[data-lembrete]')) {
          fechar();
          GS.lembrete.abrir();
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
