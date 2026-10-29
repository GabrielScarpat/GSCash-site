/* =========================================================
   GSCASH — Configurações (menu da conta › Configurações)
   · Indique e ganhe: link, código, progresso até 5 amigos e quem usou.
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

  /* ---------- Indique e ganhe ----------
     5 amigos criam conta pelo link e registram o primeiro gasto: 6 meses de licença, uma vez.
     Quem conta e quem ganha é o banco (minha_indicacao); aqui só mostra. */

  const LINK_INDICACAO = 'https://gscash.com.br/?ref=';
  let indicacao = null;

  async function desenharIndicacao() {
    try {
      const { data, error } = await GS.supabase.rpc('minha_indicacao');
      if (error) throw error;
      indicacao = data;
    } catch (err) {
      console.warn('minha_indicacao', err);
      return;   // sem internet: o cartão não aparece
    }
    const { codigo, meta, premio, amigos } = indicacao;
    const validas = Math.min(indicacao.validas, meta);
    const link = LINK_INDICACAO + codigo;
    const tracos = Array.from({ length: meta }, (_, i) => `<i${i < validas ? ' class="on"' : ''}></i>`).join('');
    const nota = texto => `<div class="cfg-nota">${icone('alert')}<span>${texto}</span></div>`;

    $('cardIndicacao').hidden = false;
    $('indicacaoSelo').classList.toggle('hidden', !premio);

    if (premio) {
      $('indicacao').innerHTML = `
        <p class="cfg-texto">Obrigado por indicar o GSCASH. Seus 6 meses grátis já estão na sua licença.</p>
        <div class="ind-progresso ganhou">
          <div class="topo">
            <div class="conta"><b class="num">${meta}</b><span>de ${meta} amigos</span></div>
            <span class="falta">Licença até <b>${esc(GS.dataMedia(premio.validade))}</b></span>
          </div>
          <div class="ind-tracos">${tracos}</div>
        </div>
        ${nota('Você ainda pode compartilhar o GSCASH, mas o prêmio vale uma vez só.')}`;
      return;
    }

    const faltam = meta - validas;
    const lista = amigos.length ? `
      <div class="ind-amigos">
        <h3>Quem usou seu link</h3>
        ${amigos.map(a => `<div class="ind-amigo">
          <span class="ini" aria-hidden="true">${esc(a.email.charAt(0).toUpperCase())}</span>
          <span class="txt"><b>${esc(a.email)}</b><small>Entrou em ${esc(GS.dataMedia(new Date(a.criada_em)))}</small></span>
          ${a.valida ? '<span class="selo ok">Valeu</span>' : '<span class="selo alerta">Falta 1º gasto</span>'}
        </div>`).join('')}
      </div>` : '';

    $('indicacao').innerHTML = `
      <p class="cfg-texto">Quando ${meta} amigos criarem conta pelo seu link e registrarem o primeiro gasto, você ganha <b>6 meses de licença grátis</b>.</p>
      <div class="ind-link">
        <span class="campo-link">${esc(link.replace('https://', ''))}</span>
        <button type="button" class="btn btn-outline" data-copiar>${icone('copiar')}Copiar</button>
        <button type="button" class="btn btn-primary" data-compartilhar>${icone('compartilhar')}Compartilhar</button>
      </div>
      <p class="ind-codigo">Quem baixar pela loja pode digitar o código <b>${esc(codigo)}</b> ao criar a conta.</p>
      <div class="ind-progresso">
        <div class="topo">
          <div class="conta"><b class="num">${validas}</b><span>de ${meta} amigos</span></div>
          <span class="falta">${faltam === 1 ? 'Falta 1' : `Faltam ${faltam}`}</span>
        </div>
        <div class="ind-tracos">${tracos}</div>
      </div>
      ${lista}
      ${nota(`Vale uma vez por conta. Os 6 meses somam à licença que você já tem. Só conta quem criou uma conta nova.`)}`;
  }

  async function copiarLink(botao, texto) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch (e) {
      const t = GS.el('textarea');
      t.value = texto;
      document.body.append(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    if (botao.dataset.textoOriginal === undefined) botao.dataset.textoOriginal = botao.innerHTML;
    botao.innerHTML = `${icone('check')}Copiado`;
    clearTimeout(botao._volta);
    botao._volta = setTimeout(() => { botao.innerHTML = botao.dataset.textoOriginal; }, 2000);
  }

  $('indicacao').addEventListener('click', async e => {
    if (!indicacao) return;
    const link = LINK_INDICACAO + indicacao.codigo;
    const copiar = e.target.closest('[data-copiar]');
    if (copiar) return copiarLink(copiar, link);
    const compartilhar = e.target.closest('[data-compartilhar]');
    if (!compartilhar) return;
    const texto = `Uso o GSCASH para controlar meus gastos. Crie sua conta pelo meu link, são 12 dias grátis para testar (código ${indicacao.codigo}):`;
    // celular e navegadores que têm a janela de compartilhar do sistema; nos outros, copia
    if (navigator.share) {
      try { await navigator.share({ title: 'GSCASH', text: texto, url: link }); } catch (err) { /* fechou a janela */ }
      return;
    }
    copiarLink(compartilhar, `${texto} ${link}`);
    GS.toast('Link copiado. Cole no WhatsApp ou onde quiser.');
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
    const ok = await GS.confirmar({
      titulo: 'Sair da conta?',
      mensagem: `Você sai de <strong>${esc(GS.dadosDaConta(GS.usuario).email)}</strong> neste aparelho. Seus dados continuam guardados na nuvem.`,
      botao: 'Sair', perigo: false,
    });
    if (!ok) return;
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
    await Promise.all([desenharIndicacao(), desenharLembrete(), desenharDuasEtapas(), desenharConta()]);
  }

  GS.iniciarPagina('configuracoes', desenhar);
})();
