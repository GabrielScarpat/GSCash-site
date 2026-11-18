/* =========================================================
   GSCASH — Painel do GSCASH (admin.html), só para o dono do app
   Os números vêm da função painel_admin do Supabase, que confere no servidor
   se quem pediu é o dono; para qualquer outra conta ela responde "sem acesso".
   Tocar num dia do gráfico marca (ou desmarca) que houve divulgação naquele dia.
   ========================================================= */

(function () {
  const $ = s => document.querySelector(s);
  const ICONES = {
    voltar: '<path d="m15 18-6-6 6-6"/>',
    pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    raio: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    lupa: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    carta: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    pix: '<path d="m12 3 4 4-4 4-4-4z"/><path d="m12 13 4 4-4 4-4-4z"/><path d="M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4"/>',
    cadeado: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    moeda: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2"/>',
    sobe: '<path d="m6 15 6-6 6 6"/>',
    desce: '<path d="m6 9 6 6 6-6"/>',
    extrato: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h8"/>',
    cartao: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
    trending: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    repetir: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    sino: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    presente: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/>',
    calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  };
  const ic = n => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[n]}</svg>`;
  document.querySelectorAll('[data-icone]').forEach(el => el.insertAdjacentHTML('afterbegin', ic(el.dataset.icone)));

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const dataCurta = iso => { const [, m, d] = String(iso).slice(0, 10).split('-'); return `${Number(d)} ${MESES[Number(m) - 1]}`; };
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  // "hoje 14:20", "ontem", "13 out"
  function quando(ts) {
    const d = new Date(ts);
    const hoje = new Date();
    const dia = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((dia(hoje) - dia(d)) / 86400000);
    if (diff === 0) return `hoje ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (diff === 1) return 'ontem';
    return `${d.getDate()} ${MESES[d.getMonth()]}`;
  }

  let dias = 30;
  let dados = null;
  let met = null;         // métricas de uso e receita (função painel_admin_metricas); sem elas, o painel mostra o básico
  let turmaSel = null;    // turma escolhida em "Ficam usando?"
  let semSel = null;      // semana escolhida em "Ativos por semana"
  let filtroCmp = 'todos';
  let buscaCmp = '';
  let todas = null;       // todas as contas, com sinais de uso e acompanhamento do contato (função painel_admin_contas)
  let grupo = 'todos';    // grupo escolhido na lista de contas
  let busca = '';
  let selId = null;       // conta aberta na ficha
  const celular = window.matchMedia('(max-width: 760px)');

  // grupos: cada um é um motivo para falar com a pessoa (o servidor diz quem entra em cada um)
  const GRUPOS = [
    ['todos', 'Todos', 'Da mais nova para a mais antiga (a sua não entra).'],
    ['acaba', 'Teste acaba em 2 dias', 'Ainda sem licença. Hora de oferecer ajuda ou lembrar do preço.'],
    ['nada', 'Não lançaram nada', 'Criaram a conta há mais de 1 dia e não lançaram nenhum gasto. Provavelmente travaram no começo.'],
    ['acabou', 'Teste acabou, sem compra', 'O teste de 12 dias acabou e não houve licença. Perguntar o que faltou.'],
    ['pararam', 'Pararam de usar', 'Usavam e estão há 7 dias ou mais sem lançar.'],
    ['vence', 'Licença vence em 30 dias', 'Renovação.'],
    ['muito', 'Usam muito, não compraram', '30 ou mais lançamentos e ainda sem licença paga.'],
  ];
  const ESTADOS = { a_contatar: 'A contatar', contatado: 'Contatado', respondeu: 'Respondeu', nao_quer: 'Não quer contato' };

  // mensagem pronta de cada grupo (o botão Escrever abre o e-mail do dono com isto; nada sai do painel)
  const MENSAGENS = {
    nada: ['Ajudar a começar', 'GSCASH: posso ajudar a começar?', 'Oi! Aqui é o Gabriel, do GSCASH. Vi que você criou sua conta, mas ainda não lançou nenhum gasto. Posso ajudar a começar? Se quiser, me conta o que você pretende controlar (cartão, contas do mês...) e eu te mostro o caminho mais rápido.'],
    acaba: ['Teste acabando', 'Seu teste do GSCASH está acabando', 'Oi! Aqui é o Gabriel, do GSCASH. Seu teste grátis termina em breve. Está conseguindo usar do jeito que precisa? Se faltar alguma coisa, me fala que eu vejo o que dá para fazer.'],
    acabou: ['Perguntar o que faltou', 'GSCASH: o que faltou para você?', 'Oi! Aqui é o Gabriel, do GSCASH. Seu teste terminou e queria entender: o que faltou para o app ser útil para você? Sua resposta me ajuda muito a melhorar.'],
    pararam: ['Voltar a usar', 'GSCASH: aconteceu alguma coisa?', 'Oi! Aqui é o Gabriel, do GSCASH. Notei que você usava e parou. Aconteceu algum problema ou ficou difícil de lançar? Quero deixar mais simples.'],
    vence: ['Renovação', 'Sua licença do GSCASH vence em breve', 'Oi! Aqui é o Gabriel, do GSCASH. Sua licença vence em breve. Obrigado por usar! Se quiser renovar, é só abrir Comprar dentro do app. Qualquer dúvida, é só responder.'],
    muito: ['Convite para comprar', 'GSCASH: vi que você está usando bastante', 'Oi! Aqui é o Gabriel, do GSCASH. Vi que você está usando bastante, que bom! Para continuar depois do teste, a licença anual é a partir de R$ 50. Se tiver qualquer dúvida, me chama.'],
    todos: ['Conversar', 'GSCASH: como está sendo?', 'Oi! Aqui é o Gabriel, do GSCASH. Queria saber como está sendo usar o app. Tem algo que eu possa melhorar?'],
  };
  const PRIORIDADE = ['vence', 'acaba', 'muito', 'acabou', 'pararam', 'nada'];
  const mensagemPadrao = c => PRIORIDADE.find(g => c.grupos.includes(g)) || 'todos';

  async function carregar() {
    $('#conteudo').classList.add('carregando');
    // a lista de contas vem junto; se ela falhar, o painel funciona só com os últimos cadastros
    const [{ data, error }, completa, metricas] = await Promise.all([
      GS.supabase.rpc('painel_admin', { p_dias: dias }),
      GS.supabase.rpc('painel_admin_contas').then(r => (r.error ? null : r.data), () => null),
      GS.supabase.rpc('painel_admin_metricas', { p_dias: dias }).then(r => (r.error ? null : r.data), () => null),
    ]);
    todas = completa;
    met = metricas;
    turmaSel = null;
    semSel = null;
    $('#conteudo').classList.remove('carregando');
    if (error) {
      const semAcesso = /sem acesso/i.test(error.message || '');
      $('#atualizado').textContent = '';
      $('#corpo').innerHTML = `<div class="adm-card adm-aviso">${ic('cadeado')}<div><b>${semAcesso ? 'Sem acesso' : 'Não foi possível carregar'}</b>
        <span>${semAcesso ? 'Este painel é só para o dono do GSCASH.' : 'Verifique a conexão e tente de novo.'}</span></div></div>`;
      return;
    }
    dados = data;
    const agora = new Date();
    $('#atualizado').textContent = `Atualizado às ${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')} · todas as contas, menos a sua`;
    desenhar();
  }

  const situacao = c => {
    if (c.situacao === 'ativa') return `<span class="selo ok">${c.comprou ? 'Comprou' : 'Licença ativa'}</span>`;
    if (c.situacao === 'vencida') return '<span class="selo erro">Licença vencida</span>';
    if (c.situacao === 'teste') return `<span class="selo info">Teste · ${plural(c.dias_teste, 'dia', 'dias')}</span>`;
    return '<span class="selo erro">Teste acabou</span>';
  };

  function desenhar() {
    const d = dados;
    const f = d.funil;
    const nomePeriodo = dias ? `nos últimos ${dias} dias` : 'desde o início';
    const etapa = (rotulo, n, extra = '') => `
      <div class="adm-etapa"><div class="l"><span>${rotulo}</span><b>${n}</b></div>
        <div class="barra"><span style="width:${pct(n, f.criaram)}%"></span></div>
        ${f.criaram ? `<small>${pct(n, f.criaram)}% das contas${extra}</small>` : ''}</div>`;

    const pagamentos = classe => `
        <div class="adm-card ${classe}"><h2>Pagamentos</h2><p class="sub">Pix pelo Mercado Pago</p>
          ${d.pagamentos.length ? `<div class="adm-tabela"><table><thead><tr><th>Quando</th><th>Conta</th><th class="r">Valor</th></tr></thead><tbody>
            ${d.pagamentos.map(p => `<tr><td class="muted">${quando(p.pago_em)}</td><td>${esc(p.email)}</td><td class="r num">${moeda(p.valor)}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="sub">Nenhum pagamento ainda.</p>'}
          <p class="sub adm-nao-pagos">Pix gerados e não pagos ${nomePeriodo}: ${d.pix_nao_pagos} (a pessoa chegou até o QR code)</p>
        </div>`;

    // sem a lista de contas (a função falhou): só os últimos cadastros, como antes
    const ultimos = `
        <div class="adm-card"><h2>Últimos cadastros</h2><p class="sub">Para você saber quem chegou e mandar um oi</p>
          ${d.cadastros.length ? `<div class="adm-tabela"><table><thead><tr><th>Quando</th><th>Conta</th><th class="r">Lançamentos</th><th>Situação</th></tr></thead><tbody>
            ${d.cadastros.map(c => `<tr><td class="muted">${quando(c.criado_em)}</td><td>${esc(c.email)}${c.provedor === 'google' ? ' <span class="muted">· Google</span>' : ''}</td>
              <td class="r num">${c.lancamentos}</td><td>${situacao(c)}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="sub">Ninguém ainda.</p>'}
        </div>`;

    const contas = `
        <div class="adm-card adm-cheia" id="cartaoContas"><h2>Contas</h2><p class="sub">Escolha um grupo para ver quem procurar</p>
          <div class="adm-grupos" id="gruposContas" role="group" aria-label="Grupos de contas"></div>
          <p class="adm-dica" id="dicaContas"></p>
          <label class="adm-busca">${ic('lupa')}<input type="search" id="buscaContas" placeholder="Buscar por e-mail" aria-label="Buscar por e-mail" autocomplete="off" spellcheck="false" value="${esc(busca)}"></label>
          <div class="adm-contas-layout">
            <div>
              <div class="adm-rolagem"><table><thead><tr><th>Conta</th><th>Última vez</th><th class="r">Lançamentos</th><th>Situação</th><th>Contato</th></tr></thead><tbody id="listaContas"></tbody></table></div>
              <div class="adm-rodape-lista" id="rodapeContas"></div>
            </div>
            <aside class="adm-ficha" id="fichaConta" aria-label="Ficha da conta"></aside>
          </div>
        </div>`;

    const Periodo = nomePeriodo[0].toUpperCase() + nomePeriodo.slice(1);
    const novas = `
        <div class="adm-card adm-graf"><h2>Contas novas por dia</h2>
          <p class="sub">${Periodo} · toque num dia para marcar que divulgou · a linha é a média dos últimos 7 dias</p>
          <div id="grafNovas"></div>
          <div class="adm-leg"><span><i style="background:var(--c-novo)"></i>Contas novas</span><span><i style="background:var(--ambar)"></i>Dia com divulgação</span>
            <span><i class="linha" style="background:var(--primary)"></i>Média de 7 dias</span>
            ${met ? `<span>Entraram por: <b>&nbsp;${Object.entries(met.provedores).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${n} ${({ email: 'e-mail', google: 'Google', apple: 'Apple' })[p] || p}`).join(' · ')}</b></span>` : ''}</div>
        </div>`;

    if (met) {
      $('#corpo').innerHTML = `
      <div class="adm-k4" id="kpis"></div>
      ${todas ? '<div class="adm-card" id="procurarHoje" aria-label="Para procurar hoje"></div>' : ''}

      <p class="adm-sec">Uso</p>
      <div class="adm-g2">
        <div class="adm-card adm-graf"><h2>Ficam usando?</h2><p class="sub">Depois de criar a conta, quantos continuam lançando</p>
          <div id="ficam"></div></div>
        <div class="adm-card adm-graf"><h2>Ativos por semana</h2><p class="sub">Contas que lançaram algo em cada semana · toque numa semana</p>
          <div id="grafAtivos"></div><div class="adm-balanco" id="balanco"></div></div>
      </div>
      <div class="adm-g2">
        <div class="adm-card"><h2>Do cadastro à compra</h2><p class="sub">Contas criadas ${nomePeriodo} · quanto se perde em cada etapa</p>
          <div id="funil2"></div></div>
        <div class="adm-card"><h2>O que os ativos usam</h2><p class="sub">Das ${plural(met.uso.ativos, 'conta que lançou', 'contas que lançaram')} algo nos últimos 30 dias</p>
          <div class="adm-usos" id="usos"></div></div>
      </div>

      <p class="adm-sec">Dinheiro</p>
      <div class="adm-g2 larga">
        <div class="adm-card adm-graf"><h2>Receita por mês</h2><p class="sub">Por canal, com o total acumulado</p>
          <div id="grafReceita"></div>
          <div class="adm-leg"><span><i style="background:var(--c-pix)"></i>Pix</span><span><i style="background:var(--c-apple)"></i>Apple</span><span><i style="background:var(--c-google)"></i>Google</span><span><i class="linha" style="background:var(--ok)"></i>Acumulado</span></div>
          <p class="sub adm-nao-pagos">Pix gerados e não pagos ${nomePeriodo}: ${d.pix_nao_pagos} (a pessoa chegou até o QR code)</p></div>
        <div class="adm-card adm-graf"><h2>Renovações</h2><p class="sub">Licenças que vencem em cada mês (anual, sem renovação automática)</p>
          <div id="grafRenova"></div></div>
      </div>
      <div class="adm-card" id="compradores"></div>

      <p class="adm-sec">Chegada</p>
      ${novas}
      ${todas ? contas : ultimos}`;
      desenharKpis();
      desenharFicam();
      desenharAtivos();
      desenharFunil();
      desenharUsos();
      desenharReceita();
      desenharRenovacoes();
      desenharCompradores();
      desenharNovas();
      if (todas) {
        if (!celular.matches && !todas.some(c => c.id === selId)) selId = null;
        desenharProcurar();
        desenharContas();
      }
      return;
    }

    // sem as métricas (a função falhou): o painel de antes
    $('#corpo').innerHTML = `
      <div class="adm-kpis">
        <div class="adm-kpi"><small>${ic('pessoa')}Contas novas</small><b>${d.contas_novas}</b><span class="var">${dias === 7 ? nomePeriodo : `+${d.contas_7d} nos últimos 7 dias`}</span></div>
        <div class="adm-kpi"><small>${ic('relogio')}No teste grátis agora</small><b>${d.em_teste}</b><span class="var cinza">${d.teste_acaba_amanha ? `${plural(d.teste_acaba_amanha, 'acaba', 'acabam')} amanhã` : 'nenhum acaba amanhã'}</span></div>
        <div class="adm-kpi"><small>${ic('pix')}Compras</small><b>${d.compras}</b><span class="var">${moeda(d.receita)} recebidos</span></div>
        <div class="adm-kpi"><small>${ic('raio')}Usaram nos últimos 7 dias</small><b>${d.ativos_7d}</b><span class="var cinza">lançaram pelo menos 1 gasto</span></div>
      </div>

      ${todas ? '<div class="adm-card" id="procurarHoje" aria-label="Para procurar hoje"></div>' : ''}

      <div class="adm-duas">
        ${novas}
        <div class="adm-card"><h2>Do cadastro à compra</h2><p class="sub">Contas criadas ${nomePeriodo}</p>
          <div class="adm-funil">
            <div class="adm-etapa"><div class="l"><span>Criaram conta</span><b>${f.criaram}</b></div><div class="barra"><span style="width:${f.criaram ? 100 : 0}%"></span></div></div>
            ${etapa('Lançaram algo', f.lancaram)}
            ${etapa('Importaram extrato', f.importaram)}
            ${etapa('Ligaram o lembrete', f.lembrete)}
            ${etapa('Compraram', f.compraram, f.passaram_teste ? ` · das que já passaram dos 12 dias: ${f.compraram_depois_teste} de ${f.passaram_teste}` : '')}
          </div>
        </div>
      </div>

      <div class="adm-duas">
        ${todas ? `${contas}${pagamentos('adm-cheia')}` : `${ultimos}${pagamentos('')}`}
      </div>`;
    desenharNovas();
    if (todas) {
      if (!celular.matches && !todas.some(c => c.id === selId)) selId = null;
      desenharProcurar();
      desenharContas();
    }
  }

  /* ---------- Para procurar hoje ----------
     Os grupos (do mais urgente para o menos) com gente que ainda não foi contatada:
     conta sem estado ou marcada "A contatar". Quem for marcado como contatado sai daqui. */

  const SUBS = {
    vence: 'Renovação', acaba: 'Ainda sem licença', muito: '30 ou mais lançamentos',
    acabou: 'Teste acabou, sem licença', pararam: 'Usavam e pararam', nada: 'Travaram no começo',
  };
  const naoContatada = c => !c.estado || c.estado === 'a_contatar';

  function desenharProcurar() {
    const el = $('#procurarHoje');
    if (!el) return;
    const blocos = PRIORIDADE.map(g => ({ g, lista: todas.filter(c => c.grupos.includes(g) && naoContatada(c)) })).filter(b => b.lista.length);
    const nomeGrupo = g => GRUPOS.find(x => x[0] === g)[1];
    el.innerHTML = `<h2>Para procurar hoje</h2><p class="sub">Quem ainda não foi contatado, do grupo mais urgente para o menos</p>
      ${blocos.length ? `<div class="proc-lista">${blocos.map(({ g, lista }) => `
        <div class="proc-grupo"><div class="proc-nome"><b><span class="proc-n">${lista.length}</span>${esc(nomeGrupo(g))}</b><small>${esc(SUBS[g])}</small></div>
          <div class="proc-nomes">${lista.slice(0, 3).map(c => `<button type="button" class="proc-conta" data-abrir="${esc(c.id)}" data-no-grupo="${g}" title="Abrir a ficha de ${esc(c.email)}">${esc(c.email)}</button>`).join('')}
            ${lista.length > 3 ? `<span class="proc-resto">e mais ${lista.length - 3}</span>` : ''}</div>
          <button type="button" class="proc-mais" data-ver-grupo="${g}">Ver todos</button></div>`).join('')}</div>`
        : '<p class="proc-vazio">Tudo em dia: ninguém para procurar agora.</p>'}`;
  }

  // leva para a lista de Contas, já no grupo (e, se pedido, com a ficha de uma conta aberta)
  function irParaContas(g, id) {
    grupo = g;
    busca = '';
    const caixa = $('#buscaContas');
    if (caixa) caixa.value = '';
    selId = id || null;
    desenharContas();
    $('#cartaoContas').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- Contas: grupos, lista e ficha ---------- */

  const contaAberta = () => todas.find(c => c.id === selId) || null;
  const contatoTxt = c => (c.estado ? `<span class="adm-contato">${ESTADOS[c.estado]}</span>` : '<span class="adm-contato novo">Sem contato</span>');

  function filtradas() {
    const termo = busca.trim().toLowerCase();
    return todas.filter(c => (grupo === 'todos' || c.grupos.includes(grupo)) && (!termo || String(c.email).toLowerCase().includes(termo)));
  }

  // grupos e lista (a busca fica fora daqui, para a digitação não perder o foco)
  function desenharContas() {
    const g = GRUPOS.find(x => x[0] === grupo);
    $('#gruposContas').innerHTML = GRUPOS.map(([k, nome]) => {
      const n = k === 'todos' ? todas.length : todas.filter(c => c.grupos.includes(k)).length;
      return `<button type="button" class="adm-grupo ${k === grupo ? 'on' : ''}" data-grupo="${k}" aria-pressed="${k === grupo}">${nome} <b>${n}</b></button>`;
    }).join('');
    $('#dicaContas').textContent = g[2];
    const lista = filtradas();
    // no computador a ficha sempre mostra alguém; no celular só depois do toque
    if (!celular.matches && !lista.some(c => c.id === selId)) selId = lista.length ? lista[0].id : null;
    $('#listaContas').innerHTML = lista.length ? lista.map(c => `
      <tr data-conta="${esc(c.id)}" class="${c.id === selId ? 'sel' : ''}" tabindex="0">
        <td>${esc(c.email)}${c.provedor === 'google' ? ' <span class="muted">· Google</span>' : ''}</td>
        <td class="muted">${c.ultimo_uso ? quando(c.ultimo_uso) : 'nunca'}</td>
        <td class="r num">${c.lancamentos}</td><td>${situacao(c)}</td><td>${contatoTxt(c)}</td></tr>`).join('')
      : `<tr><td colspan="5" class="muted adm-vazio">${busca.trim() ? 'Nenhuma conta com esse e-mail.' : 'Ninguém neste grupo agora.'}</td></tr>`;
    const total = plural(todas.length, 'conta', 'contas');
    $('#rodapeContas').innerHTML = lista.length === todas.length ? `<span>${total}</span><span>Role a lista para ver as mais antigas</span>` : `<span>${lista.length} de ${total}</span>`;
    desenharFicha();
  }

  const mailto = (c, chave) => {
    const m = MENSAGENS[chave];
    return `mailto:${encodeURIComponent(c.email).replace(/%40/g, '@')}?subject=${encodeURIComponent(m[1])}&body=${encodeURIComponent(m[2])}`;
  };

  function desenharFicha() {
    const el = $('#fichaConta');
    const c = contaAberta();
    el.classList.toggle('aberta', !!c && celular.matches);
    document.body.classList.toggle('adm-ficha-aberta', !!c && celular.matches);
    if (!c) {
      el.innerHTML = '<p class="sub adm-ficha-vazia">Escolha uma conta na lista para ver a ficha.</p>';
      return;
    }
    const chave = c.mensagem || (c.mensagem = mensagemPadrao(c));
    const m = MENSAGENS[chave];
    el.innerHTML = `
      <div class="adm-ficha-topo"><span class="adm-ficha-av" aria-hidden="true">${esc((c.email[0] || '?').toUpperCase())}</span>
        <div><b>${esc(c.email)}</b><small>Entrou por ${c.provedor === 'google' ? 'Google' : 'e-mail'} · cadastro ${quando(c.criado_em)}</small></div>
        <button type="button" class="adm-ficha-fechar" data-fechar-ficha aria-label="Fechar a ficha">${ic('x')}</button></div>
      <h3>Uso</h3>
      <dl class="adm-dados">
        <div><dt>Última vez</dt><dd>${c.ultimo_uso ? quando(c.ultimo_uso) : 'Ainda não lançou'}</dd></div>
        <div><dt>Lançamentos</dt><dd>${c.lancamentos}</dd></div>
        <div><dt>Importou extrato</dt><dd>${c.importou ? 'Sim' : 'Não'}</dd></div>
        <div><dt>Lembrete das 19h</dt><dd>${c.lembrete ? 'Sim' : 'Não'}</dd></div>
        <div><dt>Duas etapas</dt><dd>${c.duas_etapas ? 'Sim' : 'Não'}</dd></div>
        <div><dt>Licença</dt><dd>${situacao(c)}${c.validade ? ` <span class="muted">até ${dataCurta(c.validade)}</span>` : ''}</dd></div>
      </dl>
      <h3>Contato</h3>
      <div class="adm-estados">${Object.entries(ESTADOS).map(([k, v]) => `<button type="button" class="adm-estado ${c.estado === k ? 'on' : ''}" data-estado="${k}" aria-pressed="${c.estado === k}">${v}</button>`).join('')}</div>
      <textarea id="notaConta" placeholder="Nota (só você vê). Ex.: pediu para importar o extrato do Nubank" aria-label="Nota" maxlength="2000">${esc(c.nota || '')}</textarea>
      <p class="adm-salvo" id="salvoConta" aria-live="polite"></p>
      <h3>Escrever</h3>
      <select id="mensagemConta" class="adm-select" aria-label="Mensagem">${Object.entries(MENSAGENS).map(([k, v]) => `<option value="${k}" ${k === chave ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>
      <div class="adm-previa" id="previaConta">${esc(m[2])}</div>
      <div class="adm-acoes"><a class="adm-escrever" id="escreverConta" href="${mailto(c, chave)}">${ic('carta')}Escrever para ${esc(c.email.split('@')[0])}</a>
        <button type="button" class="adm-copiar" data-copiar>Copiar e-mail</button></div>
      <p class="adm-aviso-mini">Abre o seu e-mail com o assunto e o texto prontos; você revisa e envia. Nada sai do painel.</p>`;
  }

  // grava o estado e a nota da conta aberta (a nota espera a pessoa parar de digitar)
  let esperaNota = null;
  async function salvarContato(c) {
    clearTimeout(esperaNota);
    const aviso = $('#salvoConta');
    if (aviso) aviso.textContent = 'Salvando…';
    const { error } = await GS.supabase.rpc('painel_admin_contato', { p_user: c.id, p_estado: c.estado || null, p_nota: c.nota || '' });
    const agora = $('#salvoConta');
    if (agora && c.id === selId) agora.textContent = error ? 'Não foi possível salvar. Tente de novo.' : 'Salvo.';
    if (!error) {
      // a linha da lista mostra o estado
      const linha = document.querySelector(`#listaContas tr[data-conta="${CSS.escape(c.id)}"] td:last-child`);
      if (linha) linha.innerHTML = contatoTxt(c);
    }
  }

  /* ---------- Métricas (função painel_admin_metricas) ---------- */

  const NOME_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const mesCurto = chave => { const [a, m] = chave.split('-').map(Number); return `${NOME_MES[m - 1]}/${String(a).slice(2)}`; };
  const somarMes = (chave, n) => { const [a, m] = chave.split('-').map(Number); const d = new Date(a, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const pctTxt = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const moedaCurta = v => moeda(v).replace(/,00$/, '');
  // escala "redonda" para o eixo (1, 2, 2,5 ou 5 × 10^n)
  const escala = (maximo, linhas = 4) => {
    if (maximo <= 0) return { max: linhas, passo: 1 };
    const bruto = maximo / linhas;
    const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
    const passo = [1, 2, 2.5, 5, 10].map(m => m * pot).find(v => v >= bruto);
    return { max: Math.ceil(maximo / passo) * passo, passo };
  };

  // mini gráfico de tendência dos KPIs
  function spark(vals, cor, preencher) {
    const W = 200, H = 38;
    if (vals.length < 2) return '';
    const max = Math.max(...vals), min = Math.min(...vals);
    const pts = vals.map((v, i) => [i * W / (vals.length - 1), H - 4 - (H - 8) * (v - min) / ((max - min) || 1)]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const u = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d} L${W},${H} L0,${H} Z" fill="${preencher}"/>
      <path d="${d}" fill="none" stroke="${cor}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><circle cx="${u[0]}" cy="${u[1]}" r="3" fill="${cor}"/></svg>`;
  }

  // comparação com o período anterior: { classe, texto }
  function delta(dif, formato, quando) {
    if (dif == null) return '';
    const classe = dif > 0 ? 'sobe' : dif < 0 ? 'desce' : 'igual';
    const sinal = dif > 0 ? '+' : dif < 0 ? '−' : '';
    return `<div class="adm-delta ${classe}">${dif ? ic(dif > 0 ? 'sobe' : 'desce') : ''}${dif ? `${sinal}${formato(Math.abs(dif))}` : 'igual'} <span>${quando}</span></div>`;
  }

  function desenharKpis() {
    const m = met;
    const antes = dias ? `vs. ${dias} dias antes` : '';
    const pctN = (a, b) => (b ? Math.round((a / b) * 100) : null);
    const serieP = s => s.map(([n, a]) => (n ? (a / n) * 100 : 0));
    const vir = pctN(m.viraram.ativas, m.viraram.contas), virA = pctN(m.viraram.ativas_antes, m.viraram.contas_antes);
    const con = pctN(m.conversao.compraram, m.conversao.contas), conA = pctN(m.conversao.compraram_antes, m.conversao.contas_antes);
    const card = (o) => `
      <div class="adm-kp ${o.estrela ? 'estrela' : ''}">
        <small>${ic(o.ic)}${o.rot}</small>
        <div class="v"><b>${o.v}</b>${o.de ? `<span class="de">${o.de}</span>` : ''}</div>
        ${o.delta || ''}
        ${spark(o.serie, o.cor, o.fill)}
        ${o.rodape ? `<span class="kp-rod">${o.rodape}</span>` : ''}
      </div>`;
    $('#kpis').innerHTML = [
      card({ estrela: true, ic: 'raio', rot: 'Ativas na semana', v: m.ativas.agora, de: `de ${m.ativas.total} contas`,
        delta: delta(m.ativas.agora - m.ativas.antes, n => n, 'vs. semana passada'), serie: m.ativas.serie, cor: '#8FD9B6', fill: 'rgba(143,217,182,.18)',
        rodape: 'lançaram algo nos últimos 7 dias' }),
      card({ ic: 'alvo', rot: 'Viraram ativas', v: vir == null ? '—' : `${vir}%`, de: `${m.viraram.ativas} de ${m.viraram.contas}`,
        delta: m.tem_anterior && vir != null && virA != null ? delta(vir - virA, n => `${n} pts`, antes) : '',
        serie: serieP(m.viraram.serie), cor: '#4A90C8', fill: 'rgba(74,144,200,.12)', rodape: 'lançaram algo nos 3 primeiros dias' }),
      card({ ic: 'pix', rot: 'Conversão do teste', v: con == null ? '—' : `${con}%`, de: `${m.conversao.compraram} de ${m.conversao.contas}`,
        delta: m.tem_anterior && con != null && conA != null ? delta(con - conA, n => `${n} pts`, antes) : '',
        serie: serieP(m.conversao.serie), cor: '#4A90C8', fill: 'rgba(74,144,200,.12)', rodape: `de quem terminou os 12 dias ${nomePeriodoAtual()}` }),
      card({ ic: 'moeda', rot: dias ? `Receita · ${dias} dias` : 'Receita', v: moeda(m.receita.agora), de: '',
        delta: m.tem_anterior ? delta(m.receita.agora - m.receita.antes, moeda, antes) : '',
        serie: m.receita.serie, cor: '#2E9E74', fill: 'rgba(46,158,116,.12)', rodape: `${moeda(m.receita.total)} desde o início` }),
    ].join('');
  }
  const nomePeriodoAtual = () => (dias ? `nos últimos ${dias} dias` : 'desde o início');

  /* Ficam usando? — de cada 10 pessoas, a curva da média e as turmas */
  const pessoa = '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>';
  const rotSemana = k => (k === 0 ? 'Entrou' : k === 4 ? '1 mês' : k === 8 ? '2 meses' : `${k} sem.`);

  function desenharFicam() {
    const el = $('#ficam');
    const turmas = met.turmas.filter(t => t.contas > 0).map(t => ({ ...t, pct: [100, ...t.voltaram.map(v => (v / t.contas) * 100)] }));
    const K = Math.min(8, Math.max(0, ...turmas.map(t => t.voltaram.length)));
    if (!K) {
      el.innerHTML = '<p class="adm-vazio-graf">Ainda não passou uma semana inteira depois dos cadastros. A curva aparece na próxima segunda-feira.</p>';
      return;
    }
    // média ponderada: soma de quem voltou ÷ soma das contas das turmas que já chegaram naquela semana
    const media = [100];
    for (let k = 1; k <= K; k++) {
      const com = turmas.filter(t => t.voltaram.length >= k);
      const n = com.reduce((s, t) => s + t.contas, 0);
      media.push(n ? (com.reduce((s, t) => s + t.voltaram[k - 1], 0) / n) * 100 : 0);
    }
    const kMes = K >= 4 ? 4 : K;
    const linhaDez = (rot, p, sub) => {
      const n = Math.round(p / 10);
      return `<div class="adm-dez-l"><span class="adm-dez-rot">${rot}<small>${sub}</small></span>
        <span class="adm-dez-p">${Array.from({ length: 10 }, (_, i) => `<svg viewBox="0 0 24 24" class="${i < n ? 'on' : ''}" aria-hidden="true">${pessoa}</svg>`).join('')}</span>
        <b>${n || !p ? `${n} de 10` : 'menos de 1 de 10'}</b></div>`;
    };
    // começa comparando com a turma mais recente que tenha pelo menos 3 contas (com 1 ou 2, a porcentagem só dá 0 ou 100)
    const comparaveis = turmas.filter(t => t.voltaram.length >= 1);
    const boas = comparaveis.filter(t => t.contas >= 3);
    if (turmaSel == null || !comparaveis.includes(turmas[turmaSel])) turmaSel = turmas.indexOf((boas.length ? boas : comparaveis)[(boas.length ? boas : comparaveis).length - 1]);

    const W = 520, H = 220, ml = 40, mr = 30, mt = 18, mb = 28;
    const x = i => ml + (W - ml - mr) * i / K, y = v => mt + (H - mt - mb) * (1 - v / 100);
    const caminho = vals => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Porcentagem que continua lançando, semana a semana"><g class="grade">`;
    for (let v = 0; v <= 100; v += 25) s += `<line x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}"/><text x="${ml - 8}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`;
    s += '</g>';
    media.forEach((_, i) => { s += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${rotSemana(i)}</text>`; });
    s += `<path d="${caminho(media)} L${x(K)},${y(0)} L${x(0)},${y(0)} Z" fill="rgba(29,58,94,.07)"/>`;
    s += `<path d="${caminho(media)}" fill="none" stroke="var(--primary)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
    media.forEach((v, i) => {
      s += `<circle cx="${x(i)}" cy="${y(v)}" r="4.5" fill="var(--surface)" stroke="var(--primary)" stroke-width="2.5"/>`;
      if (i) s += `<text class="rot" x="${x(i)}" y="${y(v) - 11}" text-anchor="middle" style="fill:var(--primary);font-size:12px">${Math.round(v)}%</text>`;
    });
    const t = turmas[turmaSel];
    if (t && t.pct.length > 1) {
      const p = t.pct.slice(0, K + 1);
      s += `<path d="${caminho(p)}" fill="none" stroke="var(--ambar)" stroke-width="2.5" stroke-dasharray="6 5" stroke-linecap="round"/>`;
      p.forEach((v, i) => { s += `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="var(--ambar)"/>`; });
    }
    s += '</svg>';

    el.innerHTML = `
      <div class="adm-dez"><p class="adm-dez-frase">De cada <b>10 pessoas</b> que criam conta:</p>
        ${linhaDez('Na semana seguinte', media[1], `${Math.round(media[1])}% voltam a lançar`)}
        ${kMes > 1 ? linhaDez(kMes === 4 ? 'Depois de 1 mês' : `Depois de ${kMes} semanas`, media[kMes], `${Math.round(media[kMes])}% continuam`) : ''}</div>
      ${s}
      <div class="adm-leg"><span><i class="linha" style="background:var(--primary)"></i>Média de todas as turmas</span>
        ${t ? `<span><i class="linha" style="background:var(--ambar)"></i>Turma de ${dataCurta(t.semana)}</span>` : ''}</div>
      <p class="adm-turmas-tit">Turmas: quem entrou em cada semana · toque para comparar com a média</p>
      <div class="adm-turmas">${turmas.slice(-6).map(tt => {
        const i = turmas.indexOf(tt);
        const p1 = tt.pct[1];
        return `<button type="button" class="adm-turma ${i === turmaSel ? 'on' : ''}" data-turma="${i}" ${p1 == null ? 'disabled' : ''}>
          <b>${dataCurta(tt.semana)}</b><small>${plural(tt.contas, 'conta', 'contas')}</small>
          ${p1 == null ? '<em class="cinza">ainda na 1ª semana</em>' : `<em class="${p1 >= media[1] ? 'sobe' : 'desce'}">${Math.round(p1)}% na 1ª semana</em>`}</button>`;
      }).join('')}</div>`;
  }

  /* Ativos por semana — barras e o balanço da semana escolhida */
  function desenharAtivos() {
    let lista = met.semanas;
    const primeira = lista.findIndex(w => w.ativos > 0 || w.pararam > 0);
    lista = primeira < 0 ? lista.slice(-1) : lista.slice(primeira);
    if (semSel == null || semSel >= lista.length) semSel = lista.length - 1;
    const W = 520, H = 190, ml = 8, mt = 22, mb = 26;
    const { max } = escala(Math.max(...lista.map(w => w.ativos), 4));
    const gw = (W - ml) / lista.length, bw = Math.min(54, gw * .58), y = v => mt + (H - mt - mb) * (1 - v / max);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Contas ativas por semana"><g class="grade"><line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"/></g>`;
    lista.forEach((w, i) => {
      const x = ml + gw * i + (gw - bw) / 2, on = i === semSel, atual = i === lista.length - 1;
      s += `<g data-sem="${i}">
        <rect x="${ml + gw * i + 2}" y="2" width="${gw - 4}" height="${H - 4}" rx="12" fill="${on ? 'rgba(29,58,94,.06)' : 'transparent'}"/>
        ${w.ativos ? `<rect x="${x}" y="${y(w.ativos)}" width="${bw}" height="${y(0) - y(w.ativos)}" rx="8" fill="${on ? 'var(--primary)' : '#B9C7D8'}"/>` : ''}
        <text class="rot" x="${x + bw / 2}" y="${y(w.ativos) - 7}" text-anchor="middle" style="font-size:13px;${on ? 'fill:var(--primary)' : ''}">${w.ativos}</text>
        <text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" style="${on ? 'fill:var(--text);font-weight:600' : ''}">${atual ? 'esta semana' : dataCurta(w.semana)}</text></g>`;
    });
    $('#grafAtivos').innerHTML = s + '</svg>';

    const w = lista[semSel];
    const antes = w.ativos - w.novos - w.voltaram + w.pararam;
    const dif = w.ativos - antes;
    const atual = semSel === lista.length - 1;
    const caixa = (v, rot, cls) => `<div class="adm-eq-c ${cls}"><b>${v}</b><small>${rot}</small></div>`;
    const ganhou = w.novos + w.voltaram;
    $('#balanco').innerHTML = `
      <div class="adm-bal-cab"><b>Semana de ${dataCurta(w.semana)}${atual ? ' (em andamento)' : ''}</b>${delta(dif, n => n, 'vs. semana anterior')}</div>
      <div class="adm-eq">
        ${caixa(antes, 'ativos antes', 'base')}<span class="adm-op">+</span>
        ${caixa(w.novos, w.novos === 1 ? 'novo' : 'novos', 'novo')}<span class="adm-op">+</span>
        ${caixa(w.voltaram, 'voltaram', 'voltou')}<span class="adm-op">−</span>
        ${caixa(w.pararam, 'pararam', 'parou')}<span class="adm-op">=</span>
        ${caixa(w.ativos, 'ativos', 'total')}
      </div>
      <p class="adm-bal-frase">${w.pararam > ganhou ? `Perdeu mais do que ganhou: <b>${w.pararam} pararam</b> e ${ganhou} chegaram ou voltaram.`
        : w.pararam < ganhou ? `Ganhou mais do que perdeu: <b>${ganhou} chegaram ou voltaram</b> e ${w.pararam} pararam.`
        : `Empatou: ${ganhou} chegaram ou voltaram e ${w.pararam} pararam.`}${atual ? ' A semana ainda não acabou.' : ''}</p>`;
  }

  /* Do cadastro à compra, com a perda de cada etapa */
  function desenharFunil() {
    const f = met.funil;
    // etapas encadeadas (cada uma está dentro da anterior, menos a compra, que pode vir antes do 2º dia)
    const E = [['Criaram conta', f.criaram], ['Lançaram algo', f.lancaram], ['Lançaram em 2 dias diferentes', f.dois_dias], ['Compraram', f.compraram]];
    const tempo = mn => (mn == null ? null : mn < 60 ? plural(mn, 'minuto', 'minutos') : mn < 1440 ? plural(Math.round(mn / 60), 'hora', 'horas') : plural(Math.round(mn / 1440), 'dia', 'dias'));
    $('#funil2').innerHTML = f.criaram ? `<div class="adm-funil2">${E.map(([n, v], i) => `
      ${i && E[i - 1][1] > v ? `<div class="adm-f-perda"><span></span><span>${ic('desce')}perdeu ${E[i - 1][1] - v} (${Math.round((1 - v / E[i - 1][1]) * 100)}%)</span></div>` : ''}
      <div class="adm-f-et"><span class="nome">${n}</span><div class="trilho">${v ? `<span style="width:${Math.max(14, (v / f.criaram) * 100)}%">${pctTxt(v, f.criaram)}</span>` : ''}</div><b>${v}</b></div>`).join('')}</div>
      ${tempo(f.mediana_min) ? `<div class="adm-nota">${ic('relogio')}<span>Do cadastro ao primeiro lançamento: <b>metade leva até ${tempo(f.mediana_min)}</b>.</span></div>` : ''}`
      : '<p class="adm-vazio-graf">Ninguém criou conta neste período.</p>';
  }

  function desenharUsos() {
    const u = met.uso;
    const L = [['extrato', 'Importaram extrato', u.importaram], ['cartao', 'Cartão de crédito', u.cartao], ['repetir', 'Contas recorrentes', u.recorrentes],
      ['trending', 'Investimentos', u.investimentos], ['sino', 'Lembrete das 19h', u.lembrete], ['presente', 'Indicaram amigos', u.indicaram]];
    $('#usos').innerHTML = u.ativos ? L.sort((a, b) => b[2] - a[2]).map(([i, n, v]) => `
      <div class="adm-uso-l">${ic(i)}<span>${n}</span><b>${v} <small>· ${pctTxt(v, u.ativos)}</small></b><div class="bar2"><span style="width:${(v / u.ativos) * 100}%"></span></div></div>`).join('')
      : '<p class="adm-vazio-graf">Ninguém lançou nada nos últimos 30 dias.</p>';
  }

  /* Receita por mês, por canal, com o acumulado */
  const CANAIS = [['pix', 'Pix', 'var(--c-pix)'], ['apple', 'Apple', 'var(--c-apple)'], ['google', 'Google', 'var(--c-google)']];
  function desenharReceita() {
    const el = $('#grafReceita');
    const linhas = met.receita_mes;
    if (!linhas.length) { el.innerHTML = '<p class="adm-vazio-graf">Nenhuma compra ainda.</p>'; return; }
    const hojeMes = met.hoje.slice(0, 7);
    const meses = [];
    for (let m = linhas[0].mes; m <= hojeMes; m = somarMes(m, 1)) meses.push(m);
    const vistos = meses.slice(-8);
    const futuros = Array.from({ length: Math.max(0, 6 - vistos.length) }, (_, i) => somarMes(hojeMes, i + 1));
    const todos = [...vistos, ...futuros];
    const valor = (m, c) => (linhas.find(l => l.mes === m && l.canal === c) || { valor: 0 }).valor;
    let acum = meses.slice(0, meses.length - vistos.length).reduce((s, m) => s + CANAIS.reduce((t, [c]) => t + Number(valor(m, c)), 0), 0);
    const totais = vistos.map(m => CANAIS.reduce((t, [c]) => t + Number(valor(m, c)), 0));
    const { max, passo } = escala(Math.max(acum + totais.reduce((a, b) => a + b, 0), ...totais), 3);
    const W = 520, H = 240, ml = 54, mt = 16, mb = 40;
    const y = v => mt + (H - mt - mb) * (1 - v / max);
    const gw = (W - ml) / todos.length, bw = Math.min(46, gw * .5);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Receita por mês"><g class="grade">`;
    for (let v = 0; v <= max + passo / 1000; v += passo) s += `<line x1="${ml}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${ml - 8}" y="${y(v) + 4}" text-anchor="end">${v ? moedaCurta(v) : '0'}</text>`;
    s += '</g>';
    const pts = [];
    todos.forEach((m, i) => {
      const x = ml + gw * i + (gw - bw) / 2, visto = i < vistos.length;
      if (visto) {
        let base = 0;
        const partes = CANAIS.map(([c, , cor]) => [Number(valor(m, c)), cor]).filter(([v]) => v > 0);
        partes.forEach(([v, cor], j) => {
          s += `<rect x="${x}" y="${y(base + v)}" width="${bw}" height="${Math.max(1, y(base) - y(base + v) - (j < partes.length - 1 ? 1.5 : 0))}" rx="${j === partes.length - 1 ? 6 : 2}" fill="${cor}"/>`;
          base += v;
        });
        acum += base;
        pts.push([x + bw / 2, y(acum)]);
        s += `<text class="rot" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${base ? moeda(base) : '—'}</text>`;
      }
      s += `<text x="${x + bw / 2}" y="${H - 22}" text-anchor="middle" ${visto ? '' : 'style="opacity:.5"'}>${mesCurto(m)}</text>`;
    });
    if (pts.length) {
      s += `<path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')}" fill="none" stroke="var(--ok)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      pts.forEach(p => { s += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="var(--surface)" stroke="var(--ok)" stroke-width="2.5"/>`; });
      const u = pts[pts.length - 1];
      s += `<text x="${u[0] + 10}" y="${u[1] + 4}" style="fill:var(--ok);font-weight:700;font-size:12px">${moedaCurta(acum)} no total</text>`;
    }
    el.innerHTML = s + '</svg>';
  }

  function desenharRenovacoes() {
    const el = $('#grafRenova');
    const r = met.renovacoes;
    if (!r.length) { el.innerHTML = '<p class="adm-vazio-graf">Nenhuma licença comprada para renovar.</p>'; return; }
    const ini = r[0].mes;
    const meses = Array.from({ length: 6 }, (_, i) => somarMes(ini, i));
    const n = m => (r.find(x => x.mes === m) || { licencas: 0 }).licencas;
    const W = 400, H = 170, mt = 18, mb = 24;
    const { max } = escala(Math.max(...meses.map(n), 2));
    const gw = W / meses.length, bw = Math.min(40, gw * .5), y = v => mt + (H - mt - mb) * (1 - v / max);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Licenças que vencem por mês"><g class="grade"><line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"/></g>`;
    meses.forEach((m, i) => {
      const x = gw * i + (gw - bw) / 2, v = n(m);
      s += v ? `<rect x="${x}" y="${y(v)}" width="${bw}" height="${y(0) - y(v)}" rx="6" fill="var(--c-novo)"/><text class="rot" x="${x + bw / 2}" y="${y(v) - 6}" text-anchor="middle">${v}</text>`
        : `<rect x="${x}" y="${y(0) - 3}" width="${bw}" height="3" rx="1.5" fill="var(--chip)"/>`;
      s += `<text x="${x + bw / 2}" y="${H - 4}" text-anchor="middle">${mesCurto(m)}</text>`;
    });
    const total = r.reduce((a, b) => a + b.licencas, 0);
    el.innerHTML = `${s}</svg><div class="adm-nota">${ic('calendario')}<span>A primeira leva vence em <b>${mesCurto(ini)}</b>: ${plural(r[0].licencas, 'licença', 'licenças')} (${total} no total). O grupo "Licença vence em 30 dias" avisa na hora.</span></div>`;
  }

  /* Quem comprou */
  const NOME_CANAL = { pix: 'Pix', apple: 'Apple', google: 'Google' };
  const COR_CANAL = { pix: 'var(--c-pix)', apple: 'var(--c-apple)', google: 'var(--c-google)' };
  const diasDesde = ts => Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  const usando = c => c.ultimo_uso && diasDesde(c.ultimo_uso) < 7;
  const venceLogo = c => (new Date(c.validade + 'T00:00:00') - Date.now()) / 86400000 <= 30;
  const FILTROS_CMP = [['todos', 'Todos', () => true], ['usando', 'Usando', usando], ['pararam', 'Pararam', c => !usando(c)], ['vence', 'Vence em 30 dias', venceLogo]];

  function desenharCompradores() {
    const el = $('#compradores');
    const lista = met.compradores;
    const total = lista.reduce((s, c) => s + Number(c.valor), 0);
    const pessoas = new Set(lista.map(c => c.id)).size;
    const porCanal = Object.keys(NOME_CANAL).map(k => [k, lista.filter(c => c.canal === k).length]).filter(([, n]) => n);
    el.innerHTML = `<h2>Quem comprou</h2><p class="sub">Todas as compras, da mais recente para a mais antiga · compras de teste ficam de fora</p>
      <div class="adm-resumo">
        <div><small>Compradores</small><b>${pessoas}</b></div>
        <div><small>Receita total</small><b>${moeda(total)}</b></div>
        <div><small>Ticket médio</small><b>${lista.length ? moeda(total / lista.length) : '—'}</b></div>
        <div><small>Por canal</small><div class="adm-canais">${porCanal.length ? porCanal.map(([k, n]) => `<span><i style="background:${COR_CANAL[k]}"></i>${n} ${NOME_CANAL[k]}</span>`).join('') : '—'}</div></div>
      </div>
      <div class="adm-filtros"><div class="adm-grupos" id="filtrosCmp" role="group" aria-label="Filtrar compradores"></div>
        <label class="adm-busca">${ic('lupa')}<input type="search" id="buscaCmp" placeholder="Buscar por e-mail" aria-label="Buscar comprador por e-mail" autocomplete="off" spellcheck="false" value="${esc(buscaCmp)}"></label></div>
      <div class="adm-cmp"><table><thead><tr><th>Conta</th><th>Canal</th><th>Comprou em</th><th class="r">Valor</th><th>Vence em</th><th>Uso nas últimas 8 semanas</th><th>Situação</th></tr></thead>
        <tbody id="listaCmp"></tbody></table></div>
      <div class="adm-rodape-lista" id="rodapeCmp"></div>`;
    desenharListaCmp();
  }

  function desenharListaCmp() {
    const lista = met.compradores;
    $('#filtrosCmp').innerHTML = FILTROS_CMP.map(([k, nome, f]) =>
      `<button type="button" class="adm-grupo ${k === filtroCmp ? 'on' : ''}" data-filtro-cmp="${k}" aria-pressed="${k === filtroCmp}">${nome} <b>${lista.filter(f).length}</b></button>`).join('');
    const filtro = FILTROS_CMP.find(x => x[0] === filtroCmp)[2];
    const termo = buscaCmp.trim().toLowerCase();
    const vis = lista.filter(c => filtro(c) && (!termo || String(c.email).toLowerCase().includes(termo)));
    const sit = c => {
      if (!c.ultimo_uso) return '<span class="selo neutro">Nunca lançou</span>';
      const d = diasDesde(c.ultimo_uso);
      return d < 7 ? '<span class="selo ok">Usando</span>' : `<span class="selo ${d < 30 ? 'alerta' : 'erro'}">Parou há ${plural(d, 'dia', 'dias')}</span>`;
    };
    $('#listaCmp').innerHTML = vis.length ? vis.map(c => {
      const mx = Math.max(1, ...c.semanas);
      return `<tr ${todas && todas.some(t => t.id === c.id) ? `data-conta-cmp="${esc(c.id)}" title="Abrir a ficha da conta"` : ''}>
        <td><div class="adm-quem"><span class="adm-av" aria-hidden="true">${esc((c.email[0] || '?').toUpperCase())}</span><div>${esc(c.email)}<small>${plural(c.lancamentos, 'lançamento', 'lançamentos')}</small></div></div></td>
        <td><span class="adm-canal"><i style="background:${COR_CANAL[c.canal]}"></i>${NOME_CANAL[c.canal]}</span></td>
        <td class="muted">${dataCurta(c.emitida)}</td><td class="r num">${moeda(c.valor)}</td><td class="muted">${dataCurta(c.validade)} ${c.validade.slice(0, 4)}</td>
        <td><span class="adm-mini-uso" aria-label="${c.semanas.join(', ')} lançamentos por semana">${c.semanas.map(v => `<i class="${v ? '' : 'z'}" style="height:${v ? 4 + 14 * v / mx : 3}px"></i>`).join('')}</span></td>
        <td>${sit(c)}</td></tr>`;
    }).join('') : `<tr><td colspan="7" class="muted adm-vazio">${lista.length ? 'Ninguém com esse filtro.' : 'Nenhuma compra ainda.'}</td></tr>`;
    $('#rodapeCmp').innerHTML = `<span>${vis.length === lista.length ? plural(lista.length, 'compra', 'compras') : `${vis.length} de ${plural(lista.length, 'compra', 'compras')}`}</span>${todas ? '<span>Toque numa linha para abrir a ficha da conta</span>' : ''}`;
  }

  /* Contas novas por dia, com os dias de divulgação e a média de 7 dias */
  function desenharNovas() {
    const el = $('#grafNovas');
    const lista = dados.por_dia.slice(-120);
    if (!lista.length) { el.innerHTML = ''; return; }
    const divulgou = new Set(dados.divulgacoes);
    const { max, passo } = escala(Math.max(...lista.map(x => x.contas), 3), 3);
    const W = 1100, H = 190, ml = 24, mt = 14, mb = 24;
    const y = v => mt + (H - mt - mb) * (1 - v / max), gw = (W - ml) / lista.length, bw = Math.max(2, gw * .62);
    const media = lista.map((_, i) => { const j = lista.slice(Math.max(0, i - 6), i + 1); return j.reduce((a, b) => a + b.contas, 0) / j.length; });
    const cada = Math.max(1, Math.ceil(lista.length / 7));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Contas novas por dia"><g class="grade">`;
    for (let v = 0; v <= max + passo / 1000; v += passo) s += `<line x1="${ml}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${ml - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    s += '</g>';
    lista.forEach((d, i) => {
      const x = ml + gw * i + (gw - bw) / 2, zap = divulgou.has(d.dia);
      s += `<g data-dia="${d.dia}"><title>${dataCurta(d.dia)}: ${plural(d.contas, 'conta nova', 'contas novas')}${zap ? ' · divulgou' : ''}</title>
        <rect x="${ml + gw * i}" y="${mt}" width="${gw}" height="${H - mt - mb}" rx="${Math.min(6, gw / 3)}" fill="${zap ? 'rgba(233,162,27,.12)' : 'transparent'}"/>
        ${d.contas ? `<rect x="${x}" y="${y(d.contas)}" width="${bw}" height="${y(0) - y(d.contas)}" rx="${Math.min(4, bw / 3)}" fill="${zap ? 'var(--ambar)' : 'var(--c-novo)'}"/>` : ''}</g>`;
      if ((lista.length - 1 - i) % cada === 0) s += `<text x="${x + bw / 2}" y="${H - 4}" text-anchor="middle">${dataCurta(d.dia)}</text>`;
    });
    s += `<path d="${media.map((m, i) => `${i ? 'L' : 'M'}${(ml + gw * i + gw / 2).toFixed(1)},${y(m).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>`;
    el.innerHTML = s + '</svg>';
  }

  // cliques e digitação nas contas
  $('#corpo').addEventListener('click', e => {
    // métricas: turma, semana, filtro e linha de comprador
    const turma = e.target.closest('[data-turma]');
    if (turma) { turmaSel = Number(turma.dataset.turma); desenharFicam(); return; }
    const sem = e.target.closest('[data-sem]');
    if (sem) { semSel = Number(sem.dataset.sem); desenharAtivos(); return; }
    const filtro = e.target.closest('[data-filtro-cmp]');
    if (filtro) { filtroCmp = filtro.dataset.filtroCmp; desenharListaCmp(); return; }
    const comprador = e.target.closest('tr[data-conta-cmp]');
    if (comprador) return irParaContas('todos', comprador.dataset.contaCmp);
    const abrir = e.target.closest('[data-abrir]');
    if (abrir) return irParaContas(abrir.dataset.noGrupo, abrir.dataset.abrir);
    const verGrupo = e.target.closest('[data-ver-grupo]');
    if (verGrupo) return irParaContas(verGrupo.dataset.verGrupo, null);
    const g = e.target.closest('[data-grupo]');
    if (g) {
      grupo = g.dataset.grupo;
      desenharContas();
      return;
    }
    const linha = e.target.closest('tr[data-conta]');
    if (linha) {
      selId = linha.dataset.conta;
      desenharContas();
      return;
    }
    if (e.target.closest('[data-fechar-ficha]')) {
      selId = null;
      desenharFicha();
      document.querySelectorAll('#listaContas tr.sel').forEach(t => t.classList.remove('sel'));
      return;
    }
    const c = todas && contaAberta();
    const estado = e.target.closest('[data-estado]');
    if (estado && c) {
      c.estado = c.estado === estado.dataset.estado ? null : estado.dataset.estado;   // tocar de novo tira o estado
      c.nota = ($('#notaConta') || {}).value ?? c.nota;
      desenharFicha();
      desenharProcurar();
      salvarContato(c);
      return;
    }
    if (e.target.closest('[data-copiar]') && c) {
      const botao = e.target.closest('[data-copiar]');
      const pronto = () => { botao.textContent = 'Copiado'; setTimeout(() => { botao.textContent = 'Copiar e-mail'; }, 1800); };
      (navigator.clipboard ? navigator.clipboard.writeText(c.email) : Promise.reject()).then(pronto).catch(() => {
        const t = document.createElement('textarea');
        t.value = c.email;
        document.body.append(t);
        t.select();
        try { document.execCommand('copy'); pronto(); } catch (err) { /* sem permissão: segue */ }
        t.remove();
      });
    }
  });
  $('#corpo').addEventListener('keydown', e => {
    const linha = e.target.closest('tr[data-conta]');
    if (linha && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      linha.click();
    }
  });
  $('#corpo').addEventListener('input', e => {
    if (e.target.id === 'buscaContas') {
      busca = e.target.value;
      desenharContas();
    } else if (e.target.id === 'buscaCmp') {
      buscaCmp = e.target.value;
      desenharListaCmp();
    } else if (e.target.id === 'notaConta') {
      const c = contaAberta();
      if (!c) return;
      c.nota = e.target.value;
      $('#salvoConta').textContent = '';
      clearTimeout(esperaNota);
      esperaNota = setTimeout(() => salvarContato(c), 700);
    }
  });
  $('#corpo').addEventListener('change', e => {
    if (e.target.id !== 'mensagemConta') return;
    const c = contaAberta();
    if (!c) return;
    c.mensagem = e.target.value;
    $('#previaConta').textContent = MENSAGENS[c.mensagem][2];
    $('#escreverConta').href = mailto(c, c.mensagem);
  });

  // marcar/desmarcar divulgação no dia
  $('#corpo').addEventListener('click', async e => {
    const b = e.target.closest('[data-dia]');
    if (!b) return;
    const dia = b.dataset.dia;
    const marcar = !dados.divulgacoes.includes(dia);
    const antes = dados.divulgacoes;
    dados.divulgacoes = marcar ? [...antes, dia] : antes.filter(x => x !== dia);
    desenharNovas();
    const { error } = await GS.supabase.rpc('marcar_divulgacao', { p_dia: dia, p_marcar: marcar });
    if (error) {
      dados.divulgacoes = antes;
      desenharNovas();
    }
  });

  document.querySelectorAll('[data-dias]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-dias]').forEach(x => x.classList.toggle('on', x === b));
    dias = Number(b.dataset.dias);
    carregar();
  }));

  carregar();
})();
