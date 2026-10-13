/* =========================================================
   GSCASH — rodapé com a versão e atualizações automáticas
   Só no app de computador: o Python (app.py) consulta a última
   versão publicada, baixa, confere o SHA-256 e instala.
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const { icone, esc } = GS;

  const mb = bytes => `${(bytes / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;

  // os dados ficam na conta (Supabase), não no computador nem no navegador
  const TEXTO_DADOS = '<span title="Seus dados ficam salvos na nuvem e só você tem acesso">Dados salvos na sua conta</span>';

  function rodape(html) {
    document.querySelector('.rodape')?.remove();
    const f = GS.el('footer', 'rodape', html);
    document.body.append(f);
    return f;
  }

  // notas da versão: linhas com "- " viram itens; **texto** vira negrito
  function notasHtml(texto) {
    const linhas = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!linhas.length) return '<p class="muted">Melhorias e correções.</p>';
    const fmt = l => esc(l).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const itens = linhas.filter(l => /^[-*•]\s+/.test(l));
    const outras = linhas.filter(l => !/^[-*•]\s+/.test(l));
    return outras.map(l => `<p>${fmt(l)}</p>`).join('') +
      (itens.length ? `<ul class="novidades">${itens.map(l => `<li>${icone('check')}<span>${fmt(l.replace(/^[-*•]\s+/, ''))}</span></li>`).join('')}</ul>` : '');
  }

  function dataBr(iso) {
    return iso ? GS.dataMedia(iso) : '';
  }

  /* ---------- faixa "Nova versão disponível" ---------- */

  function mostrarFaixa(api, info) {
    document.querySelector('.aviso-versao')?.remove();
    const faixa = GS.el('div', 'aviso-versao');
    faixa.setAttribute('role', 'status');
    faixa.innerHTML = `
      <span class="ic">${icone('download')}</span>
      <span><strong>Nova versão ${esc(info.versao)} disponível.</strong> Você está na ${esc(info.atual)}.</span>
      <div class="acoes">
        <button type="button" class="link" data-novidades>Ver novidades</button>
        <button type="button" class="btn btn-fantasma" data-depois>Agora não</button>
        <button type="button" class="btn btn-claro" data-atualizar>${icone('download')}Atualizar</button>
      </div>`;
    const topo = document.querySelector('.topbar');
    topo ? topo.after(faixa) : document.body.prepend(faixa);

    faixa.querySelector('[data-depois]').addEventListener('click', () => {
      api.dispensar_atualizacao(info.versao);
      faixa.remove();
    });
    faixa.querySelector('[data-novidades]').addEventListener('click', () => abrirNovidades(api, info));
    faixa.querySelector('[data-atualizar]').addEventListener('click', () => atualizar(api, info));
  }

  function abrirNovidades(api, info) {
    const modal = GS.abrirModal({
      titulo: 'Novidades',
      corpo: `
        <div><span class="versao-tag">Versão ${esc(info.versao)}</span>
          ${info.data ? `<span class="muted" style="margin-left:8px">publicada em ${dataBr(info.data)}</span>` : ''}</div>
        ${notasHtml(info.notas)}
        <p class="field-hint">Seus dados não são afetados pela atualização.</p>`,
      rodape: `<button type="button" class="btn btn-outline" data-fechar>Agora não</button>
               <button type="button" class="btn btn-primary" data-atualizar>${icone('download')}Atualizar agora</button>`,
    });
    modal.foot.querySelector('[data-atualizar]').addEventListener('click', () => {
      modal.fechar();
      atualizar(api, info);
    });
  }

  /* ---------- baixar e instalar ---------- */

  async function atualizar(api, info) {
    let terminou = false;
    const modal = GS.abrirModal({
      titulo: 'Atualização',
      tamanho: 'sm',
      rodapeClasse: 'even',
      corpo: `
        <div class="prog">
          <span class="ic">${icone('download')}</span>
          <h3 data-titulo>Baixando a versão ${esc(info.versao)}</h3>
          <div class="bar"><span data-barra style="width:0%"></span></div>
          <small data-detalhe>Conectando…</small>
        </div>`,
      rodape: '<span></span><button type="button" class="btn btn-outline" data-cancelar>Cancelar</button>',
      aoFechar: () => { if (!terminou) api.cancelar_atualizacao(); },
    });
    const $ = sel => modal.el.querySelector(sel);
    modal.el.querySelector('.modal-head').classList.add('hidden');
    $('[data-cancelar]').addEventListener('click', () => modal.fechar());

    const inicio = await api.baixar_atualizacao();
    if (!inicio.ok) {
      terminou = true;
      modal.fechar();
      return GS.toast(inicio.erro, 'erro');
    }

    const acompanhar = async () => {
      if (!modal.el.isConnected) return;
      const p = await api.progresso_atualizacao();
      if (p.estado === 'baixando' || p.estado === 'verificando') {
        const pct = p.total ? Math.min(100, (p.baixado / p.total) * 100) : 0;
        $('[data-barra]').style.width = `${pct}%`;
        $('[data-detalhe]').textContent = p.estado === 'verificando'
          ? 'Conferindo a segurança do arquivo…'
          : `${mb(p.baixado)} de ${mb(p.total || info.tamanho)}`;
        return setTimeout(acompanhar, 250);
      }
      if (p.estado === 'pronto') {
        terminou = true;
        $('.prog').innerHTML = `
          <span class="ic">${icone('repeat')}</span>
          <h3>Instalando…</h3>
          <p>O GSCASH vai fechar e abrir de novo em alguns segundos. Seus dados continuam iguais.</p>`;
        $('[data-cancelar]').classList.add('hidden');
        const r = await api.instalar_atualizacao();
        if (!r.ok) {
          modal.fechar();
          GS.toast(r.erro, 'erro');
        }
        return;
      }
      terminou = true;
      modal.fechar();
      if (p.estado === 'erro') GS.toast(p.erro, 'erro');
    };
    acompanhar();
  }

  /* ---------- início ---------- */

  async function iniciar() {
    if (!GS.noDesktop) {
      await GS.licenca.pronta;
      const licenca = GS.licenca.rodapeHtml().replace(/<span class="sep">·<\/span>$/, '');
      const f = rodape(`<span>GSCASH · navegador</span><span class="sep">·</span>${TEXTO_DADOS}${licenca ? `<span class="sep">·</span>${licenca}` : ''}`);
      f.querySelector('[data-licenca]')?.addEventListener('click', GS.licenca.abrirJanela);
      return;
    }
    const api = await GS.apiDesktop();
    const info = await api.info();
    await GS.licenca.pronta;

    const f = rodape(`
      <span>GSCASH ${esc(info.versao)}</span><span class="sep">·</span>
      ${TEXTO_DADOS}<span class="sep">·</span>
      ${GS.licenca.rodapeHtml()}
      <button type="button" class="link-btn" data-verificar>Verificar atualizações</button>`);
    f.querySelector('[data-licenca]')?.addEventListener('click', GS.licenca.abrirJanela);

    f.querySelector('[data-verificar]').addEventListener('click', async e => {
      const b = e.currentTarget;
      b.disabled = true;
      b.textContent = 'Verificando…';
      const r = await api.verificar_atualizacao(true);
      b.disabled = false;
      b.textContent = 'Verificar atualizações';
      if (!r.ok) return GS.toast(`Não foi possível verificar: ${r.erro}`, 'erro');
      if (r.disponivel) {
        mostrarFaixa(api, r);
        GS.toast(`Nova versão ${r.versao} disponível`);
      } else {
        GS.toast(`Você já está na versão mais recente (${r.atual})`);
      }
    });

    // consulta automática (o Python guarda o resultado até o app fechar)
    const r = await api.verificar_atualizacao(false);
    if (r.ok && r.disponivel && !r.dispensada) mostrarFaixa(api, r);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
