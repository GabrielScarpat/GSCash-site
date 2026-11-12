/* =========================================================
   GSCASH — importar extrato, fatura ou planilha
   1. escolher o arquivo (OFX, CSV ou Excel) e para onde vai (carteira, ou cartão e fatura)
   2. dizer o que é cada coluna (só quando o GSCASH não reconhece a planilha sozinho)
   3. revisar: categoria sugerida, repetidos desmarcados; importar (com "Desfazer")
   O arquivo é lido no próprio aparelho; só os lançamentos escolhidos vão para a conta.
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const { icone, esc } = GS;

  /* =========================================================
     Leitura do arquivo
     ========================================================= */

  const semAcento = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = s => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // linha de saldo ("Saldo anterior", "Saldo do dia", "S A L D O") não é lançamento: só mostra quanto tinha
  const ehSaldo = s => /^(saldo|s a l d o)\b/.test(norm(s));

  /* Como os bancos escrevem o histórico, juntado num título só:
     BB: "Compra com Cartão" + "03/11 20:47 EMPORIO DAMIANI" -> "EMPORIO DAMIANI" (com a data da compra)
         "Pix - Enviado" + "03/11 15:05 Ana Souza" -> "Pix enviado · Ana Souza" */
  function tituloDoBanco(principal, detalhe, data, completar) {
    principal = String(principal || '').replace(/\s+/g, ' ').trim().replace(/^pix\s*-\s*/i, 'Pix ');
    detalhe = String(detalhe || '').trim();
    // nome da loja como vem da maquininha: 22 letras do nome, 13 da cidade e o país
    // ("Araujo Loja           Belo Horizontbra" -> "Araujo Loja")
    if (/bra$/i.test(detalhe) && detalhe.length >= 36 && detalhe.length <= 44) detalhe = detalhe.slice(0, detalhe.length - 16);
    detalhe = detalhe.replace(/\s+/g, ' ').trim()
      .replace(/^cp\s*:\s*\d*\s*-\s*/i, '')                  // Inter: "Cp :00000000-NOME"
      .replace(/^\d{3,5}\s+\d{5,}\s+/, '')                     // Inter: "00019 23546018 NOME"
      .replace(/^no estabelecimento\s+/i, '')                   // Inter: "No estabelecimento LOJA"
      .replace(/^(des|rem|dest|fav|orig)\s*:\s*/i, '')          // Bradesco: "DES: NOME 06/11"
      .replace(/\s+\d{2}\/\d{2}$/, '');
    if (/^bco\s*:\s*\d+/i.test(detalhe)) detalhe = '';         // Bradesco: "BCO:237 AGE:00513 CTA:..." (conta, não nome)
    const quando = detalhe.match(/^(\d{2})\/(\d{2})\s+\d{2}:\d{2}(?::\d{2})?\s*(.*)$/);
    if (quando) {
      const d = completar(quando[1], quando[2]);
      if (d && data && d <= data && diasEntre(d, data) <= 10) data = d;
      detalhe = quando[3].replace(/^\d{8,}\s+/, '').trim();  // CPF/conta antes do nome
    }
    let titulo;
    // compra no débito/cartão: o que importa é a loja
    if (/^compra (com cart[aã]o|no d[eé]bito|no cart[aã]o)$/i.test(principal) && detalhe) titulo = detalhe;
    else titulo = detalhe ? `${principal} · ${detalhe}` : principal;
    titulo = titulo.replace(/^pix (enviado|recebido)\s+(?!·)/i, (_, q) => `Pix ${q.toLowerCase()} · `)
      .replace(/^pix (enviado|recebido)\b/i, (_, q) => `Pix ${q.toLowerCase()}`);
    return { titulo: titulo.replace(/\s+/g, ' ').trim(), data };
  }

  // Inter: 'Pix recebido: "Cp :00000000-NOME"' -> ['Pix recebido', 'Cp :00000000-NOME']
  const comAspas = t => String(t || '').match(/^([^:"]{3,40}):\s*"(.*)"\s*$/);

  // completa "dd/mm" sem ano pela data do lançamento (o mais recente possível até ela)
  const completarPerto = base => (d, m) => {
    const ano = Number(String(base).slice(0, 4));
    const mesmoAno = dataValida(ano, Number(m), Number(d));
    return mesmoAno && mesmoAno <= base ? mesmoAno : dataValida(ano - 1, Number(m), Number(d));
  };

  function decodificar(buf) {
    const bytes = new Uint8Array(buf);
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
    } catch (e) {
      return new TextDecoder('windows-1252').decode(bytes);  // bancos brasileiros costumam exportar assim
    }
  }

  const dois = n => String(n).padStart(2, '0');
  function dataValida(a, m, d) {
    const dt = new Date(a, m - 1, d);
    return dt.getFullYear() === a && dt.getMonth() === m - 1 && dt.getDate() === d ? `${a}-${dois(m)}-${dois(d)}` : null;
  }

  // "02/10/2026", "2/10/26", "2026-10-02", "20261002120000[-3:BRT]" ou número de série do Excel -> "2026-10-02"
  function dataIso(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return dataValida(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return dataValida(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
    if (m) return dataValida(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
    m = s.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m) return dataValida(+m[1], +m[2], +m[3]);
    return null;
  }

  // qual é o separador decimal do arquivo: ',' (1.234,56) ou '.' (1,234.56)
  function separadorDecimal(valores) {
    let virgula = 0, ponto = 0;
    valores.forEach(v => {
      if (typeof v !== 'string') return;
      if (/,\d{1,2}\s*[CD]?$/i.test(v.trim())) virgula++;
      else if (/\.\d{1,2}\s*[CD]?$/i.test(v.trim())) ponto++;
    });
    return ponto > virgula ? '.' : ',';
  }

  // "R$ -1.234,56", "(12,00)", "123,45 D", -12.5, "¥1,500" -> centavos com sinal (negativo = saída)
  function centavos(v, decimal = ',') {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
    let s = String(v ?? '').trim();
    if (!s) return null;
    const negativo = /^\(.*\)$/.test(s) || /[-−]/.test(s) || /\d\s*D$/i.test(s);
    s = s.replace(/[^\d.,]/g, '');
    if (!/\d/.test(s)) return null;
    // separador que aparece mais de uma vez, ou com 3 dígitos depois, é de milhar, não de centavos:
    // valores sem centavos (iene) como "1,500" e "1,500,000" são 1500 e 1500000, não 1,50
    const partes = s.split(decimal);
    const soMilhar = partes.length > 2 || (partes.length === 2 && partes[1].length === 3);
    const numero = soMilhar ? s.replace(/[.,]/g, '')
      : decimal === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    const n = Number(numero);
    return Number.isFinite(n) ? Math.round(n * 100) * (negativo ? -1 : 1) : null;
  }

  // CSV com ; , ou tab (o mais comum nas primeiras linhas), respeitando aspas
  function lerCsv(texto) {
    const amostra = texto.split(/\r?\n/).slice(0, 15).join('\n');
    const contar = c => amostra.split('"').filter((_, i) => i % 2 === 0).join('').split(c).length - 1;
    const sep = [';', ',', '\t'].sort((a, b) => contar(b) - contar(a))[0];
    const linhas = [];
    let linha = [], campo = '', aspas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (aspas) {
        if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') aspas = false;
        else campo += c;
      } else if (c === '"') aspas = true;
      else if (c === sep) { linha.push(campo.trim()); campo = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto[i + 1] === '\n') i++;
        linha.push(campo.trim());
        if (linha.some(x => x !== '')) linhas.push(linha);
        linha = []; campo = '';
      } else campo += c;
    }
    linha.push(campo.trim());
    if (linha.some(x => x !== '')) linhas.push(linha);
    return linhas;
  }

  // OFX (SGML ou XML): conta ou cartão, banco e os lançamentos <STMTTRN>
  function lerOfx(texto) {
    const tag = (bloco, nome) => ((bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i')) || [])[1] || '').trim();
    const linhas = texto.split(/<STMTTRN>/i).slice(1).map(b => b.split(/<\/STMTTRN>/i)[0]).map(b => {
      const valorTexto = tag(b, 'TRNAMT');
      const data = dataIso(tag(b, 'DTPOSTED'));
      let titulo = (tag(b, 'MEMO') || tag(b, 'NAME')).replace(/\s+/g, ' ');
      const aspas = comAspas(titulo);
      // Inter: MEMO 'Pix enviado: "00019 23546018 IEZICA SOUSA"', NAME 'Iezica Fernanda Cassemiro De Sousa'
      if (aspas && data) titulo = tituloDoBanco(aspas[1], tag(b, 'NAME') || aspas[2], data, completarPerto(data)).titulo || titulo;
      return {
        data,
        valor: centavos(valorTexto, valorTexto.includes(',') && !valorTexto.includes('.') ? ',' : '.'),
        titulo,
        fitid: tag(b, 'FITID'),
      };
    }).filter(l => l.data && l.valor);
    return {
      tipo: 'ofx',
      cartao: /<CCSTMTRS>/i.test(texto),
      banco: `${tag(texto, 'ORG')} ${tag(texto, 'BANKID')} ${tag(texto, 'FID')}`,
      linhas,
    };
  }

  // Excel: a biblioteca só é baixada quando alguém escolhe um .xlsx
  let xlsx = null;
  function carregarXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsx) {
      xlsx = new Promise((ok, falha) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = () => ok(window.XLSX);
        s.onerror = () => { xlsx = null; falha(new Error('Não foi possível abrir arquivos do Excel agora. Salve a planilha como CSV e tente de novo.')); };
        document.head.append(s);
      });
    }
    return xlsx;
  }

  /* ---------- extrato em PDF ----------
     O PDF não tem colunas de verdade: só textos soltos com posição. Juntamos os textos da mesma
     altura em linhas e lemos a parte "Movimentação": a coluna de valores é a que mais aparece;
     a descrição continua nas linhas de baixo (ex.: "COMPRA CARTAO DEB MC" / "05/09 PADARIA X").
     O que vem depois no PDF (compras do cartão, comprovantes, investimentos) repete lançamentos
     e fica de fora. Feito sobre o extrato do Santander; outros bancos parecidos também funcionam.
     O extrato novo do Santander ("Detalhe dos movimentos") põe a descrição em volta da linha da
     data e do valor: o tipo logo acima ("Pix recebido") e o nome logo abaixo ("Ana Souza"). */

  let pdfjs = null;
  function carregarPdf() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfjs) {
      pdfjs = new Promise((ok, falha) => {
        const base = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
        const s = document.createElement('script');
        s.src = base + 'pdf.min.js';
        s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js'; ok(window.pdfjsLib); };
        s.onerror = () => { pdfjs = null; falha(new Error('Não foi possível abrir PDFs agora. Verifique a internet e tente de novo.')); };
        document.head.append(s);
      });
    }
    return pdfjs;
  }

  // páginas -> linhas [{ pagina, y, altura, itens: [{ s, x, x2 }] }], de cima para baixo
  async function linhasDoPdf(buf) {
    const lib = await carregarPdf();
    let pdf;
    try {
      pdf = await lib.getDocument({ data: buf }).promise;
    } catch (e) {
      if (e && e.name === 'PasswordException') throw new Error('Esse PDF tem senha. Abra o extrato, salve uma cópia sem senha (em Imprimir, escolha "Salvar como PDF") e tente de novo.');
      throw e;
    }
    const linhas = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const pagina = await pdf.getPage(n);
      const { items } = await pagina.getTextContent();
      const daPagina = [];
      items.forEach(it => {
        const s = String(it.str || '').replace(/\s+/g, ' ').trim();
        if (!s) return;
        const x = it.transform[4], y = it.transform[5], altura = Math.abs(it.transform[3]) || it.height || 8;
        let l = daPagina.find(o => Math.abs(o.y - y) < Math.max(2, altura * 0.35));
        if (!l) daPagina.push(l = { pagina: n, y, altura, itens: [] });
        l.itens.push({ s, x, x2: x + (it.width || 0) });
      });
      // o PDF costuma vir em pedacinhos ("CO" "M" "P" "R" "A"): pedaços colados viram uma palavra,
      // um espacinho vira espaço, e um vão maior separa as colunas
      daPagina.sort((a, b) => b.y - a.y).forEach(l => {
        l.itens.sort((a, b) => a.x - b.x);
        const juntos = [];
        l.itens.forEach(i => {
          const ant = juntos[juntos.length - 1];
          const vao = ant ? i.x - ant.x2 : Infinity;
          // o sinal do valor às vezes vem separado: "1.851,00" "(-)", "150,00" "D"
          const sinalSolto = ant && SINAL_PDF.test(i.s) && VALOR_PDF.test(ant.s) && vao < l.altura * 3;
          // a data é uma coluna: nunca se junta ao texto que vem depois (Itaú: "09/10/2026" + "PAG BOLETO...")
          const depoisDaData = ant && DATA_PDF.test(ant.s) && vao > 1.5;
          if (ant && !depoisDaData && (vao < l.altura * 0.8 || sinalSolto)) {
            ant.s += (vao > 1.5 ? ' ' : '') + i.s;
            ant.x2 = Math.max(ant.x2, i.x2);
          } else juntos.push({ ...i });
        });
        l.itens = juntos;
        linhas.push(l);
      });
    }
    if (!linhas.length) throw new Error('Esse PDF é uma imagem (foto ou digitalização), sem texto para ler. Baixe o extrato direto do app ou do site do banco, de preferência em OFX ou CSV.');
    return linhas;
  }

  const MESES_PDF = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const DATA_PDF = /^(\d{2})\/(\d{2})(?:\/(\d{2}|\d{4}))?$|^(\d{2})-(\d{2})-(\d{4})$/;  // "05/09", "05/09/2026", "05-09-2026" (Mercado Pago)
  const partesData = s => { const m = s.match(DATA_PDF); return m[4] ? [m[0], m[4], m[5], m[6]] : m; };
  // "1.234,56", "-R$ 30,00", "1.851,00 (-)" (BB), "150,00 D" / "150,00 C"
  const VALOR_PDF = /^-?\s*(?:R\$\s*)?-?\(?\d{1,3}(?:\.\d{3})*,\d{2}\)?-?(?:\s*(?:\([+-]\)|[CD]|[+-]))?$/;
  const SINAL_PDF = /^(?:\([+-]\)|[CD]|[+-])$/;
  const textoDe = itens => itens.map(i => i.s).join(' ').replace(/\s+/g, ' ').trim();

  /* ---------- conferência pelos saldos do extrato ----------
     valores: centavos de cada lançamento lido, na ordem do arquivo; saldos: [{ pos, valor }], o saldo impresso
     depois dos "pos" primeiros lançamentos. O primeiro saldo é o ponto de partida; cada saldo seguinte tem que
     bater com ele mais o que foi lido até ali. Uma linha que o leitor perdeu (ou leu com o sinal errado) aparece aqui.
     Volta null quando o arquivo não tem saldos suficientes para conferir. */
  // linha: o saldo é o da coluna de saldo da própria linha (pos - 1), não uma linha de saldo à parte.
  // Extrato do mais novo para o mais antigo (Itaú, Inter, Santander): o saldo de um ponto é o de
  // tudo o que vem DEPOIS dele no arquivo, então a soma é feita de baixo para cima.
  // Linha de saldo com data ("SALDO DO DIA 09/10", "Saldo anterior"): confere pela data, somando tudo o que
  // aconteceu até aquele dia, qualquer que seja o lugar dela no arquivo (o Itaú põe embaixo dos lançamentos do dia).
  // Saldo de um dia depois do último lançamento é ignorado: pode incluir rendimento que ainda não virou lançamento.
  function conferirSaldos(valores, saldos, datas = []) {
    const n = valores.length;
    const datasLidas = datas.filter(Boolean);
    const ultimaData = datasLidas.reduce((a, b) => (b > a ? b : a), '');
    saldos = saldos.filter(s => s.linha || !s.data || !ultimaData || s.data <= ultimaData);
    if (saldos.length < 2) return null;
    const invertido = datasLidas.length > 1 && datasLidas[0] > datasLidas[datasLidas.length - 1];
    const acum = [0];
    valores.forEach(v => acum.push(acum[acum.length - 1] + (v || 0)));
    const ateODia = d => valores.reduce((t, v, i) => t + (datas[i] && datas[i] <= d ? v || 0 : 0), 0);
    // quanto já foi somado até cada saldo
    const somado = s => (!s.linha && s.data ? ateODia(s.data)
      : invertido ? acum[n] - acum[s.linha ? s.pos - 1 : s.pos] : acum[s.pos]);
    const lugares = new Set(saldos.map(somado));
    if (lugares.size < 2) return null;  // todos no mesmo ponto: não há o que conferir
    const base = saldos[0].valor - somado(saldos[0]);
    for (const s of saldos.slice(1)) {
      const lido = base + somado(s);
      if (lido !== s.valor) return { ok: false, diferenca: s.valor - lido, data: datas[Math.max(0, s.pos - 1)] || null, saldo: s.valor };
    }
    const ultimo = saldos[saldos.length - 1];
    return { ok: true, saldo: ultimo.valor, conferidos: saldos.length - 1 };
  }

  function extratoDoPdf(linhas) {
    const todo = norm(linhas.slice(0, 80).map(l => textoDe(l.itens)).join(' '));
    // mês e ano do extrato ("setembro/2026"), para completar datas "05/09"
    const ref = todo.match(new RegExp(`(${MESES_PDF.join('|')}) ?(?:de )?(20\\d{2})`));
    // sem o mês por extenso (BB: "Período: 01 a 12/11/2026"), vale a data completa mais recente do topo
    const ultima = (todo.match(/\b\d{1,2} \d{2} 20\d{2}\b/g) || []).map(s => s.split(' ').map(Number))
      .sort((a, b) => (b[2] * 12 + b[1]) - (a[2] * 12 + a[1]))[0];
    const mesRef = ref ? MESES_PDF.indexOf(ref[1]) + 1 : ultima ? ultima[1] : GS.hoje().getMonth() + 1;
    const anoRef = ref ? Number(ref[2]) : ultima ? ultima[2] : GS.hoje().getFullYear();
    const completar = (d, m, a) => {
      const ano = a ? (a.length === 2 ? 2000 + Number(a) : Number(a)) : (Number(m) > mesRef ? anoRef - 1 : anoRef);
      return dataValida(ano, Number(m), Number(d));
    };

    let inicio = linhas.findIndex(l => /movimenta|movimentos/i.test(norm(textoDe(l.itens))));
    if (inicio < 0) inicio = 0;
    // onde a lista de lançamentos acaba (só vale depois do primeiro lançamento: antes pode ser o cabeçalho)
    const fim = /n.mero do cart.o|comprovantes? de pagamento|aplica..o n|investimentos|resumo do m.s|saldo final|indicadores|informa..es adicionais|lan.amentos futuros/i;

    // coluna dos valores: a borda direita que mais se repete entre as linhas com valor
    const bordas = new Map();
    linhas.slice(inicio, inicio + 120).forEach(l => l.itens.filter(i => VALOR_PDF.test(i.s)).slice(0, 1)
      .forEach(i => { const k = Math.round(i.x2 / 6); bordas.set(k, (bordas.get(k) || 0) + 1); }));
    const colValor = ([...bordas.entries()].sort((a, b) => b[1] - a[1])[0] || [0])[0] * 6;
    const xs = linhas.slice(inicio).map(l => l.itens[0]).filter(i => i && DATA_PDF.test(i.s)).map(i => i.x);
    const colData = xs.length ? Math.min(...xs) : -1;
    // Bradesco: "Crédito (R$)" e "Débito (R$)" em colunas separadas, valores sem sinal
    const cabecalhoCD = linhas.slice(0, inicio + 40).map(l => ({
      c: l.itens.find(i => /^credito\b/.test(norm(i.s))), d: l.itens.find(i => /^debito\b/.test(norm(i.s))),
    })).find(h => h.c && h.d);
    const naColuna = (i, col) => col && VALOR_PDF.test(i.s) && Math.abs(i.x2 - col.x2) < 14;
    const movDe = vals => (cabecalhoCD ? vals.find(i => naColuna(i, cabecalhoCD.c) || naColuna(i, cabecalhoCD.d))
      : vals.find(i => Math.abs(i.x2 - colValor) < 14));
    const valorDe = i => (cabecalhoCD && naColuna(i, cabecalhoCD.d) ? -Math.abs(centavos(i.s, ',')) : centavos(i.s, ','));
    // Inter: a data vem num título por dia ("12 de Outubro de 2026 Saldo do dia: R$ 1.330,33")
    const DIA_EXTENSO = new RegExp(`^(\\d{1,2}) de (${MESES_PDF.join('|')}) de (20\\d{2})\\b`);

    const lista = linhas.slice(inicio + 1);
    const ehData = l => l && l.itens[0] && DATA_PDF.test(l.itens[0].s) && Math.abs(l.itens[0].x - colData) < 6;
    const ehValor = i => !!movDe([i]);
    // sem nada entre a data e o valor na maioria das linhas: a descrição está em volta (Santander novo)
    const comValor = lista.filter(l => ehData(l) && l.itens.some(ehValor));
    const sanduiche = comValor.length > 0 &&
      comValor.filter(l => l.itens.length - 1 - l.itens.filter(i => VALOR_PDF.test(i.s)).length === 0).length > comValor.length / 2;
    // linha só de texto, colada (acima ou abaixo) na linha da data
    const vizinha = (v, l, folga = 1.1) => v && v.pagina === l.pagina && !ehData(v) && !v.itens.some(i => VALOR_PDF.test(i.s)) &&
      Math.abs(v.y - l.y) < l.altura * folga ? textoDe(v.itens) : '';
    // o que fica entre a data e o valor, sem lote e nº do documento (BB: "99008 174848")
    const descricaoDe = (itens, mov) => itens.filter(i => i.x2 <= mov.x + 1 && i !== mov && !/^(\d{4,}|-)$/.test(i.s));
    // linha com data e valor, mas sem histórico nela: o histórico está nas linhas de cima e de baixo (BB)
    const semHistorico = l => {
      if (!ehData(l)) return false;
      const mov = l.itens.find(ehValor);
      return !!mov && !descricaoDe(l.itens.slice(1), mov).length;
    };

    const saida = [];
    // saldos impressos no extrato (linha de saldo ou coluna de saldo): servem para conferir a leitura
    const saldos = [];
    // linha = true: saldo da coluna de saldo do lançamento que acabou de entrar
    const anotarSaldo = (item, linha = false, quando = null) => {
      const v = item && centavos(item.s, ',');
      if (v !== null && v !== undefined && item) saldos.push({ pos: saida.length, valor: v, linha, data: linha ? null : quando });
    };
    let data = null, atual = null, lancados = 0;
    for (let k = 0; k < lista.length; k++) {
      const l = lista[k];
      const texto = textoDe(l.itens);
      if (fim.test(semAcento(texto))) { if (saida.length) break; continue; }
      const porExtenso = norm(texto).match(DIA_EXTENSO);
      if (porExtenso) {
        data = dataValida(Number(porExtenso[3]), MESES_PDF.indexOf(porExtenso[2]) + 1, Number(porExtenso[1]));
        atual = null;
        continue;
      }
      let itens = l.itens;
      const primeiro = itens[0];
      const temData = primeiro && DATA_PDF.test(primeiro.s) && Math.abs(primeiro.x - colData) < 6;
      const valores = itens.filter(i => VALOR_PDF.test(i.s));
      const mov = movDe(valores);
      if (sanduiche) {
        if (!mov || !temData) continue;
        const m = partesData(primeiro.s);
        const quando = completar(m[1], m[2], m[3]);
        const acima = vizinha(lista[k - 1], l), abaixo = vizinha(lista[k + 1], l);
        const principal = acima || abaixo;
        if (quando && principal && /saldo/i.test(norm(principal))) anotarSaldo(mov, false, quando);
        if (!quando || !principal || /saldo/i.test(norm(principal))) continue;
        saida.push({ data: quando, valor: valorDe(mov), principal, detalhe: acima && abaixo ? [abaixo] : [] });
        anotarSaldo(valores.find(i => i !== mov && i.x > mov.x2), true);
        continue;
      }
      if (!mov) {
        // "SALDO DO DIA" com o valor na coluna de saldo (Itaú): só pula a linha
        const resto = textoDe(itens.filter(i => !DATA_PDF.test(i.s) && !VALOR_PDF.test(i.s) && !/^\d{4,}$/.test(i.s)));
        if (/saldo/.test(norm(resto)) || ehSaldo(resto)) {
          const doDia = temData ? (m => completar(m[1], m[2], m[3]))(partesData(primeiro.s)) : data;
          anotarSaldo(valores[valores.length - 1], false, doDia);
          atual = null;
          continue;
        }
        // linha com data e valor em outra coluna: começou outra tabela (ex.: compras do cartão)
        if (temData && valores.length && lancados >= 3) break;
        if (temData) { const m = partesData(primeiro.s); data = completar(m[1], m[2], m[3]); }
        // texto colado em cima de uma linha de data sem histórico: é o começo do próximo lançamento
        const proxima = lista[k + 1];
        if (proxima && semHistorico(proxima) && proxima.pagina === l.pagina && Math.abs(proxima.y - l.y) < proxima.altura * 1.5) { atual = null; continue; }
        const perto = atual && atual.pagina === l.pagina && atual.ultimoY - l.y < atual.altura * 2.8;
        if (perto && !valores.length && atual.detalhe.length < 2) { atual.detalhe.push(texto); atual.ultimoY = l.y; }
        else atual = null;
        continue;
      }
      if (temData) { const m = partesData(primeiro.s); data = completar(m[1], m[2], m[3]); itens = itens.slice(1); }
      let principal = textoDe(descricaoDe(itens, mov));
      if (!principal && data) {
        // histórico em volta da linha (BB): tipo em cima ("Pix - Enviado"), quem e quando embaixo
        // Mercado Pago: o mesmo texto quebrado em duas linhas ("Liberação de dinheiro Venda" / "com Pix")
        const acima = vizinha(lista[k - 1], l, 1.5), abaixo = vizinha(lista[k + 1], l, 1.5);
        // linha de baixo com campo do banco ("DES: NOME", "BCO:237 ...") é detalhe, não o texto continuando
        const quebrado = acima && abaixo && !/^\d{2}\/\d{2}\s/.test(abaixo) && !/^(des|rem|dest|fav|orig|bco)\s*:/i.test(abaixo);
        principal = quebrado ? `${acima} ${abaixo}` : acima || abaixo;
        if (principal && ehSaldo(principal)) anotarSaldo(mov, false, data);
        if (!data || !principal || ehSaldo(principal)) { atual = null; continue; }
        saida.push({ data, valor: valorDe(mov), principal, detalhe: acima && abaixo && !quebrado ? [abaixo] : [] });
        anotarSaldo(valores.find(i => i !== mov && i.x > mov.x2), true);  // coluna de saldo ao lado (Mercado Pago, Bradesco)
        if (abaixo) k++;
        atual = null;
        lancados++;
        continue;
      }
      if (principal && (/saldo/i.test(norm(principal)) || ehSaldo(principal))) anotarSaldo(mov, false, data);
      // "Total" no fim da tabela (Bradesco) soma o que já foi lido
      if (!data || !principal || /saldo/i.test(norm(principal)) || ehSaldo(principal) || /^(total|totais)\b/i.test(principal)) { atual = null; continue; }
      atual = { data, valor: valorDe(mov), principal, detalhe: [], pagina: l.pagina, ultimoY: l.y, altura: l.altura };
      saida.push(atual);
      anotarSaldo(valores.find(i => i !== mov && i.x > mov.x2), true);
      lancados++;
    }

    const conferencia = conferirSaldos(saida.map(t => t.valor), saldos, saida.map(t => t.data));
    const lidas = saida.filter(t => t.valor).map(t => {
      let principal = t.principal, detalhe = t.detalhe.join(' ').trim(), data = t.data;
      const aspas = !detalhe && comAspas(principal);
      if (aspas) { principal = aspas[1]; detalhe = aspas[2]; }
      // BB: "Compra com Cartão" / "Pix - Enviado" com "03/11 20:47 NOME" embaixo; Inter (aspas); Bradesco ("DES: NOME")
      if (aspas || /^\d{2}\/\d{2}\s+\d{2}:\d{2}/.test(detalhe) || /^(des|rem|dest|fav|orig|bco)\s*:/i.test(detalhe)
        || /^(compra com cart|pix\s*-\s)/i.test(principal)) {
        const r = tituloDoBanco(principal, detalhe, data, (d, m) => completar(d, m));
        return { data: r.data, valor: t.valor, titulo: r.titulo || 'Lançamento' };
      }
      // compra no cartão de débito: a loja e a data da compra vêm na linha de baixo ("05/09 PADARIA X")
      const cartao = principal.match(/^compra cart[aã]o (?:deb|d[eé]bito|cred|cr[eé]dito)\w*(?: mc| visa| elo| maestro)?\s*(.*)$/i);
      if (cartao) principal = cartao[1];
      if (/^\d{2}\/\d{2}$/.test(detalhe) && !cartao) detalhe = '';  // só a data repetida
      const comData = `${principal} ${detalhe}`.trim().match(/^(\d{2})\/(\d{2})(?:\s+(.*))?$/);
      let titulo = `${principal} ${detalhe}`.trim();
      if (comData) {
        const d = completar(comData[1], comData[2]);
        if (d && d <= data && diasEntre(d, data) <= 10) data = d;
        titulo = comData[3] || 'Compra no cartão de débito';
      }
      // código de controle do banco ("ICK48462523") não é nome de ninguém
      if (!cartao && detalhe && !/^(?=.*\d)[A-Z0-9]{6,}$/i.test(detalhe) && !/^[A-Z0-9]{6,}$/.test(detalhe)) titulo = `${principal} · ${detalhe}`;
      else if (!cartao) titulo = principal;
      // Itaú: "PIX TRANSF JOAO S01/10" -> a data do Pix colada no nome sai do título
      const colada = /^(pix|ted|doc|transf)/i.test(titulo) && titulo.match(/\s?(\d{2})\/(\d{2})$/);
      if (colada) {
        const d = completar(colada[1], colada[2]);
        if (d && diasEntre(d, data) <= 10) titulo = titulo.slice(0, colada.index).trim();
      }
      titulo = titulo.replace(/^pix (enviado|recebido)\s+(?!·)/i, (_, q) => `Pix ${q.toLowerCase()} · `)
        .replace(/^pix (enviado|recebido)/i, (_, q) => `Pix ${q.toLowerCase()}`);
      return { data, valor: t.valor, titulo: titulo.replace(/\s+/g, ' ').trim() || 'Lançamento' };
    });
    lidas.conferencia = conferencia;
    return lidas;
  }

  // bancos que não escrevem o próprio nome no arquivo (o PDF do BB só tem o logo): reconhecidos pelas colunas
  function bancoPeloLayout(texto) {
    const n = norm(texto);
    if (/\bdia lote documento historico valor\b|\bdata lancamento detalhes n documento valor tipo lancamento\b|\bdependencia origem historico data do balancete\b/.test(n)) return 'banco do brasil';
    if (/\brelease date transaction type\b/.test(n)) return 'mercado pago';
    if (/\bdata lancamento dcto credito r debito r saldo r\b|\bdata historico docto credito r debito r saldo r\b/.test(n)) return 'bradesco';
    return '';
  }

  async function lerArquivo(arquivo) {
    if (arquivo.size > 15 * 1024 * 1024) throw new Error('O arquivo é grande demais (mais de 15 MB).');
    const nome = arquivo.name || 'arquivo';
    const buf = await arquivo.arrayBuffer();
    if (/\.pdf$/i.test(nome) || new TextDecoder('ascii').decode(new Uint8Array(buf.slice(0, 5))) === '%PDF-') {
      const linhas = await linhasDoPdf(buf);
      const texto = linhas.slice(0, 60).map(l => textoDe(l.itens)).join(' ');
      return { tipo: 'ofx', formato: 'pdf', nome, cartao: false, banco: `${bancoPeloLayout(texto)} ${texto}`, linhas: extratoDoPdf(linhas) };
    }
    if (/\.(xlsx|xls|ods)$/i.test(nome)) {
      const X = await carregarXlsx();
      const livro = X.read(buf, { type: 'array' });
      const folha = livro.Sheets[livro.SheetNames[0]];
      const linhas = X.utils.sheet_to_json(folha, { header: 1, raw: true, defval: '' })
        .filter(l => l.some(c => String(c).trim() !== ''));
      return { tipo: 'tabela', nome, tabela: linhas };
    }
    const texto = decodificar(buf);
    if (/\.ofx$|\.qfx$/i.test(nome) || /<OFX>|OFXHEADER/i.test(texto.slice(0, 2000))) return { ...lerOfx(texto), nome };
    return { tipo: 'tabela', nome, tabela: lerCsv(texto) };
  }

  /* =========================================================
     Colunas da planilha
     ========================================================= */

  const PAPEIS = [
    ['ignorar', 'Ignorar'], ['data', 'Data'], ['descricao', 'Descrição'], ['valor', 'Valor'],
    ['entrada', 'Entrada'], ['saida', 'Saída'], ['categoria', 'Categoria'], ['tipo', 'Tipo (entrada/saída)'],
    ['complemento', 'Complemento da descrição'],
  ];

  function papelPeloNome(cab) {
    const n = norm(cab);
    if (!n) return null;
    // Mercado Pago: RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE
    if (/^(release date|money release date|date created)$/.test(n)) return 'data';
    if (/^transaction type$/.test(n)) return 'descricao';
    if (/^(transaction net amount|settlement net amount|net amount)$/.test(n)) return 'valor';
    if (/\b(saldo|balance)\b/.test(n)) return null;
    if (/^(data|date|dt)\b|data (da |de )?(compra|transacao|lancamento|movimento)/.test(n)) return 'data';
    if (/categoria|category/.test(n)) return 'categoria';
    // BB: "Tipo Lançamento" (Entrada/Saída)
    if (/^(tipo|natureza|d c|c d|debito credito)$|^tipo (de )?(lancamento|transacao|movimento|operacao)$/.test(n)) return 'tipo';
    // BB: "Detalhes" traz quem recebeu ou a loja ("03/11 20:47 EMPORIO DAMIANI")
    if (/^(detalhes?|complemento|informacoes? (complementares?|adicionais))$/.test(n)) return 'complemento';
    if (/^(entrada|entradas|credito|creditos|receita|receitas)( r)?$/.test(n)) return 'entrada';
    if (/^(saida|saidas|debito|debitos|despesa|despesas)( r)?$/.test(n)) return 'saida';
    if (/^(valor|amount|value|quantia|montante|vlr|valor r|valor rs|preco)/.test(n)) return 'valor';
    if (/descri|historico|title|titulo|estabelecimento|lancamento|nome|memo|detalhe|identificacao/.test(n)) return 'descricao';
    return null;
  }

  // acha a linha de cabeçalho e o papel de cada coluna; sem cabeçalho, adivinha pelo conteúdo
  function adivinharColunas(tabela) {
    for (let i = 0; i < Math.min(10, tabela.length); i++) {
      const papeis = tabela[i].map(papelPeloNome);
      const tem = p => papeis.includes(p);
      if (tem('data') && (tem('descricao') || tem('valor') || tem('entrada') || tem('saida'))) {
        const vistos = new Set();  // um papel por coluna (o primeiro que aparecer)
        const unicos = papeis.map(p => {
          if (p === 'descricao' && vistos.has('descricao') && !vistos.has('complemento')) { vistos.add('complemento'); return 'complemento'; }
          return p && !vistos.has(p) && vistos.add(p) ? p : 'ignorar';
        });
        // só "Detalhes", sem outra descrição: ela é a descrição
        if (!unicos.includes('descricao') && unicos.includes('complemento')) unicos[unicos.indexOf('complemento')] = 'descricao';
        return { inicio: i + 1, papeis: unicos, cabecalho: tabela[i] };
      }
    }
    const largura = Math.max(...tabela.slice(0, 20).map(l => l.length));
    const amostra = tabela.slice(0, 20);
    const papeis = Array(largura).fill('ignorar');
    const colunas = [...Array(largura).keys()];
    const fracao = (c, teste) => amostra.filter(l => teste(l[c])).length / amostra.length;
    const colData = colunas.find(c => fracao(c, dataIso) > 0.6);
    const colValor = colunas.find(c => c !== colData && fracao(c, v => /^[-−(]?\s*(R\$\s*)?[\d.,]+\)?\s*[CD]?$/i.test(String(v).trim()) || typeof v === 'number') > 0.6);
    const colTexto = colunas.filter(c => c !== colData && c !== colValor)
      .sort((a, b) => amostra.reduce((s, l) => s + String(l[b] ?? '').length, 0) - amostra.reduce((s, l) => s + String(l[a] ?? '').length, 0))[0];
    if (colData !== undefined) papeis[colData] = 'data';
    if (colValor !== undefined) papeis[colValor] = 'valor';
    if (colTexto !== undefined) papeis[colTexto] = 'descricao';
    // primeira linha sem data onde as outras têm: é um cabeçalho com nomes que não conhecemos
    const titulos = colData !== undefined && !dataIso(tabela[0][colData]) && tabela.length > 1;
    return { inicio: titulos ? 1 : 0, papeis, cabecalho: titulos ? tabela[0] : null };
  }

  const mapaCompleto = papeis => papeis.includes('data') && papeis.includes('descricao')
    && (papeis.includes('valor') || papeis.includes('entrada') || papeis.includes('saida'));

  // linhas no formato comum: { data, valor (centavos; negativo = saída), titulo, categoriaTexto }
  function linhasDaTabela(tabela, mapa, sinal) {
    const col = p => mapa.papeis.indexOf(p);
    const [cData, cDesc, cValor, cEnt, cSai, cCat, cTipo, cComp] = ['data', 'descricao', 'valor', 'entrada', 'saida', 'categoria', 'tipo', 'complemento'].map(col);
    const corpo = tabela.slice(mapa.inicio);
    const dec = separadorDecimal(corpo.flatMap(l => [l[cValor], l[cEnt], l[cSai]]));
    const linhas = [];
    const datasDoExtrato = [];  // data de cada lançamento como está no extrato (para a conferência)
    // coluna de saldo ("Saldo (R$)", "PARTIAL_BALANCE") e linhas de saldo: para conferir a leitura no fim
    const cSaldo = (mapa.cabecalho || []).findIndex(c => /\b(saldo|balance)\b/.test(norm(c)));
    const saldos = [];
    const anotarSaldo = (v, linha, quando = null) => {
      const c = v === '' || v === undefined ? null : centavos(v, dec);
      if (c !== null) saldos.push({ pos: linhas.length, valor: c, linha, data: linha ? null : quando });
    };
    let anterior = null;
    for (const l of corpo) {
      // "Lançamentos futuros" (Bradesco, BB): ainda não aconteceram, a lista de verdade acabou
      if (/^lancamentos futuros\b|^saldos? (invest|aplic)/.test(norm(l.find(c => String(c ?? '').trim() !== '') || ''))) break;
      const data = dataIso(l[cData]);
      const desc = String(l[cDesc] ?? '').replace(/\s+/g, ' ').trim();
      const comp = cComp >= 0 ? String(l[cComp] ?? '').trim() : '';
      const temValor = [cValor, cEnt, cSai].some(c => c >= 0 && centavos(l[c], dec));
      // Bradesco: o histórico continua na linha de baixo, sem data nem valor ("PIX TRANSF" / "JOAO DA SILVA")
      if (!data && !temValor && anterior && (desc || comp)) {
        anterior.titulo = `${anterior.titulo} · ${desc || comp}`.slice(0, 200);
        anterior = null;
        continue;
      }
      anterior = null;
      if (desc && ehSaldo(desc)) { anotarSaldo(cSaldo >= 0 && String(l[cSaldo] ?? '').trim() ? l[cSaldo] : l[cValor >= 0 ? cValor : cEnt], false, data); continue; }
      if (!data || !desc) continue;
      const { titulo, data: quando } = comp || /^pix\s*-\s/i.test(desc)
        ? tituloDoBanco(desc, comp, data, completarPerto(data)) : { titulo: desc, data };
      let valor = null;
      if (cValor >= 0) {
        valor = centavos(l[cValor], dec);
        if (valor === null) continue;
        const tipo = cTipo >= 0 ? norm(l[cTipo]) : '';
        if (/^(receita|entrada|credito|c|cr)\b/.test(tipo)) valor = Math.abs(valor);
        else if (/^(despesa|saida|debito|d|db)\b/.test(tipo)) valor = -Math.abs(valor);
        else if (sinal === 'todos') valor = -Math.abs(valor);
      } else {
        const e = cEnt >= 0 ? Math.abs(centavos(l[cEnt], dec) || 0) : 0;
        const s = cSai >= 0 ? Math.abs(centavos(l[cSai], dec) || 0) : 0;
        valor = e ? e : -s;
      }
      if (!valor) continue;
      anterior = { data: quando, valor, titulo, categoriaTexto: cCat >= 0 ? String(l[cCat] ?? '').trim() : '' };
      datasDoExtrato.push(data);
      linhas.push(anterior);
      if (cSaldo >= 0) anotarSaldo(l[cSaldo], true);
    }
    // a conferência usa a data do lançamento no extrato, não a da compra (que pode ser dias antes)
    linhas.conferencia = conferirSaldos(linhas.map(t => t.valor), saldos, datasDoExtrato);
    return linhas;
  }

  /* =========================================================
     Categorias sugeridas
     ========================================================= */

  // nome da loja -> nomes de subcategoria/categoria que costumam existir (o primeiro que a pessoa tiver)
  const PISTAS = [
    [/\b(ifood|ifd|rappi|ze delivery|aiqfome|james delivery|uber ?eats)\b/, ['Delivery', 'Alimentação']],
    [/\b(uber|99 ?app|99 ?pop|99 ?taxi|99 99|cabify|indrive|indriver|taxi)\b|^99\b/,['Uber / 99', 'Uber', 'Táxi', 'Transporte']],
    [/\b(posto|shell|ipiranga|petrobras|br mania|ale combust|combustive|gasolina)\b/, ['Combustível', 'Gasolina', 'Transporte']],
    [/\b(metro|sptrans|bilhete unico|onibus|cptm|brt|top cartao|recarga transporte|estacionamento|sem parar|veloe|conectcar|pedagio)\b/, ['Ônibus', 'Estacionamento', 'Transporte']],
    [/\b(netflix|spotify|disney|hbo|max com|prime video|amazon prime|youtube|deezer|globoplay|paramount|crunchyroll|apple com bill|icloud|google one|chatgpt|openai)\b/, ['Streaming', 'Música', 'Assinaturas']],
    [/\b(vivo|claro|tim brasil|oi movel|recarga celular)\b/, ['Celular', 'Internet', 'Assinaturas', 'Moradia']],
    [/\b(farmacia|drogasil|droga raia|drogaria|raia|pague menos|panvel|drogao|ultrafarma)\b/, ['Farmácia', 'Remédios', 'Saúde']],
    [/\b(smart ?fit|bluefit|academia|gympass|wellhub|totalpass|crossfit)\b/, ['Academia', 'Saúde']],
    [/\b(supermercado|mercado|carrefour|assai|atacadao|pao de acucar|extra|hortifruti|sams club|dia brasil|zaffari|guanabara|mambo|oba|sonda|condor|angeloni|bistek|giassi|super nosso|supernosso|verdemar|epa|mart minas|dma distribuidora)\b/,['Mercado', 'Supermercado', 'Alimentação']],
    [/\b(restaurante|lanchonete|padaria|burger|mc ?donald|mcdonalds|bk|subway|outback|pizza|pizzaria|cafe|cafeteria|starbucks|habibs|giraffas|spoleto|coco bambu|sorveteria|acai|bar|pastel|pastelaria|emporio|quiosque|churrascaria|hamburgueria|sushi|esfiharia)\b/,['Restaurante', 'Lanche', 'Lanche na faculdade', 'Alimentação']],
    [/\b(amazon|mercado ?livre|mercadolivre|shopee|magalu|magazine luiza|americanas|aliexpress|shein|centauro|renner|riachuelo|c a|zara|netshoes|kabum|casas bahia|leroy|decathlon|nike|adidas)\b/, ['Compras', 'Roupas']],
    [/\b(cinema|cinemark|kinoplex|ingresso|sympla|eventim|ticketmaster|steam|playstation|xbox|nintendo|show|teatro)\b/, ['Lazer', 'Shows', 'Rolês']],
    [/\b(aluguel|condominio|energia|enel|cemig|copel|light|celesc|coelba|equatorial|sabesp|copasa|cedae|agua|comgas|naturgy|internet|net virtua|iptu)\b/, ['Moradia', 'Contas da casa']],
    [/\b(escola|faculdade|universidade|mensalidade|curso|udemy|alura|coursera|livraria|saraiva|papelaria)\b/, ['Mensalidade', 'Cursos', 'Educação', 'Faculdade']],
    [/\b(hotel|pousada|airbnb|booking|latam|gol linhas|azul linhas|decolar|123milhas|passagem)\b/, ['Hospedagem', 'Passagens', 'Viagens', 'Viagem']],
    [/\b(medico|clinica|hospital|laboratorio|exame|dentista|odonto|unimed|amil|hapvida|bradesco saude|sulamerica)\b/, ['Consultas', 'Plano de saúde', 'Saúde']],
    [/\b(pet|petz|cobasi|veterinari|racao)\b/, ['Pet', 'Pets']],
    [/\b(barbearia|barbeiro|salao|cabeleireir|manicure|estetica)/, ['Beleza', 'Cuidados pessoais', 'Barbearia', 'Salão']],
    [/\b(titulo capitalizacao|capitalizacao|investimento|corretora)\b/, ['Investimentos', 'Capitalização', 'Poupança']],
  ];
  const PISTAS_RECEITA = [
    [/\b(salario|folha|pagamento de salario|proventos|vencimentos)\b/, ['Salário']],
    [/\b(rendimento|rend pago|remuneracao|juros|dividendo|cdb|tesouro|resgate)\b/, ['Rendimentos', 'Investimentos']],
    [/\b(mesada)\b/, ['Mesada']],
    [/\b(reembolso|estorno|cashback|devolucao|devolvido)\b/, ['Reembolso', 'Estorno', 'Cashback']],
  ];
  /* ---------- investimentos no extrato ----------
     Aplicação (dinheiro saindo) e resgate (voltando) não são gasto nem receita: viram transferência
     entre a conta e um investimento. "Rendimento"/"juros" continuam receita (categoria Rendimentos).
     chave: o nome do produto sem as palavras de movimento ("Aplicação RDB" e "Resgate RDB" -> "rdb"),
     usada para juntar as linhas e para lembrar o investimento nas próximas importações. */
  // Mercado Pago: "Dinheiro reservado <caixinha>" (aplicação) e "Dinheiro retirado <caixinha>" (resgate)
  const PISTA_INV = /\b(aplic\w*|apl|resgates?|resg|cdb|rdb|lci|lca|tesouro|caixinhas?|porquinho|cofrinho|capitalizacao|invest facil|contamax|rende facil|poupanca|investimentos?|fundos?|dinheiro reservado|dinheiro retirado)\b/;
  const NAO_INV = /\b(rendimentos?|rend pago|remuneracao|juros|dividendos?|proventos|salario|tarifa|iof)\b/;
  const AUTOMATICA = /\b(invest facil|contamax|rende facil)\b|\baut\w*\b.*\b(aplic\w*|apl|res|resg)\b|\b(aplic\w*|apl|res|resg)\b.*\baut\w*\b/;
  const SIGLAS = new Set(['cdb', 'rdb', 'lci', 'lca', 'ipca', 'cdi', 'xp', 'btg', 'bb']);

  function investimentoDaLinha(titulo) {
    const t = norm(titulo);
    if (!PISTA_INV.test(t) || NAO_INV.test(t)) return null;
    if (AUTOMATICA.test(t)) return { chave: 'aplicacao automatica' };
    const chave = t.replace(/\b(dinheiro (reservado|retirado)|aplic\w*|apl|res|resgates?|resg|debito|deb|credito|cred|aut\w*|de|da|do|dos|das|em|para|no|na|pix|ted|doc|valor|transf\w*|\d+)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
    // caixinha do Mercado Pago com o nome que a pessoa deu ("Dinheiro reservado GSCASH" -> "caixinha gscash")
    if (/\bdinheiro (reservado|retirado)\b/.test(t) && !/\b(cofrinho|caixinhas?)\b/.test(chave)) return { chave: `caixinha ${chave}`.trim() };
    return { chave: chave || 'investimento' };
  }

  /* ---------- pagamento de fatura no extrato da conta ----------
     "Pagamento de fatura", "PAG FATURA", "Pgto cartão de crédito": é dinheiro da conta quitando a fatura, não um
     gasto novo (as compras já estão na fatura). Compra no débito ("Compra com cartão") e boleto não entram. */
  function pagamentoDeFatura(titulo) {
    const t = norm(titulo);
    if (/\b(compra|qr|boleto|estorno|devolucao)\b|\bcom cart/.test(t)) return false;
    // conta de luz, água e telefone também chegam como "fatura"
    if (/\b(energia|luz|agua|gas|telefone|telefonia|internet|celular|condominio|aluguel|cemig|enel|copel|celesc|coelba|light|equatorial|sabesp|copasa|cedae|comgas|vivo|claro|tim|oi)\b/.test(t)) return false;
    return (/\bfaturas?\b/.test(t) && /\b(pag\w*|pgto|pgt|debito automatico|deb aut\w*|liquidacao)\b/.test(t))
      || /\b(pag\w*|pgto|pgt)\s+(do |de |da )?cart(ao|oes)?\s+(de )?credito\b/.test(t)
      || /\bpag fat\b/.test(t);
  }

  // a fatura que um pagamento quita: a última que fechou antes dele (quem paga adiantado ou atrasado troca na revisão)
  function faturaDoPagamento(cartao, data) {
    return GS.faturas.somarMeses(GS.faturas.cicloDe(cartao, data), -1);
  }

  const nomeBonito = chave => chave.split(' ').map(p => (SIGLAS.has(p) ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');

  // tipo, taxa e nome sugeridos pelo nome do produto (a pessoa confere na primeira vez)
  function sugestaoDeInvestimento(chave, conta) {
    const nome = nomeBonito(chave);
    const com = (tipo, indexador, taxa, liquidez, n) => ({ tipo, indexador, taxa, liquidez, nome: n.slice(0, 60) });
    if (chave === 'aplicacao automatica') return com('cdb', 'cdi_pct', 100, 'diaria', `Aplicação automática ${conta}`);
    if (/capitalizacao/.test(chave)) return com('outro', 'sem_taxa', 0, 'vencimento', 'Título de capitalização');
    if (/\bpoupanca\b/.test(chave)) return com('poupanca', 'poupanca', 0, 'diaria', `Poupança ${conta}`);
    if (/\btesouro\b/.test(chave)) return com('tesouro', 'selic', 0, 'diaria', nome);
    if (/\b(lci|lca)\b/.test(chave)) return com('lci_lca', 'cdi_pct', 90, 'diaria', chave.includes(' ') ? nome : `${nome} ${conta}`);
    if (/\b(rdb|caixinhas?|porquinho|cofrinho)\b/.test(chave)) return com('cdb', 'cdi_pct', 100, 'diaria', chave.includes(' ') ? nome : `${nome} ${conta}`);
    if (/\bcdb\b/.test(chave)) return com('cdb', 'cdi_pct', 100, 'diaria', chave.includes(' ') ? nome : `CDB ${conta}`);
    if (/\bfundos?\b/.test(chave)) return com('fundos', 'sem_taxa', 0, 'diaria', nome);
    return com('outro', 'sem_taxa', 0, 'diaria', nome === 'Investimento' ? `Investimento ${conta}` : nome);
  }

  // prefixos de banco que só atrapalham a comparação de nomes
  const limparTitulo = t => norm(t)
    .replace(/^(compra (no )?(debito|credito)|pix (enviado|recebido)|transferencia (enviada|recebida)|pagamento (de|da|do)? ?(boleto|conta)?|pg|pag|debito automatico|deb aut|ted|doc|tef|cartao)\s+/, '')
    .replace(/\b\d{4,}\b/g, '').replace(/\s+/g, ' ').trim();

  function motorDeCategorias(categorias, transacoes) {
    const porNome = new Map();  // nome normalizado -> { categoriaId, subcategoriaId, tipo }
    categorias.forEach(c => {
      if (!porNome.has(norm(c.nome) + '|' + c.tipo)) porNome.set(norm(c.nome) + '|' + c.tipo, { categoriaId: c.id, subcategoriaId: null });
      (c.subcategorias || []).forEach(s => {
        const k = norm(s.nome) + '|' + c.tipo;
        if (!porNome.has(k)) porNome.set(k, { categoriaId: c.id, subcategoriaId: s.id });
      });
    });
    const achar = (nome, tipo) => porNome.get(norm(nome) + '|' + tipo) || null;

    // o que a pessoa já lançou: o nome da loja aponta para a categoria que ela usou por último
    const existe = new Set(categorias.map(c => c.id));
    const historico = new Map();
    [...transacoes].filter(t => (t.tipo === 'despesa' || t.tipo === 'receita') && existe.has(t.categoriaId))
      .sort((a, b) => (a.data < b.data ? -1 : 1))
      .forEach(t => {
        const nome = limparTitulo(t.titulo);
        if (!nome) return;
        const alvo = { categoriaId: t.categoriaId, subcategoriaId: t.subcategoriaId || null };
        historico.set(t.tipo + '|' + nome, alvo);
        const duas = nome.split(' ').slice(0, 2).join(' ');
        if (duas.length >= 4) historico.set(t.tipo + '|2|' + duas, alvo);
      });

    return function sugerir(titulo, tipo, categoriaTexto) {
      if (categoriaTexto) {
        const c = achar(categoriaTexto, tipo);
        return c ? { ...c, sugerida: false } : { nova: categoriaTexto.trim().slice(0, 40), sugerida: false };
      }
      const nome = limparTitulo(titulo);
      const h = historico.get(tipo + '|' + nome) || historico.get(tipo + '|2|' + nome.split(' ').slice(0, 2).join(' '));
      if (h) return { ...h, sugerida: true };
      for (const [re, nomes] of (tipo === 'receita' ? PISTAS_RECEITA : PISTAS)) {
        if (!re.test(nome) && !re.test(norm(titulo))) continue;
        for (const n of nomes) {
          const c = achar(n, tipo);
          if (c) return { ...c, sugerida: true };
        }
      }
      const reserva = tipo === 'receita' ? 'Outras receitas' : 'Outros';
      const c = achar(reserva, tipo);
      return c ? { ...c, sugerida: false } : { nova: reserva, sugerida: false };
    };
  }

  /* =========================================================
     Repetidos e ids
     ========================================================= */

  // id fixo por lançamento: importar o mesmo arquivo de novo não duplica nada
  function hash(texto) {
    let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
    for (let i = 0; i < texto.length; i++) {
      const c = texto.charCodeAt(i);
      a = Math.imul(a ^ c, 16777619);
      b = Math.imul(b ^ c, 2246822519);
    }
    return (a >>> 0).toString(36) + (b >>> 0).toString(36);
  }

  const CONVITE = 'gscash:importar-convite';  // convite do Painel já resolvido (fechou ou importou)
  const diasEntre = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);

  /* =========================================================
     Janela
     ========================================================= */

  const BANCOS = [  // pistas no arquivo -> nome que a carteira costuma ter
    [/nu pagamentos|nubank|\b260\b/i, 'nubank'], [/ita[uú]|\b341\b/i, 'itau'], [/bradesco|\b237\b/i, 'bradesco'],
    [/inter\b|\b077\b/i, 'inter'], [/santander|\b033\b/i, 'santander'], [/caixa|\b104\b/i, 'caixa'],
    [/banco do brasil|\b001\b/i, 'brasil'], [/c6|\b336\b/i, 'c6'], [/pagbank|pagseguro|\b290\b/i, 'pag'],
    [/mercado pago|\b323\b/i, 'mercado pago'], [/picpay|\b380\b/i, 'picpay'], [/sicoob|\b756\b/i, 'sicoob'], [/sicredi|\b748\b/i, 'sicredi'],
    [/\bneon\b|\b536\b/i, 'neon'], [/banco pan\b|\b623\b/i, 'pan'], [/btg|\b208\b/i, 'btg'], [/agibank|\b121\b/i, 'agi'],
    [/banrisul|\b041\b/i, 'banrisul'], [/banco original|\b212\b/i, 'original'], [/\bxp\b|\b102\b/i, 'xp'],
  ];

  /* Quando o PDF não dá certo: outro formato que o banco oferece para conta de pessoa física, só onde a ajuda
     ou o atendimento do próprio banco confirma (opções de conta de empresa não contam). É só o caminho: não
     promete que o arquivo vai ser lido. Bradesco, Caixa, C6, Sicoob e os outros ficam com a mensagem geral. */
  const DICAS = {
    nubank: 'No app do Nubank dá para pedir o extrato também em OFX, que chega por e-mail. Tente por ele.',
    itau: 'O Itaú também oferece o extrato em OFX, se aparecer a opção. Tente por ele.',
    inter: 'No Super Extrato do Inter dá para exportar em OFX ou CSV. Tente por um deles.',
    santander: 'No app do Santander dá para exportar o extrato em CSV ou Excel, se aparecer a opção. Tente por um deles.',
    brasil: 'O Banco do Brasil também exporta o extrato em CSV, se aparecer a opção. Tente por ele.',
    pag: 'O PagBank também exporta o extrato da conta em OFX, CSV ou Excel. Tente por um deles.',
    'mercado pago': 'O Mercado Pago também exporta o extrato em CSV ou Excel (XLSX). Tente por um deles.',
    picpay: 'O PicPay também exporta o extrato em CSV (períodos a partir de janeiro de 2025). Tente por ele.',
    btg: 'O BTG também exporta o extrato em Excel. Tente por ele.',
  };
  function dicaDoBanco(texto) {
    const pista = (BANCOS.find(([re]) => re.test(texto)) || [])[1];
    return DICAS[pista] || 'Se o banco tiver a opção, exporte o extrato em OFX ou CSV e tente de novo.';
  }

  function abrir() {
    if (GS.somenteLeitura) return GS.toast(GS.TEXTO_SO_LEITURA, 'erro');
    const modal = GS.abrirModal({ titulo: 'Importar lançamentos', corpo: '', tamanho: 'lg importar' });
    const titulo = t => { modal.el.querySelector('.modal-title').textContent = t; };
    const rodape = (html, classe = '') => {
      modal.foot.className = `modal-foot ${classe}`;
      modal.foot.innerHTML = html;
      modal.foot.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => modal.fechar()));
    };
    const fmt = c => GS.moedaAbs ? GS.moedaAbs(c) : (Math.abs(c) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    let arq = null;        // { tipo: 'ofx'|'tabela', nome, linhas | tabela, cartao, banco }
    let mapa = null;       // planilha: { inicio, papeis, cabecalho }
    let sinal = 'menos';   // planilha sem coluna de tipo: 'menos' (gastos com -) ou 'todos' (tudo é gasto)
    let destino = null;    // { carteira, cartao: bool }
    let fatura = null;     // 'AAAA-MM' (cartão)
    let carteiras = [];

    /* ---------- 1. escolher o arquivo ---------- */

    function passoArquivo(erro) {
      titulo('Importar lançamentos');
      modal.body.innerHTML = `
        <label class="imp-soltar" tabindex="0">
          <input type="file" accept=".ofx,.qfx,.csv,.txt,.xlsx,.xls,.ods,.pdf" hidden>
          <span class="ic">${icone('subir')}</span>
          <b>Escolha o arquivo ou arraste para cá</b>
          <small>OFX, CSV, Excel ou o extrato em PDF</small>
          <span class="btn btn-outline">Escolher arquivo</span>
        </label>
        ${erro ? `<p class="imp-erro">${icone('alert')}${esc(erro)}</p>` : ''}
        <div class="imp-fontes">
          <div><b>${icone('bank')}Extrato ou fatura do banco</b>No app ou site do banco, procure <b>Exportar extrato</b> e escolha OFX ou CSV. O extrato em PDF também serve.</div>
          <div><b>${icone('planilha')}Planilha ou outro app</b>Planilha do Excel ou Google, ou o arquivo exportado do Mobills, Organizze e parecidos.</div>
        </div>`;
      rodape('<button type="button" class="btn btn-outline" data-fechar>Cancelar</button>', 'um');
      const zona = modal.body.querySelector('.imp-soltar');
      const campo = zona.querySelector('input');
      zona.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); campo.click(); } });
      campo.addEventListener('change', () => campo.files[0] && receber(campo.files[0]));
      zona.addEventListener('dragover', e => { e.preventDefault(); zona.classList.add('sobre'); });
      zona.addEventListener('dragleave', () => zona.classList.remove('sobre'));
      zona.addEventListener('drop', e => {
        e.preventDefault();
        zona.classList.remove('sobre');
        if (e.dataTransfer.files[0]) receber(e.dataTransfer.files[0]);
      });
    }

    async function receber(arquivo) {
      modal.body.querySelector('.imp-soltar b').textContent = 'Lendo o arquivo…';
      try {
        arq = await lerArquivo(arquivo);
        [carteiras] = await Promise.all([GS.api.listarCarteiras()]);
        if (!carteiras.length) throw new Error('Cadastre uma carteira antes de importar (em Carteiras).');
        if (arq.tipo === 'tabela') {
          if (!arq.tabela.length) throw new Error('Não encontramos nenhuma linha nesse arquivo.');
          mapa = adivinharColunas(arq.tabela);
          const vals = linhasDaTabela(arq.tabela, mapa, 'menos').map(l => l.valor);
          sinal = 'menos';
          arq.precisaColunas = !mapaCompleto(mapa.papeis);
          // tudo positivo e sem coluna de tipo: não dá para saber o que é gasto (exceto em fatura de cartão)
          arq.sinalIncerto = !mapa.papeis.includes('tipo') && mapa.papeis.includes('valor') && vals.length > 0 && vals.every(v => v > 0);
          const cab = norm((mapa.cabecalho || []).join(' '));
          arq.cartao = /^date title amount$/.test(cab);  // fatura do Nubank: "date,title,amount"
          arq.banco = arq.cartao ? 'nubank' : `${bancoPeloLayout(arq.tabela.slice(0, 10).map(l => l.join(' ')).join(' '))} ${arq.nome}`;
        } else if (!arq.linhas.length) {
          throw new Error(arq.formato === 'pdf' ? `Não conseguimos ler a lista de lançamentos desse PDF. ${dicaDoBanco(`${arq.banco || ''} ${arq.nome}`)}` : 'Não encontramos lançamentos nesse arquivo OFX.');
        }
        destino = destinoProvavel();
        passoDestino();
      } catch (e) {
        console.error('Falha ao ler o arquivo', e);
        passoArquivo(e.message && !/^[A-Z][a-z]+Error/.test(e.message) ? e.message : 'Não conseguimos ler esse arquivo. Confira se é OFX, CSV, Excel ou o extrato em PDF.');
      }
    }

    // carteira com o nome do banco do arquivo; cartão quando o arquivo é de fatura
    function destinoProvavel() {
      const pista = (BANCOS.find(([re]) => re.test(`${arq.banco || ''} ${arq.nome}`)) || [])[1];
      const doBanco = pista ? carteiras.filter(c => norm(c.nome).includes(pista)) : [];
      const cartoes = GS.faturas.cartoes(carteiras);
      if (arq.cartao && cartoes.length) {
        return { carteira: (doBanco.find(c => GS.faturas.temCredito(c)) || cartoes[0]), cartao: true };
      }
      return { carteira: doBanco[0] || carteiras[0], cartao: false };
    }

    /* ---------- 1b. para onde vão ---------- */

    function opcoesDestino() {
      const ops = [];
      carteiras.forEach(c => {
        const temCartao = GS.faturas.temCredito(c);
        ops.push({ valor: `${c.id}|conta`, rotulo: temCartao ? `${c.nome} · conta` : c.nome, cor: c.cor });
        if (temCartao) ops.push({ valor: `${c.id}|cartao`, rotulo: `${c.nome} · cartão de crédito`, cor: c.cor });
      });
      return ops;
    }

    function linhasAtuais() {
      return arq.tipo === 'ofx' ? arq.linhas : linhasDaTabela(arq.tabela, mapa, sinal);
    }

    // faturas possíveis: a mais comum nas datas do arquivo, e as vizinhas
    function opcoesFatura() {
      const cartao = destino.carteira;
      const conta = new Map();
      linhasAtuais().forEach(l => {
        const k = GS.faturas.cicloDe(cartao, l.data);
        conta.set(k, (conta.get(k) || 0) + 1);
      });
      const comum = [...conta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || GS.faturas.cicloDe(cartao, GS.isoData(GS.hoje()));
      if (!fatura || !conta.has(fatura)) fatura = comum;
      return [-2, -1, 0, 1, 2].map(n => GS.faturas.somarMeses(comum, n)).map(k => {
        const f = GS.faturas.datas(cartao, k).fechamento;
        return { valor: k, rotulo: `${GS.mesAnoDeIso(k)} · fecha em ${f.getDate()} ${GS.dataMedia(f).split(' ')[1]}` };
      });
    }

    function passoDestino() {
      titulo('Importar lançamentos');
      const qtd = arq.tipo === 'ofx' ? `${GS.plural(arq.linhas.length, 'lançamento', 'lançamentos')}` : `${GS.plural(Math.max(0, arq.tabela.length - mapa.inicio), 'linha', 'linhas')}`;
      const tipoArq = arq.cartao ? 'Fatura de cartão' : arq.formato === 'pdf' ? 'Extrato em PDF' : arq.tipo === 'ofx' ? 'Extrato' : /\.(xlsx|xls|ods)$/i.test(arq.nome) ? 'Planilha' : 'Arquivo CSV';
      modal.body.innerHTML = `
        <div class="imp-arquivo"><span class="ic">${icone('check')}</span><span><b>${esc(arq.nome)}</b><small>${tipoArq} · ${qtd}</small></span>
          <button type="button" class="link-btn" data-trocar>Trocar</button></div>
        <div class="field"><span class="field-label">Em qual carteira ou cartão?</span><div data-slot="destino"></div></div>
        <div class="field hidden" data-campo-fatura><span class="field-label">De qual fatura?</span><div data-slot="fatura"></div>
          <span class="field-hint">As compras entram nesta fatura, inclusive as parcelas de compras antigas.</span></div>`;
      const selDestino = GS.criarSelect({
        opcoes: opcoesDestino(), valor: `${destino.carteira.id}|${destino.cartao ? 'cartao' : 'conta'}`, rotuloAria: 'Carteira ou cartão',
        aoMudar: v => {
          const [id, modo] = v.split('|');
          destino = { carteira: carteiras.find(c => c.id === id), cartao: modo === 'cartao' };
          pintarFatura();
        },
      });
      modal.body.querySelector('[data-slot="destino"]').append(selDestino.el);
      let selFatura = null;
      function pintarFatura() {
        const campo = modal.body.querySelector('[data-campo-fatura]');
        // planilha que ainda vai passar pelas colunas: a fatura é escolhida lá
        const mostrar = destino.cartao && !(arq.tipo === 'tabela' && arq.precisaColunas);
        campo.classList.toggle('hidden', !mostrar);
        if (!mostrar) return;
        const ops = opcoesFatura();
        if (!selFatura) {
          selFatura = GS.criarSelect({ opcoes: ops, valor: fatura, rotuloAria: 'Fatura', aoMudar: v => { fatura = v; } });
          modal.body.querySelector('[data-slot="fatura"]').append(selFatura.el);
        } else selFatura.definirOpcoes(ops, fatura);
      }
      pintarFatura();
      modal.body.querySelector('[data-trocar]').addEventListener('click', () => passoArquivo());
      rodape(`<button type="button" class="btn btn-outline" data-voltar>Voltar</button>
              <button type="button" class="btn btn-primary" data-seguir>Continuar${icone('arrow-right')}</button>`);
      modal.foot.querySelector('[data-voltar]').addEventListener('click', () => passoArquivo());
      modal.foot.querySelector('[data-seguir]').addEventListener('click', () => {
        const precisa = arq.tipo === 'tabela' && (arq.precisaColunas || (arq.sinalIncerto && !destino.cartao));
        precisa ? passoColunas() : passoRevisar();
      });
    }

    /* ---------- 2. colunas da planilha ---------- */

    function passoColunas(erro) {
      titulo('Quais colunas são o quê?');
      const largura = Math.max(...arq.tabela.slice(mapa.inicio, mapa.inicio + 20).map(l => l.length), mapa.papeis.length);
      while (mapa.papeis.length < largura) mapa.papeis.push('ignorar');
      const exemplos = arq.tabela.slice(mapa.inicio, mapa.inicio + 4);
      const mostrar = v => {
        if (typeof v === 'number' && v > 20000 && v < 80000) { const d = dataIso(v); if (d) return GS.dataCurta ? GS.dataCurta(d) : d.split('-').reverse().join('/'); }
        return String(v ?? '');
      };
      const usaSinal = !destino.cartao;
      modal.body.innerHTML = `
        <p>Diga o que tem em cada coluna. Mostramos as primeiras linhas da sua planilha.</p>
        ${erro ? `<p class="imp-erro">${icone('alert')}${esc(erro)}</p>` : ''}
        <div class="imp-colunas"><table>
          <thead><tr>${mapa.papeis.map((p, i) => `<th>
            ${mapa.cabecalho && mapa.cabecalho[i] ? `<small>${esc(mapa.cabecalho[i])}</small>` : ''}
            <select class="imp-papel ${p !== 'ignorar' ? 'ok' : ''}" data-col="${i}" aria-label="Coluna ${i + 1}">
              ${PAPEIS.map(([v, r]) => `<option value="${v}" ${v === p ? 'selected' : ''}>${r}</option>`).join('')}
            </select></th>`).join('')}</tr></thead>
          <tbody>${exemplos.map(l => `<tr>${mapa.papeis.map((p, i) => `<td class="${p === 'ignorar' ? 'cinza' : ''}">${esc(mostrar(l[i]))}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>
        ${usaSinal ? `<div class="field"><label for="impSinal">Como aparecem os gastos?</label>
          <select id="impSinal" class="imp-sinal">
            <option value="menos" ${sinal === 'menos' ? 'selected' : ''}>Com sinal de menos (−187,40) e as entradas sem sinal</option>
            <option value="todos" ${sinal === 'todos' ? 'selected' : ''}>Sem sinal: todos os valores são gastos</option>
          </select><span class="field-hint">Se a planilha tem uma coluna dizendo se é entrada ou saída, marque ela como "Tipo".</span></div>` : ''}
        ${destino.cartao ? `<div class="field"><span class="field-label">De qual fatura?</span><div data-slot="fatura"></div></div>` : ''}`;
      modal.body.querySelectorAll('.imp-papel').forEach(s => s.addEventListener('change', () => {
        const i = Number(s.dataset.col);
        // cada papel (menos "Ignorar") vale para uma coluna só
        if (s.value !== 'ignorar') mapa.papeis = mapa.papeis.map((p, k) => (k !== i && p === s.value ? 'ignorar' : p));
        mapa.papeis[i] = s.value;
        passoColunas();
      }));
      modal.body.querySelector('#impSinal')?.addEventListener('change', e => { sinal = e.target.value; });
      if (destino.cartao && mapaCompleto(mapa.papeis)) {
        const sel = GS.criarSelect({ opcoes: opcoesFatura(), valor: fatura, rotuloAria: 'Fatura', aoMudar: v => { fatura = v; } });
        modal.body.querySelector('[data-slot="fatura"]').append(sel.el);
      }
      rodape(`<button type="button" class="btn btn-outline" data-voltar>Voltar</button>
              <button type="button" class="btn btn-primary" data-seguir>Continuar${icone('arrow-right')}</button>`);
      modal.foot.querySelector('[data-voltar]').addEventListener('click', passoDestino);
      modal.foot.querySelector('[data-seguir]').addEventListener('click', () => {
        if (!mapaCompleto(mapa.papeis)) return passoColunas('Marque pelo menos a Data, a Descrição e o Valor (ou Entrada e Saída).');
        if (!linhasAtuais().length) return passoColunas('Com essas colunas não encontramos nenhum lançamento. Confira a Data e o Valor.');
        if (destino.cartao && !fatura) opcoesFatura();
        passoRevisar();
      });
    }

    /* ---------- 3. revisar ---------- */

    async function passoRevisar() {
      titulo('Revisando…');
      modal.body.innerHTML = '<p class="imp-carregando"><span class="roda-botao"></span>Organizando os lançamentos…</p>';
      rodape('');
      const [categorias, transacoes, carteiras, investimentos] = await Promise.all([
        GS.api.listarCategorias(), GS.api.listarTransacoes(), GS.api.listarCarteiras(), GS.api.listarInvestimentos()]);
      const sugerir = motorDeCategorias(categorias, transacoes);
      const cartao = destino.cartao ? destino.carteira : null;

      // investimentos ativos e o que já se aprendeu: chave da linha -> investimento (importações e lançamentos anteriores)
      const regInv = new Map(investimentos.map(v => [v.id, v]));
      const ativos = carteiras.filter(c => c.tipo === 'investimento' && !(regInv.get(c.id) || {}).resgatadoEm);
      const ehAtivo = new Set(ativos.map(c => c.id));
      const aprendido = new Map();
      transacoes.filter(t => t.tipo === 'transferencia' && (ehAtivo.has(t.destinoId) || ehAtivo.has(t.carteiraId)))
        .sort((a, b) => a.data.localeCompare(b.data))
        .forEach(t => {
          const d = investimentoDaLinha(t.titulo.replace(/^(aplicação|resgate|vencimento) · /i, ''));
          if (d) aprendido.set(d.chave, ehAtivo.has(t.destinoId) ? t.destinoId : t.carteiraId);
        });
      const investimentoDaChave = chave => aprendido.get(chave)
        || (ativos.find(c => norm(c.nome) === chave) || ativos.find(c => chave.length >= 3 && norm(c.nome).split(' ').includes(chave)) || {}).id || null;
      const novosInv = new Map();   // chave -> dados do formulário (investimento novo configurado nesta revisão)
      // transferências que já existem entre esta conta e um investimento (para não repetir)
      const transfInv = transacoes.filter(t => t.tipo === 'transferencia'
        && ((t.carteiraId === destino.carteira.id && ehAtivo.has(t.destinoId)) || (t.destinoId === destino.carteira.id && ehAtivo.has(t.carteiraId))));
      if (cartao && !fatura) opcoesFatura();

      let linhas = linhasAtuais();
      // conferência pelos saldos impressos (só extrato de conta; fatura não tem saldo)
      const conferencia = cartao ? null : linhas.conferencia || null;
      let foraDaFatura = 0;
      if (cartao) {
        // na fatura, o que domina são as compras (no Nubank vêm positivas); o resto é pagamento ou estorno
        const positivas = linhas.filter(l => l.valor > 0).length;
        const compraPositiva = positivas > linhas.length - positivas;
        const compras = linhas.filter(l => (compraPositiva ? l.valor > 0 : l.valor < 0));
        foraDaFatura = linhas.length - compras.length;
        linhas = compras.map(l => ({ ...l, valor: -Math.abs(l.valor) }));
      }

      // repetidos: mesmo id (já importado) ou mesmo valor e tipo, na mesma carteira, com até 2 dias de diferença
      const ids = new Set(transacoes.map(t => t.id));
      const formaAlvo = cartao ? 'credito' : 'debito';
      const candidatos = transacoes.filter(t => (t.tipo === 'despesa' || t.tipo === 'receita') && t.carteiraId === destino.carteira.id && (t.forma || 'debito') === formaAlvo);
      const usados = new Set();
      const ocorrencias = new Map();
      const fechamento = cartao ? GS.isoData(GS.faturas.datas(cartao, fatura).fechamento) : null;
      // Pix/TED com o nome da própria pessoa: é dinheiro indo de uma conta dela para outra, não gasto
      const meuNome = norm((GS.usuario && GS.usuario.user_metadata && (GS.usuario.user_metadata.full_name || GS.usuario.user_metadata.name)) || '').split(' ');
      const paraSiMesmo = titulo => {
        if (meuNome.length < 2 || !/^(pix|ted|doc|transf)/.test(norm(titulo))) return false;
        const t = norm(titulo);
        return t.includes(meuNome[0]) && t.includes(meuNome[meuNome.length - 1].slice(0, 5));
      };

      // pagamento de fatura no extrato da conta: qual cartão ele paga. O configurado para ser pago por esta conta,
      // o cartão da própria carteira ou o único cartão; sem como saber, a pessoa escolhe na revisão
      const cartoesFat = cartao ? [] : GS.faturas.cartoes(carteiras);
      const cartaoDaConta = cartoesFat.find(c => c.credito.pagarComId === destino.carteira.id)
        || cartoesFat.find(c => c.id === destino.carteira.id) || (cartoesFat.length === 1 ? cartoesFat[0] : null);
      const pagamentosDaConta = transacoes.filter(t => t.tipo === 'pagamento' && t.carteiraId === destino.carteira.id);

      const itens = linhas.map((l, n) => {
        const tipo = l.valor < 0 ? 'despesa' : 'receita';
        const valor = Math.abs(l.valor);
        let data = l.data;
        let nota = '';
        const parcela = l.titulo.match(/parcela\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/i) || l.titulo.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*$/);
        if (cartao && GS.faturas.cicloDe(cartao, data) !== fatura) {
          nota = `Compra de ${data.split('-').reverse().join('/')}`;
          data = fechamento;
        }
        const chaveBase = l.fitid ? `fit|${l.fitid}` : `${l.data}|${valor}|${tipo}|${norm(l.titulo)}`;
        const vez = (ocorrencias.get(chaveBase) || 0) + 1;
        ocorrencias.set(chaveBase, vez);
        const id = 'imp' + hash(`${destino.carteira.id}|${formaAlvo}|${chaveBase}|${vez}`);
        let repetido = null;
        if (ids.has(id)) repetido = 'Já foi importado antes';
        else if (paraSiMesmo(l.titulo)) repetido = 'Parece uma transferência entre suas contas';
        else {
          const igual = candidatos.find(t => !usados.has(t.id) && t.tipo === tipo && t.valor === valor && diasEntre(t.data, l.data) <= 2);
          if (igual) {
            usados.add(igual.id);
            repetido = `Já está no GSCASH (${GS.dataCurta ? GS.dataCurta(igual.data) : igual.data}, ${fmt(igual.valor)})`;
          }
        }
        const s = sugerir(l.titulo, tipo, l.categoriaTexto);
        const fat = tipo === 'despesa' && cartoesFat.length && pagamentoDeFatura(l.titulo)
          ? { cartaoId: cartaoDaConta ? cartaoDaConta.id : null, fatura: cartaoDaConta ? faturaDoPagamento(cartaoDaConta, l.data) : null }
          : null;
        if (fat && !repetido) {
          const igual = pagamentosDaConta.find(t => !usados.has(t.id) && t.valor === valor && diasEntre(t.data, l.data) <= 3);
          if (igual) {
            usados.add(igual.id);
            repetido = `Já está no GSCASH (${GS.dataCurta ? GS.dataCurta(igual.data) : igual.data}, ${fmt(igual.valor)})`;
          }
        }
        // aplicação ou resgate (só em conta; fatura de cartão não tem)
        const achado = !cartao && !fat && investimentoDaLinha(l.titulo);
        const inv = achado ? { chave: achado.chave, invId: investimentoDaChave(achado.chave), mov: tipo === 'despesa' ? 'aplicacao' : 'resgate' } : null;
        if (inv && !repetido) {
          const igual = transfInv.find(t => !usados.has(t.id) && t.valor === valor && diasEntre(t.data, l.data) <= 2
            && (inv.mov === 'aplicacao' ? t.carteiraId === destino.carteira.id : t.destinoId === destino.carteira.id));
          if (igual) {
            usados.add(igual.id);
            repetido = `Já está no GSCASH (${GS.dataCurta ? GS.dataCurta(igual.data) : igual.data}, ${fmt(igual.valor)})`;
          }
        }
        return {
          n, id, tipo, valor, data, titulo: l.titulo.slice(0, 80), nota, parcela: parcela ? `${parcela[1]}/${parcela[2]}` : '',
          marcado: !repetido, repetido, inv, fat,
          cat: s.nova ? `nova:${s.nova}` : `${s.categoriaId}${s.subcategoriaId ? '|' + s.subcategoriaId : ''}`,
          sugerida: s.sugerida,
        };
      }).sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.n - b.n));

      if (!itens.length) {
        titulo('Importar lançamentos');
        modal.body.innerHTML = `<p class="imp-erro">${icone('alert')}Não sobrou nenhum lançamento para importar${foraDaFatura ? ' (só pagamentos e estornos, que ficam de fora)' : ''}.</p>`;
        rodape('<button type="button" class="btn btn-outline" data-fechar>Fechar</button>', 'um');
        return;
      }

      // opções de categoria de cada tipo, mais as novas que vieram da planilha
      const opcoesCat = tipo => {
        const ops = [];
        categorias.filter(c => c.tipo === tipo).forEach(c => {
          ops.push({ valor: c.id, rotulo: c.nome, cor: c.cor });
          (c.subcategorias || []).forEach(s => ops.push({ valor: `${c.id}|${s.id}`, rotulo: s.nome, pai: c.nome, cor: c.cor }));
        });
        new Set(itens.filter(i => i.tipo === tipo && i.cat.startsWith('nova:')).map(i => i.cat))
          .forEach(v => ops.push({ valor: v, rotulo: `${v.slice(5)} (nova)`, cor: '#1D3A5E' }));
        return ops;
      };
      const ops = { despesa: opcoesCat('despesa'), receita: opcoesCat('receita') };
      const rotuloCat = (tipo, v) => {
        const o = ops[tipo].find(x => x.valor === v);
        return o ? `<i class="bol" style="background:${o.cor}"></i><span>${esc(o.pai ? `${o.pai} · ${o.rotulo}` : o.rotulo)}</span>` : '<span class="muted">Escolher</span>';
      };

      titulo(`Revisar ${GS.plural(itens.length, 'lançamento', 'lançamentos')}`);
      const entreContas = itens.filter(i => i.repetido && i.repetido.startsWith('Parece uma transfer')).length;
      const repetidos = itens.filter(i => i.repetido).length - entreContas;
      const nomeInv = id => (carteiras.find(c => c.id === id) || {}).nome || 'Investimento';
      // investimento novo desta revisão: configurado (tem dados) ou ainda por configurar
      const pendente = i => i.inv && !i.inv.invId && !novosInv.has(i.inv.chave);

      const nomeCartao = id => (carteiras.find(c => c.id === id) || {}).nome || 'Cartão';
      const mesFatura = k => GS.mesAnoDeIso(k).split(' ')[0].toLowerCase();
      function slotHtml(i) {
        if (i.fat) {
          if (!i.fat.cartaoId) return `<button type="button" class="imp-fat novo">${icone('plus')}<span>Escolher o cartão</span></button>`;
          return `<button type="button" class="imp-fat">${icone('cartao')}<span>${esc(nomeCartao(i.fat.cartaoId))} · fatura de ${esc(mesFatura(i.fat.fatura))}</span></button>`;
        }
        if (!i.inv) return `<button type="button" class="imp-cat">${rotuloCat(i.tipo, i.cat)}${i.sugerida ? `<span class="sug" title="Categoria sugerida">${icone('brilho')}</span>` : ''}</button>`;
        if (pendente(i)) return `<button type="button" class="imp-inv novo">${icone('plus')}<span>Investimento novo · configurar</span></button>`;
        const nome = i.inv.invId ? nomeInv(i.inv.invId) : novosInv.get(i.inv.chave).nome;
        const selo = i.inv.invId ? (i.inv.escolhido ? '' : 'reconhecido') : 'novo';
        return `<button type="button" class="imp-inv">${icone('trending')}<span>${esc(nome)}</span>${selo ? `<small>${selo}</small>` : ''}</button>`;
      }
      function linhaHtml(i) {
        const sub = i.repetido ? `<small class="aviso">${esc(i.repetido)}</small>`
          : i.fat ? '<small class="fat">Paga a fatura do cartão, não é gasto</small>'
          : i.inv ? `<small class="inv">${i.inv.mov === 'aplicacao' ? 'Sai da conta para o investimento' : 'Volta do investimento para a conta'}</small>`
          : i.nota ? `<small>${esc(i.nota)}</small>` : '';
        return `
          <div class="imp-item ${i.repetido ? 'rep' : ''}" data-n="${i.n}">
            <input type="checkbox" class="imp-marca" ${i.marcado ? 'checked' : ''} aria-label="Importar ${esc(i.titulo)}">
            <span class="data">${esc(GS.dataCurta ? GS.dataCurta(i.data) : i.data)}</span>
            <span class="desc"><b title="${esc(i.titulo)}">${esc(i.titulo)}</b>${sub}</span>
            <span class="cat-slot">${slotHtml(i)}</span>
            <span class="val ${i.tipo === 'receita' ? 'e' : i.fat ? 't' : ''}">${i.tipo === 'receita' ? '+ ' : ''}${fmt(i.valor)}</span>
          </div>`;
      }

      const dataDe = d => (GS.dataCurta ? GS.dataCurta(d) : d.split('-').reverse().join('/'));
      const avisoSaldo = conferencia && !conferencia.ok
        ? `<p class="imp-erro">${icone('alert')}<span>O que lemos não fecha com o saldo impresso no extrato: diferença de ${fmt(conferencia.diferenca)}${conferencia.data ? ` até ${esc(dataDe(conferencia.data))}` : ''}. Pode ter ficado alguma linha de fora. Confira com o extrato antes de importar.</span></p>`
        : '';
      modal.body.innerHTML = `
        ${avisoSaldo}
        <div class="imp-resumo">
          <span class="chip-r"><b data-conta></b> para importar</span>
          ${conferencia && conferencia.ok ? `<span class="chip-r" title="Somamos os lançamentos lidos e chegamos nos mesmos saldos que o banco imprimiu no extrato">${icone('check')}Confere com o saldo do extrato</span>` : ''}
          <span class="chip-r hidden" data-chip-fat>${icone('cartao')}<b></b></span>
          <span class="chip-r inv hidden" data-chip-inv>${icone('trending')}<b></b> de investimento</span>
          <span class="chip-r aviso hidden" data-chip-pend>${icone('alert')}<b></b></span>
          ${repetidos ? `<span class="chip-r aviso">${icone('alert')}<b>${repetidos}</b> já ${repetidos === 1 ? 'estava' : 'estavam'} no GSCASH</span>` : ''}
          ${entreContas ? `<span class="chip-r aviso">${icone('transfer')}<b>${entreContas}</b> entre suas contas</span>` : ''}
          ${foraDaFatura ? `<span class="chip-r">${GS.plural(foraDaFatura, 'pagamento ou estorno fica', 'pagamentos e estornos ficam')} de fora</span>` : ''}
          <span class="chip-r">Total <b data-total></b></span>
        </div>
        <div class="imp-itens">${itens.map(linhaHtml).join('')}</div>
        <p class="imp-legenda">${icone('brilho')}<span>categoria sugerida. Toque na categoria para trocar; o que você trocar o GSCASH aprende para as próximas importações.</span></p>`;

      const porN = new Map(itens.map(i => [i.n, i]));
      const lista = modal.body.querySelector('.imp-itens');
      const redesenhar = i => {
        const el = lista.querySelector(`[data-n="${i.n}"]`);
        if (el) el.outerHTML = linhaHtml(i);
      };
      const botaoImportar = () => modal.foot.querySelector('[data-importar]');
      function atualizar() {
        const marcados = itens.filter(i => i.marcado);
        const total = marcados.reduce((s, i) => s + (i.tipo === 'receita' ? i.valor : -i.valor), 0);
        modal.body.querySelector('[data-conta]').textContent = marcados.length;
        modal.body.querySelector('[data-total]').textContent = `${total > 0 ? '+ ' : total < 0 ? '− ' : ''}${fmt(total)}`;
        const deFat = marcados.filter(i => i.fat).length;
        const chipFat = modal.body.querySelector('[data-chip-fat]');
        chipFat.classList.toggle('hidden', !deFat);
        chipFat.querySelector('b').textContent = deFat === 1 ? '1 pagamento de fatura' : `${deFat} pagamentos de fatura`;
        const semCartao = marcados.filter(i => i.fat && !i.fat.cartaoId).length;
        const deInv = marcados.filter(i => i.inv).length;
        const pend = new Set(marcados.filter(pendente).map(i => i.inv.chave)).size;
        const chipInv = modal.body.querySelector('[data-chip-inv]');
        chipInv.classList.toggle('hidden', !deInv);
        chipInv.querySelector('b').textContent = deInv;
        const chipPend = modal.body.querySelector('[data-chip-pend]');
        chipPend.classList.toggle('hidden', !pend);
        chipPend.querySelector('b').textContent = pend === 1 ? '1 investimento novo para configurar' : `${pend} investimentos novos para configurar`;
        const b = botaoImportar();
        b.disabled = !marcados.length;   // com investimento por configurar, o botão abre a configuração
        b.innerHTML = pend ? `Configure ${GS.plural(pend, 'investimento', 'investimentos')}`
          : semCartao ? 'Escolha o cartão'
          : `${icone('subir')}Importar ${GS.plural(marcados.length, 'lançamento', 'lançamentos')}`;
      }

      // investimento novo: configurado uma vez para todas as linhas com a mesma chave
      function configurar(chave) {
        const grupo = itens.filter(i => i.inv && i.inv.chave === chave && !i.inv.invId);
        if (!grupo.length) return;
        const saindo = grupo.filter(i => i.inv.mov === 'aplicacao');
        GS.formInvestimento.abrir({
          ctx: { carteiras, investimento: regInv },
          extrato: {
            titulo: grupo[0].titulo, linhas: grupo.length,
            total: grupo.reduce((s, i) => s + i.valor, 0), saindo: saindo.length >= grupo.length - saindo.length,
            data: grupo.map(i => i.data).sort()[0], conta: destino.carteira,
            sugestao: novosInv.get(chave) || sugestaoDeInvestimento(chave, destino.carteira.nome),
          },
          aoUsar: dados => { novosInv.set(chave, dados); grupo.forEach(redesenhar); atualizar(); },
          aoNaoE: () => { grupo.forEach(i => { i.inv = null; redesenhar(i); }); atualizar(); },
        });
      }

      lista.addEventListener('change', e => {
        if (!e.target.classList.contains('imp-marca')) return;
        const linha = e.target.closest('.imp-item');
        porN.get(Number(linha.dataset.n)).marcado = e.target.checked;
        atualizar();
      });
      // pagamento de fatura: outro cartão, a fatura do mês anterior ou seguinte, ou "é um gasto"
      function menuFatura(bf, item) {
        const escolher = (cartaoId, fatura) => { item.fat = { cartaoId, fatura }; redesenhar(item); atualizar(); };
        const atual = item.fat.cartaoId && carteiras.find(c => c.id === item.fat.cartaoId);
        GS.abrirMenu(bf, [
          ...cartoesFat.filter(c => c.id !== item.fat.cartaoId).map(c => {
            const k = faturaDoPagamento(c, item.data);
            return { rotulo: `${c.nome} · fatura de ${mesFatura(k)}`, icone: 'cartao', acao: () => escolher(c.id, k) };
          }),
          ...(atual ? [-1, 1].map(n => GS.faturas.somarMeses(item.fat.fatura, n)).map(k => ({
            rotulo: `Fatura de ${mesFatura(k)}`, icone: 'calendar', acao: () => escolher(atual.id, k),
          })) : []),
          { rotulo: 'Não é pagamento de fatura (gasto)', icone: 'x', acao: () => { item.fat = null; redesenhar(item); atualizar(); } },
        ]);
      }

      lista.addEventListener('click', e => {
        const bf = e.target.closest('.imp-fat');
        if (bf) return menuFatura(bf, porN.get(Number(bf.closest('.imp-item').dataset.n)));
        const bi = e.target.closest('.imp-inv');
        if (bi) {
          const item = porN.get(Number(bi.closest('.imp-item').dataset.n));
          if (pendente(item)) return configurar(item.inv.chave);
          // trocar: outro investimento, um novo, ou "não é investimento"
          GS.abrirMenu(bi, [
            ...ativos.filter(c => c.id !== item.inv.invId).map(c => ({
              rotulo: c.nome, icone: 'trending',
              acao: () => { item.inv.invId = c.id; item.inv.escolhido = true; redesenhar(item); atualizar(); },
            })),
            { rotulo: item.inv.invId ? 'Investimento novo' : 'Configurar de novo', icone: 'plus', acao: () => {
              item.inv.invId = null;
              item.inv.escolhido = false;
              redesenhar(item); atualizar();
              configurar(item.inv.chave);
            } },
            { rotulo: `Não é investimento (${item.tipo === 'despesa' ? 'gasto' : 'receita'})`, icone: 'x', acao: () => { item.inv = null; redesenhar(item); atualizar(); } },
          ]);
          return;
        }
        // a lista de categorias só é montada na linha em que a pessoa toca (arquivos grandes ficam leves)
        const b = e.target.closest('.imp-cat');
        if (!b) return;
        const linha = b.closest('.imp-item');
        const item = porN.get(Number(linha.dataset.n));
        const sel = GS.criarSelect({
          opcoes: ops[item.tipo], valor: item.cat, busca: true, rotuloAria: 'Categoria',
          aoMudar: v => { item.cat = v; item.sugerida = false; },
        });
        b.replaceWith(sel.el);
        sel.botao.click();
      });

      rodape(`<button type="button" class="btn btn-outline" data-voltar>Voltar</button>
              <button type="button" class="btn btn-primary" data-importar></button>`);
      modal.foot.querySelector('[data-voltar]').addEventListener('click', () => (arq.tipo === 'tabela' && (arq.precisaColunas || (arq.sinalIncerto && !destino.cartao)) ? passoColunas() : passoDestino()));
      botaoImportar().addEventListener('click', () => {
        const falta = itens.find(i => i.marcado && pendente(i));
        if (falta) return configurar(falta.inv.chave);
        const semCartao = itens.find(i => i.marcado && i.fat && !i.fat.cartaoId);
        if (semCartao) {
          const bf = lista.querySelector(`[data-n="${semCartao.n}"] .imp-fat`);
          // o menu fecha com qualquer rolagem: rola até a linha só se ela estiver fora de vista, e abre depois
          const r = bf.getBoundingClientRect(), caixa = modal.body.getBoundingClientRect();
          if (r.top >= caixa.top && r.bottom <= caixa.bottom) return menuFatura(bf, semCartao);
          bf.scrollIntoView({ block: 'nearest' });
          return setTimeout(() => menuFatura(bf, semCartao), 350);
        }
        importar(itens.filter(i => i.marcado), categorias, novosInv);
      });
      atualizar();
    }

    /* ---------- importar ---------- */

    async function importar(todos, categorias, novosInv = new Map()) {
      const b = modal.foot.querySelector('[data-importar]');
      b.disabled = true;
      b.innerHTML = '<span class="roda-botao" aria-hidden="true"></span>Importando…';
      const escolhidos = todos.filter(i => !i.inv && !i.fat);
      const deInvestimento = todos.filter(i => i.inv);
      const deFatura = todos.filter(i => i.fat && i.fat.cartaoId);
      try {
        // aplicações e resgates: transferências entre a conta e o investimento (os novos são criados juntos)
        let inv = { transacoes: [], investimentos: [], movimentos: 0 };
        if (deInvestimento.length) {
          const chavesNovas = new Set(deInvestimento.filter(i => !i.inv.invId).map(i => i.inv.chave));
          inv = await GS.api.importarMovimentosInvestimento(
            [...chavesNovas].map(chave => ({ chave, dados: novosInv.get(chave) })),
            deInvestimento.map(i => ({
              id: i.id, investimentoId: i.inv.invId, chave: i.inv.chave, mov: i.inv.mov,
              valor: i.valor, data: i.data, titulo: i.titulo, contaId: destino.carteira.id,
            })));
        }
        // pagamentos de fatura: o mesmo registro do "Pagar fatura" (a fatura do cartão aparece como paga)
        let pagos = [];
        if (deFatura.length) {
          pagos = await GS.api.importarPagamentosFatura(deFatura.map(i => ({
            id: i.id, cartaoId: i.fat.cartaoId, fatura: i.fat.fatura, valor: i.valor, data: i.data, contaId: destino.carteira.id,
          })));
        }
        const idsPagos = pagos.map(t => t.id);
        if (!escolhidos.length) {
          return concluir(idsPagos, inv);
        }
        // categorias que ainda não existem (da planilha, ou "Outros"): criadas uma vez cada
        const novas = new Map();
        for (const i of escolhidos.filter(x => x.cat.startsWith('nova:'))) {
          const chave = `${i.tipo}|${i.cat}`;
          if (novas.has(chave)) continue;
          const nome = i.cat.slice(5);
          let c = categorias.find(x => x.tipo === i.tipo && norm(x.nome) === norm(nome));
          if (!c) c = await GS.api.criarCategoria({ nome, tipo: i.tipo, icone: i.tipo === 'receita' ? 'cash' : 'tag', cor: '#8A8F98' });
          novas.set(chave, c.id);
        }
        const lista = escolhidos.map(i => {
          const [categoriaId, subcategoriaId] = i.cat.startsWith('nova:') ? [novas.get(`${i.tipo}|${i.cat}`), null] : i.cat.split('|');
          return {
            id: i.id, tipo: i.tipo, titulo: i.titulo, descricao: i.nota, valor: i.valor, data: i.data,
            categoriaId, subcategoriaId: subcategoriaId || null, carteiraId: destino.carteira.id,
            forma: destino.cartao ? 'credito' : 'debito', parcelas: 1,
          };
        });
        const criadas = await GS.api.importarTransacoes(lista);
        concluir([...idsPagos, ...criadas.map(t => t.id)], inv);
      } catch (err) {
        console.error('Falha ao importar', err);
        b.disabled = false;
        b.innerHTML = `${icone('subir')}Tentar de novo`;
        GS.toast(err.message || 'Não foi possível importar agora.', 'erro');
      }
    }

    // fim: aviso com "Desfazer" (que tira os lançamentos e os investimentos criados agora)
    function concluir(ids, inv) {
      GS.daConta.gravar(CONVITE, 'importou');
      document.querySelector('.convite-importar')?.remove();
      modal.fechar();
      GS.notificarMudanca();
      const n = ids.length + (inv.movimentos || 0);
      const criados = inv.investimentos.length;
      GS.toast(`${GS.plural(n, 'lançamento importado', 'lançamentos importados')}${criados ? ` · ${GS.plural(criados, 'investimento criado', 'investimentos criados')}` : ''}`, 'ok', {
        desfazer: async () => {
          try {
            await GS.api.excluirTransacoes([...ids, ...inv.transacoes]);
            for (const id of inv.investimentos) await GS.api.excluirInvestimento(id);
            GS.notificarMudanca();
            GS.toast('Importação desfeita');
          } catch (err) {
            GS.toast(err.message, 'erro');
          }
        },
      });
    }

    passoArquivo();
  }

  GS.importar = { abrir, _testes: { investimentoDaLinha, sugestaoDeInvestimento, linhasDoPdf, extratoDoPdf, lerCsv, lerOfx, dataIso, centavos, separadorDecimal, adivinharColunas, linhasDaTabela, motorDeCategorias, conferirSaldos, dicaDoBanco, bancoPeloLayout, pagamentoDeFatura } };

  // botão "Importar" da tela Transações
  document.getElementById('importar')?.addEventListener('click', abrir);

  /* ---------- convite no Painel ----------
     Para quem já usa mas tem poucos lançamentos (menos de 10). Some de vez depois do X ou da
     primeira importação. Um convite por vez no Painel: instalar e lembrete vêm antes deste. */
  async function convitePainel() {
    const lugar = document.querySelector('main .container');
    const passos = document.getElementById('primeirosPassos');
    if (!lugar || !passos) return;  // só no Painel
    await GS.usuarioPronto;
    if (GS.daConta.ler(CONVITE)) return;
    await GS.licenca?.pronta;
    await new Promise(r => setTimeout(r, 900));  // os outros convites aparecem primeiro
    // primeiros passos à mostra já oferecem importar
    if (GS.somenteLeitura || document.querySelector('.convite-app') || !passos.classList.contains('hidden')) return;
    const transacoes = await GS.api.listarTransacoes().catch(() => null);
    if (!transacoes || transacoes.filter(t => t.tipo === 'despesa' || t.tipo === 'receita').length >= 10) return;
    if (transacoes.some(t => String(t.id).startsWith('imp'))) return;
    const el = GS.el('div', 'convite-app convite-importar');
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Importar lançamentos');
    el.innerHTML = `
      <span class="icone-sino">${icone('subir')}</span>
      <span class="txt"><b>Traga o mês inteiro de uma vez</b><small>Importe o extrato do banco (até o PDF) ou sua planilha antiga. O GSCASH sugere as categorias e não duplica nada.</small></span>
      <button type="button" class="btn btn-primary" data-importar-convite>Importar</button>
      <button type="button" class="convite-fechar" aria-label="Agora não">${icone('x')}</button>`;
    el.querySelector('[data-importar-convite]').addEventListener('click', abrir);
    el.querySelector('.convite-fechar').addEventListener('click', () => {
      GS.daConta.gravar(CONVITE, 'fechou');
      el.remove();
    });
    lugar.prepend(el);
  }
  convitePainel();
})();
