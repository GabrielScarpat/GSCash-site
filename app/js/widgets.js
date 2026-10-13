/* =========================================================
   GSCASH — blocos visuais compartilhados entre as telas
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const { icone, esc } = GS;

  GS.widgets = {
    // linha de transação (Painel, Transações e Faturas)
    // naFatura / valor / parcela: usados na página de faturas para mostrar só a parcela
    linhaTransacao(t, ctx, { comData = false, comAcoes = false, valor = null, parcela = null, naFatura = false } = {}) {
      const pagamento = t.tipo === 'pagamento';
      const transferencia = t.tipo === 'transferencia';
      const cat = ctx.categoria.get(t.categoriaId);
      const cart = ctx.carteira.get(t.carteiraId);
      const receita = t.tipo === 'receita';
      const recorrente = t.recorrenciaId
        ? `<span class="sep">·</span><span class="tx-badge" title="Transação recorrente">${icone('repeat')}${t.parcela}/${t.totalParcelas}</span>`
        : '';
      const credito = t.forma === 'credito' && !naFatura
        ? `<span class="sep">·</span><span class="tx-badge credito" title="Compra no crédito">${icone('card')}Crédito${t.parcelas > 1 ? ` ${t.parcelas}x` : ''}</span>`
        : '';
      const seloParcela = parcela ? `<span class="sep">·</span><span class="parcela">${parcela}</span>` : '';

      const icon = transferencia ? 'transfer' : pagamento ? 'card' : (cat ? cat.icone : 'tag');
      const rotulo = pagamento ? 'Pagamento de fatura' : (cat ? cat.nome : 'Sem categoria');
      // com título próprio, a subcategoria aparece junto da categoria: "Moradia › Luz"
      const sub = ctx.subcategoria && ctx.subcategoria.get(t.subcategoriaId);
      const rotuloHtml = sub && sub.nome !== t.titulo
        ? `<span class="caminho">${esc(rotulo)}${icone('chevron-right')}${esc(sub.nome)}</span>`
        : `<span>${esc(rotulo)}</span>`;
      const mostrarCarteira = !naFatura || t.tipo === 'pagamento';
      const contaHtml = c => `<span class="dot" style="background:${c ? c.cor : '#999'}"></span> ${esc(c ? c.nome : 'Carteira removida')}`;

      // transferência: "Nubank → Reserva · descrição"
      const meta = transferencia
        ? `<span class="rota">${contaHtml(cart)}${icone('arrow-right')}${contaHtml(ctx.carteira.get(t.destinoId))}</span>
           ${t.descricao ? `<span class="sep">·</span><span>${esc(t.descricao)}</span>` : ''}`
        : `${rotuloHtml}
           ${mostrarCarteira ? `<span class="sep">·</span><span>${contaHtml(cart)}</span>` : ''}`;

      return `
        <li class="tx ${pagamento ? 'tx-pagamento' : ''} ${transferencia ? 'tx-transfer' : ''}" data-id="${t.id}">
          <span class="tile">${icone(icon)}</span>
          <div class="tx-body">
            <div class="tx-title" title="${esc(t.descricao || t.titulo)}">${esc(t.titulo)}</div>
            <div class="tx-meta">
              ${meta}
              ${comData ? `<span class="sep">·</span><span>${GS.dataCurta(t.data)}</span>` : ''}
              ${credito}${seloParcela}${recorrente}
            </div>
          </div>
          <div class="tx-value num ${receita ? 'income' : ''}">${receita ? '+' : ''}${GS.moeda(valor ?? t.valor)}</div>
          ${comAcoes ? `
          <div class="tx-actions">
            ${pagamento
              ? '<span class="icon-btn" aria-hidden="true"></span>'
              : `<button type="button" class="icon-btn" data-editar="${t.id}" aria-label="Editar ${esc(t.titulo)}">${icone('pencil')}</button>`}
            <button type="button" class="icon-btn danger" data-excluir="${t.id}" aria-label="${pagamento ? 'Desfazer pagamento' : 'Excluir'} ${esc(t.titulo)}">${icone('trash')}</button>
          </div>` : ''}
        </li>`;
    },

    // gráfico de rosca: itens [{ valor, cor, rotulo }]
    rosca(itens, total, rotuloCentro = 'Total') {
      const R = 15.9155; // circunferência = 100
      let acumulado = 0;
      const arcos = total > 0
        ? itens.filter(i => i.valor > 0).map(i => {
            const p = (i.valor / total) * 100;
            const arco = `<circle cx="21" cy="21" r="${R}" fill="none" stroke="${i.cor}" stroke-width="7"
                stroke-dasharray="${p} ${100 - p}" stroke-dashoffset="${-acumulado}"><title>${esc(i.rotulo)}: ${GS.moeda(i.valor)}</title></circle>`;
            acumulado += p;
            return arco;
          }).join('')
        : '';

      return `
        <div class="donut" role="img" aria-label="${esc(rotuloCentro)} ${GS.moeda(total)}">
          <svg viewBox="0 0 42 42">
            <circle cx="21" cy="21" r="${R}" fill="none" stroke="var(--chip)" stroke-width="7"/>
            ${arcos}
          </svg>
          <div class="donut-center">
            <small>${esc(rotuloCentro)}</small>
            <strong class="num">${GS.moedaInteira(total)}</strong>
          </div>
        </div>`;
    },

    legenda(itens, total) {
      return `<ul class="legend">${itens.map(i => `
        <li><span class="sq" style="background:${i.cor}"></span><span>${esc(i.rotulo)}</span><span class="pct num">${GS.pct(i.valor, total)}</span></li>`).join('')}
      </ul>`;
    },

    vazio(titulo, texto = '') {
      return `<div class="empty"><strong>${esc(titulo)}</strong>${texto ? `<span>${esc(texto)}</span>` : ''}</div>`;
    },

    // cor de fundo suave a partir da cor da categoria/carteira
    tileTingido(cor, nomeIcone, classe = '') {
      return `<span class="tile tinted ${classe}" style="--c:${cor}">${icone(nomeIcone)}</span>`;
    },
  };
})();
