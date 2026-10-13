/* =========================================================
   GSCASH — licença anual, ligada à conta
   A situação vem do banco (rpc minha_licenca) e a ativação passa pela
   Edge Function "ativar-licenca", que confere a chave e a prende à conta
   (uma chave, uma conta). Vale igual no navegador e no app de computador.

   Situações:
   · teste        — conta nova, nos 7 dias grátis (faixa azul)
   · teste-acabou — sem chave depois do teste: só leitura (faixa vermelha)
   · ativa / vencendo (30 dias ou menos) / vencida (só leitura)
   O banco também recusa gravar sem licença: aqui é só a parte visível.
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const { icone, esc } = GS;

  // preço anual em promoção (centavos)
  const PRECO_DE = 7000;
  const PRECO_POR = 5000;
  const fmtPreco = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const preco = centavos => fmtPreco.format(centavos / 100);  // não usa GS.moeda: o preço aparece mesmo com valores ocultos

  // "Quero comprar": WhatsApp de quem vende (o mesmo número do app.py)
  const WHATSAPP_VENDAS = '5573999239911';
  const MENSAGEM_COMPRA = 'Olá! Quero comprar a licença do GSCASH.';

  // botões que gravam algo: no modo só leitura ficam travados
  // (a mesma lista está em css/licenca.css)
  const ESCRITA = [
    '[data-acao="novo-gasto"]', '[data-acao="transferir"]',
    '[data-acao="configurar"]', '[data-acao="pagar"]', '[data-acao="adiantar"]', '[data-acao="desfazer"]',
    '#novaCarteira', '#novaCategoria', '#definirOrcamento', '#configurar',
    '[data-editar]', '[data-excluir]', '[data-editar-credito]', '[data-switch]', 'button[data-saldo]', '[data-orcamento]',
    '[data-passo]',
  ].join(',');

  let info = { estado: 'livre' };

  const data = d => GS.dataMedia(d);  // 5 out 2027 (texto "2027-10-05" ou Date)
  const dias = n => (n === 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias`);
  const DIA = 86400000;
  const entreDatas = (de, ate) => Math.round((Date.parse(ate) - Date.parse(de)) / DIA);

  /* ---------- situação da conta ---------- */

  async function lerSituacao() {
    const { data: s, error } = await GS.supabase.rpc('minha_licenca');
    if (error) throw error;
    if (s.validade) {
      const faltam = entreDatas(s.hoje, s.validade);
      return {
        estado: faltam < 0 ? 'vencida' : faltam <= 30 ? 'vencendo' : 'ativa',
        nome: s.nome, validade: s.validade, dias: faltam,
      };
    }
    const testeAte = new Date(s.teste_ate);  // data e hora: 7 dias depois de criar a conta
    const restante = testeAte - Date.now();
    return restante > 0
      ? { estado: 'teste', testeAte, dias: Math.ceil(restante / DIA) }
      : { estado: 'teste-acabou', testeAte };
  }

  // chama a Edge Function; devolve { nome, validade } ou lança o erro em português
  async function enviarChave(chave) {
    const { data: r, error } = await GS.supabase.functions.invoke('ativar-licenca', { body: { chave } });
    if (!error) return r;
    let msg = 'Não foi possível ativar agora. Verifique a conexão e tente de novo.';
    try { msg = (await error.context.json()).erro || msg; } catch (e) { /* sem corpo: fica a mensagem padrão */ }
    throw new Error(msg);
  }

  const pronta = (async () => {
    try {
      info = await lerSituacao();
      // app de computador: a chave que já estava neste computador passa para a conta, sozinha
      if (GS.noDesktop && (info.estado === 'teste' || info.estado === 'teste-acabou')) {
        const local = await (await GS.apiDesktop()).chave_local();
        if (local) {
          try {
            const r = await enviarChave(local);
            info = await lerSituacao();
            setTimeout(() => GS.toast(`A licença deste computador agora está na sua conta (até ${data(r.validade)})`), 800);
          } catch (e) {
            console.warn('Não foi possível ligar a licença deste computador à conta', e);
          }
        }
      }
    } catch (e) {
      // sem internet ou erro: não trava nada aqui (o banco continua conferindo ao gravar)
      console.error('Falha ao ler a licença', e);
      info = { estado: 'livre' };
    }

    GS.somenteLeitura = info.estado === 'vencida' || info.estado === 'teste-acabou';
    if (info.estado === 'teste-acabou') GS.TEXTO_SO_LEITURA = 'Seu teste grátis acabou: o GSCASH está em modo só leitura.';

    if (info.estado === 'teste') faixaTeste();
    else if (info.estado === 'teste-acabou') travar();
    else if (info.estado === 'vencida') travar();
    else if (info.estado === 'vencendo') avisoVencendo();
    return info;
  })();

  async function comprar() {
    if (GS.noDesktop) {
      (await GS.apiDesktop()).comprar_licenca();
      return;
    }
    window.open(`https://wa.me/${WHATSAPP_VENDAS}?text=${encodeURIComponent(MENSAGEM_COMPRA)}`, '_blank', 'noopener');
  }

  /* ---------- campo da chave ---------- */

  function campoChave() {
    const campo = GS.el('div', 'field');
    campo.innerHTML = `
      <label for="chaveLicenca">Chave de licença</label>
      <div class="input chave-campo"><textarea id="chaveLicenca" rows="3" spellcheck="false" autocomplete="off" placeholder="GSC1-…"></textarea></div>`;
    const texto = campo.querySelector('textarea');
    const erro = msg => {
      campo.querySelector('.field-error')?.remove();
      campo.querySelector('.input').classList.toggle('invalid', !!msg);
      if (msg) campo.append(GS.el('span', 'field-error', `${icone('alert')}${esc(msg)}`));
    };
    texto.addEventListener('input', () => erro(null));
    return { el: campo, texto, erro };
  }

  /* ---------- janela "Ativar licença" ---------- */

  function abrirAtivacao() {
    const corpo = GS.el('div', 'ativ-corpo');
    corpo.innerHTML = `
      <p>Cole abaixo a chave de licença que você recebeu. Ela fica ligada à sua conta e vale no computador e no navegador.</p>
      <div data-slot="campo"></div>
      <div class="comprar">
        <div class="comprar-topo"><b>Ainda não tem uma chave?</b><span class="selo-promo">Promoção</span></div>
        <div class="comprar-linha">
          <span class="preco num"><s>${preco(PRECO_DE)}</s>${preco(PRECO_POR)}<small>por ano</small></span>
          <button type="button" class="btn btn-outline" data-comprar>Quero comprar</button>
        </div>
        <p>Pague por Pix e receba a chave pelo WhatsApp.</p>
      </div>`;
    const campo = campoChave();
    corpo.querySelector('[data-slot="campo"]').replaceWith(campo.el);

    const modal = GS.abrirModal({
      titulo: info.estado === 'teste' || info.estado === 'teste-acabou' ? 'Ativar licença' : 'Inserir nova chave',
      corpo,
      rodape: `<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
               <button type="button" class="btn btn-primary" data-ativar>${icone('key')}Ativar</button>`,
      avisoDescarte: 'A chave que você colou ainda não foi ativada.',
    });
    corpo.querySelector('[data-comprar]').addEventListener('click', comprar);

    const botao = modal.foot.querySelector('[data-ativar]');
    const enviar = async () => {
      const chave = campo.texto.value.trim();
      if (!chave) {
        campo.erro('Cole a chave de licença que você recebeu.');
        return campo.texto.focus();
      }
      GS.salvando(botao, true);
      let r;
      try {
        r = await enviarChave(chave);
      } catch (e) {
        GS.salvando(botao, false);
        campo.erro(e.message);
        return campo.texto.focus();
      }
      const primeiro = r.nome.split(' ')[0];
      corpo.innerHTML = `
        <div class="ativ-ok">
          <span class="ic">${icone('check')}</span>
          <h3 class="ativ-titulo">Tudo certo, ${esc(primeiro)}!</h3>
          <p>Licença ativada para <b>${esc(r.nome)}</b>.<br>Ela vale até <b>${data(r.validade)}</b>, no computador e no navegador.</p>
        </div>`;
      modal.foot.innerHTML = `<button type="button" class="btn btn-primary" data-continuar>Continuar${icone('arrow-right')}</button>`;
      const continuar = modal.foot.querySelector('[data-continuar]');
      continuar.addEventListener('click', () => location.reload());
      continuar.focus();
    };
    botao.addEventListener('click', enviar);
    campo.texto.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
    });
    setTimeout(() => campo.texto.focus(), 50);
  }

  /* ---------- janela "Licença" (link no rodapé) ---------- */

  function abrirJanela() {
    const conta = (GS.usuario && GS.usuario.email) || '';
    let linhas;
    if (info.estado === 'teste' || info.estado === 'teste-acabou') {
      const prazo = info.estado === 'teste' ? `faltam ${GS.plural(info.dias, 'dia', 'dias')}` : 'acabou';
      linhas = `
        <div><span>Situação</span><span class="selo-licenca ${info.estado === 'teste' ? 'teste' : 'vencida'}">${info.estado === 'teste' ? 'Teste grátis' : 'Teste acabou'}</span></div>
        <div><span>Conta</span><b>${esc(conta)}</b></div>
        <div><span>Teste até</span><b>${data(info.testeAte)} <small>· ${prazo}</small></b></div>`;
    } else {
      const [selo, classe] = {
        ativa: ['Ativa', 'ativa'],
        vencendo: ['Vence em breve', 'vencendo'],
        vencida: ['Vencida', 'vencida'],
      }[info.estado];
      const prazo = info.dias >= 0
        ? (info.dias === 0 ? 'vence hoje' : `faltam ${GS.plural(info.dias, 'dia', 'dias')}`)
        : `venceu há ${GS.plural(-info.dias, 'dia', 'dias')}`;
      linhas = `
        <div><span>Situação</span><span class="selo-licenca ${classe}">${selo}</span></div>
        <div><span>Licenciado para</span><b>${esc(info.nome)}</b></div>
        <div><span>Conta</span><b>${esc(conta)}</b></div>
        <div><span>Válida até</span><b>${data(info.validade)} <small>· ${prazo}</small></b></div>`;
    }
    const emTeste = info.estado === 'teste' || info.estado === 'teste-acabou';
    const modal = GS.abrirModal({
      titulo: 'Licença',
      corpo: `<div class="lic-info">${linhas}</div>`,
      rodape: `<button type="button" class="btn btn-outline" data-fechar>Fechar</button>
               <button type="button" class="btn btn-primary" data-ativar>${icone('key')}${emTeste ? 'Ativar chave' : 'Trocar chave'}</button>`,
    });
    modal.foot.querySelector('[data-ativar]').addEventListener('click', () => {
      modal.fechar();
      abrirAtivacao();
    });
  }

  /* ---------- faixas de aviso ---------- */

  function faixa(classe, html) {
    document.querySelector('.faixa-licenca')?.remove();
    const el = GS.el('div', `faixa-licenca ${classe}`, html);
    el.setAttribute('role', 'status');
    const topo = document.querySelector('.topbar');
    topo ? topo.after(el) : document.body.prepend(el);
    el.querySelector('[data-chave]')?.addEventListener('click', abrirAtivacao);
    el.querySelector('[data-comprar]')?.addEventListener('click', comprar);
    return el;
  }

  const ATE = iso => data(iso).split(' ').slice(0, 2).join(' ');  // "19 out"

  // teste grátis: faixa azul em todas as páginas
  function faixaTeste() {
    faixa('teste', `
      <span class="ic">${icone('clock')}</span>
      <span class="longo"><strong>Teste grátis: ${info.dias === 1 ? 'falta 1 dia' : `faltam ${info.dias} dias`}</strong> (até ${ATE(info.testeAte)}). Depois, ative sua licença para continuar lançando.</span>
      <span class="curto"><strong>Teste grátis:</strong> ${GS.plural(info.dias, 'dia', 'dias')}</span>
      <div class="acoes">
        <button type="button" class="btn btn-outline" data-comprar>Quero comprar</button>
        <button type="button" class="btn btn-primary" data-chave>${icone('key')}Ativar chave</button>
      </div>`);
  }

  // faltam 30 dias ou menos: avisa uma vez por dia
  async function avisoVencendo() {
    const hoje = GS.isoData(GS.hoje());
    const prefs = await GS.api.obterPreferencias().catch(() => ({}));
    if (prefs.licencaAvisoDispensado === hoje) return;
    const el = faixa('vencendo', `
      <span class="ic">${icone('clock')}</span>
      <span>Sua licença vence <strong>${dias(info.dias)}</strong> (${data(info.validade)}). Renove para continuar lançando seus gastos.</span>
      <div class="acoes">
        <button type="button" class="btn btn-outline" data-depois>Agora não</button>
        <button type="button" class="btn btn-primary" data-chave>${icone('key')}Inserir nova chave</button>
      </div>`);
    el.querySelector('[data-depois]').addEventListener('click', () => {
      GS.api.salvarPreferencia('licencaAvisoDispensado', hoje).catch(err => GS.toast(err.message, 'erro'));
      el.remove();
    });
  }

  // vencida ou teste acabou: só leitura (os dados continuam visíveis e o relatório funciona)
  function travar() {
    document.documentElement.classList.add('somente-leitura');
    if (info.estado === 'teste-acabou') {
      faixa('vencida', `
        <span class="ic">${icone('lock')}</span>
        <span><strong>Seu teste grátis acabou.</strong> Seus dados continuam aqui: ative sua licença para voltar a lançar e editar.</span>
        <div class="acoes">
          <button type="button" class="btn btn-outline" data-comprar>Quero comprar</button>
          <button type="button" class="btn btn-primary" data-chave>${icone('key')}Ativar chave</button>
        </div>`);
    } else {
      faixa('vencida', `
        <span class="ic">${icone('lock')}</span>
        <span><strong>Licença vencida em ${data(info.validade)}.</strong> O GSCASH está em modo só leitura: você vê seus dados e gera relatórios, mas não lança nem edita.</span>
        <div class="acoes"><button type="button" class="btn btn-primary" data-chave>${icone('key')}Inserir nova chave</button></div>`);
    }
    document.addEventListener('click', e => {
      if (!e.target.closest(ESCRITA)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      GS.toast(GS.TEXTO_SO_LEITURA, 'erro');
    }, true);
  }

  /* ---------- rodapé ---------- */

  // "Licenciado para Maria Silva até 5 out 2027 · Licença" / "Teste grátis até 19 out · Licença"
  function rodapeHtml() {
    const i = info;
    const texto = {
      teste: () => `Teste grátis até ${ATE(i.testeAte)}`,
      'teste-acabou': () => 'Teste grátis encerrado',
      ativa: () => `Licenciado para ${esc(i.nome)} até ${data(i.validade)}`,
      vencendo: () => `Licenciado para ${esc(i.nome)} até ${data(i.validade)}`,
      vencida: () => `Licença vencida em ${data(i.validade)}`,
    }[i.estado]?.();
    if (!texto) return '';
    return `<span>${texto}</span><span class="sep">·</span><button type="button" class="link-btn" data-licenca>Licença</button><span class="sep">·</span>`;
  }

  GS.licenca = { pronta, rodapeHtml, abrirJanela, abrirAtivacao };
})();
