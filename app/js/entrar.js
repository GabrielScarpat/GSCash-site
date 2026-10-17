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
    voltarEscolha: $('voltarEscolha'), cancelarAdicionar: $('cancelarAdicionar'),
  };

  const TEXTOS = {
    entrar:    { titulo: 'Bem-vindo de volta', sub: 'Entre para ver suas contas em qualquer aparelho.', botao: 'Entrar', senha: 'Sua senha', auto: 'current-password' },
    criar:     { titulo: 'Crie sua conta', sub: 'Leva menos de um minuto.', botao: 'Criar conta', senha: 'Crie uma senha', auto: 'new-password' },
    recuperar: { titulo: 'Recuperar senha', sub: 'Enviaremos um link para você escolher uma nova senha.', botao: 'Enviar link' },
    novasenha: { titulo: 'Escolha a nova senha', sub: 'Use pelo menos 8 caracteres.', botao: 'Salvar nova senha', senha: 'Nova senha', auto: 'new-password' },
  };

  let modo = 'entrar';

  /* ---------- Várias contas ----------
     entrar.html?adicionar=1  : chegou pelo menu da conta ("Adicionar outra conta"); a conta em uso continua guardada
     entrar.html?reentrar=EMAIL : a sessão guardada dessa conta não vale mais; pede a senha só dela
     Sem nada na barra e com contas guardadas: atalhos "Continuar como…". */
  const params = new URLSearchParams(location.search);
  const emOutraConta = params.has('adicionar') || !!params.get('reentrar');
  let semAbas = emOutraConta;   // sem "Criar conta": a pessoa já tem a conta
  let contexto = null;          // { titulo, sub }: textos do modo "entrar" quando ele não é o de sempre
  let temContas = false;
  let temSessao = false;

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

    el.abas.classList.toggle('hidden', !soAbas || semAbas);
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
    if (novo === 'entrar' && contexto) {
      el.titulo.textContent = contexto.titulo;
      el.sub.textContent = contexto.sub;
    }
    atualizarVoltas();
    el.rotuloSenha.textContent = novo === 'novasenha' ? 'Nova senha' : 'Senha';
    // a regra da senha fica sempre à vista quando a pessoa está criando uma
    $('regraSenha').classList.toggle('hidden', novo !== 'criar' && novo !== 'novasenha');
    pintarRegra();
    avisar('');
  }

  // links de saída do formulário: voltar ao app (quem está entrado e veio adicionar) ou às contas guardadas
  function atualizarVoltas() {
    const noForm = modo === 'entrar' || modo === 'criar';
    const veioDoApp = emOutraConta && temSessao;
    el.cancelarAdicionar.classList.toggle('hidden', !(noForm && veioDoApp));
    el.voltarEscolha.classList.toggle('hidden', !(noForm && temContas && !veioDoApp));
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

  /* ---------- Atalhos "Continuar como…" ---------- */

  function avisarEscolha(texto, ok) {
    const a = $('escolhaAviso');
    a.textContent = texto || '';
    a.hidden = !texto;
    a.classList.toggle('ok', !!ok);
  }

  function desenharEscolha(lista) {
    $('escolhaLista').replaceChildren(...lista.map(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'escolha-conta';
      b.dataset.id = c.id;
      const mini = document.createElement('span');
      mini.className = 'conta-mini';
      mini.setAttribute('aria-hidden', 'true');
      mini.textContent = c.inicial;
      const nomes = document.createElement('span');
      nomes.className = 'conta-nomes';
      const l1 = document.createElement('span');
      l1.className = 'l1';
      const nome = document.createElement('b');
      nome.textContent = GS.nomeDaConta(c);
      l1.append(nome);
      const mail = document.createElement('small');
      mail.textContent = c.email;
      nomes.append(l1, mail);
      const seta = document.createElement('span');
      seta.className = 'seta';
      seta.innerHTML = GS.contasIcones.seta;
      b.append(mini, nomes, seta);
      b.setAttribute('aria-label', `Continuar como ${GS.nomeDaConta(c)} (${c.email})`);
      return b;
    }));
  }

  // lista de contas guardadas; sem nenhuma, o formulário de sempre
  async function mostrarEscolha(lista) {
    lista = lista || await GS.contas.listar().catch(() => []);
    temContas = lista.length > 0;
    contexto = null;
    semAbas = false;
    if (!temContas) {
      mostrarSo('formulario');
      trocarModo('entrar');
      return;
    }
    desenharEscolha(lista);
    avisarEscolha('');
    mostrarSo('escolha');
    $('escolhaLista').querySelector('button').focus();
  }

  // a sessão guardada dessa conta não vale mais (ou a pessoa quer entrar de novo nela): pede a senha só dela
  function pedirSenha(email) {
    semAbas = true;
    contexto = { titulo: 'Digite a senha da conta', sub: `Para continuar como ${email}, precisamos da senha de novo (ela pode ter sido trocada em outro aparelho).` };
    mostrarSo('formulario');
    trocarModo('entrar');
    el.email.value = email;
    el.senha.value = '';
    el.senha.focus();
  }

  async function continuarComo(id) {
    const botoes = $('escolhaLista').querySelectorAll('button');
    botoes.forEach(b => { b.disabled = true; });
    avisarEscolha('');
    try {
      await GS.contas.trocar(id);
      await seguir();
    } catch (err) {
      botoes.forEach(b => { b.disabled = false; });
      if (err.codigo === 'precisa_senha') return pedirSenha(err.email);
      avisarEscolha(err.message);
    }
  }

  $('escolhaLista').addEventListener('click', e => {
    const b = e.target.closest('button[data-id]');
    if (b) continuarComo(b.dataset.id);
  });

  // "Entrar com outra conta": o formulário de sempre (com "Criar conta")
  function formularioDeOutraConta() {
    contexto = null;
    semAbas = false;
    mostrarSo('formulario');
    trocarModo('entrar');
    el.email.value = '';
    el.senha.value = '';
    el.email.focus();
  }
  $('escolhaOutra').addEventListener('click', formularioDeOutraConta);
  el.voltarEscolha.addEventListener('click', () => mostrarEscolha());
  el.cancelarAdicionar.addEventListener('click', () => irParaOApp());
  $('escolhaGerir').addEventListener('click', () => GS.contas.abrirGerenciar({
    aoAdicionar: formularioDeOutraConta,
    // saiu de uma conta pela janela: a lista de trás acompanha (sem nenhuma, volta ao formulário)
    aoMudar: async () => {
      const lista = await GS.contas.listar().catch(() => []);
      temContas = lista.length > 0;
      if (temContas) desenharEscolha(lista); else { mostrarSo('formulario'); trocarModo('entrar'); }
    },
  }));

  /* ---------- Verificação em duas etapas ----------
     Depois da senha (ou do Google/Apple) quem ligou a verificação ainda precisa do código
     do app autenticador. Vale igual no navegador, no programa para Windows e no iPhone:
     o login de todos termina aqui, nesta mesma tela. */

  // entrou: vai para o app ou, se a conta tiver a verificação ligada, pede o código antes
  async function seguir() {
    if (await GS.auth.duasEtapas.precisaCodigo()) return mostrarDuasEtapas();
    irParaOApp();
  }

  function mostrarSo(id) {
    ['escolha', 'formulario', 'confirmar', 'duasEtapas', 'recuperacao'].forEach(x => $(x).classList.toggle('hidden', x !== id));
    el.abas.classList.toggle('hidden', id !== 'formulario' || semAbas);
  }

  function avisarEm(id, texto) {
    $(id).textContent = texto || '';
    $(id).hidden = !texto;
  }

  let campoDuas = null;
  let conferindo = false;

  async function conferirCodigo(codigo) {
    if (conferindo) return;
    if (!/^\d{6}$/.test(codigo)) {
      avisarEm('duasAviso', 'Digite os 6 dígitos do código.');
      return campoDuas.focar();
    }
    conferindo = true;
    avisarEm('duasAviso', '');
    campoDuas.travar(true);
    const b = $('duasEntrar');
    b.disabled = true;
    b.innerHTML = '<span class="roda" aria-hidden="true"></span>Conferindo…';
    try {
      await GS.auth.duasEtapas.confirmar(codigo);
      irParaOApp();
    } catch (err) {
      conferindo = false;
      b.disabled = false;
      b.textContent = 'Entrar';
      avisarEm('duasAviso', err.message);
      campoDuas.erro();
    }
  }

  async function mostrarDuasEtapas() {
    const sessao = await GS.auth.sessao();
    const email = (sessao && sessao.user && sessao.user.email) || '';
    const p = $('duasTexto');
    p.innerHTML = 'Abra o app autenticador e digite o código do <b>GSCASH</b>';
    if (email) {
      const b = document.createElement('b');
      b.textContent = email;
      p.append(' para ', b);
    }
    p.append('.');
    if (!campoDuas) {
      campoDuas = GS.duasEtapas.campoCodigo({ aoCompletar: conferirCodigo });
      $('duasCampo').replaceWith(campoDuas.el);
    }
    avisarEm('duasAviso', '');
    mostrarSo('duasEtapas');
    setTimeout(() => campoDuas.focar(), 50);
  }

  $('duasEntrar').addEventListener('click', () => conferirCodigo(campoDuas.valor()));

  // desiste do código: sai desta sessão pela metade (as contas já guardadas continuam) e volta
  $('duasOutraConta').addEventListener('click', async () => {
    await GS.supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    temSessao = false;
    el.senha.value = '';
    const lista = await GS.contas.listar().catch(() => []);
    if (lista.length) return mostrarEscolha(lista);
    mostrarSo('formulario');
    trocarModo('entrar');
    el.email.focus();
  });

  $('perdiCelular').addEventListener('click', () => {
    avisarEm('recuperacaoAviso', '');
    mostrarSo('recuperacao');
    $('codigoRecuperacao').focus();
  });
  $('recuperacaoVoltar').addEventListener('click', mostrarDuasEtapas);

  async function usarRecuperacao() {
    const codigo = $('codigoRecuperacao').value.trim();
    if (codigo.replace(/[^a-z0-9]/gi, '').length !== 8) return avisarEm('recuperacaoAviso', 'O código de recuperação tem 8 letras e números, como K7QM-2XPA.');
    const b = $('recuperacaoEntrar');
    b.disabled = true;
    b.innerHTML = '<span class="roda" aria-hidden="true"></span>Conferindo…';
    avisarEm('recuperacaoAviso', '');
    try {
      await GS.auth.duasEtapas.usarCodigoRecuperacao(codigo);
      try { sessionStorage.setItem('gscash:2fa-desligada', '1'); } catch (e) { /* segue sem o aviso */ }
      irParaOApp();
    } catch (err) {
      b.disabled = false;
      b.textContent = 'Entrar com o código';
      avisarEm('recuperacaoAviso', err.message);
    }
  }
  $('recuperacaoEntrar').addEventListener('click', usarRecuperacao);
  $('codigoRecuperacao').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); usarRecuperacao(); } });

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
        return await seguir();
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
  // login com Google ou com a Apple: no app de computador ele continua no navegador padrão;
  // enquanto isso a tela avisa o que fazer e o mesmo botão vira "Cancelar"
  const botoesExternos = { google: el.google, apple: $('apple') };
  const NOMES = { google: { com: 'Google', o: 'o Google' }, apple: { com: 'Apple', o: 'a Apple' } };
  const textos = Object.fromEntries(Object.entries(botoesExternos).map(([k, b]) => [k, b.innerHTML]));
  let espera = null;  // { provedor, controle }

  function fimEspera() {
    if (!espera) return;
    botoesExternos[espera.provedor].innerHTML = textos[espera.provedor];
    espera = null;
    Object.values(botoesExternos).forEach(x => { x.disabled = false; });
    el.enviar.disabled = false;
  }

  Object.entries(botoesExternos).forEach(([provedor, botao]) => botao.addEventListener('click', async () => {
    if (espera) {
      if (espera.provedor === provedor) espera.controle.abort();
      return;
    }
    espera = { provedor, controle: new AbortController() };
    el.enviar.disabled = true;
    Object.values(botoesExternos).forEach(x => { if (x !== botao) x.disabled = true; });
    const nome = NOMES[provedor];
    if (GS.auth.noDesktop) {
      botao.textContent = `Cancelar login com ${nome.com}`;
      avisar(`Abrimos ${nome.o} no seu navegador. Entre lá e depois volte aqui.`, true);
    } else {
      // no navegador a própria página vai para o provedor (e volta logada para o app)
      botao.disabled = true;
      avisar(`Abrindo ${nome.o}…`, true);
    }
    try {
      const r = await GS.auth.entrarCom(provedor, { sinal: espera.controle.signal });
      if (r && r.saiuDaPagina) return;  // não navegar: atropelaria a ida para o provedor
      fimEspera();
      avisar('');
      await seguir();
    } catch (err) {
      fimEspera();
      avisar(err.name === 'AbortError' ? `Login com ${nome.com} cancelado.` : err.message, err.name === 'AbortError');
    }
  }));

  // o botão da Apple só aparece quando ela estiver ligada no Supabase (até lá, daria erro)
  GS.auth.provedoresLigados().then(ligados => { $('apple').classList.toggle('hidden', !ligados.apple); }).catch(() => {});

  // voltou do Google/Apple pelo botão Voltar do navegador: a página volta como estava, então destrava o botão
  window.addEventListener('pageshow', e => {
    if (e.persisted && espera) { fimEspera(); avisar(''); }
  });

  // acabou de sair pelo menu da conta (Gerenciar contas): confirma de qual conta saiu
  let mensagemInicial = null;
  try {
    const saiuDe = sessionStorage.getItem('gscash:saiu');
    const saiuDeTodas = sessionStorage.getItem('gscash:saiu-todas') === '1';
    sessionStorage.removeItem('gscash:saiu');
    sessionStorage.removeItem('gscash:saiu-todas');
    if (saiuDeTodas) mensagemInicial = 'Você saiu de todas as contas.';
    else if (saiuDe !== null) mensagemInicial = saiuDe ? `Você saiu da conta ${saiuDe}.` : 'Você saiu da sua conta.';
  } catch (e) { /* sem sessionStorage: segue sem a confirmação */ }
  // acabou de excluir a conta (js/excluir-conta.js)
  try {
    if (sessionStorage.getItem('gscash:excluida')) {
      sessionStorage.removeItem('gscash:excluida');
      mensagemInicial = 'Sua conta foi excluída. Seus dados foram apagados. Obrigado por ter usado o GSCASH.';
    }
  } catch (e) { /* segue */ }

  // "Prefere instalar no computador? Baixar para Windows" (só no navegador, e só com a 2.0 publicada)
  const linkBaixar = GS.baixar.linkHtml();
  if (linkBaixar) {
    $('baixarLinha').innerHTML = `Prefere instalar no computador? ${linkBaixar}`;
    $('baixarLinha').hidden = false;
  }

  // "Começar grátis" da página inicial do site (→ entrar.html#criar): abre em "Criar conta" (no fim deste arquivo)

  // veio pelo link "recuperar senha" do e-mail: pede a nova senha em vez de entrar direto
  const veioDoLinkDeSenha = /type=recovery/.test(location.hash);
  GS.supabase.auth.onAuthStateChange(evento => {
    if (evento === 'PASSWORD_RECOVERY') trocarModo('novasenha');
  });

  // Quem já está logado vai direto para o app. Sem login e com contas guardadas, atalhos
  // "Continuar como…". Até decidir, nada aparece (senão o formulário piscaria antes da lista).
  mostrarSo('');
  (async () => {
    const sessao = await GS.auth.sessao().catch(() => null);
    temSessao = !!sessao;
    if (sessao && !emOutraConta && !veioDoLinkDeSenha) return seguir();

    const lista = await GS.contas.listar().catch(() => []);
    temContas = lista.length > 0;
    const email = params.get('reentrar');
    if (params.has('adicionar')) {
      contexto = {
        titulo: 'Adicionar outra conta',
        sub: sessao && sessao.user.email ? `Você continua conectado como ${sessao.user.email}. Entre com a outra conta para guardá-la neste aparelho.` : 'Entre com a outra conta para guardá-la neste aparelho.',
      };
    }
    if (email) {
      pedirSenha(email);
    } else if (!params.has('adicionar') && !sessao && temContas && !veioDoLinkDeSenha && location.hash !== '#criar') {
      mostrarEscolha(lista);
    } else {
      mostrarSo('formulario');
      // (o link de nova senha do e-mail já pode ter pedido 'novasenha' enquanto isto carregava)
      trocarModo(modo === 'novasenha' ? 'novasenha' : location.hash === '#criar' && !emOutraConta ? 'criar' : 'entrar');
    }
    if (mensagemInicial) {
      if ($('escolha').classList.contains('hidden')) avisar(mensagemInicial, true);
      else avisarEscolha(mensagemInicial, true);
    }
  })();
})();
