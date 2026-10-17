/* =========================================================
   GSCASH — utilitários: formatação, datas, ícones e cálculos
   ========================================================= */

window.GS = window.GS || {};

(function () {
  /* ---------- Formatação ---------- */

  // moedas que a pessoa pode escolher (Configurações). Só muda o símbolo e o formato:
  // os valores não são convertidos. Fora o real, ponto nos centavos e vírgula no milhar
  // (€1,234.56, $1,234.56); o iene não tem centavos.
  // Por dentro tudo continua em centavos (no iene, ¥1 = 100), então trocar de moeda não mexe no banco.
  // A licença do GSCASH é sempre em real (licenca.js tem a formatação própria).
  GS.MOEDAS = {
    BRL: { nome: 'Real brasileiro', simbolo: 'R$', sigla: 'R$', local: 'pt-BR', casas: 2 },
    EUR: { nome: 'Euro', simbolo: '€', sigla: '€', local: 'en-IE', casas: 2 },
    USD: { nome: 'Dólar americano', simbolo: '$', sigla: 'US$', local: 'en-US', casas: 2 },
    JPY: { nome: 'Iene japonês', simbolo: '¥', sigla: '¥', local: 'en-US', casas: 0 },
  };

  let fmtMoeda, fmtMoedaInteira, fmtNumero, MASCARA;

  // troca a moeda de todo o app (chamada ao carregar as preferências e nas Configurações)
  GS.definirMoeda = codigo => {
    if (!GS.MOEDAS[codigo]) codigo = 'BRL';
    const m = GS.MOEDAS[codigo];
    GS.codigoMoeda = codigo;
    fmtMoeda = new Intl.NumberFormat(m.local, { style: 'currency', currency: codigo, minimumFractionDigits: m.casas, maximumFractionDigits: m.casas });
    fmtMoedaInteira = new Intl.NumberFormat(m.local, { style: 'currency', currency: codigo, maximumFractionDigits: 0 });
    fmtNumero = new Intl.NumberFormat(m.local, { minimumFractionDigits: m.casas, maximumFractionDigits: m.casas });
    MASCARA = `${m.simbolo} •••••`;
  };
  GS.moedaAtual = () => GS.MOEDAS[GS.codigoMoeda];
  GS.definirMoeda('BRL');

  // valores chegam em centavos
  // GS.oculto = true troca todos os valores exibidos por "R$ •••••" (botão de olho do Painel)
  GS.oculto = false;
  GS.moeda = centavos => (GS.oculto ? MASCARA : fmtMoeda.format((centavos || 0) / 100));
  GS.moedaInteira = centavos => (GS.oculto ? MASCARA : fmtMoedaInteira.format(Math.trunc((centavos || 0) / 100)));
  // mesmo com os valores ocultos (relatório em PDF, prévia da importação)
  GS.moedaVisivel = centavos => fmtMoeda.format((centavos || 0) / 100);
  GS.moedaAbs = centavos => fmtMoeda.format(Math.abs(centavos || 0) / 100);
  // só o número, sem símbolo (campos de valor)
  GS.numero = centavos => fmtNumero.format((centavos || 0) / 100);
  GS.pct = (parte, total) => (total > 0 ? Math.round((parte / total) * 100) : 0) + '%';

  GS.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // remove acentos e caixa para busca
  GS.normalizar = s => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

  GS.plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  /* ---------- Datas ---------- */

  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const pad = n => String(n).padStart(2, '0');

  GS.parseData = iso => {
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(a, m - 1, d);
  };

  GS.isoData = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  GS.isoMes = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;

  const comoData = d => (typeof d === 'string' ? GS.parseData(d) : d);

  GS.dataCurta = d => { d = comoData(d); return `${d.getDate()} ${MESES_CURTOS[d.getMonth()]}`; };                 // 30 set
  GS.dataMedia = d => { d = comoData(d); return `${d.getDate()} ${MESES_CURTOS[d.getMonth()]} ${d.getFullYear()}`; }; // 30 set 2026
  GS.dataLonga = d => { d = comoData(d); return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`; };   // Quarta, 30 de setembro
  GS.mesAno = d => { d = comoData(d); return `${cap(MESES[d.getMonth()])} ${d.getFullYear()}`; };                      // Setembro 2026
  GS.mesAnoDeIso = iso => GS.mesAno(GS.parseData(iso + '-01'));

  GS.somarDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  GS.diasEntre = (a, b) => Math.round((b - a) / 86400000);

  /* ---------- Ícones (traço, 24x24) ---------- */

  const P = {
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    'arrow-down': '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
    transfer: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
    'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c4.36 0 8.15 2.63 9.94 6.65a1 1 0 0 1 0 .7 10.6 10.6 0 0 1-1.62 2.6"/><path d="M14.08 14.16a3 3 0 0 1-4.24-4.24"/><path d="M17.48 17.5A10.56 10.56 0 0 1 12 19c-4.36 0-8.15-2.63-9.94-6.65a1 1 0 0 1 0-.7 10.7 10.7 0 0 1 4.46-5.14"/><path d="m2 2 20 20"/>',
    download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/>',
    filtro: '<path d="M3 5h18"/><path d="M6 12h12"/><path d="M10 19h4"/>',
    painel: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    carteira: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M16 14.5h2"/>',
    cartao: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/>',
    etiqueta: '<path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l8.58-8.58a1 1 0 0 0 0-1.42z"/><path d="M7 7h.01"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    escudo: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><rect x="9" y="11" width="6" height="5" rx="1"/><path d="M10.5 11V9.5a1.5 1.5 0 0 1 3 0V11"/>',
    'escudo-ok': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    pix: '<path d="m12 3 4 4-4 4-4-4z"/><path d="m12 13 4 4-4 4-4-4z"/><path d="M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4"/>',
    copiar: '<rect width="13" height="13" x="9" y="9" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    compartilhar: '<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/>',
    'mais-quadrado': '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8"/><path d="M8 12h8"/>',
    subir: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 8 5-5 5 5"/>',
    planilha: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/>',
    brilho: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    sino: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    logout: '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
    engrenagem: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    key: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',

    // categorias
    utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    house: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    car: '<path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.65 5H8.4a2 2 0 0 0-1.9 1.26L5 10 3 8"/><path d="M7 14h.01"/><path d="M17 14h.01"/><rect width="18" height="8" x="3" y="10" rx="2"/><path d="M5 18v2"/><path d="M19 18v2"/>',
    ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    repeat: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    book: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M4 16h16"/>',
    coffee: '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C9.5 3 11 5.5 12 8c1-2.5 2.5-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    gamepad: '<path d="M6 12h4"/><path d="M8 10v4"/><path d="M15 13h.01"/><path d="M18 11h.01"/><rect width="20" height="12" x="2" y="6" rx="2"/>',
    briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
    trending: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    tag: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>',
    paw: '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.05Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/>',

    // carteiras
    bank: '<path d="M3 22h18"/><path d="M6 18v-7"/><path d="M10 18v-7"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="m12 2 8 5H4z"/>',
    card: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
    cash: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    piggy: '<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z"/><path d="M2 9v1c0 1.1.9 2 2 2h1"/><path d="M16 11h.01"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  };

  GS.icone = (nome, extra = '') =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${P[nome] || P.tag}</svg>`;

  // ícones que o usuário pode escolher para uma categoria
  GS.ICONES_CATEGORIA = ['utensils', 'house', 'car', 'ticket', 'bag', 'repeat', 'heart', 'book',
                         'coffee', 'gift', 'plane', 'gamepad', 'paw', 'briefcase', 'trending', 'tag'];

  GS.CORES = ['#1B3A5C', '#2D5F8B', '#4A90C8', '#7DB5E0', '#2F7BD8', '#1FAF74', '#6B8F6B',
              '#C9B57A', '#E9A21B', '#E8693A', '#C2392B', '#B5517E', '#7A5BC4', '#8C7354'];

  GS.TIPOS_CARTEIRA = {
    corrente:     { nome: 'Conta corrente',    icone: 'bank' },
    dinheiro:     { nome: 'Dinheiro',          icone: 'cash' },
    poupanca:     { nome: 'Poupança',          icone: 'piggy' },
    investimento: { nome: 'Investimento',      icone: 'trending' },
  };

  /* ---------- Cálculos ---------- */

  GS.calc = {
    // saldo da conta até uma data (padrão: hoje — lançamentos futuros não contam);
    // compras no crédito não mexem nele (vão para a fatura); pagamentos de
    // fatura saem da conta que pagou; transferências saem de uma e entram na outra
    saldoCarteira(carteira, transacoes, ateIso = GS.isoData(GS.hoje())) {
      return transacoes.reduce((s, t) => {
        if (t.data > ateIso) return s;
        if (t.tipo === 'transferencia' && t.destinoId === carteira.id) return s + t.valor;
        if (t.carteiraId !== carteira.id) return s;
        if (t.tipo === 'receita') return s + t.valor;
        if (t.tipo === 'despesa' && t.forma === 'credito') return s;
        return s - t.valor;
      }, carteira.saldoInicial || 0);
    },

    // carteiras que entram no saldo geral (as ocultas ficam de fora)
    visiveis(carteiras) {
      return carteiras.filter(c => !c.oculta);
    },

    // despesas entre duas datas ISO (inclusive)
    despesasNoPeriodo(transacoes, inicioIso, fimIso) {
      return transacoes.filter(t => t.tipo === 'despesa' && t.data >= inicioIso && t.data <= fimIso);
    },

    receitasNoPeriodo(transacoes, inicioIso, fimIso) {
      return transacoes.filter(t => t.tipo === 'receita' && t.data >= inicioIso && t.data <= fimIso);
    },

    somar(transacoes) {
      return transacoes.reduce((s, t) => s + t.valor, 0);
    },

    // agrupa por campo e devolve [{ id, total, quantidade }] em ordem decrescente de total
    agrupar(transacoes, campo) {
      const mapa = new Map();
      transacoes.forEach(t => {
        const g = mapa.get(t[campo]) || { id: t[campo], total: 0, quantidade: 0 };
        g.total += t.valor;
        g.quantidade += 1;
        mapa.set(t[campo], g);
      });
      return [...mapa.values()].sort((a, b) => b.total - a.total);
    },

    ordenarRecentes(transacoes) {
      return [...transacoes].sort((a, b) => (b.data.localeCompare(a.data)) || (b.criadoEm - a.criadoEm));
    },
  };

  /* ---------- Faturas de cartão ----------
     Uma fatura é identificada pelo mês em que fecha ('AAAA-MM').
     Compras até o dia de fechamento entram na fatura do mês;
     depois dele, vão para a do mês seguinte.                   */

  const ultimoDia = (a, m) => new Date(a, m + 1, 0).getDate();
  const partesMes = chave => { const [a, m] = chave.split('-').map(Number); return [a, m - 1]; };
  const somarMeses = (chave, n) => { const [a, m] = partesMes(chave); return GS.isoMes(new Date(a, m + n, 1)); };
  const diaNoMes = (a, m, dia) => { const ref = new Date(a, m, 1); return new Date(ref.getFullYear(), ref.getMonth(), Math.min(dia, ultimoDia(ref.getFullYear(), ref.getMonth()))); };

  GS.faturas = {
    temCredito: c => !!(c && c.credito && c.credito.ativo),
    cartoes: carteiras => carteiras.filter(GS.faturas.temCredito),
    somarMeses,

    // fatura em que entra uma compra feita na data
    cicloDe(cartao, dataIso) {
      const d = GS.parseData(dataIso);
      const fechamento = Math.min(cartao.credito.diaFechamento, ultimoDia(d.getFullYear(), d.getMonth()));
      const chave = GS.isoMes(d);
      return d.getDate() <= fechamento ? chave : somarMeses(chave, 1);
    },

    // { inicio, fechamento, vencimento } de uma fatura
    datas(cartao, chave) {
      const { diaFechamento: F, diaVencimento: V } = cartao.credito;
      const [a, m] = partesMes(chave);
      const [pa, pm] = partesMes(somarMeses(chave, -1));
      return {
        inicio: GS.somarDias(diaNoMes(pa, pm, F), 1),
        fechamento: diaNoMes(a, m, F),
        vencimento: diaNoMes(a, V > F ? m : m + 1, V),
      };
    },

    // divide uma compra nas faturas: [{ chave, valor, n, total }]
    parcelas(t, cartao) {
      const total = Math.max(1, t.parcelas || 1);
      const base = Math.floor(t.valor / total);
      const primeira = GS.faturas.cicloDe(cartao, t.data);
      return Array.from({ length: total }, (_, i) => ({
        chave: somarMeses(primeira, i),
        valor: base + (i === 0 ? t.valor - base * total : 0),
        n: i + 1,
        total,
      }));
    },

    // faturas do cartão, da mais nova para a mais antiga
    // status: 'futura' | 'aberta' | 'fechada' | 'vencida' | 'paga'
    listar(cartao, transacoes, hoje = GS.hoje()) {
      const mapa = new Map();
      const pegar = chave => {
        if (!mapa.has(chave)) mapa.set(chave, { chave, itens: [], pagamentos: [], total: 0, pago: 0 });
        return mapa.get(chave);
      };

      transacoes.forEach(t => {
        if (t.tipo === 'despesa' && t.forma === 'credito' && t.carteiraId === cartao.id) {
          GS.faturas.parcelas(t, cartao).forEach(p => {
            const f = pegar(p.chave);
            f.itens.push({ ...p, transacao: t });
            f.total += p.valor;
          });
        } else if (t.tipo === 'pagamento' && t.cartaoId === cartao.id) {
          const f = pegar(t.fatura);
          f.pagamentos.push(t);
          f.pago += t.valor;
        }
      });

      const atual = GS.faturas.cicloDe(cartao, GS.isoData(hoje));
      pegar(atual);

      return [...mapa.values()]
        .map(f => {
          const datas = GS.faturas.datas(cartao, f.chave);
          const restante = Math.max(0, f.total - f.pago);
          let status;
          if (f.chave > atual) status = 'futura';
          else if (f.chave === atual) status = 'aberta';
          else if (restante === 0) status = 'paga';
          else status = hoje <= datas.vencimento ? 'fechada' : 'vencida';
          const pagaEm = f.pagamentos.map(p => p.data).sort().pop() || null;
          f.itens.sort((x, y) => y.transacao.data.localeCompare(x.transacao.data));
          return { ...f, ...datas, restante, status, pagaEm, atual: f.chave === atual };
        })
        .sort((x, y) => y.chave.localeCompare(x.chave));
    },

    // quanto do limite está comprometido (inclui parcelas futuras)
    limiteUsado(cartao, transacoes) {
      return GS.faturas.listar(cartao, transacoes).reduce((s, f) => s + f.restante, 0);
    },

    STATUS: {
      futura: 'Futura',
      aberta: 'Aberta',
      fechada: 'Fechada',
      vencida: 'Vencida',
      paga: 'Paga',
    },
  };

  // carrega tudo de uma vez e cria índices por id
  GS.carregarTudo = async function () {
    const [transacoes, categorias, carteiras] = await Promise.all([
      GS.api.listarTransacoes(),
      GS.api.listarCategorias(),
      GS.api.listarCarteiras(),
    ]);
    return {
      transacoes,
      categorias,
      carteiras,
      categoria: new Map(categorias.map(c => [c.id, c])),
      subcategoria: new Map(categorias.flatMap(c => (c.subcategorias || []).map(s => [s.id, { ...s, categoriaId: c.id }]))),
      carteira: new Map(carteiras.map(c => [c.id, c])),
    };
  };
})();
