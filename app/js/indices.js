/* =========================================================
   GSCASH — índices do Banco Central e rendimento dos investimentos

   Os índices vêm da API pública do Banco Central (SGS), sem conta nem chave.
   Nada do usuário é enviado: só se pede a série de um índice entre duas datas.
   Ficam guardados no aparelho e são buscados de novo uma vez por dia; sem
   internet, vale o último guardado (a tela mostra de quando é).

   Séries usadas:
     12   CDI de cada dia útil (% ao dia)          4389 CDI ao ano (último)
     11   Selic de cada dia útil (% ao dia)        432  meta da Selic (última)
     433  IPCA de cada mês (%)                     195  poupança: rendimento do mês
                                                        que começa naquele dia (%)

   Cálculo (estimativa, antes de impostos): cada dinheiro que entrou ou saiu do
   investimento é corrigido do dia em que entrou até a data pedida. Datas sem
   índice publicado (o futuro) usam o último valor conhecido; dias úteis do
   futuro = dias de segunda a sexta.
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const CHAVE = 'gscash:indices';
  const API = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.';
  const DIARIAS = { cdi: 12, selic: 11, ipca: 433, poupanca: 195 };
  const ULTIMAS = { cdiAno: 4389, selicMeta: 432 };

  const iso = GS.isoData;
  const doBc = s => { const [d, m, a] = s.split('/'); return `${a}-${m}-${d}`; };
  const paraBc = dataIso => dataIso.split('-').reverse().join('/');
  const somarDiasIso = (dataIso, n) => { const [a, m, d] = dataIso.split('-').map(Number); return iso(new Date(a, m - 1, d + n)); };
  const diaDaSemana = dataIso => { const [a, m, d] = dataIso.split('-').map(Number); return new Date(a, m - 1, d).getDay(); };
  const diasNoMes = dataIso => { const [a, m] = dataIso.split('-').map(Number); return new Date(a, m, 0).getDate(); };

  let dados = null;      // { buscadoEm, desde, cdi: {iso: %}, selic, ipca: {'AAAA-MM': %}, poupanca, cdiAno, selicMeta }
  let carregando = null;

  function lerGuardado() {
    try { return JSON.parse(localStorage.getItem(CHAVE)); } catch (e) { return null; }
  }
  function guardar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(dados)); } catch (e) { /* sem espaço: busca de novo depois */ }
  }

  async function buscarSerie(numero, desde, ate) {
    const url = `${API}${numero}/dados?formato=json&dataInicial=${paraBc(desde)}&dataFinal=${paraBc(ate)}`;
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`Banco Central respondeu ${resp.status}`);
    return resp.json();
  }
  // "/ultimos/1" às vezes volta 304 sem conteúdo; os últimos 3 vêm sempre
  async function buscarUltimo(numero) {
    const resp = await fetch(`${API}${numero}/dados/ultimos/3?formato=json`, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`Banco Central respondeu ${resp.status}`);
    const lista = (await resp.json()).map(x => ({ data: doBc(x.data), valor: Number(x.valor) }));
    return lista.sort((a, b) => a.data.localeCompare(b.data)).pop() || null;
  }

  // garante os índices desde uma data (a aplicação mais antiga). Devolve os dados (ou os guardados, sem internet)
  GS.indices = {
    async carregar(desdeIso) {
      const hojeIso = iso(GS.hoje());
      // séries diárias aceitam até 10 anos por pedido; o IPCA dos últimos 12 meses entra sempre
      const limite = iso(new Date(GS.hoje().getFullYear() - 10, GS.hoje().getMonth(), GS.hoje().getDate() + 1));
      const umAno = iso(new Date(GS.hoje().getFullYear() - 1, GS.hoje().getMonth() - 1, 1));
      const desde = [desdeIso || umAno, umAno].sort()[0] < limite ? limite : [desdeIso || umAno, umAno].sort()[0];
      if (!dados) dados = lerGuardado();
      if (dados && dados.buscadoEm === hojeIso && dados.desde <= desde) return dados;
      if (carregando) return carregando;
      carregando = (async () => {
        try {
          const novo = { buscadoEm: hojeIso, desde };
          const pedidos = Object.entries(DIARIAS).map(async ([nome, n]) => {
            const lista = await buscarSerie(n, desde, hojeIso);
            novo[nome] = {};
            lista.forEach(x => {
              const chave = nome === 'ipca' ? doBc(x.data).slice(0, 7) : doBc(x.data);
              novo[nome][chave] = Number(x.valor);
            });
          });
          const ultimos = Object.entries(ULTIMAS).map(async ([nome, n]) => { novo[nome] = await buscarUltimo(n); });
          await Promise.all([...pedidos, ...ultimos]);
          dados = novo;
          guardar();
        } catch (e) {
          console.warn('Índices do Banco Central indisponíveis; usando os guardados', e);
          if (!dados) throw new Error('Não foi possível buscar os índices do Banco Central. Verifique a internet.');
        } finally {
          carregando = null;
        }
        return dados;
      })();
      return carregando;
    },

    get dados() { return dados; },

    // resumo para a tela: CDI ao ano, Selic, IPCA do último mês, poupança do mês
    resumo() {
      if (!dados) return null;
      const meses = Object.keys(dados.ipca || {}).sort();
      const mesIpca = meses[meses.length - 1];
      const dias = Object.keys(dados.poupanca || {}).sort();
      return {
        cdiAno: dados.cdiAno && dados.cdiAno.valor,
        selicMeta: dados.selicMeta && dados.selicMeta.valor,
        ipcaMes: mesIpca ? { mes: mesIpca, valor: dados.ipca[mesIpca] } : null,
        ipca12: ipca12meses(),
        poupancaMes: dias.length ? dados.poupanca[dias[dias.length - 1]] : null,
        buscadoEm: dados.buscadoEm,
      };
    },

    // fator de correção de um investimento entre duas datas (1 = não rendeu)
    fator,

    // rendimento ao ano equivalente de hoje (para mostrar "rende cerca de 15,0% ao ano")
    taxaAnual(indexador, taxa) {
      if (!dados) return null;
      const r = GS.indices.resumo();
      const t = (Number(taxa) || 0) / 100;
      const cdiDia = r.cdiAno != null ? Math.pow(1 + r.cdiAno / 100, 1 / 252) - 1 : null;
      switch (indexador) {
        case 'cdi_pct': return cdiDia == null ? null : (Math.pow(1 + cdiDia * t, 252) - 1) * 100;
        case 'cdi_mais': return r.cdiAno == null ? null : ((1 + r.cdiAno / 100) * (1 + t) - 1) * 100;
        case 'prefixado': return t * 100;
        case 'ipca_mais': return r.ipca12 == null ? null : ((1 + r.ipca12 / 100) * (1 + t) - 1) * 100;
        case 'selic': return r.selicMeta;
        case 'poupanca': return r.poupancaMes == null ? null : (Math.pow(1 + r.poupancaMes / 100, 12) - 1) * 100;
        default: return null;
      }
    },

    /* Valor de um investimento.
       inv: registro (ou null: carteira antiga, sem taxa); carteira; transacoes: todas.
       Devolve { hoje, noVencimento, investido, ganho } em centavos (estimados). */
    estimar(inv, carteira, transacoes) {
      const hojeIso = iso(GS.hoje());
      const previsto = t => t.id === `${carteira.id}-vr` || t.id === `${carteira.id}-vt`;
      // entradas e saídas de dinheiro (transferências); rendimentos lançados não são dinheiro novo
      const fluxos = transacoes.filter(t => t.tipo === 'transferencia' && !previsto(t) && t.data <= hojeIso
        && (t.destinoId === carteira.id || t.carteiraId === carteira.id))
        .map(t => ({ data: t.data, valor: t.destinoId === carteira.id ? t.valor : -t.valor }));
      const investido = (carteira.saldoInicial || 0) + fluxos.reduce((s, f) => s + f.valor, 0);
      const contabil = GS.calc.saldoCarteira(carteira, transacoes.filter(t => !previsto(t)), hojeIso);

      const semTaxa = !inv || inv.indexador === 'sem_taxa' || !dados;
      // base: o último valor informado à mão (e o que entrou ou saiu depois dele), ou tudo desde o começo
      const base = inv && inv.valorAtual != null ? { data: inv.valorAtualEm, valor: inv.valorAtual } : null;
      const depois = base ? fluxos.filter(f => f.data > base.data) : fluxos;
      const valorEm = ate => {
        if (semTaxa) return base ? base.valor + depois.reduce((s, f) => s + f.valor, 0) : contabil;
        let v = base ? base.valor * fator(inv, base.data, ate) : (carteira.saldoInicial || 0) * fator(inv, primeiraData(), ate);
        depois.forEach(f => { v += f.valor * fator(inv, f.data, ate); });
        return Math.round(v);
      };
      function primeiraData() { return fluxos.length ? fluxos.map(f => f.data).sort()[0] : hojeIso; }

      // venceu e ainda não foi confirmado: vale o que valia no vencimento (depois disso não rende mais)
      const ateHoje = inv && inv.liquidez === 'vencimento' && inv.vencimento && inv.vencimento < hojeIso ? inv.vencimento : hojeIso;
      const hoje = Math.max(0, valorEm(ateHoje));
      const noVencimento = inv && inv.liquidez === 'vencimento' && inv.vencimento && inv.vencimento > hojeIso
        ? Math.max(0, valorEm(inv.vencimento)) : null;
      return { hoje, noVencimento, investido, ganho: hoje - investido };
    },
  };

  /* ---------- fatores ---------- */

  const ultimoValor = mapa => {
    const chaves = Object.keys(mapa || {}).sort();
    return chaves.length ? { chave: chaves[chaves.length - 1], valor: mapa[chaves[chaves.length - 1]] } : null;
  };

  function ipca12meses() {
    const meses = Object.keys(dados.ipca || {}).sort().slice(-12);
    if (!meses.length) return null;
    return (meses.reduce((f, m) => f * (1 + dados.ipca[m] / 100), 1) - 1) * 100;
  }

  // percorre os dias de [de, ate) chamando cada(dataIso, diaUtil, taxaDiaDaSerie)
  function porDia(serie, de, ate, cada) {
    const mapa = (dados && dados[serie]) || {};
    const ult = ultimoValor(mapa);
    for (let d = de; d < ate; d = somarDiasIso(d, 1)) {
      if (d in mapa) cada(d, true, mapa[d]);
      else if (ult && d > ult.chave) {
        const util = diaDaSemana(d) !== 0 && diaDaSemana(d) !== 6;
        cada(d, util, util ? ult.valor : 0);
      }
      // dia passado fora da série: fim de semana ou feriado, não rende
    }
  }

  function fator(inv, de, ate) {
    if (!dados || !de || !ate || ate <= de) return 1;
    const t = (Number(inv.taxa) || 0) / 100;
    let f = 1;
    switch (inv.indexador) {
      case 'cdi_pct': porDia('cdi', de, ate, (d, util, r) => { if (util) f *= 1 + (r / 100) * t; }); return f;
      case 'cdi_mais': {
        const extra = Math.pow(1 + t, 1 / 252);
        porDia('cdi', de, ate, (d, util, r) => { if (util) f *= (1 + r / 100) * extra; });
        return f;
      }
      case 'selic': porDia('selic', de, ate, (d, util, r) => { if (util) f *= 1 + r / 100; }); return f;
      case 'prefixado': {
        let du = 0;
        porDia('cdi', de, ate, (d, util) => { if (util) du++; });
        return Math.pow(1 + t, du / 252);
      }
      case 'ipca_mais': {
        const ipca = dados.ipca || {};
        const ult = ultimoValor(ipca);
        let du = 0;
        for (let d = de; d < ate; d = somarDiasIso(d, 1)) {
          const mes = d.slice(0, 7);
          const m = mes in ipca ? ipca[mes] : ult ? ult.valor : 0;
          f *= Math.pow(1 + m / 100, 1 / diasNoMes(d));
        }
        porDia('cdi', de, ate, (d, util) => { if (util) du++; });
        return f * Math.pow(1 + t, du / 252);
      }
      case 'poupanca': {
        // rende só no "aniversário" de cada mês, com a taxa do mês que começou no aniversário anterior
        const p = dados.poupanca || {};
        const ult = ultimoValor(p);
        const [a, m, dia] = de.split('-').map(Number);
        for (let k = 1; ; k++) {
          const aniversario = iso(new Date(a, m - 1 + k, Math.min(dia, 28)));
          if (aniversario > ate) break;
          const inicio = iso(new Date(a, m - 1 + k - 1, Math.min(dia, 28)));
          const taxa = inicio in p ? p[inicio] : ult ? ult.valor : 0;
          f *= 1 + taxa / 100;
        }
        return f;
      }
      default: return 1;
    }
  }
})();
