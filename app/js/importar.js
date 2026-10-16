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

  // "R$ -1.234,56", "(12,00)", "123,45 D", -12.5 -> centavos com sinal (negativo = saída)
  function centavos(v, decimal = ',') {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
    let s = String(v ?? '').trim();
    if (!s) return null;
    const negativo = /^\(.*\)$/.test(s) || /[-−]/.test(s) || /\sD$/i.test(s);
    s = s.replace(/[^\d.,]/g, '');
    if (!/\d/.test(s)) return null;
    const numero = decimal === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
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
      const titulo = tag(b, 'MEMO') || tag(b, 'NAME');
      return {
        data: dataIso(tag(b, 'DTPOSTED')),
        valor: centavos(valorTexto, valorTexto.includes(',') && !valorTexto.includes('.') ? ',' : '.'),
        titulo: titulo.replace(/\s+/g, ' '),
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
     e fica de fora. Feito sobre o extrato do Santander; outros bancos parecidos também funcionam. */

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
    const pdf = await lib.getDocument({ data: buf }).promise;
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
          if (ant && vao < l.altura * 0.8) {
            ant.s += (vao > 1.5 ? ' ' : '') + i.s;
            ant.x2 = Math.max(ant.x2, i.x2);
          } else juntos.push({ ...i });
        });
        l.itens = juntos;
        linhas.push(l);
      });
    }
    return linhas;
  }

  const MESES_PDF = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const DATA_PDF = /^(\d{2})\/(\d{2})(?:\/(\d{2}|\d{4}))?$/;
  const VALOR_PDF = /^-?\(?\d{1,3}(?:\.\d{3})*,\d{2}\)?-?$/;
  const textoDe = itens => itens.map(i => i.s).join(' ').replace(/\s+/g, ' ').trim();

  function extratoDoPdf(linhas) {
    const todo = norm(linhas.slice(0, 80).map(l => textoDe(l.itens)).join(' '));
    // mês e ano do extrato ("setembro/2026"), para completar datas "05/09"
    const ref = todo.match(new RegExp(`(${MESES_PDF.join('|')}) ?(?:de )?(20\\d{2})`));
    const mesRef = ref ? MESES_PDF.indexOf(ref[1]) + 1 : GS.hoje().getMonth() + 1;
    const anoRef = ref ? Number(ref[2]) : GS.hoje().getFullYear();
    const completar = (d, m, a) => {
      const ano = a ? (a.length === 2 ? 2000 + Number(a) : Number(a)) : (Number(m) > mesRef ? anoRef - 1 : anoRef);
      return dataValida(ano, Number(m), Number(d));
    };

    let inicio = linhas.findIndex(l => /movimenta/i.test(norm(textoDe(l.itens))));
    if (inicio < 0) inicio = 0;
    const fim = /n.mero do cart.o|comprovantes? de pagamento|aplica..o n|investimentos|resumo do m.s|saldo final|indicadores/i;

    // coluna dos valores: a borda direita que mais se repete entre as linhas com valor
    const bordas = new Map();
    linhas.slice(inicio, inicio + 120).forEach(l => l.itens.filter(i => VALOR_PDF.test(i.s)).slice(0, 1)
      .forEach(i => { const k = Math.round(i.x2 / 6); bordas.set(k, (bordas.get(k) || 0) + 1); }));
    const colValor = ([...bordas.entries()].sort((a, b) => b[1] - a[1])[0] || [0])[0] * 6;
    const xs = linhas.slice(inicio).map(l => l.itens[0]).filter(i => i && DATA_PDF.test(i.s)).map(i => i.x);
    const colData = xs.length ? Math.min(...xs) : -1;

    const saida = [];
    let data = null, atual = null, lancados = 0;
    for (const l of linhas.slice(inicio + 1)) {
      const texto = textoDe(l.itens);
      if (fim.test(semAcento(texto))) break;
      let itens = l.itens;
      const primeiro = itens[0];
      const temData = primeiro && DATA_PDF.test(primeiro.s) && Math.abs(primeiro.x - colData) < 6;
      const valores = itens.filter(i => VALOR_PDF.test(i.s));
      const mov = valores.find(i => Math.abs(i.x2 - colValor) < 14);
      if (!mov) {
        // linha com data e valor em outra coluna: começou outra tabela (ex.: compras do cartão)
        if (temData && valores.length && lancados >= 3) break;
        if (temData) { const m = primeiro.s.match(DATA_PDF); data = completar(m[1], m[2], m[3]); }
        const perto = atual && atual.pagina === l.pagina && atual.ultimoY - l.y < atual.altura * 2.8;
        if (perto && !valores.length && atual.detalhe.length < 2) { atual.detalhe.push(texto); atual.ultimoY = l.y; }
        else atual = null;
        continue;
      }
      if (temData) { const m = primeiro.s.match(DATA_PDF); data = completar(m[1], m[2], m[3]); itens = itens.slice(1); }
      const desc = itens.filter(i => i.x2 <= mov.x + 1 && i !== mov);
      while (desc.length && /^(\d{4,}|-)$/.test(desc[desc.length - 1].s)) desc.pop();  // nº do documento
      const principal = textoDe(desc);
      if (!data || !principal || /saldo/i.test(norm(principal))) { atual = null; continue; }
      atual = { data, valor: centavos(mov.s, ','), principal, detalhe: [], pagina: l.pagina, ultimoY: l.y, altura: l.altura };
      saida.push(atual);
      lancados++;
    }

    return saida.filter(t => t.valor).map(t => {
      let principal = t.principal, detalhe = t.detalhe.join(' ').trim(), data = t.data;
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
      if (!cartao && detalhe && !/^[A-Z0-9]{6,}$/.test(detalhe)) titulo = `${principal} · ${detalhe}`;
      else if (!cartao) titulo = principal;
      titulo = titulo.replace(/^pix (enviado|recebido)\s+(?!·)/i, (_, q) => `Pix ${q.toLowerCase()} · `)
        .replace(/^pix (enviado|recebido)/i, (_, q) => `Pix ${q.toLowerCase()}`);
      return { data, valor: t.valor, titulo: titulo.replace(/\s+/g, ' ').trim() || 'Lançamento' };
    });
  }

  async function lerArquivo(arquivo) {
    if (arquivo.size > 15 * 1024 * 1024) throw new Error('O arquivo é grande demais (mais de 15 MB).');
    const nome = arquivo.name || 'arquivo';
    const buf = await arquivo.arrayBuffer();
    if (/\.pdf$/i.test(nome) || new TextDecoder('ascii').decode(new Uint8Array(buf.slice(0, 5))) === '%PDF-') {
      const linhas = await linhasDoPdf(buf);
      const texto = linhas.slice(0, 60).map(l => textoDe(l.itens)).join(' ');
      return { tipo: 'ofx', formato: 'pdf', nome, cartao: false, banco: texto, linhas: extratoDoPdf(linhas) };
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
  ];

  function papelPeloNome(cab) {
    const n = norm(cab);
    if (!n) return null;
    if (/^(data|date|dt)\b|data (da |de )?(compra|transacao|lancamento|movimento)/.test(n)) return 'data';
    if (/categoria|category/.test(n)) return 'categoria';
    if (/^(tipo|natureza|d c|c d|debito credito)$/.test(n)) return 'tipo';
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
        return { inicio: i + 1, papeis: papeis.map(p => (p && !vistos.has(p) && vistos.add(p) ? p : 'ignorar')), cabecalho: tabela[i] };
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
    const [cData, cDesc, cValor, cEnt, cSai, cCat, cTipo] = ['data', 'descricao', 'valor', 'entrada', 'saida', 'categoria', 'tipo'].map(col);
    const corpo = tabela.slice(mapa.inicio);
    const dec = separadorDecimal(corpo.flatMap(l => [l[cValor], l[cEnt], l[cSai]]));
    const linhas = [];
    corpo.forEach(l => {
      const data = dataIso(l[cData]);
      const titulo = String(l[cDesc] ?? '').replace(/\s+/g, ' ').trim();
      if (!data || !titulo) return;
      let valor = null;
      if (cValor >= 0) {
        valor = centavos(l[cValor], dec);
        if (valor === null) return;
        const tipo = cTipo >= 0 ? norm(l[cTipo]) : '';
        if (/^(receita|entrada|credito|c|cr)\b/.test(tipo)) valor = Math.abs(valor);
        else if (/^(despesa|saida|debito|d|db)\b/.test(tipo)) valor = -Math.abs(valor);
        else if (sinal === 'todos') valor = -Math.abs(valor);
      } else {
        const e = cEnt >= 0 ? Math.abs(centavos(l[cEnt], dec) || 0) : 0;
        const s = cSai >= 0 ? Math.abs(centavos(l[cSai], dec) || 0) : 0;
        valor = e ? e : -s;
      }
      if (!valor) return;
      linhas.push({ data, valor, titulo, categoriaTexto: cCat >= 0 ? String(l[cCat] ?? '').trim() : '' });
    });
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
  ];

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
          arq.banco = arq.cartao ? 'nubank' : `${arq.nome}`;
        } else if (!arq.linhas.length) {
          throw new Error(arq.formato === 'pdf' ? 'Não encontramos a lista de lançamentos nesse PDF. Se o banco tiver a opção, exporte o extrato em OFX ou CSV.' : 'Não encontramos lançamentos nesse arquivo OFX.');
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
      const [categorias, transacoes] = await Promise.all([GS.api.listarCategorias(), GS.api.listarTransacoes()]);
      const sugerir = motorDeCategorias(categorias, transacoes);
      const cartao = destino.cartao ? destino.carteira : null;
      if (cartao && !fatura) opcoesFatura();

      let linhas = linhasAtuais();
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
        return {
          n, id, tipo, valor, data, titulo: l.titulo.slice(0, 80), nota, parcela: parcela ? `${parcela[1]}/${parcela[2]}` : '',
          marcado: !repetido, repetido,
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
      modal.body.innerHTML = `
        <div class="imp-resumo">
          <span class="chip-r"><b data-conta></b> para importar</span>
          ${repetidos ? `<span class="chip-r aviso">${icone('alert')}<b>${repetidos}</b> já ${repetidos === 1 ? 'estava' : 'estavam'} no GSCASH</span>` : ''}
          ${entreContas ? `<span class="chip-r aviso">${icone('transfer')}<b>${entreContas}</b> entre suas contas</span>` : ''}
          ${foraDaFatura ? `<span class="chip-r">${GS.plural(foraDaFatura, 'pagamento ou estorno fica', 'pagamentos e estornos ficam')} de fora</span>` : ''}
          <span class="chip-r">Total <b data-total></b></span>
        </div>
        <div class="imp-itens">${itens.map(i => `
          <div class="imp-item ${i.repetido ? 'rep' : ''}" data-n="${i.n}">
            <input type="checkbox" class="imp-marca" ${i.marcado ? 'checked' : ''} aria-label="Importar ${esc(i.titulo)}">
            <span class="data">${esc(GS.dataCurta ? GS.dataCurta(i.data) : i.data)}</span>
            <span class="desc"><b title="${esc(i.titulo)}">${esc(i.titulo)}</b>${i.repetido ? `<small class="aviso">${esc(i.repetido)}</small>` : i.nota ? `<small>${esc(i.nota)}</small>` : ''}</span>
            <span class="cat-slot"><button type="button" class="imp-cat">${rotuloCat(i.tipo, i.cat)}${i.sugerida ? `<span class="sug" title="Categoria sugerida">${icone('brilho')}</span>` : ''}</button></span>
            <span class="val ${i.tipo === 'receita' ? 'e' : ''}">${i.tipo === 'receita' ? '+ ' : ''}${fmt(i.valor)}</span>
          </div>`).join('')}</div>
        <p class="imp-legenda">${icone('brilho')}<span>categoria sugerida. Toque na categoria para trocar; o que você trocar o GSCASH aprende para as próximas importações.</span></p>`;

      const porN = new Map(itens.map(i => [i.n, i]));
      const botaoImportar = () => modal.foot.querySelector('[data-importar]');
      function atualizar() {
        const marcados = itens.filter(i => i.marcado);
        const total = marcados.reduce((s, i) => s + (i.tipo === 'receita' ? i.valor : -i.valor), 0);
        modal.body.querySelector('[data-conta]').textContent = marcados.length;
        modal.body.querySelector('[data-total]').textContent = `${total > 0 ? '+ ' : total < 0 ? '− ' : ''}${fmt(total)}`;
        const b = botaoImportar();
        b.disabled = !marcados.length;
        b.innerHTML = `${icone('subir')}Importar ${GS.plural(marcados.length, 'lançamento', 'lançamentos')}`;
      }
      const lista = modal.body.querySelector('.imp-itens');
      lista.addEventListener('change', e => {
        if (!e.target.classList.contains('imp-marca')) return;
        const linha = e.target.closest('.imp-item');
        porN.get(Number(linha.dataset.n)).marcado = e.target.checked;
        atualizar();
      });
      // a lista de categorias só é montada na linha em que a pessoa toca (arquivos grandes ficam leves)
      lista.addEventListener('click', e => {
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
      botaoImportar().addEventListener('click', () => importar(itens.filter(i => i.marcado), categorias));
      atualizar();
    }

    /* ---------- importar ---------- */

    async function importar(escolhidos, categorias) {
      const b = modal.foot.querySelector('[data-importar]');
      b.disabled = true;
      b.innerHTML = '<span class="roda-botao" aria-hidden="true"></span>Importando…';
      try {
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
        try { localStorage.setItem(CONVITE, 'importou'); } catch (e) { /* segue */ }
        document.querySelector('.convite-importar')?.remove();
        modal.fechar();
        GS.notificarMudanca();
        GS.toast(`${GS.plural(criadas.length, 'lançamento importado', 'lançamentos importados')}`, 'ok', {
          desfazer: async () => {
            try {
              await GS.api.excluirTransacoes(criadas.map(t => t.id));
              GS.notificarMudanca();
              GS.toast('Importação desfeita');
            } catch (err) {
              GS.toast(err.message, 'erro');
            }
          },
        });
      } catch (err) {
        console.error('Falha ao importar', err);
        b.disabled = false;
        b.innerHTML = `${icone('subir')}Tentar de novo`;
        GS.toast(err.message || 'Não foi possível importar agora.', 'erro');
      }
    }

    passoArquivo();
  }

  GS.importar = { abrir, _testes: { linhasDoPdf, extratoDoPdf, lerCsv, lerOfx, dataIso, centavos, separadorDecimal, adivinharColunas, linhasDaTabela, motorDeCategorias } };

  // botão "Importar" da tela Transações
  document.getElementById('importar')?.addEventListener('click', abrir);

  /* ---------- convite no Painel ----------
     Para quem já usa mas tem poucos lançamentos (menos de 10). Some de vez depois do X ou da
     primeira importação. Um convite por vez no Painel: instalar e lembrete vêm antes deste. */
  async function convitePainel() {
    const lugar = document.querySelector('main .container');
    const passos = document.getElementById('primeirosPassos');
    if (!lugar || !passos) return;  // só no Painel
    try { if (localStorage.getItem(CONVITE)) return; } catch (e) { return; }
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
      try { localStorage.setItem(CONVITE, 'fechou'); } catch (e) { /* segue */ }
      el.remove();
    });
    lugar.prepend(el);
  }
  convitePainel();
})();
