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

  /* ---------- Várias contas no mesmo aparelho ----------
     O supabase-js guarda uma sessão só (a da conta em uso). Aqui fica uma lista com a sessão
     de cada conta já logada: toda vez que o supabase-js entra ou renova uma sessão, a cópia
     da lista é atualizada (onAuthStateChange, mais abaixo). Trocar de conta é entregar a
     sessão guardada da outra ao supabase-js (setSession): sem senha e sem código.
     Só entra na lista a sessão que já passou pela verificação em duas etapas (aal2), então
     voltar a uma conta guardada nunca pede o código de novo.
     A lista fica onde a sessão já ficava: localStorage, ou o arquivo do app de computador. */

  const CHAVE_CONTAS = 'gscash:contas';
  const armazemContas = noDesktop ? armazenamentoDesktop : {
    getItem: async chave => { try { return localStorage.getItem(chave); } catch (e) { return null; } },
    setItem: async (chave, valor) => { try { localStorage.setItem(chave, valor); } catch (e) { /* sem armazenamento: não guarda */ } },
  };

  // as leituras e gravações da lista entram numa fila: duas ao mesmo tempo não se atropelam
  let filaContas = Promise.resolve();
  function naFila(passo) {
    const p = filaContas.then(passo);
    filaContas = p.catch(() => {});
    return p;
  }
  async function lerContas() {
    try {
      const r = JSON.parse(await armazemContas.getItem(CHAVE_CONTAS));
      if (r && typeof r.contas === 'object') return r;
    } catch (e) { /* ainda não existe */ }
    return { contas: {} };
  }
  const mexerContas = alterar => naFila(async () => {
    const r = await lerContas();
    const saida = await alterar(r);
    await armazemContas.setItem(CHAVE_CONTAS, JSON.stringify(r));
    return saida;
  });

  function lerJwt(token) {
    try {
      const b64 = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))));
    } catch (e) {
      return {};
    }
  }

  // sessão que já pode ser guardada: sem duas etapas ligadas, ou já confirmada com o código
  function sessaoCompleta(sessao) {
    const ligada = ((sessao.user && sessao.user.factors) || []).some(f => f.status === 'verified');
    return !ligada || lerJwt(sessao.access_token).aal === 'aal2';
  }

  function dadosDaConta(usuario) {
    const email = usuario.email || '';
    const meta = usuario.user_metadata || {};
    const nome = String(meta.full_name || meta.name || '').trim();
    return { id: usuario.id, email, nome, inicial: ((nome || email).trim()[0] || '?').toUpperCase() };
  }

  const erroSemSenha = conta => Object.assign(new Error(`Digite a senha de ${conta.email} para continuar.`), { codigo: 'precisa_senha', email: conta.email });

  // sessão de uma conta guardada que a pessoa mandou sair: encerra no servidor, sem mexer na conta em uso
  async function revogarSessao(sessao) {
    const descartavel = window.supabase.createClient(SUPABASE_URL, SUPABASE_CHAVE, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'gscash-descartavel' },
    });
    const { error } = await descartavel.auth.setSession({ access_token: sessao.access_token, refresh_token: sessao.refresh_token });
    if (!error) await descartavel.auth.signOut({ scope: 'local' });
  }
  const revogarSemEsperar = sessao => (sessao
    ? Promise.race([revogarSessao(sessao).catch(() => {}), new Promise(r => setTimeout(r, 4000))])
    : Promise.resolve());

  const contas = GS.contas = {
    // true enquanto troca ou sai: os avisos do supabase-js não redirecionam a página no meio do caminho
    ocupado: false,

    // contas deste aparelho, da usada há menos tempo para a mais antiga
    async listar() {
      const r = await naFila(lerContas);
      return Object.values(r.contas).sort((a, b) => (b.uso || 0) - (a.uso || 0))
        .map(c => ({ id: c.id, email: c.email, nome: c.nome, inicial: c.inicial, semSessao: !c.sessao }));
    },

    // guarda (ou renova) a sessão de uma conta; usar: ela passa a ser a mais recente
    registrar(sessao, { usar = false } = {}) {
      if (!sessao || !sessao.user || !sessaoCompleta(sessao)) return Promise.resolve();
      const d = dadosDaConta(sessao.user);
      return mexerContas(r => {
        const antes = r.contas[d.id];
        r.contas[d.id] = {
          ...d,
          uso: usar || !antes ? Date.now() : antes.uso,
          sessao: { access_token: sessao.access_token, refresh_token: sessao.refresh_token, expires_at: sessao.expires_at },
        };
      });
    },

    async registrarAtual() {
      await contas.registrar(await GS.auth.sessao());
    },

    esquecer(id) {
      return mexerContas(r => { delete r.contas[id]; });
    },

    // passa a usar outra conta guardada. Sem senha. Se a sessão dela não vale mais,
    // o erro tem codigo 'precisa_senha' (e o e-mail) e a conta de antes continua em uso.
    async trocar(id) {
      const antes = await GS.auth.sessao();
      if (antes && antes.user.id === id) return;
      const conta = (await naFila(lerContas)).contas[id];
      if (!conta) throw new Error('Essa conta não está mais neste aparelho.');
      if (!conta.sessao) throw erroSemSenha(conta);

      contas.ocupado = true;
      try {
        await contas.registrar(antes);   // guarda a sessão mais nova da conta que fica para trás
        let resp;
        try {
          resp = await cliente.auth.setSession({ access_token: conta.sessao.access_token, refresh_token: conta.sessao.refresh_token });
        } catch (e) {
          resp = { error: e };
        }
        const e = resp.error;
        if (e || !resp.data || !resp.data.session) {
          // sem internet a sessão guardada continua boa; qualquer outro erro é sessão vencida ou encerrada
          const semRede = e && (e.name === 'AuthRetryableFetchError' || e.status === 0 || e.status >= 500 || /failed to fetch|network/i.test(e.message || ''));
          if (!semRede) await mexerContas(r => { if (r.contas[id]) r.contas[id].sessao = null; });
          // o supabase-js derruba a sessão em uso ao receber a recusa: devolve a de antes
          if (antes && !(await GS.auth.sessao())) {
            await cliente.auth.setSession({ access_token: antes.access_token, refresh_token: antes.refresh_token }).catch(() => {});
          }
          throw semRede ? erroDe(e) : erroSemSenha(conta);
        }
        await contas.registrar(resp.data.session, { usar: true });
        // nada da conta anterior fica para a próxima: a cópia dos dados da aba e o aviso de boas-vindas
        try {
          sessionStorage.removeItem('gscash:copia');
          sessionStorage.setItem('gscash:trocou', conta.nome || conta.email);
        } catch (err) { /* sem sessionStorage: só não mostra o aviso */ }
      } finally {
        contas.ocupado = false;
      }
    },

    // sai de uma conta deste aparelho; as outras continuam entradas.
    // Se for a conta em uso, a página vai para a tela de entrar (com as outras para escolher).
    async sair(id) {
      const atual = await GS.auth.sessao();
      if (atual && atual.user.id === id) {
        const email = atual.user.email || '';
        contas.ocupado = true;
        try {
          // só esta sessão é encerrada; outros aparelhos e as outras contas seguem como estão
          await executar(cliente.auth.signOut({ scope: 'local' }));
        } catch (e) {
          contas.ocupado = false;
          throw e;
        }
        await contas.esquecer(id);
        try {
          sessionStorage.removeItem('gscash:copia');
          sessionStorage.setItem('gscash:saiu', email);
        } catch (e) { /* sem sessionStorage: só não mostra a confirmação */ }
        location.replace('entrar.html');
        return new Promise(() => {});
      }
      const conta = (await naFila(lerContas)).contas[id];
      await contas.esquecer(id);
      await revogarSemEsperar(conta && conta.sessao);
    },

    async sairDeTodas() {
      const todas = Object.values((await naFila(lerContas)).contas);
      const atual = await GS.auth.sessao();
      contas.ocupado = true;
      try {
        if (atual) await executar(cliente.auth.signOut({ scope: 'local' }));
      } catch (e) {
        contas.ocupado = false;
        throw e;
      }
      await Promise.all(todas.filter(c => !atual || c.id !== atual.user.id).map(c => revogarSemEsperar(c.sessao)));
      await mexerContas(r => { r.contas = {}; });
      try {
        sessionStorage.removeItem('gscash:copia');
        sessionStorage.setItem('gscash:saiu-todas', '1');
      } catch (e) { /* segue */ }
      location.replace('entrar.html');
      return new Promise(() => {});
    },
  };

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
        // só agora a sessão vale como aal2 e pode ficar guardada entre as contas do aparelho
        await contas.registrarAtual();
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
        await contas.registrarAtual();
      },
    },
  };

  /* ---------- Contas: avisos do supabase-js e janela "Gerenciar contas" ---------- */

  // estilo das contas (menu, janela "Gerenciar contas" e atalhos da tela de entrar)
  const estilo = document.createElement('link');
  estilo.rel = 'stylesheet';
  estilo.href = 'css/contas.css';
  document.head.append(estilo);

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONES = {
    x: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    mais: svg('<path d="M5 12h14"/><path d="M12 5v14"/>'),
    sair: svg('<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>'),
    pessoas: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    seta: svg('<path d="m9 18 6-6-6-6"/>'),
  };
  GS.contasIcones = ICONES;
  GS.dadosDaConta = dadosDaConta;
  // nome para mostrar: o do perfil ou, sem ele, o começo do e-mail
  const nomeDe = GS.nomeDaConta = c => c.nome || (c.email.split('@')[0] || c.email).replace(/^./, l => l.toUpperCase());

  // um aviso de outra aba, ou da sessão que acabou
  cliente.auth.onAuthStateChange((evento, sessao) => {
    // toda sessão entrada ou renovada fica guardada na lista de contas (sem esperar nada do supabase-js aqui)
    if (sessao && evento !== 'SIGNED_OUT') contas.registrar(sessao, { usar: evento === 'SIGNED_IN' }).catch(() => {});
    if (naTelaDeLogin || contas.ocupado) return;
    if (evento === 'SIGNED_OUT') {
      location.replace('entrar.html');
    } else if (sessao && GS.usuario && sessao.user.id !== GS.usuario.id) {
      // outra aba trocou de conta: esta acompanha, recarregando tudo da conta nova
      location.replace('index.html');
    }
  });

  // Janela "Gerenciar contas": sair de uma conta ou de todas, adicionar outra.
  // aoMudar: avisa quando a lista mudou; aoAdicionar: no lugar de ir para a tela de entrar
  contas.abrirGerenciar = async function ({ aoMudar, aoAdicionar } = {}) {
    if (document.querySelector('.gerir-fundo')) return;
    const fundo = document.createElement('div');
    fundo.className = 'gerir-fundo';
    const janela = document.createElement('div');
    janela.className = 'gerir';
    janela.setAttribute('role', 'dialog');
    janela.setAttribute('aria-modal', 'true');
    janela.setAttribute('aria-label', 'Gerenciar contas');
    fundo.append(janela);
    document.body.append(fundo);

    const voltarFoco = document.activeElement;
    const tecla = e => { if (e.key === 'Escape') { e.stopPropagation(); fechar(); } };
    function fechar() {
      fundo.remove();
      document.removeEventListener('keydown', tecla, true);
      if (voltarFoco && voltarFoco.focus && document.contains(voltarFoco)) voltarFoco.focus();
    }
    document.addEventListener('keydown', tecla, true);
    fundo.addEventListener('mousedown', e => { if (e.target === fundo) fechar(); });

    let confirmando = false;
    let relogio = null;

    async function desenhar(erro) {
      const atual = await GS.auth.sessao();
      const atualId = atual && atual.user.id;
      const lista = await contas.listar();
      janela.innerHTML = `
        <div class="gerir-topo"><h2>Gerenciar contas</h2><button type="button" class="gerir-fechar" data-fechar aria-label="Fechar">${ICONES.x}</button></div>
        <p class="gerir-sub">Contas guardadas neste aparelho.</p>
        ${lista.length ? `<div class="gerir-lista">${lista.map(c => `
          <div class="gerir-linha">
            <span class="conta-mini${c.id === atualId ? ' atual' : ''}" aria-hidden="true">${esc(c.inicial)}</span>
            <span class="conta-nomes"><span class="l1"><b>${esc(nomeDe(c))}</b>${c.id === atualId ? '<span class="gerir-selo">Atual</span>' : ''}</span><small>${esc(c.email)}</small></span>
            <button type="button" class="gerir-sair" data-sair="${esc(c.id)}" aria-label="Sair da conta ${esc(c.email)}">Sair</button>
          </div>`).join('')}</div>` : '<p class="gerir-vazio">Nenhuma conta guardada.</p>'}
        <p class="gerir-erro" role="alert"${erro ? '' : ' hidden'}>${esc(erro || '')}</p>
        <button type="button" class="gerir-mais" data-adicionar>${ICONES.mais}Adicionar outra conta</button>
        ${lista.length ? `<button type="button" class="gerir-todas" data-todas>${ICONES.sair}<span>Sair de todas as contas</span></button>` : ''}`;
      const primeiro = janela.querySelector('.gerir-sair, .gerir-mais');
      if (primeiro) primeiro.focus();
    }

    janela.addEventListener('click', async e => {
      if (e.target.closest('[data-fechar]')) return fechar();
      if (e.target.closest('[data-adicionar]')) {
        fechar();
        if (aoAdicionar) aoAdicionar(); else location.href = 'entrar.html?adicionar=1';
        return;
      }
      const todas = e.target.closest('[data-todas]');
      if (todas) {
        if (!confirmando) {
          confirmando = true;
          todas.querySelector('span').textContent = 'Toque de novo para sair de todas';
          clearTimeout(relogio);
          relogio = setTimeout(() => { confirmando = false; const t = janela.querySelector('[data-todas] span'); if (t) t.textContent = 'Sair de todas as contas'; }, 4000);
          return;
        }
        janela.querySelectorAll('button').forEach(b => { b.disabled = true; });
        try {
          await contas.sairDeTodas();
        } catch (err) {
          confirmando = false;
          desenhar(err.message);
        }
        return;
      }
      const sair = e.target.closest('[data-sair]');
      if (sair) {
        janela.querySelectorAll('button').forEach(b => { b.disabled = true; });
        try {
          await contas.sair(sair.dataset.sair);   // se for a conta em uso, a página sai daqui
          if (aoMudar) await aoMudar();
          await desenhar();
        } catch (err) {
          desenhar(err.message);
        }
      }
    });

    await desenhar();
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
    // contas que já estavam entradas antes das várias contas passam a constar na lista
    contas.registrar(sessao).catch(() => {});
    return sessao.user;
  }).catch(() => {
    location.replace('entrar.html');
    return null;
  });
  GS.usuarioPronto = logado;

  // Preferências do aparelho que pertencem a uma conta (convite já visto, lembrete ligado):
  // ficam separadas por conta, para uma não decidir pela outra. O que já estava guardado sem
  // conta (antes das várias contas) passa para a primeira conta que o ler.
  GS.daConta = {
    chave: base => `${base}:${GS.usuario.id}`,
    ler(base) {
      if (!GS.usuario) return null;
      try {
        const chave = GS.daConta.chave(base);
        let v = localStorage.getItem(chave);
        if (v === null) {
          const antigo = localStorage.getItem(base);
          if (antigo !== null) {
            localStorage.setItem(chave, antigo);
            localStorage.removeItem(base);
            v = antigo;
          }
        }
        return v;
      } catch (e) {
        return null;
      }
    },
    gravar(base, valor) {
      if (!GS.usuario) return;
      try { localStorage.setItem(GS.daConta.chave(base), valor); } catch (e) { /* sem localStorage: segue */ }
    },
  };

  /* ---------- Menu da conta (inicial no topo, como no Google) ---------- */

  // conta do dono do app: vê o item "Painel do GSCASH" (o servidor confere de novo antes de mostrar os números)
  const DONO = 'gabrielscarpat123@gmail.com';

  const paginaCarregada = new Promise(r => (document.readyState === 'complete' ? r() : window.addEventListener('load', r, { once: true })));

  Promise.all([logado, paginaCarregada]).then(([usuario]) => {
    const acoes = document.querySelector('.topbar-acoes');
    if (!usuario || !acoes || !GS.icone) return;

    // acabou de trocar de conta (ou voltou da tela de entrar com outra): confirma em qual está
    try {
      const para = sessionStorage.getItem('gscash:trocou');
      if (para) {
        sessionStorage.removeItem('gscash:trocou');
        if (GS.toast) GS.toast(`Agora você está em ${para}.`);
      }
    } catch (e) { /* sem sessionStorage: segue sem o aviso */ }

    const email = usuario.email || '';
    const { nome: nomeCompleto, inicial } = dadosDaConta(usuario);

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
    let abrindo = false;

    async function abrir() {
      if (abrindo) return;
      abrindo = true;
      // a conta em uso entra na lista antes de montar o menu (as outras vêm da lista guardada)
      await contas.registrarAtual().catch(() => {});
      const outras = (await contas.listar().catch(() => [])).filter(c => c.id !== usuario.id);
      abrindo = false;

      const cartao = document.createElement('div');
      cartao.className = 'conta-pop';
      cartao.setAttribute('role', 'dialog');
      cartao.setAttribute('aria-label', 'Sua conta');
      cartao.innerHTML = `
        <div class="conta-topo enxuto">
          <div class="conta-av" aria-hidden="true">${esc(inicial)}</div>
          <div><strong>${esc(nomeCompleto || email)}</strong>${nomeCompleto ? `<span>${esc(email)}</span>` : ''}</div>
        </div>
        <hr>
        ${outras.length ? `<div class="conta-sec">Outras contas neste aparelho</div>${outras.map(c => `
          <button type="button" class="conta-outra" data-trocar="${esc(c.id)}">
            <span class="conta-mini" aria-hidden="true">${esc(c.inicial)}</span>
            <span class="conta-nomes"><span class="l1"><b>${esc(nomeDe(c))}</b></span><small>${esc(c.email)}</small></span>
          </button>`).join('')}` : ''}
        <button type="button" class="conta-item" data-adicionar>${GS.icone('plus')}Adicionar outra conta</button>
        <button type="button" class="conta-item" data-gerir>${ICONES.pessoas}Gerenciar contas</button>
        <hr class="entre">
        ${email === DONO ? `<a class="conta-item" href="admin.html">${GS.icone('painel')}Painel do GSCASH</a>` : ''}
        ${GS.abrirTour ? `<button type="button" class="conta-item" data-tour>${GS.icone('play')}Ver o tour do GSCASH (1 min)</button>` : ''}
        ${GS.baixar && GS.baixar.disponivel() ? `<a class="conta-item instalar" href="${GS.baixar.url}" data-baixar>${GS.icone('download')}Baixar para Windows</a>` : ''}
        ${GS.instalar && GS.instalar.disponivel() ? `<button type="button" class="conta-item instalar" data-instalar>${GS.icone('download')}Instalar o app no celular</button>` : ''}
        ${GS.importar ? `<button type="button" class="conta-item" data-importar>${GS.icone('subir')}Importar extrato ou planilha</button>` : ''}
        <a class="conta-item" href="configuracoes.html">${GS.icone('engrenagem')}Configurações</a>
        <p class="conta-nota">Seus dados ficam salvos na sua conta. Para sair, use Gerenciar contas.</p>
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
        // o download em si é o link; o menu fecha logo depois, sem cortar o clique
        if (e.target.closest('[data-baixar]')) {
          setTimeout(() => fechar && fechar(), 0);
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
        if (e.target.closest('[data-adicionar]')) {
          location.href = 'entrar.html?adicionar=1';
          return;
        }
        if (e.target.closest('[data-gerir]')) {
          fechar();
          contas.abrirGerenciar();
          return;
        }
        const alvo = e.target.closest('[data-trocar]');
        if (!alvo) return;
        cartao.querySelectorAll('button').forEach(x => { x.disabled = true; });
        try {
          await contas.trocar(alvo.dataset.trocar);
          location.replace('index.html');   // recarrega tudo (painel, licença, moeda, dados) já na conta nova
        } catch (err) {
          if (err.codigo === 'precisa_senha') {
            // a sessão guardada dessa conta não vale mais: só ela pede a senha
            location.href = 'entrar.html?reentrar=' + encodeURIComponent(err.email);
            return;
          }
          cartao.querySelectorAll('button').forEach(x => { x.disabled = false; });
          if (GS.toast) GS.toast(err.message, 'erro'); else alert(err.message);
        }
      });

      document.addEventListener('mousedown', fora, true);
      document.addEventListener('keydown', tecla, true);
      window.addEventListener('resize', fechar);
      botao.setAttribute('aria-expanded', 'true');
      (cartao.querySelector('.conta-outra') || cartao.querySelector('.conta-item')).focus();
    }

    botao.addEventListener('click', () => (fechar ? fechar() : abrir()));
  });
})();
