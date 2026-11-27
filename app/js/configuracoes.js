/* =========================================================
   GSCASH — Configurações (menu da conta › Configurações)
   · Indique e ganhe: link, código, progresso até 5 amigos e quem usou.
   · Moeda do app: só troca o símbolo e o formato, sem converter
     os valores. Clicar numa moeda só marca; a troca vale ao
     confirmar e fica salva nas preferências da conta.
   · Lembrete diário: chave liga/desliga, vale só para este aparelho.
     Não aparece no programa para Windows (lá não chega notificação).
   · Verificação em duas etapas: só aparece aqui (não fica no menu da conta).
   · Aplicativo: importar, baixar para Windows (computador) ou instalar no celular, e o tour.
   · Sair da conta (as outras contas do aparelho continuam entradas), excluir a conta e a versão.
   Lista agrupada (como os ajustes do iPhone): no celular, cada linha abre a sua tela (#moeda,
   #indique); no computador, a lista fica à esquerda e a tela escolhida à direita.
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
        ${codigo === atual ? '<span class="estado-txt info">Em uso</span>' : ''}
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

  /* ---------- Navegação: lista e telas ----------
     Celular: a lista é a tela; tocar numa linha abre a tela dela (o "voltar" do aparelho volta à lista).
     Computador: a lista fica à esquerda e a tela escolhida à direita (começa na Moeda). */

  const TELAS = ['moeda', 'indique', 'ajuda'];
  const noCelular = () => matchMedia('(max-width: 760px)').matches;

  function mostrarTela() {
    let tela = location.hash.slice(1);
    if (!TELAS.includes(tela) || (tela === 'indique' && $('grupoIndicacao').hidden)) tela = '';
    const visivel = tela || (noCelular() ? '' : 'moeda');
    $('cfgApp').dataset.tela = tela;
    document.querySelectorAll('.cfg-painel').forEach(p => { p.hidden = p.dataset.painel !== visivel; });
    document.querySelectorAll('.cfg-menu [data-ir]').forEach(b => {
      const on = b.dataset.ir === visivel && !noCelular();
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    if (tela && noCelular()) window.scrollTo(0, 0);
  }

  document.querySelector('.cfg-menu').addEventListener('click', e => {
    const b = e.target.closest('[data-ir]');
    if (!b) return;
    if (location.hash === '#' + b.dataset.ir) mostrarTela();
    else location.hash = b.dataset.ir;
  });
  document.querySelectorAll('[data-voltar]').forEach(b => b.addEventListener('click', () => {
    if (history.length > 1 && location.hash) history.back();
    else { history.replaceState(null, '', location.pathname); mostrarTela(); }
  }));
  window.addEventListener('hashchange', mostrarTela);
  matchMedia('(max-width: 760px)').addEventListener('change', mostrarTela);

  const linhaHtml = (ic, nome, direita = '', sub = '') => `<span class="cfg-ic">${icone(ic)}</span>
    <span class="nome">${esc(nome)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>${direita}`;
  const seta = (antes = '') => `<span class="dir">${antes}${icone('chevron-right')}</span>`;

  /* ---------- Topo: a conta e a licença ---------- */

  async function garantirUsuario() {
    if (GS.usuario || !GS.auth) return GS.usuario;
    const sessao = await GS.auth.sessao();
    if (sessao) GS.usuario = sessao.user;
    return GS.usuario;
  }

  const COR_LICENCA = { ativa: 'ok', vencendo: 'alerta', teste: 'info', 'teste-acabou': 'erro', vencida: 'erro' };

  async function desenharPerfil() {
    if (!await garantirUsuario() || !GS.dadosDaConta) return;
    const { email, inicial } = GS.dadosDaConta(GS.usuario);
    const meta = GS.usuario.user_metadata || {};
    const nome = meta.full_name || meta.name || '';
    if (GS.licenca) await GS.licenca.pronta;
    const sit = GS.licenca && GS.licenca.situacao && GS.licenca.situacao();
    $('perfil').hidden = false;
    $('perfil').innerHTML = `
      <span class="cfg-avatar" aria-hidden="true">${esc(inicial)}</span>
      <span class="txt"><b>${esc(nome || email)}</b>${nome ? `<small>${esc(email)}</small>` : ''}
        ${sit ? `<span class="estado-txt ${COR_LICENCA[sit.estado] || 'neutro'}">${sit.texto}</span>` : ''}</span>
      ${icone('chevron-right')}`;
    $('perfil').setAttribute('aria-label', `${nome || email}. ${sit ? sit.texto.replace(/<[^>]+>/g, '') + '. ' : ''}Abrir a licença`);
  }

  $('perfil').addEventListener('click', () => GS.licenca && GS.licenca.abrirJanela());

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
      return;   // sem internet: a linha não aparece
    }
    const { codigo, meta, premio, amigos } = indicacao;
    const validas = Math.min(indicacao.validas, meta);
    const link = LINK_INDICACAO + codigo;
    const tracos = Array.from({ length: meta }, (_, i) => `<i${i < validas ? ' class="on"' : ''}></i>`).join('');
    const nota = texto => `<div class="cfg-nota">${icone('alert')}<span>${texto}</span></div>`;

    $('grupoIndicacao').hidden = false;
    $('grupoIndicacao').querySelector('[data-ir]').innerHTML = linhaHtml('gift', 'Indique e ganhe',
      seta(premio ? '<span class="estado-txt ok">Ganhou</span>' : `<span class="num">${validas} de ${meta}</span>`),
      premio ? '' : '6 meses grátis com 5 amigos');
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
      mostrarTela();
      return;
    }

    const faltam = meta - validas;
    const lista = amigos.length ? `
      <div class="ind-amigos">
        <h3>Quem usou seu link</h3>
        ${amigos.map(a => `<div class="ind-amigo">
          <span class="ini" aria-hidden="true">${esc(a.email.charAt(0).toUpperCase())}</span>
          <span class="txt"><b>${esc(a.email)}</b><small>Entrou em ${esc(GS.dataMedia(new Date(a.criada_em)))}</small></span>
          ${a.valida ? '<span class="estado-txt ok">Valeu</span>' : '<span class="estado-txt alerta">Falta 1º gasto</span>'}
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
    mostrarTela();   // abriu direto em #indique antes da linha existir
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

  /* ---------- Lembrete diário (chave direto na linha) ---------- */

  const TEXTO_LEMBRETE = 'Às 19h, se ainda não lançou nada no dia';

  async function desenharLembrete() {
    if (!GS.lembrete || !GS.lembrete.visivel()) return;
    const linha = $('lembrete');
    linha.hidden = false;
    // iPhone pelo Safari: só funciona com o app instalado na tela inicial
    if (!GS.lembrete.suportado) {
      linha.innerHTML = linhaHtml('sino', 'Lembrete diário', '<button type="button" class="btn btn-outline cfg-mini" data-instalar>Como instalar</button>',
        'Funciona com o GSCASH instalado na tela inicial');
      return;
    }
    const ligado = await GS.lembrete.ligado().catch(() => false);
    linha.innerHTML = linhaHtml('sino', 'Lembrete diário',
      `<button type="button" class="switch${ligado ? ' on' : ''}" role="switch" aria-checked="${ligado}" aria-label="Lembrete diário" data-chave></button>`,
      ligado ? `${TEXTO_LEMBRETE} · neste aparelho` : TEXTO_LEMBRETE);
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

  // redesenha quando a janela aberta (lembrete, duas etapas, licença) fecha
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
    if (!GS.duasEtapas || !await garantirUsuario()) return;
    const ligada = GS.duasEtapas.ligada();
    $('tituloSeguranca').hidden = false;
    $('grupoSeguranca').hidden = false;
    // desligada não mostra nada à direita (só a seta)
    $('duasEtapas').innerHTML = linhaHtml('escudo', 'Verificação em duas etapas', seta(ligada ? '<span class="estado-txt ok">Ligada</span>' : ''));
  }

  $('duasEtapas').addEventListener('click', () => {
    GS.duasEtapas.abrir();
    vigiarJanela(desenharDuasEtapas);   // ao fechar a janela, mostra se ficou ligada ou desligada
  });

  /* ---------- Aplicativo ---------- */

  // Importar extrato; baixar para Windows (computador com Windows, pelo navegador) ou instalar no celular
  // (pelo navegador); o tour. Só aparece o que vale para este aparelho.
  function desenharAplicativo() {
    const linhas = [];
    if (GS.importar) linhas.push(`<button type="button" class="cfg-item" data-importar>${linhaHtml('subir', 'Importar extrato ou planilha', seta())}</button>`);
    if (GS.baixar && GS.baixar.disponivel()) {
      linhas.push(`<a class="cfg-item" href="${GS.baixar.url}" data-baixar>${linhaHtml('computador', 'GSCASH para Windows', `<span class="dir">${icone('download')}</span>`, 'Mesma conta, direto da área de trabalho')}</a>`);
    } else if (GS.instalar && GS.instalar.disponivel()) {
      linhas.push(`<button type="button" class="cfg-item" data-instalar-app>${linhaHtml('celular', 'Instalar no celular', seta(), 'Ícone na tela inicial, como um app')}</button>`);
    }
    if (GS.abrirTour) linhas.push(`<button type="button" class="cfg-item" data-tour>${linhaHtml('play', 'Ver o tour do GSCASH', seta('<span>1 min</span>'))}</button>`);
    linhas.push(`<button type="button" class="cfg-item" data-ir="ajuda">${linhaHtml('book', 'Ajuda', seta(), 'Dúvidas frequentes e suporte')}</button>`);
    $('aplicativo').innerHTML = linhas.join('');
    $('aplicativo').hidden = $('tituloApp').hidden = !linhas.length;
  }

  $('aplicativo').addEventListener('click', e => {
    if (e.target.closest('[data-importar]')) return GS.importar.abrir();
    if (e.target.closest('[data-instalar-app]')) return GS.instalar.abrir();
    if (e.target.closest('[data-tour]')) return GS.abrirTour();
  });
  // instalou pelo convite do navegador: a linha some
  window.addEventListener('appinstalled', desenharAplicativo);

  /* ---------- Ajuda: dúvidas frequentes ----------
     As mesmas perguntas das Dúvidas frequentes do site (site/index.html), ajustadas para quem já está no app.
     Mudou uma resposta lá, muda aqui também. No app da loja, o pagamento é só pela loja: a Apple e o Google
     não deixam o app falar de outras formas de pagar. */

  function respostaPagamento() {
    const plataforma = GS.nativo ? window.Capacitor.getPlatform() : '';
    const loja = plataforma === 'ios' ? 'pela App Store' : plataforma === 'android' ? 'pelo Google Play' : '';
    return loja
      ? `Dentro do próprio GSCASH, ${loja}. A licença ativa assim que a compra é aprovada e vale em todos os aparelhos em que você entrar com a mesma conta.`
      : 'Dentro do próprio GSCASH, por Pix ou cartão de crédito à vista. A licença ativa assim que o pagamento é aprovado e vale em todos os aparelhos em que você entrar com a mesma conta.';
  }

  const AJUDA = () => [
    ['O que acontece depois dos 12 dias grátis?', 'Nada some. Sem a licença, o GSCASH fica só para consulta: você vê tudo o que lançou e gera relatórios, mas não lança nada novo. Ative a licença quando quiser e continue de onde parou.'],
    ['Como importo o extrato do banco?', 'Em Configurações > Importar extrato ou planilha, escolha o arquivo que o banco fornece, em PDF, OFX, CSV ou Excel. O GSCASH mostra cada lançamento para você revisar antes de salvar. Ele nunca pede a senha do banco.'],
    ['Quais bancos o importador lê?', 'Os extratos em PDF do Banco do Brasil, Itaú, Bradesco, Santander, Nubank, Inter, Mercado Pago, PicPay, BTG e Sicoob. De qualquer outro banco, use o arquivo OFX ou CSV, que quase todos oferecem.'],
    ['Posso usar em mais de um aparelho?', 'Sim, em quantos quiser, com a mesma conta e a mesma licença. Também dá para deixar mais de uma conta entrada no mesmo aparelho e trocar entre elas pelo menu da conta, sem digitar a senha de novo.'],
    ['Perdi o celular com a verificação em duas etapas. E agora?', 'Na hora de entrar, use um dos códigos de recuperação que o GSCASH mostrou quando você ligou a verificação. Sem os códigos, escreva para o suporte a partir do e-mail da conta.'],
    ['A licença renova sozinha?', 'Não. A licença vale um ano e não existe cobrança automática. Para renovar, é só comprar de novo dentro do GSCASH, e o novo ano soma ao tempo que ainda restava.'],
    ['Como faço o pagamento?', respostaPagamento()],
    ['Como funciona o Indique e ganhe?', 'Envie o seu link, que fica em Configurações > Indique e ganhe. Quando 5 amigos criarem a conta por ele e lançarem o primeiro gasto, você ganha 6 meses de licença grátis. O prêmio vale uma vez por conta.'],
    ['Posso usar em outra moeda?', 'Sim. Em Configurações > Moeda, escolha a moeda em que você registra os gastos. Os valores não são convertidos, só aparecem na moeda escolhida.'],
    ['Como baixo meus dados ou excluo minha conta?', 'Em Configurações > Baixar meus dados, vem uma planilha do Excel com tudo o que você guardou, mesmo sem licença. Para excluir a conta, use Excluir minha conta, no fim de Configurações. Antes de confirmar, o GSCASH oferece a mesma planilha.'],
  ];

  function desenharAjuda() {
    $('ajudaLista').innerHTML = AJUDA().map(([pergunta, resposta]) =>
      `<details><summary>${esc(pergunta)}${icone('chevron-down')}</summary><p>${esc(resposta)}</p></details>`).join('');
  }

  /* ---------- Seus dados: a planilha com tudo (js/baixar-dados.js), a política e os termos ---------- */

  // data da última versão da política e dos termos (gscash.com.br): trocar aqui quando eles mudarem
  const DOCUMENTOS_EM = '27 de novembro';
  const DOCUMENTOS = [
    { ic: 'escudo', nome: 'Política de privacidade', sub: `Atualizada em ${DOCUMENTOS_EM}`, url: 'https://gscash.com.br/privacidade.html' },
    { ic: 'file', nome: 'Termos de uso', sub: `Atualizados em ${DOCUMENTOS_EM}`, url: 'https://gscash.com.br/termos.html' },
  ];
  const FORA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>';

  function desenharDados() {
    if (GS.baixarDados) $('baixarDados').innerHTML = linhaHtml('download', 'Baixar meus dados', seta(), 'Planilha com tudo o que você guardou');
    $('baixarDados').hidden = !GS.baixarDados;
    $('grupoDados').querySelectorAll('[data-documento]').forEach(a => a.remove());
    $('grupoDados').insertAdjacentHTML('beforeend', DOCUMENTOS.map(d =>
      `<a class="cfg-item" href="${d.url}" target="_blank" rel="noopener" data-documento>${linhaHtml(d.ic, d.nome, `<span class="dir">${FORA}</span>`, d.sub)}</a>`).join(''));
    $('grupoDados').hidden = $('tituloDados').hidden = false;
  }
  $('baixarDados').addEventListener('click', () => GS.baixarDados.abrir());
  // no app do celular, a página abre no navegador do sistema por cima do app (não troca a página do app)
  $('grupoDados').addEventListener('click', e => {
    const a = e.target.closest('[data-documento]');
    if (!a || !GS.nativo) return;
    e.preventDefault();
    window.Capacitor.registerPlugin('Browser').open({ url: a.href, presentationStyle: 'popover' }).catch(() => window.open(a.href, '_blank'));
  });

  /* ---------- Sair, excluir e versão ---------- */

  // Sai só da conta em uso, do mesmo jeito que "Sair" em Gerenciar contas: as outras contas
  // guardadas neste aparelho continuam entradas e aparecem na tela de entrar para escolher.
  async function desenharConta() {
    if (!GS.contas || !await garantirUsuario()) return;
    $('grupoSair').hidden = false;
    $('excluirConta').hidden = !GS.excluirConta;
  }

  $('sair').addEventListener('click', async () => {
    const botao = $('sair');
    if (botao.disabled) return;
    const { id, email } = GS.dadosDaConta(GS.usuario);
    const outras = (await GS.contas.listar().catch(() => [])).filter(c => c.id !== id);
    const ok = await GS.confirmar({
      titulo: 'Sair da conta?',
      mensagem: `Você sai de <strong>${esc(email)}</strong> neste aparelho. Seus dados continuam guardados na nuvem.`
        + (outras.length ? ' As outras contas deste aparelho continuam entradas.' : ''),
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

  $('excluirConta').addEventListener('click', () => GS.excluirConta && GS.excluirConta.abrir());

  // a versão de quem está rodando: app do celular, programa do Windows ou o site
  async function desenharVersao() {
    let texto = 'GSCASH · navegador';
    try {
      if (GS.nativo && window.Capacitor && window.Capacitor.isPluginAvailable('App')) {
        texto = `GSCASH ${(await window.Capacitor.registerPlugin('App').getInfo()).version}`;
      } else if (GS.noDesktop) {
        texto = `GSCASH ${(await (await GS.apiDesktop()).info()).versao} · Windows`;
      }
    } catch (e) { /* fica o texto padrão */ }
    $('versao').textContent = texto;
  }

  desenharAjuda();

  let primeira = true;
  async function desenhar() {
    desenharMoedas();
    desenharAplicativo();
    desenharDados();
    if (primeira) { primeira = false; mostrarTela(); desenharVersao(); }
    await Promise.all([desenharPerfil(), desenharIndicacao(), desenharLembrete(), desenharDuasEtapas(), desenharConta()]);
  }

  GS.iniciarPagina('configuracoes', desenhar);
})();
