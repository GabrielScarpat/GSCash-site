/* =========================================================
   GSCASH — excluir a própria conta (link no fim do menu da conta)
   1. o que se perde (e a licença, se houver), com a opção de baixar os lançamentos em CSV
   2. confirmar digitando o próprio e-mail
   3. a Edge Function "excluir-conta" apaga a conta e tudo dela; volta para a tela de entrada
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const { icone, esc } = GS;

  /* ---------- cópia dos lançamentos (CSV que o Excel abre com acentos) ---------- */

  async function planilha() {
    const [transacoes, categorias, carteiras] = await Promise.all([
      GS.api.listarTransacoes(), GS.api.listarCategorias(), GS.api.listarCarteiras(),
    ]);
    const cat = new Map(categorias.map(c => [c.id, c]));
    const cart = new Map(carteiras.map(c => [c.id, c.nome]));
    const TIPOS = { despesa: 'Despesa', receita: 'Receita', transferencia: 'Transferência', pagamento: 'Pagamento de fatura' };
    const campo = v => {
      const s = String(v ?? '');
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const valor = c => (c / 100).toFixed(2).replace('.', ',');
    const linhas = [['Data', 'Tipo', 'Título', 'Descrição', 'Categoria', 'Subcategoria', 'Carteira', 'Destino', 'Forma', 'Parcelas', `Valor (${GS.moedaAtual().sigla})`]];
    [...transacoes].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0)).forEach(t => {
      const c = cat.get(t.categoriaId);
      const sub = c && (c.subcategorias || []).find(s => s.id === t.subcategoriaId);
      const sinal = t.tipo === 'receita' ? 1 : -1;
      linhas.push([
        t.data.split('-').reverse().join('/'), TIPOS[t.tipo] || t.tipo, t.titulo, t.descricao,
        c ? c.nome : '', sub ? sub.nome : '', cart.get(t.carteiraId) || '', cart.get(t.destinoId) || '',
        t.forma === 'credito' ? 'Crédito' : 'Débito', t.parcelas || 1, valor(t.tipo === 'transferencia' ? t.valor : sinal * t.valor),
      ]);
    });
    return linhas.map(l => l.map(campo).join(';')).join('\r\n');
  }

  async function baixarCopia(botao) {
    const original = botao.innerHTML;
    botao.disabled = true;
    botao.innerHTML = '<span class="roda-botao" aria-hidden="true"></span>Gerando…';
    try {
      const texto = await planilha();
      const nome = `GSCASH - lançamentos ${GS.isoData(GS.hoje())}`;
      if (GS.noDesktop) {
        const api = await GS.apiDesktop();
        const r = await api.salvar_planilha(nome, texto);
        if (!r || !r.ok) throw new Error((r && r.erro) || 'Não foi possível salvar a planilha.');
        api.mostrar_relatorio(r.caminho);
        GS.toast('Planilha salva em Documentos > GSCASH > Relatórios');
      } else {
        const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${nome}.csv`;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        GS.toast('Planilha baixada');
      }
      botao.innerHTML = `${icone('check')}Baixada`;
    } catch (err) {
      botao.innerHTML = original;
      GS.toast(err.message || 'Não foi possível gerar a planilha.', 'erro');
    } finally {
      botao.disabled = false;
    }
  }

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
        <div class="excluir-copia"><span><b>Quer guardar uma cópia?</b>Planilha (CSV) com todos os lançamentos.</span>
          <button type="button" class="btn btn-outline" data-copia>${icone('download')}Baixar</button></div>`;
      modal.body.querySelector('[data-copia]').addEventListener('click', e => baixarCopia(e.currentTarget));
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
        sessionStorage.setItem('gscash:excluida', '1');
        localStorage.removeItem('gscash:instalado');
      } catch (e) { /* segue */ }
      await GS.supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      location.replace('entrar.html');
    }

    passoAviso();
  }

  GS.excluirConta = { abrir };
})();
