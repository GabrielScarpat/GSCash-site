/* =========================================================
   GSCASH — "Baixar meus dados" (Configurações > Seus dados, e a cópia antes de excluir a conta)
   Uma planilha do Excel com uma aba para cada parte da conta: lançamentos, carteiras e cartões,
   categorias e metas, investimentos e dívidas. Valores e datas vão como números de verdade,
   para a pessoa poder somar e filtrar.
   · navegador: baixa o .xlsx
   · app do iPhone/Android: abre a janela de compartilhar (Salvar em Arquivos, e-mail…), porque o
     download comum não funciona dentro do app
   · Windows: salva em Documentos > GSCASH > Relatórios. Versões do programa sem salvar_arquivo
     salvam uma planilha CSV por aba no mesmo lugar.
   Funciona também sem licença (modo só leitura): os dados são da pessoa.
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const { icone, esc } = GS;

  // a mesma biblioteca que o importador usa para ler .xlsx; só é baixada quando alguém pede
  let xlsx = null;
  GS.carregarXlsx = function () {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsx) {
      xlsx = new Promise((ok, falha) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = () => ok(window.XLSX);
        s.onerror = () => { xlsx = null; falha(new Error('Não foi possível gerar a planilha agora. Verifique a internet e tente de novo.')); };
        document.head.append(s);
      });
    }
    return xlsx;
  };

  /* ---------- o que vai em cada aba ---------- */

  const TIPOS_LANC = { despesa: 'Despesa', receita: 'Receita', transferencia: 'Transferência', pagamento: 'Pagamento de fatura' };
  const TIPOS_INV = { cdb: 'CDB', lci_lca: 'LCI / LCA', tesouro: 'Tesouro', poupanca: 'Poupança', fundos: 'Fundos / Ações', outro: 'Outro' };

  // célula de dinheiro (centavos -> número com 2 casas) e de data (texto ISO -> data do Excel)
  const dinheiro = c => ({ t: 'n', v: Math.round(c) / 100, z: '#,##0.00' });
  const data = iso => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return '';
    return { t: 'n', v: (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000, z: 'dd/mm/yyyy' };
  };
  const pct = n => String(Number(n) || 0).replace('.', ',');

  function comoRende(v) {
    switch (v.indexador) {
      case 'cdi_pct': return `${pct(v.taxa)}% do CDI`;
      case 'cdi_mais': return `CDI + ${pct(v.taxa)}% a.a.`;
      case 'prefixado': return `Prefixado ${pct(v.taxa)}% a.a.`;
      case 'ipca_mais': return `IPCA + ${pct(v.taxa)}% a.a.`;
      case 'selic': return 'Selic';
      case 'poupanca': return 'Poupança';
      default: return 'Sem taxa';
    }
  }

  async function lerConta() {
    const [transacoes, carteiras, categorias, investimentos, dividas] = await Promise.all([
      GS.api.listarTransacoes(), GS.api.listarCarteiras(), GS.api.listarCategorias(),
      GS.api.listarInvestimentos(), GS.api.listarDividas(),
    ]);
    return { transacoes, carteiras, categorias, investimentos, dividas };
  }

  function montarAbas(d) {
    const moeda = GS.moedaAtual().sigla;
    const cat = new Map(d.categorias.map(c => [c.id, c]));
    const cart = new Map(d.carteiras.map(c => [c.id, c]));
    const nomeCart = id => (cart.get(id) || {}).nome || '';
    const porData = (a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0);

    const lancamentos = [['Data', 'Tipo', 'Título', 'Descrição', 'Categoria', 'Subcategoria', 'Carteira', 'Destino', 'Forma', 'Parcelas', `Valor (${moeda})`]];
    [...d.transacoes].sort(porData).forEach(t => {
      const c = cat.get(t.categoriaId);
      const sub = c && (c.subcategorias || []).find(s => s.id === t.subcategoriaId);
      const sinal = t.tipo === 'receita' || t.tipo === 'transferencia' ? 1 : -1;
      lancamentos.push([
        data(t.data), TIPOS_LANC[t.tipo] || t.tipo, t.titulo || '', t.descricao || '', c ? c.nome : '', sub ? sub.nome : '',
        nomeCart(t.carteiraId), nomeCart(t.destinoId), t.forma === 'credito' ? 'Crédito' : 'Débito', t.parcelas || 1, dinheiro(sinal * t.valor),
      ]);
    });

    const carteiras = [['Nome', 'Tipo', `Saldo inicial (${moeda})`, `Saldo hoje (${moeda})`, 'Cartão de crédito', `Limite (${moeda})`, 'Dia do fechamento', 'Dia do vencimento', 'Fatura paga com', 'Escondida do saldo']];
    d.carteiras.forEach(w => {
      const cr = w.credito && w.credito.ativo ? w.credito : null;
      carteiras.push([
        w.nome, (GS.TIPOS_CARTEIRA[w.tipo] || GS.TIPOS_CARTEIRA.corrente).nome, dinheiro(w.saldoInicial || 0),
        dinheiro(GS.calc.saldoCarteira(w, d.transacoes)), cr ? 'Sim' : 'Não', cr ? dinheiro(cr.limite || 0) : '',
        cr ? cr.diaFechamento : '', cr ? cr.diaVencimento : '', cr ? nomeCart(cr.pagarComId) : '', w.oculta ? 'Sim' : 'Não',
      ]);
    });

    const categorias = [['Categoria', 'Tipo', 'Subcategorias', `Orçamento ou meta por mês (${moeda})`]];
    d.categorias.forEach(c => {
      categorias.push([
        c.nome, c.tipo === 'receita' ? 'Receita' : 'Despesa', (c.subcategorias || []).map(s => s.nome).join(', '),
        c.orcamento > 0 ? dinheiro(c.orcamento) : '',
      ]);
    });

    const investimentos = [['Nome', 'Tipo', 'Como rende', 'Quando dá para resgatar', 'Vencimento', `Saldo hoje (${moeda})`, 'Resgatado em']];
    d.investimentos.forEach(v => {
      const w = cart.get(v.id);
      investimentos.push([
        w ? w.nome : '', TIPOS_INV[v.tipo] || 'Outro', comoRende(v), v.liquidez === 'vencimento' ? 'No vencimento' : 'A qualquer dia',
        data(v.vencimento), w ? dinheiro(GS.calc.saldoCarteira(w, d.transacoes)) : '', data(v.resgatadoEm),
      ]);
    });

    const dividas = [['Quem', 'Lado', 'Descrição', 'Data', 'Vencimento', `Valor (${moeda})`, `Já pago (${moeda})`, `Falta (${moeda})`]];
    [...d.dividas].sort(porData).forEach(x => {
      const pago = (x.pagamentos || []).reduce((s, g) => s + g.valor, 0);
      dividas.push([
        x.pessoa, x.lado === 'eu_devo' ? 'Eu devo' : 'Me devem', x.descricao || '', data(x.data), data(x.vencimento),
        dinheiro(x.valor), dinheiro(pago), dinheiro(Math.max(0, x.valor - pago)),
      ]);
    });

    return [
      { nome: 'Lançamentos', linhas: lancamentos },
      { nome: 'Carteiras e cartões', linhas: carteiras },
      { nome: 'Categorias e metas', linhas: categorias },
      { nome: 'Investimentos', linhas: investimentos },
      { nome: 'Dívidas', linhas: dividas },
    ];
  }

  /* ---------- gerar e salvar ---------- */

  async function pasta(abas) {
    const X = await GS.carregarXlsx();
    const wb = X.utils.book_new();
    abas.forEach(a => {
      const ws = X.utils.aoa_to_sheet(a.linhas);
      // largura de cada coluna pelo texto mais comprido (com limite)
      ws['!cols'] = a.linhas[0].map((_, i) => ({
        wch: Math.min(40, Math.max(10, ...a.linhas.map(l => {
          const c = l[i];
          return c && typeof c === 'object' ? 12 : String(c ?? '').length + 2;
        }))),
      }));
      X.utils.book_append_sheet(wb, ws, a.nome);
    });
    return { X, wb };
  }

  // CSV de uma aba, para o programa do Windows que ainda não salva .xlsx
  function csv(linhas) {
    const texto = c => {
      if (c && typeof c === 'object') {
        if (c.z === 'dd/mm/yyyy') return new Date(Date.UTC(1899, 11, 30) + c.v * 86400000).toISOString().slice(0, 10).split('-').reverse().join('/');
        return c.v.toFixed(2).replace('.', ',');
      }
      const s = String(c ?? '');
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return linhas.map(l => l.map(texto).join(';')).join('\r\n');
  }

  const nativo = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  async function salvar() {
    const abas = montarAbas(await lerConta());
    const nome = `GSCASH - meus dados ${GS.isoData(GS.hoje())}`;

    if (GS.noDesktop) {
      const api = await GS.apiDesktop();
      if (api.salvar_arquivo) {
        const { X, wb } = await pasta(abas);
        const r = await api.salvar_arquivo(`${nome}.xlsx`, X.write(wb, { type: 'base64', bookType: 'xlsx' }));
        if (!r || !r.ok) throw new Error((r && r.erro) || 'Não foi possível salvar a planilha.');
        api.mostrar_relatorio(r.caminho);
      } else {
        let ultimo = null;
        for (const a of abas) {
          const r = await api.salvar_planilha(`${nome} - ${a.nome}`, csv(a.linhas));
          if (!r || !r.ok) throw new Error((r && r.erro) || 'Não foi possível salvar a planilha.');
          ultimo = r.caminho;
        }
        api.mostrar_relatorio(ultimo);
      }
      return 'Planilha salva em Documentos > GSCASH > Relatórios';
    }

    const { X, wb } = await pasta(abas);
    const bytes = X.write(wb, { type: 'array', bookType: 'xlsx' });
    const tipo = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    // dentro do app do celular: a janela de compartilhar do sistema (Salvar em Arquivos, e-mail, Drive…)
    if (nativo() && navigator.canShare) {
      const arquivo = new File([bytes], `${nome}.xlsx`, { type: tipo });
      if (navigator.canShare({ files: [arquivo] })) {
        try {
          await navigator.share({ files: [arquivo], title: 'Meus dados do GSCASH' });
          return 'Planilha pronta';
        } catch (err) {
          if (err && err.name === 'AbortError') return null;   // fechou a janela sem escolher
          throw err;
        }
      }
    }

    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: tipo }));
    a.download = `${nome}.xlsx`;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return 'Planilha baixada';
  }

  // botão que mostra "Gerando…" enquanto a planilha é montada
  async function baixar(botao) {
    const original = botao.innerHTML;
    botao.disabled = true;
    botao.innerHTML = '<span class="roda-botao" aria-hidden="true"></span>Gerando…';
    try {
      const aviso = await salvar();
      if (aviso) GS.toast(aviso);
      return !!aviso;
    } catch (err) {
      GS.toast(err.message || 'Não foi possível gerar a planilha.', 'erro');
      return false;
    } finally {
      botao.disabled = false;
      botao.innerHTML = original;
    }
  }

  /* ---------- janela de Configurações ---------- */

  async function abrir() {
    const modal = GS.abrirModal({ titulo: 'Baixar meus dados', corpo: '' });
    modal.body.innerHTML = '<p class="dados-intro">Carregando…</p>';
    let d;
    try {
      d = await lerConta();
    } catch (err) {
      modal.body.innerHTML = `<p class="dados-intro">${esc(err.message || 'Não foi possível ler seus dados agora.')}</p>`;
      return;
    }
    const partes = [
      ['Lançamentos', d.transacoes.length], ['Carteiras e cartões', d.carteiras.length],
      ['Categorias e metas', d.categorias.length], ['Investimentos', d.investimentos.length], ['Dívidas', d.dividas.length],
    ];
    modal.body.innerHTML = `
      <p class="dados-intro">Uma planilha do Excel com tudo o que você guardou no GSCASH, uma aba para cada parte:</p>
      <ul class="dados-abas">${partes.map(([nome, n]) => `<li><b>${esc(nome)}</b><span class="num">${n}</span></li>`).join('')}</ul>
      <p class="dados-nota">Abre no Excel, no Google Planilhas e no Numbers. Os valores ficam em ${esc(GS.moedaAtual().sigla)}.</p>`;
    modal.foot.innerHTML = `
      <button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
      <button type="button" class="btn btn-primary" data-gerar>${icone('download')}Baixar planilha</button>`;
    modal.foot.querySelector('[data-fechar]').addEventListener('click', () => modal.fechar());
    modal.foot.querySelector('[data-gerar]').addEventListener('click', async e => {
      if (await baixar(e.currentTarget)) modal.fechar();
    });
  }

  GS.baixarDados = { abrir, baixar, montarAbas };
})();
