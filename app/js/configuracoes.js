/* =========================================================
   GSCASH — Configurações (menu da conta › Configurações)
   · Moeda do app: só troca o símbolo e o formato, sem converter
     os valores. Clicar numa moeda só marca; a troca vale ao
     confirmar e fica salva nas preferências da conta.
   · Verificação em duas etapas: só aparece aqui (não fica no menu da conta).
   ========================================================= */

(function () {
  const { icone, esc } = GS;
  const $ = id => document.getElementById(id);

  /* ---------- Moeda ---------- */

  let escolhida = null;   // moeda marcada e ainda não confirmada (null = a atual)

  // formata na moeda pedida usando o mesmo formatador do resto do app, por isso troca a moeda por um instante
  function formatar(codigo, centavos) {
    const atual = GS.codigoMoeda;
    GS.definirMoeda(codigo);
    const texto = GS.moedaVisivel(centavos);
    GS.definirMoeda(atual);
    return texto;
  }

  function desenharMoedas() {
    const atual = GS.codigoMoeda;
    const marcada = escolhida || atual;
    $('moedaAtual').textContent = GS.moedaAtual().nome;
    $('moedas').innerHTML = Object.entries(GS.MOEDAS).map(([codigo, m]) => {
      const on = codigo === marcada;
      return `<button type="button" class="cfg-moeda${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-moeda="${codigo}">
        <span class="simb" aria-hidden="true">${esc(m.sigla)}</span>
        <span class="txt"><b>${esc(m.nome)}</b><small class="num">${esc(formatar(codigo, 123456))}</small></span>
        ${codigo === atual ? '<span class="atual">Atual</span>' : ''}
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
      <span class="conta-selo${ligada ? ' ligada' : ''}">${ligada ? 'Ligada' : 'Desligada'}</span>
      <button type="button" class="btn btn-outline" data-duas-etapas>${ligada ? 'Gerenciar' : 'Ligar'}</button>`;
  }

  $('duasEtapas').addEventListener('click', e => {
    if (!e.target.closest('[data-duas-etapas]')) return;
    GS.duasEtapas.abrir();
    // ao fechar a janela, mostra se ficou ligada ou desligada
    const vigia = new MutationObserver(() => {
      if (document.querySelector('.modal-backdrop')) return;
      vigia.disconnect();
      desenharDuasEtapas();
    });
    setTimeout(() => vigia.observe(document.body, { childList: true }), 300);
  });

  async function desenhar() {
    desenharMoedas();
    await desenharDuasEtapas();
  }

  GS.iniciarPagina('configuracoes', desenhar);
})();
