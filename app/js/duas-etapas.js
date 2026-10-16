/* =========================================================
   GSCASH — verificação em duas etapas (item no menu da conta)
   Ligar: o que é → QR code (no celular, botão que abre o autenticador) → código de 6 dígitos
          → 8 códigos de recuperação para guardar.
   Já ligada: estado, gerar novos códigos e desligar (os dois pedem o código do celular antes).
   O campo de 6 dígitos (GS.duasEtapas.campoCodigo) também é usado na tela de entrada.
   A conversa com o Supabase fica em GS.auth.duasEtapas (supabase.js).
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const auth = () => GS.auth.duasEtapas;
  const noCelular = () => GS.nativo || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  /* ---------- campo de 6 dígitos ----------
     Um campo de verdade, invisível, por cima de 6 quadrinhos desenhados: aceita colar, o teclado
     só de números e o preenchimento automático do celular. aoCompletar(codigo) roda no 6º dígito. */
  function campoCodigo({ aoCompletar, rotulo = 'Código de 6 dígitos' } = {}) {
    const caixa = document.createElement('div');
    caixa.className = 'codigo-6';
    caixa.innerHTML = '<span class="codigo-casa"></span>'.repeat(6)
      + `<input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" spellcheck="false" aria-label="${rotulo}">`;
    const input = caixa.querySelector('input');
    const casas = [...caixa.querySelectorAll('.codigo-casa')];

    const pintar = () => {
      const v = input.value;
      const focado = document.activeElement === input;
      casas.forEach((c, i) => {
        c.textContent = v[i] || '';
        c.classList.toggle('foco', focado && i === Math.min(v.length, 5));
      });
    };
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 6);
      caixa.classList.remove('erro');
      pintar();
      if (input.value.length === 6 && aoCompletar) aoCompletar(input.value);
    });
    input.addEventListener('focus', pintar);
    input.addEventListener('blur', pintar);
    pintar();

    return {
      el: caixa,
      valor: () => input.value,
      focar: () => input.focus(),
      travar(sim) { input.disabled = !!sim; },
      // código errado: quadrinhos vermelhos e tudo selecionado, para o próximo já substituir
      erro() {
        caixa.classList.add('erro');
        input.disabled = false;
        input.focus();
        input.select();
      },
    };
  }

  /* ---------- ajudas ---------- */

  async function copiar(botao, texto) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch (e) {
      const t = document.createElement('textarea');
      t.value = texto;
      document.body.append(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    if (botao.dataset.textoOriginal === undefined) botao.dataset.textoOriginal = botao.innerHTML;
    botao.innerHTML = `${GS.icone('check')}Copiado`;
    clearTimeout(botao._volta);
    botao._volta = setTimeout(() => { botao.innerHTML = botao.dataset.textoOriginal; }, 2000);
  }

  // a chave em grupos de 4, mais fácil de digitar no app
  const chaveLegivel = chave => String(chave).replace(/(.{4})/g, '$1 ').trim();
  // o Supabase devolve o QR code como SVG (às vezes já como endereço data:)
  const imagemQr = qr => (/^data:/.test(qr) ? qr : `data:image/svg+xml;utf8,${encodeURIComponent(qr)}`);

  const textoCodigos = codigos => [
    'GSCASH - códigos de recuperação da verificação em duas etapas',
    `Conta: ${(GS.usuario && GS.usuario.email) || ''}`,
    'Cada código vale uma vez. Use se perder o celular com o app autenticador.',
    '',
    ...codigos,
  ].join('\r\n');

  function baixarCodigos(codigos) {
    const blob = new Blob([textoCodigos(codigos)], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'GSCASH - códigos de recuperação.txt';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // a sessão mudou (ligou ou desligou): o menu da conta lê daqui se está ligada
  async function atualizarUsuario() {
    const sessao = await GS.auth.sessao();
    if (sessao) GS.usuario = sessao.user;
  }

  function ligada() {
    return ((GS.usuario && GS.usuario.factors) || []).some(f => f.status === 'verified');
  }

  /* ---------- janela ---------- */

  async function abrir() {
    const { icone, esc } = GS;
    const modal = GS.abrirModal({ titulo: 'Verificação em duas etapas', corpo: '', rodapeClasse: 'duas-rodape' });
    modal.el.classList.add('duas-modal');
    const titulo = t => { modal.el.querySelector('.modal-title').textContent = t; };
    const rodape = html => {
      modal.foot.innerHTML = html;
      modal.foot.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => modal.fechar()));
    };
    const carregando = () => {
      modal.body.innerHTML = '<div class="duas-carregando"><span class="roda-botao" aria-hidden="true"></span>Carregando…</div>';
      rodape('');
    };
    const falhou = err => {
      modal.body.innerHTML = `<div class="duas-erro">${icone('alert')}<span>${esc(err.message || 'Não foi possível agora. Verifique a conexão e tente de novo.')}</span></div>`;
      rodape('<button type="button" class="btn btn-outline" data-fechar>Fechar</button>');
    };
    const ocupar = (botao, texto) => {
      botao.disabled = true;
      botao.innerHTML = `<span class="roda-botao" aria-hidden="true"></span>${texto}`;
    };

    /* --- ligar: 1. o que é --- */
    function passoIntro() {
      titulo('Verificação em duas etapas');
      modal.body.innerHTML = `
        <span class="duas-escudo">${icone('escudo')}</span>
        <p>Uma proteção a mais: além da senha, o GSCASH pede um <b>código do seu celular</b> ao entrar num aparelho.</p>
        <ol class="duas-passos">
          <li><span class="n">1</span><span>Instale um app autenticador no celular (grátis).</span></li>
          <li><span class="n">2</span><span>${noCelular() ? 'Adicione o GSCASH a ele com um toque.' : 'Leia o QR code que vamos mostrar.'}</span></li>
          <li><span class="n">3</span><span>Digite o código de 6 dígitos que aparecer.</span></li>
        </ol>
        <div class="duas-apps"><span>Google Authenticator</span><span>Microsoft Authenticator</span><span>Authy</span></div>`;
      rodape(`<button type="button" class="btn btn-outline" data-fechar>Agora não</button>
              <button type="button" class="btn btn-primary" data-comecar>Começar</button>`);
      const b = modal.foot.querySelector('[data-comecar]');
      b.addEventListener('click', async () => {
        ocupar(b, 'Preparando…');
        try {
          passoQr(await auth().comecar());
        } catch (err) {
          falhou(err);
        }
      });
      setTimeout(() => b.focus(), 50);
    }

    /* --- ligar: 2. QR code (computador) ou botão que abre o autenticador (celular) --- */
    function passoQr(fator) {
      const chave = `<div class="duas-chave"><span>${esc(chaveLegivel(fator.chave))}</span>
        <button type="button" data-copiar-chave>${icone('copiar')}Copiar</button></div>`;
      if (noCelular()) {
        titulo('Adicione ao autenticador');
        modal.body.innerHTML = `
          <p>Você está no celular: não dá para ler o QR code da própria tela. Toque no botão e o autenticador abre com o GSCASH já preenchido.</p>
          <a class="btn btn-primary duas-abrir-app" href="${esc(fator.endereco)}">${icone('escudo')}Abrir no app autenticador</a>
          <p class="duas-pequeno">Não abriu? Copie a chave e cole no app:</p>
          ${chave}`;
      } else {
        titulo('Leia o QR code');
        modal.body.innerHTML = `
          <div class="duas-qr-lado">
            <img class="duas-qr" src="${esc(imagemQr(fator.qr))}" alt="QR code para o app autenticador">
            <div class="duas-qr-texto">
              <p>No app autenticador do celular, toque em <b>+</b> e aponte a câmera para o código.</p>
              <p class="duas-pequeno">Sem câmera? Digite esta chave no app:</p>
              ${chave}
            </div>
          </div>`;
      }
      modal.body.querySelector('[data-copiar-chave]').addEventListener('click', e => copiar(e.currentTarget, fator.chave));
      rodape(`<button type="button" class="btn btn-outline" data-voltar>Voltar</button>
              <button type="button" class="btn btn-primary" data-proximo>Próximo</button>`);
      modal.foot.querySelector('[data-voltar]').addEventListener('click', passoIntro);
      modal.foot.querySelector('[data-proximo]').addEventListener('click', () => passoCodigo(fator));
    }

    /* --- código de 6 dígitos: ligar (fator novo), gerar novos códigos ou desligar --- */
    function passoCodigo(fator, objetivo = 'ligar') {
      const TEXTOS = {
        ligar: { titulo: 'Digite o código', botao: 'Ligar', espera: 'Ligando…' },
        novos: { titulo: 'Confirme com o código', botao: 'Gerar novos códigos', espera: 'Gerando…' },
        desligar: { titulo: 'Confirme com o código', botao: 'Desligar', espera: 'Desligando…' },
      }[objetivo];
      titulo(TEXTOS.titulo);
      modal.body.innerHTML = `
        <p>${objetivo === 'ligar' ? 'Digite os <b>6 dígitos</b> que o app mostra para o GSCASH.'
          : 'Para sua segurança, digite o código de <b>6 dígitos</b> do app autenticador.'}</p>
        <div data-campo></div>
        <p class="duas-aviso" role="alert" hidden></p>
        <p class="duas-pequeno">O código muda a cada 30 segundos. Ao completar os 6, confirmamos sozinhos.</p>`;
      rodape(`<button type="button" class="btn btn-outline" data-voltar>Voltar</button>
              <button type="button" class="btn ${objetivo === 'desligar' ? 'btn-danger' : 'btn-primary'}" data-ok>${TEXTOS.botao}</button>`);
      const aviso = modal.body.querySelector('.duas-aviso');
      const botao = modal.foot.querySelector('[data-ok]');
      let enviando = false;

      async function enviar(codigo) {
        if (enviando) return;
        if (!/^\d{6}$/.test(codigo)) {
          aviso.textContent = 'Digite os 6 dígitos do código.';
          aviso.hidden = false;
          return campo.focar();
        }
        enviando = true;
        aviso.hidden = true;
        campo.travar(true);
        ocupar(botao, TEXTOS.espera);
        try {
          if (objetivo === 'ligar') {
            const codigos = await auth().terminar(fator.id, codigo);
            await atualizarUsuario();
            return passoCodigos(codigos, true);
          }
          if (objetivo === 'novos') return passoCodigos(await auth().novosCodigos(codigo), false);
          await auth().desligar(codigo);
          await atualizarUsuario();
          modal.fechar();
          GS.toast('Verificação em duas etapas desligada');
        } catch (err) {
          enviando = false;
          botao.disabled = false;
          botao.textContent = TEXTOS.botao;
          aviso.textContent = err.message;
          aviso.hidden = false;
          campo.erro();
        }
      }

      const campo = campoCodigo({ aoCompletar: enviar });
      modal.body.querySelector('[data-campo]').replaceWith(campo.el);
      botao.addEventListener('click', () => enviar(campo.valor()));
      modal.foot.querySelector('[data-voltar]').addEventListener('click', () => (objetivo === 'ligar' ? passoQr(fator) : passoEstado()));
      setTimeout(() => campo.focar(), 50);
    }

    /* --- os 8 códigos de recuperação (só aparecem agora; o servidor guarda embaralhados) --- */
    function passoCodigos(codigos, acabouDeLigar) {
      titulo('Guarde estes códigos');
      const podeBaixar = !GS.nativo && !GS.auth.noDesktop;
      modal.body.innerHTML = `
        <p>Se perder o celular, cada código abaixo deixa você entrar <b>uma vez</b>. Guarde num lugar seguro, fora do celular.</p>
        <div class="duas-codigos">${codigos.map(c => `<span>${esc(c)}</span>`).join('')}</div>
        <div class="duas-linha-btn${podeBaixar ? '' : ' um'}">
          <button type="button" class="btn btn-outline" data-copiar>${icone('copiar')}Copiar</button>
          ${podeBaixar ? `<button type="button" class="btn btn-outline" data-baixar>${icone('download')}Baixar</button>` : ''}
        </div>
        <label class="duas-guardei"><input type="checkbox" data-guardei>Guardei os códigos</label>`;
      rodape('<button type="button" class="btn btn-primary duas-concluir" data-concluir disabled>Concluir</button>');
      modal.body.querySelector('[data-copiar]').addEventListener('click', e => copiar(e.currentTarget, textoCodigos(codigos)));
      const b = modal.body.querySelector('[data-baixar]');
      if (b) b.addEventListener('click', () => baixarCodigos(codigos));
      const concluir = modal.foot.querySelector('[data-concluir]');
      modal.body.querySelector('[data-guardei]').addEventListener('change', e => { concluir.disabled = !e.target.checked; });
      concluir.addEventListener('click', () => {
        modal.fechar();
        GS.toast(acabouDeLigar ? 'Verificação em duas etapas ligada' : 'Códigos novos criados. Os antigos não valem mais.');
      });
    }

    /* --- já ligada --- */
    async function passoEstado() {
      titulo('Verificação em duas etapas');
      carregando();
      let fator;
      let info;
      try {
        [fator, info] = await Promise.all([auth().fator(), auth().infoCodigos().catch(() => null)]);
      } catch (err) {
        return falhou(err);
      }
      if (!fator) return passoIntro();
      const desde = GS.dataMedia ? GS.dataMedia(String(fator.created_at || '').slice(0, 10)) : '';
      const quantos = info && info.quantos ? `${info.quantos} códigos, criados em ${esc(GS.dataMedia(String(info.criados_em).slice(0, 10)))}.` : 'Nenhum código guardado. Gere novos.';
      modal.body.innerHTML = `
        <div class="duas-status">${icone('escudo-ok')}<span><b>Ligada</b>${desde ? `Desde ${esc(desde)}. ` : ''}Ao entrar num aparelho, pedimos o código do celular.</span></div>
        <div class="duas-acao"><span class="t"><b>Códigos de recuperação</b>${quantos}</span>
          <button type="button" class="btn btn-outline" data-novos>Gerar novos</button></div>
        <div class="duas-acao"><span class="t"><b>Desligar</b>Volta a entrar só com a senha.</span>
          <button type="button" class="btn btn-outline duas-desligar" data-desligar>Desligar</button></div>`;
      rodape('<button type="button" class="btn btn-outline duas-concluir" data-fechar>Fechar</button>');
      modal.body.querySelector('[data-novos]').addEventListener('click', () => passoCodigo(fator, 'novos'));
      modal.body.querySelector('[data-desligar]').addEventListener('click', () => passoCodigo(fator, 'desligar'));
    }

    carregando();
    try {
      (await auth().fator()) ? passoEstado() : passoIntro();
    } catch (err) {
      falhou(err);
    }
  }

  // entrou com um código de recuperação (tela de entrada): avisa que a verificação ficou desligada
  try {
    if (sessionStorage.getItem('gscash:2fa-desligada') && !/entrar\.html$/i.test(location.pathname)) {
      sessionStorage.removeItem('gscash:2fa-desligada');
      window.addEventListener('load', () => setTimeout(() => {
        if (GS.toast) GS.toast('Verificação em duas etapas desligada. Ligue de novo pelo menu da conta, com o celular novo.');
      }, 600));
    }
  } catch (e) { /* sem sessionStorage: segue sem o aviso */ }

  GS.duasEtapas = { abrir, ligada, campoCodigo };
})();
