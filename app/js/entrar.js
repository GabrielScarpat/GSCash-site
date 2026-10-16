/* =========================================================
   GSCASH — tela de login
   Modos: entrar · criar (conta) · recuperar (pede o e-mail)
          · novasenha (depois de clicar no link do e-mail)
   ========================================================= */

(function () {
  const $ = id => document.getElementById(id);
  const el = {
    abas: $('abas'), form: $('formulario'), titulo: $('titulo'), sub: $('subtitulo'),
    campoEmail: $('campoEmail'), campoSenha: $('campoSenha'), email: $('email'), senha: $('senha'),
    rotuloSenha: $('rotuloSenha'), esqueci: $('esqueci'), aviso: $('aviso'), enviar: $('enviar'),
    google: $('google'), blocoGoogle: $('blocoGoogle'), voltar: $('voltar'),
  };

  const TEXTOS = {
    entrar:    { titulo: 'Bem-vindo de volta', sub: 'Entre para ver suas contas em qualquer aparelho.', botao: 'Entrar', senha: 'Sua senha', auto: 'current-password' },
    criar:     { titulo: 'Crie sua conta', sub: 'Leva menos de um minuto.', botao: 'Criar conta', senha: 'Crie uma senha', auto: 'new-password' },
    recuperar: { titulo: 'Recuperar senha', sub: 'Enviaremos um link para você escolher uma nova senha.', botao: 'Enviar link' },
    novasenha: { titulo: 'Escolha a nova senha', sub: 'Use pelo menos 8 caracteres.', botao: 'Salvar nova senha', senha: 'Nova senha', auto: 'new-password' },
  };

  let modo = 'entrar';

  function avisar(texto, ok) {
    el.aviso.textContent = texto || '';
    el.aviso.hidden = !texto;
    el.aviso.classList.toggle('ok', !!ok);
  }

  function trocarModo(novo) {
    modo = novo;
    const t = TEXTOS[novo];
    const abaAtiva = novo === 'criar' ? 'criar' : 'entrar';
    const soAbas = novo === 'entrar' || novo === 'criar';

    el.abas.classList.toggle('hidden', !soAbas);
    el.abas.querySelectorAll('button').forEach(b => {
      const ativa = b.dataset.aba === abaAtiva;
      b.classList.toggle('ativa', ativa);
      b.setAttribute('aria-selected', String(ativa));
    });

    el.titulo.textContent = t.titulo;
    el.sub.textContent = t.sub;
    el.enviar.textContent = t.botao;
    el.campoEmail.classList.toggle('hidden', novo === 'novasenha');
    el.campoSenha.classList.toggle('hidden', novo === 'recuperar');
    el.esqueci.classList.toggle('hidden', novo !== 'entrar');
    el.blocoGoogle.classList.toggle('hidden', !soAbas);
    el.voltar.classList.toggle('hidden', soAbas);
    if (t.senha) {
      el.senha.placeholder = t.senha;
      el.senha.autocomplete = t.auto;
    }
    el.rotuloSenha.textContent = novo === 'novasenha' ? 'Nova senha' : 'Senha';
    // a regra da senha fica sempre à vista quando a pessoa está criando uma
    $('regraSenha').classList.toggle('hidden', novo !== 'criar' && novo !== 'novasenha');
    pintarRegra();
    avisar('');
  }

  // "Pelo menos 8 caracteres": cinza enquanto falta, verde quando a senha atende
  function pintarRegra() {
    $('regraSenha').classList.toggle('ok', el.senha.value.length >= 8);
  }
  el.senha.addEventListener('input', pintarRegra);

  // olho: mostra ou esconde a senha digitada
  $('mostrarSenha').addEventListener('click', () => {
    const mostrar = el.senha.type === 'password';
    el.senha.type = mostrar ? 'text' : 'password';
    const b = $('mostrarSenha');
    b.setAttribute('aria-pressed', String(mostrar));
    b.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
    b.querySelector('.icone-olho').classList.toggle('hidden', mostrar);
    b.querySelector('.icone-olho-fechado').classList.toggle('hidden', !mostrar);
    el.senha.focus();
  });

  function validar() {
    const email = el.email.value.trim();
    if (modo !== 'novasenha' && !/^\S+@\S+\.\S+$/.test(email)) return 'Informe um e-mail válido.';
    if (modo !== 'recuperar' && !el.senha.value) return 'Informe a senha.';
    if ((modo === 'criar' || modo === 'novasenha') && el.senha.value.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
    return null;
  }

  const irParaOApp = () => location.replace('index.html');

  /* ---------- "Confira seu e-mail" ----------
     Depois de criar a conta o formulário sai da frente: antes, ele ficava lá com um aviso pequeno,
     a pessoa tocava de novo em "Criar conta" e o Supabase (que só reenvia depois de 60 s) respondia
     "Muitas tentativas". Aqui fica o que fazer agora, com o reenvio liberado depois da espera. */

  // botão do e-mail da pessoa (Gmail, Outlook, iCloud, Yahoo); outros ficam sem botão
  const CAIXAS = [
    [/@(gmail|googlemail)\.com$/i, 'Abrir o Gmail', 'https://mail.google.com/mail/u/0/#search/gscash'],
    [/@(outlook|hotmail|live|msn)\.[a-z.]+$/i, 'Abrir o Outlook', 'https://outlook.live.com/mail/0/'],
    [/@(icloud|me|mac)\.com$/i, 'Abrir o iCloud Mail', 'https://www.icloud.com/mail'],
    [/@yahoo\.[a-z.]+$/i, 'Abrir o Yahoo Mail', 'https://mail.yahoo.com/'],
  ];
  const ICONE_CARTA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>';
  let emailConfirmar = '';
  let relogio = null;

  function contarReenvio(segundos) {
    clearInterval(relogio);
    const b = $('reenviar');
    let falta = Math.max(0, Math.round(segundos));
    const pintar = () => {
      b.disabled = falta > 0;
      b.textContent = falta > 0 ? `Reenviar e-mail (em ${falta} s)` : 'Reenviar e-mail';
    };
    pintar();
    relogio = setInterval(() => {
      falta--;
      pintar();
      if (falta <= 0) clearInterval(relogio);
    }, 1000);
  }

  function avisarConfirmar(texto, ok) {
    const a = $('confirmarAviso');
    a.textContent = texto || '';
    a.hidden = !texto;
    a.classList.toggle('ok', !!ok);
  }

  // motivo: 'criada' (acabou de criar), 'enviado' (tentou de novo logo depois), 'pendente' (tentou entrar sem confirmar)
  function mostrarConfirmar(email, motivo, segundos) {
    emailConfirmar = email.trim();
    const pedaco = document.createElement('b');
    pedaco.textContent = emailConfirmar;
    const antes = motivo === 'pendente'
      ? 'Sua conta ainda não foi confirmada. O link de confirmação foi enviado para '
      : motivo === 'enviado' ? 'Já enviamos o link de confirmação para ' : 'Enviamos um link de confirmação para ';
    const p = $('confirmarTexto');
    p.textContent = antes;
    p.append(pedaco, '.');
    const caixa = CAIXAS.find(([re]) => re.test(emailConfirmar));
    const abrir = $('abrirEmail');
    abrir.classList.toggle('hidden', !caixa);
    if (caixa) { abrir.innerHTML = `${ICONE_CARTA}${caixa[1]}`; abrir.href = caixa[2]; }
    avisarConfirmar('');
    el.form.classList.add('hidden');
    el.abas.classList.add('hidden');
    $('confirmar').classList.remove('hidden');
    contarReenvio(motivo === 'pendente' ? 0 : (segundos || 60));
  }

  $('reenviar').addEventListener('click', async () => {
    const b = $('reenviar');
    b.disabled = true;
    b.textContent = 'Reenviando…';
    try {
      await GS.auth.reenviarConfirmacao(emailConfirmar);
      avisarConfirmar('Pronto, enviamos de novo. Confira a caixa de entrada.', true);
      contarReenvio(60);
    } catch (err) {
      if (err.segundos) {
        avisarConfirmar('');
        contarReenvio(err.segundos);
      } else {
        avisarConfirmar(err.message);
        contarReenvio(0);
      }
    }
  });

  $('outroEmail').addEventListener('click', () => {
    clearInterval(relogio);
    $('confirmar').classList.add('hidden');
    el.form.classList.remove('hidden');
    trocarModo('criar');
    el.email.value = '';
    el.email.focus();
  });

  // botão ocupado: rodinha e texto do que está acontecendo (e nada de segundo toque)
  function ocupar(texto) {
    el.enviar.disabled = true;
    el.enviar.innerHTML = `<span class="roda" aria-hidden="true"></span>${texto}`;
  }

  async function enviar(e) {
    e.preventDefault();
    const erro = validar();
    if (erro) return avisar(erro);

    avisar('');
    const ESPERA = { entrar: 'Entrando…', criar: 'Criando sua conta…', recuperar: 'Enviando…', novasenha: 'Salvando…' };
    ocupar(ESPERA[modo]);
    try {
      if (modo === 'entrar') {
        await GS.auth.entrar(el.email.value, el.senha.value);
        return irParaOApp();
      }
      if (modo === 'criar') {
        const { precisaConfirmar } = await GS.auth.criarConta(el.email.value, el.senha.value);
        if (!precisaConfirmar) return irParaOApp();
        mostrarConfirmar(el.email.value, 'criada');
        return;
      }
      if (modo === 'recuperar') {
        await GS.auth.recuperarSenha(el.email.value);
        avisar('Se esse e-mail tiver conta, o link de recuperação já está a caminho.', true);
        return;
      }
      await GS.auth.definirSenha(el.senha.value);
      irParaOApp();
    } catch (err) {
      // tocou em "Criar conta" de novo logo depois: a conta já existe e o e-mail já foi
      if (modo === 'criar' && err.codigo === 'over_email_send_rate_limit') return mostrarConfirmar(el.email.value, 'enviado', err.segundos);
      if (modo === 'entrar' && err.codigo === 'email_not_confirmed') return mostrarConfirmar(el.email.value, 'pendente');
      avisar(err.message);
    } finally {
      el.enviar.disabled = false;
      el.enviar.textContent = TEXTOS[modo].botao;
    }
  }

  el.abas.addEventListener('click', e => {
    const b = e.target.closest('button[data-aba]');
    if (b) trocarModo(b.dataset.aba);
  });
  el.esqueci.addEventListener('click', () => trocarModo('recuperar'));
  el.voltar.addEventListener('click', () => trocarModo('entrar'));
  el.form.addEventListener('submit', enviar);
  // login com Google: no app de computador ele continua no navegador padrão;
  // enquanto isso a tela avisa o que fazer e o mesmo botão vira "Cancelar"
  const textoGoogle = el.google.innerHTML;
  let esperaGoogle = null;

  function fimEsperaGoogle() {
    esperaGoogle = null;
    el.google.disabled = false;
    el.google.innerHTML = textoGoogle;
    el.enviar.disabled = false;
  }

  el.google.addEventListener('click', async () => {
    if (esperaGoogle) {
      esperaGoogle.abort();
      return;
    }
    esperaGoogle = new AbortController();
    el.enviar.disabled = true;
    if (GS.auth.noDesktop) {
      el.google.textContent = 'Cancelar login com Google';
      avisar('Abrimos o Google no seu navegador. Escolha sua conta lá e depois volte aqui.', true);
    } else {
      // no navegador a própria página vai para o Google (e volta logada para o app)
      el.google.disabled = true;
      avisar('Abrindo o Google…', true);
    }
    try {
      const r = await GS.auth.entrarComGoogle({ sinal: esperaGoogle.signal });
      if (r && r.saiuDaPagina) return;  // não navegar: atropelaria a ida para o Google
      irParaOApp();
    } catch (err) {
      fimEsperaGoogle();
      avisar(err.name === 'AbortError' ? 'Login com Google cancelado.' : err.message, err.name === 'AbortError');
    }
  });

  // voltou do Google pelo botão Voltar do navegador: a página volta como estava, então destrava o botão
  window.addEventListener('pageshow', e => {
    if (e.persisted && esperaGoogle) { fimEsperaGoogle(); avisar(''); }
  });

  // acabou de sair pelo menu da conta: confirma de qual conta saiu (e, se for troca, pede a outra)
  let saiuDe = null;
  let trocar = false;
  try {
    saiuDe = sessionStorage.getItem('gscash:saiu');
    trocar = sessionStorage.getItem('gscash:trocar') === '1';
    sessionStorage.removeItem('gscash:saiu');
    sessionStorage.removeItem('gscash:trocar');
  } catch (e) { /* sem sessionStorage: segue sem a confirmação */ }
  if (trocar) {
    el.titulo.textContent = 'Entrar com outra conta';
    el.sub.textContent = 'Use o e-mail e a senha da outra conta.';
  }
  if (saiuDe !== null) {
    avisar(saiuDe ? `Você saiu da conta ${saiuDe}.` : 'Você saiu da sua conta.', true);
    (trocar ? el.email : el.enviar).focus();
  }

  // "Prefere instalar no computador? Baixar para Windows" (só no navegador, e só com a 2.0 publicada)
  const linkBaixar = GS.baixar.linkHtml();
  if (linkBaixar) {
    $('baixarLinha').innerHTML = `Prefere instalar no computador? ${linkBaixar}`;
    $('baixarLinha').hidden = false;
  }

  // "Começar grátis" da página inicial do site (→ entrar.html#criar): abre em "Criar conta"
  if (location.hash === '#criar') trocarModo('criar');

  // veio pelo link "recuperar senha" do e-mail: pede a nova senha em vez de entrar direto
  const veioDoLinkDeSenha = /type=recovery/.test(location.hash);
  GS.supabase.auth.onAuthStateChange(evento => {
    if (evento === 'PASSWORD_RECOVERY') trocarModo('novasenha');
  });

  // quem já está logado vai direto para o app
  GS.auth.sessao().then(sessao => {
    if (sessao && !veioDoLinkDeSenha) irParaOApp();
  });
})();
