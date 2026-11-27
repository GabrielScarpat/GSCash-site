/* =========================================================
   GSCASH — excluir a própria conta (link no fim do menu da conta)
   1. o que se perde (e a licença, se houver), com a opção de baixar a planilha com tudo (js/baixar-dados.js)
   2. confirmar digitando o próprio e-mail
   3. a Edge Function "excluir-conta" apaga a conta e tudo dela; volta para a tela de entrada
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const { icone, esc } = GS;

  /* ---------- janela ---------- */

  async function abrir() {
    const email = (GS.usuario && GS.usuario.email) || '';
    const info = GS.licenca ? await GS.licenca.pronta.catch(() => ({})) : {};
    const comLicenca = info.estado === 'ativa' || info.estado === 'vencendo';

    const modal = GS.abrirModal({ titulo: 'Excluir sua conta?', corpo: '' });
    const titulo = t => { modal.el.querySelector('.modal-title').textContent = t; };
    const rodape = html => {
      modal.foot.innerHTML = html;
      modal.foot.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => modal.fechar()));
    };

    /* 1. o que se perde */
    function passoAviso() {
      titulo('Excluir sua conta?');
      modal.body.innerHTML = `
        <div class="excluir-perde">
          <div>${icone('alert')}<span>Isso apaga <b>para sempre</b>, sem como desfazer:</span></div>
          <div>· todos os lançamentos, carteiras, faturas e categorias;</div>
          <div>· o lembrete diário e o seu acesso ao GSCASH.</div>
        </div>
        ${comLicenca ? `<div class="excluir-licenca">${icone('clock')}<span>Sua licença vale até <b>${esc(GS.dataMedia(info.validade))}</b>. Ela será perdida e não é reembolsada.</span></div>` : ''}
        <div class="excluir-copia"><span><b>Quer guardar uma cópia?</b>Planilha do Excel com todos os seus dados.</span>
          <button type="button" class="btn btn-outline" data-copia>${icone('download')}Baixar</button></div>`;
      modal.body.querySelector('[data-copia]').addEventListener('click', e => GS.baixarDados.baixar(e.currentTarget));
      rodape(`<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
              <button type="button" class="btn btn-danger" data-seguir>Continuar</button>`);
      modal.foot.querySelector('[data-seguir]').addEventListener('click', passoConfirmar);
    }

    /* 2. confirmar digitando o e-mail */
    function passoConfirmar() {
      titulo('Confirme a exclusão');
      modal.body.innerHTML = `
        <p>Para confirmar, escreva o seu e-mail: <b class="excluir-email">${esc(email)}</b></p>
        <div class="field"><div class="input"><input id="excluirEmail" type="email" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${esc(email)}"></div></div>
        <p class="excluir-dica">O botão só libera quando o e-mail estiver igual.</p>`;
      rodape(`<button type="button" class="btn btn-outline" data-voltar>Voltar</button>
              <button type="button" class="btn btn-danger" data-excluir disabled>Excluir para sempre</button>`);
      const campo = modal.body.querySelector('#excluirEmail');
      const botao = modal.foot.querySelector('[data-excluir]');
      const igual = () => campo.value.trim().toLowerCase() === email.toLowerCase();
      campo.addEventListener('input', () => { botao.disabled = !igual(); });
      campo.addEventListener('keydown', e => { if (e.key === 'Enter' && igual()) { e.preventDefault(); excluir(botao, campo.value); } });
      modal.foot.querySelector('[data-voltar]').addEventListener('click', passoAviso);
      botao.addEventListener('click', () => excluir(botao, campo.value));
      setTimeout(() => campo.focus(), 50);
    }

    /* 3. apagar */
    async function excluir(botao, digitado) {
      botao.disabled = true;
      botao.innerHTML = '<span class="roda-botao" aria-hidden="true"></span>Excluindo…';
      const { error } = await GS.supabase.functions.invoke('excluir-conta', { body: { email: digitado.trim() } });
      if (error) {
        let msg = 'Não foi possível excluir agora. Verifique a conexão e tente de novo.';
        try { msg = (await error.context.json()).erro || msg; } catch (e) { /* fica a padrão */ }
        botao.innerHTML = 'Excluir para sempre';
        botao.disabled = false;
        return GS.toast(msg, 'erro');
      }
      // a conta já não existe: limpa a sessão deste aparelho e volta para a entrada com o aviso
      try {
        sessionStorage.removeItem('gscash:copia');
        sessionStorage.removeItem('gscash:licenca');
        sessionStorage.setItem('gscash:excluida', '1');
        localStorage.removeItem('gscash:instalado');
      } catch (e) { /* segue */ }
      await GS.supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      await GS.contas.esquecer(GS.usuario.id).catch(() => {});   // some também da lista de contas do aparelho
      location.replace('entrar.html');
    }

    passoAviso();
  }

  GS.excluirConta = { abrir };
})();
