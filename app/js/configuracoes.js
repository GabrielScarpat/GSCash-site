/* =========================================================
   GSCASH — Configurações (menu da conta › Configurações)
   · Moeda do app: só troca o símbolo e o formato, sem converter
     os valores. Clicar numa moeda só marca; a troca vale ao
     confirmar e fica salva nas preferências da conta.
   · Lembrete diário: chave liga/desliga, vale só para este aparelho.
     Não aparece no programa para Windows (lá não chega notificação).
   · Verificação em duas etapas: só aparece aqui (não fica no menu da conta).
   · Aplicativo: baixar para Windows (computador) ou instalar no celular.
   · Conta: Sair da conta (as outras contas do aparelho continuam entradas).
   ========================================================= */

(function () {
  const { icone, esc } = GS;
  const $ = id => document.getElementById(id);

  /* ---------- Moeda ---------- */

  let escolhida = null;   // moeda marcada e ainda não confirmada (null = a atual)

  const formatar = GS.formatarEm;

  function desenharMoedas() {
    const atual = GS.codigoMoeda;
    const marcada = escolhida || atual;
    $('moedaAtual').textContent = GS.moedaAtual().nome;
    $('moedas').innerHTML = Object.entries(GS.MOEDAS).map(([codigo, m]) => {
      const on = codigo === marcada;
      return `<button type="button" class="cfg-moeda${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-moeda="${codigo}">
        <span class="simb" aria-hidden="true">${esc(m.sigla)}</span>
        <span class="txt"><b>${esc(m.nome)}</b><small class="num">${esc(formatar(codigo, 123456))}</small></span>
        ${codigo === atual ? '<span class="selo info">Em uso</span>' : ''}
        <span class="marca" aria-hidden="true">${icone('check')}</span>
      </button>`;
    }).join('');

    // barra de confirmação: o antes e depois de um gasto de 50
    const barra = $('confirmarMoeda');
    barra.hidden = !escolhida;
    if (escolhida) {
      barra.querySelector('[data-titulo]').textContent = `Trocar de ${GS.moedaAtual().nome} para ${GS.MOEDAS[escolhida].nome}?`;
      barra.querySelector('[data-exemplo]').textContent = `Um gasto de ${formatar(atual, 5000)} vai aparecer como ${formatar(escolhida, 5000)}.`;
    }
  }

  $('moedas').addEventListener('click', e => {
    const b = e.target.closest('[data-moeda]');
    if (!b) return;
    escolhida = b.dataset.moeda === GS.codigoMoeda ? null : b.dataset.moeda;
    desenharMoedas();
  });

  $('confirmarMoeda').addEventListener('click', async e => {
    if (e.target.closest('[data-cancelar]')) {
      escolhida = null;
      desenharMoedas();
      return;
    }
    const botao = e.target.closest('[data-confirmar]');
    if (!botao || !escolhida) return;
    const anterior = GS.codigoMoeda;
    botao.disabled = true;
    GS.definirMoeda(escolhida);
    try {
      await GS.api.salvarPreferencia('moeda', GS.codigoMoeda);
      escolhida = null;
      GS.toast(`Moeda trocada para ${GS.moedaAtual().nome.toLowerCase()}`);
    } catch (err) {
      GS.definirMoeda(anterior);
      GS.toast(err.message, 'erro');
    } finally {
      botao.disabled = false;
      desenharMoedas();
    }
  });

  /* ---------- Lembrete diário ---------- */

  const TEXTO_LEMBRETE = 'Todo dia às 19h, se você ainda não lançou nada no dia.';

  async function desenharLembrete() {
    if (!GS.lembrete || !GS.lembrete.visivel()) return;
    $('cardNotificacoes').hidden = false;
    const titulo = sub => `<span class="cfg-icone">${icone('sino')}</span>
      <span class="txt"><b>Lembrete diário</b><small>${esc(sub)}</small></span>`;
    // iPhone pelo Safari: só funciona com o app instalado na tela inicial
    if (!GS.lembrete.suportado) {
      $('lembrete').innerHTML = titulo('No iPhone, funciona com o GSCASH instalado na tela inicial.')
        + '<button type="button" class="btn btn-outline" data-instalar>Como instalar</button>';
      return;
    }
    const ligado = await GS.lembrete.ligado().catch(() => false);
    $('lembrete').innerHTML = titulo(ligado ? `${TEXTO_LEMBRETE} Ligado neste aparelho.` : TEXTO_LEMBRETE)
      + `<button type="button" class="switch${ligado ? ' on' : ''}" role="switch" aria-checked="${ligado}" aria-label="Lembrete diário" data-chave></button>`;
  }

  $('lembrete').addEventListener('click', async e => {
    if (e.target.closest('[data-instalar]')) return GS.instalar && GS.instalar.abrir();
    const chave = e.target.closest('[data-chave]');
    if (!chave || chave.disabled) return;
    const ligar = !chave.classList.contains('on');
    chave.disabled = true;
    chave.classList.toggle('on', ligar);   // responde na hora; volta se não der certo
    try {
      await GS.lembrete.definir(ligar);
    } catch (err) {
      GS.toast(err.message || 'Não foi possível mudar o lembrete agora.', 'erro');
    }
    await desenharLembrete();
    // notificações bloqueadas: a janela explica; ao fechar, a chave mostra o estado certo
    if (document.querySelector('.modal-backdrop')) vigiarJanela(desenharLembrete);
  });

  // redesenha quando a janela aberta (lembrete, duas etapas) fecha
  function vigiarJanela(redesenhar) {
    const vigia = new MutationObserver(() => {
      if (document.querySelector('.modal-backdrop')) return;
      vigia.disconnect();
      redesenhar();
    });
    setTimeout(() => vigia.observe(document.body, { childList: true }), 300);
  }

  /* ---------- Verificação em duas etapas ---------- */

  async function desenharDuasEtapas() {
    if (!GS.duasEtapas || !GS.auth) return;
    // a conta pode ainda não ter chegado (supabase.js confere o login em paralelo)
    if (!GS.usuario) {
      const sessao = await GS.auth.sessao();
      if (!sessao) return;
      GS.usuario = sessao.user;
    }
    const ligada = GS.duasEtapas.ligada();
    $('cardSeguranca').hidden = false;
    $('duasEtapas').innerHTML = `
      <span class="cfg-icone">${icone('escudo')}</span>
      <span class="txt"><b>Verificação em duas etapas</b>
        <small>Além da senha, o GSCASH pede um código do app autenticador do celular ao entrar.</small></span>
      <span class="cfg-acoes">
        ${ligada ? '<span class="selo ok">Ligada</span>' : ''}
        <button type="button" class="btn btn-outline" data-duas-etapas>${ligada ? 'Gerenciar' : 'Ligar'}</button>
      </span>`;
  }

  $('duasEtapas').addEventListener('click', e => {
    if (!e.target.closest('[data-duas-etapas]')) return;
    GS.duasEtapas.abrir();
    // ao fechar a janela, mostra se ficou ligada ou desligada
    vigiarJanela(desenharDuasEtapas);
  });

  /* ---------- Aplicativo (baixar para Windows ou instalar no celular) ---------- */

  // No computador com Windows, pelo navegador: baixar o instalador. No celular, pelo navegador:
  // instalar com ícone na tela inicial. No programa para Windows, no app do iPhone, no que já
  // foi instalado e em Mac/Linux não há o que oferecer: o cartão nem aparece.
  function desenharAplicativo() {
    const linha = (nome, titulo, sub, acao) => `<span class="cfg-icone">${icone(nome)}</span>
      <span class="txt"><b>${esc(titulo)}</b><small>${esc(sub)}</small></span>${acao}`;
    let html = '';
    if (GS.baixar && GS.baixar.disponivel()) {
      html = linha('computador', 'GSCASH para Windows', 'Abre direto da área de trabalho, com a mesma conta e os mesmos dados.',
        `<a class="btn btn-outline cfg-botao" href="${GS.baixar.url}" data-baixar>${icone('download')}Baixar</a>`);
    } else if (GS.instalar && GS.instalar.disponivel()) {
      html = linha('celular', 'Instalar no celular', 'Ícone na tela inicial, abre em tela cheia, como um app.',
        '<button type="button" class="btn btn-outline cfg-botao" data-instalar-app>Instalar</button>');
    }
    $('cardApp').hidden = !html;
    $('aplicativo').innerHTML = html;
  }

  $('aplicativo').addEventListener('click', e => {
    if (e.target.closest('[data-instalar-app]')) GS.instalar.abrir();
  });
  // instalou pelo convite do navegador: o cartão some
  window.addEventListener('appinstalled', desenharAplicativo);

  /* ---------- Conta (sair) ---------- */

  // Sai só da conta em uso, do mesmo jeito que "Sair" em Gerenciar contas: as outras contas
  // guardadas neste aparelho continuam entradas e aparecem na tela de entrar para escolher.
  async function desenharConta() {
    if (!GS.contas || !GS.auth) return;
    if (!GS.usuario) {
      const sessao = await GS.auth.sessao();
      if (!sessao) return;
      GS.usuario = sessao.user;
    }
    const { id, email, inicial } = GS.dadosDaConta(GS.usuario);
    const outras = (await GS.contas.listar().catch(() => [])).filter(c => c.id !== id);
    const sub = outras.length
      ? 'Sai só desta conta. As outras contas deste aparelho continuam entradas.'
      : 'Você entra de novo quando quiser, com e-mail e senha ou com o Google.';
    $('cardConta').hidden = false;
    $('conta').innerHTML = `
      <span class="cfg-avatar" aria-hidden="true">${esc(inicial)}</span>
      <span class="txt"><b>${esc(email)}</b><small>${esc(sub)}</small></span>
      <button type="button" class="btn btn-outline cfg-botao" data-sair>${icone('logout')}Sair da conta</button>`;
  }

  $('conta').addEventListener('click', async e => {
    const botao = e.target.closest('[data-sair]');
    if (!botao || botao.disabled) return;
    botao.disabled = true;
    try {
      await GS.contas.sair(GS.usuario.id);   // a página vai para a tela de entrar daqui
    } catch (err) {
      botao.disabled = false;
      GS.toast(err.message || 'Não foi possível sair agora.', 'erro');
    }
  });

  async function desenhar() {
    desenharMoedas();
    desenharAplicativo();
    await Promise.all([desenharLembrete(), desenharDuasEtapas(), desenharConta()]);
  }

  GS.iniciarPagina('configuracoes', desenhar);
})();
