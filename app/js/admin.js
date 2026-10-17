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

  async function carregar() {
    $('#conteudo').classList.add('carregando');
    const { data, error } = await GS.supabase.rpc('painel_admin', { p_dias: dias });
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

  function desenhar() {
    const d = dados;
    const f = d.funil;
    const nomePeriodo = dias ? `nos últimos ${dias} dias` : 'desde o início';
    const situacao = c => {
      if (c.situacao === 'ativa') return `<span class="selo ok">${c.comprou ? 'Comprou' : 'Licença ativa'}</span>`;
      if (c.situacao === 'vencida') return '<span class="selo erro">Licença vencida</span>';
      if (c.situacao === 'teste') return `<span class="selo info">Teste · ${plural(c.dias_teste, 'dia', 'dias')}</span>`;
      return '<span class="selo erro">Teste acabou</span>';
    };
    const etapa = (rotulo, n, extra = '') => `
      <div class="adm-etapa"><div class="l"><span>${rotulo}</span><b>${n}</b></div>
        <div class="barra"><span style="width:${pct(n, f.criaram)}%"></span></div>
        ${f.criaram ? `<small>${pct(n, f.criaram)}% das contas${extra}</small>` : ''}</div>`;

    $('#corpo').innerHTML = `
      <div class="adm-kpis">
        <div class="adm-kpi"><small>${ic('pessoa')}Contas novas</small><b>${d.contas_novas}</b><span class="var">${dias === 7 ? nomePeriodo : `+${d.contas_7d} nos últimos 7 dias`}</span></div>
        <div class="adm-kpi"><small>${ic('relogio')}No teste grátis agora</small><b>${d.em_teste}</b><span class="var cinza">${d.teste_acaba_amanha ? `${plural(d.teste_acaba_amanha, 'acaba', 'acabam')} amanhã` : 'nenhum acaba amanhã'}</span></div>
        <div class="adm-kpi"><small>${ic('pix')}Compras</small><b>${d.compras}</b><span class="var">${moeda(d.receita)} recebidos</span></div>
        <div class="adm-kpi"><small>${ic('raio')}Usaram nos últimos 7 dias</small><b>${d.ativos_7d}</b><span class="var cinza">lançaram pelo menos 1 gasto</span></div>
      </div>

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
            ${etapa('Compraram', f.compraram, f.passaram_teste ? ` · das que já passaram dos 7 dias: ${f.compraram_depois_teste} de ${f.passaram_teste}` : '')}
          </div>
        </div>
      </div>

      <div class="adm-duas">
        <div class="adm-card"><h2>Últimos cadastros</h2><p class="sub">Para você saber quem chegou e mandar um oi</p>
          ${d.cadastros.length ? `<div class="adm-tabela"><table><thead><tr><th>Quando</th><th>Conta</th><th class="r">Lançamentos</th><th>Situação</th></tr></thead><tbody>
            ${d.cadastros.map(c => `<tr><td class="muted">${quando(c.criado_em)}</td><td>${esc(c.email)}${c.provedor === 'google' ? ' <span class="muted">· Google</span>' : ''}</td>
              <td class="r num">${c.lancamentos}</td><td>${situacao(c)}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="sub">Ninguém ainda.</p>'}
        </div>
        <div class="adm-card"><h2>Pagamentos</h2><p class="sub">Pix pelo Mercado Pago</p>
          ${d.pagamentos.length ? `<div class="adm-tabela"><table><thead><tr><th>Quando</th><th>Conta</th><th class="r">Valor</th></tr></thead><tbody>
            ${d.pagamentos.map(p => `<tr><td class="muted">${quando(p.pago_em)}</td><td>${esc(p.email)}</td><td class="r num">${moeda(p.valor)}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="sub">Nenhum pagamento ainda.</p>'}
          <p class="sub adm-nao-pagos">Pix gerados e não pagos ${nomePeriodo}: ${d.pix_nao_pagos} (a pessoa chegou até o QR code)</p>
        </div>
      </div>`;
    desenharBarras();
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
