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
    const [{ data, error }, completa] = await Promise.all([
      GS.supabase.rpc('painel_admin', { p_dias: dias }),
      GS.supabase.rpc('painel_admin_contas').then(r => (r.error ? null : r.data), () => null),
    ]);
    todas = completa;
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

    $('#corpo').innerHTML = `
      <div class="adm-kpis">
        <div class="adm-kpi"><small>${ic('pessoa')}Contas novas</small><b>${d.contas_novas}</b><span class="var">${dias === 7 ? nomePeriodo : `+${d.contas_7d} nos últimos 7 dias`}</span></div>
        <div class="adm-kpi"><small>${ic('relogio')}No teste grátis agora</small><b>${d.em_teste}</b><span class="var cinza">${d.teste_acaba_amanha ? `${plural(d.teste_acaba_amanha, 'acaba', 'acabam')} amanhã` : 'nenhum acaba amanhã'}</span></div>
        <div class="adm-kpi"><small>${ic('pix')}Compras</small><b>${d.compras}</b><span class="var">${moeda(d.receita)} recebidos</span></div>
        <div class="adm-kpi"><small>${ic('raio')}Usaram nos últimos 7 dias</small><b>${d.ativos_7d}</b><span class="var cinza">lançaram pelo menos 1 gasto</span></div>
      </div>

      ${todas ? '<div class="adm-card" id="procurarHoje" aria-label="Para procurar hoje"></div>' : ''}

      <div class="adm-duas">
        <div class="adm-card"><h2>Contas novas por dia</h2>
          <p class="sub">${nomePeriodo[0].toUpperCase() + nomePeriodo.slice(1)} · toque num dia para marcar que divulgou</p>
          <div class="adm-barras" data-barras></div>
          <div class="adm-eixo" data-eixo></div>
          <div class="adm-legenda"><i></i>Dia com divulgação</div>
        </div>
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
    desenharBarras();
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

  function desenharBarras() {
    const lista = dados.por_dia.slice(-120);
    const max = Math.max(1, ...lista.map(x => x.contas));
    const divulgou = new Set(dados.divulgacoes);
    $('[data-barras]').innerHTML = lista.map(x => `
      <button type="button" class="${divulgou.has(x.dia) ? 'zap' : ''}" data-dia="${x.dia}"
        title="${dataCurta(x.dia)}: ${plural(x.contas, 'conta nova', 'contas novas')}${divulgou.has(x.dia) ? ' · divulgou' : ''}"
        aria-label="${dataCurta(x.dia)}: ${plural(x.contas, 'conta nova', 'contas novas')}">
        <i style="height:${Math.max(2, (x.contas / max) * 100)}%">${x.contas ? `<span>${x.contas}</span>` : ''}</i>
      </button>`).join('');
    const meio = lista[Math.floor(lista.length / 2)];
    $('[data-eixo]').innerHTML = lista.length ? `<span>${dataCurta(lista[0].dia)}</span><span>${dataCurta(meio.dia)}</span><span>${dataCurta(lista[lista.length - 1].dia)}</span>` : '';
  }

  // cliques e digitação nas contas
  $('#corpo').addEventListener('click', e => {
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
    b.classList.toggle('zap', marcar);
    const { error } = await GS.supabase.rpc('marcar_divulgacao', { p_dia: dia, p_marcar: marcar });
    if (error) {
      b.classList.toggle('zap', !marcar);
      return;
    }
    dados.divulgacoes = marcar ? [...dados.divulgacoes, dia] : dados.divulgacoes.filter(x => x !== dia);
    desenharBarras();
  });

  document.querySelectorAll('[data-dias]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-dias]').forEach(x => x.classList.toggle('on', x === b));
    dias = Number(b.dataset.dias);
    carregar();
  }));

  carregar();
})();
