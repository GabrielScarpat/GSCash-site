/* =========================================================
   GSCASH — camada de dados

   Os dados ficam no Supabase (veja "Armazenamento" mais abaixo).
   Todas as funções de GS.api retornam Promises, então as telas não
   dependem de onde os dados são guardados.

   Modelos (valores sempre em CENTAVOS, datas em 'AAAA-MM-DD'):

   Transacao { id, tipo: 'despesa'|'receita'|'pagamento'|'transferencia', titulo,
               descricao, valor, data, categoriaId, carteiraId,
               forma: 'debito'|'credito', parcelas (1 = à vista),
               subcategoriaId (null = nenhuma),
               recorrenciaId?, parcela?, totalParcelas?, criadoEm }
               · subcategoriaId: uma das subcategorias da categoria. Se o
                 título vier em branco, o lançamento leva o nome dela.
               · forma 'credito': o gasto vai para a fatura do cartão
                 da carteira e não mexe no saldo dela.
               · tipo 'pagamento': pagamento de fatura. carteiraId é a
                 conta que pagou; cartaoId e fatura ('AAAA-MM') dizem
                 qual fatura foi paga. Não conta como gasto.
               · tipo 'transferencia': sai de carteiraId e entra em
                 destinoId. Não conta como gasto nem como receita.
   Categoria { id, nome, tipo: 'despesa'|'receita', icone, cor,
               orcamento (centavos | null), subcategorias: [{ id, nome }] }
   Carteira  { id, nome, tipo: 'corrente'|'dinheiro'|'poupanca'|
               'investimento', cor, saldoInicial, oculta,
               credito: null | { ativo, limite, diaFechamento,
                                 diaVencimento, pagarComId } }
               · oculta: some da lista de carteiras e não entra no
                 saldo geral; os gastos dela continuam contando.
   ========================================================= */

window.GS = window.GS || {};

(function () {
  const STORAGE_KEY = 'gscash:v2';
  const STORAGE_KEY_V1 = 'gscash:v1';

  // Data fixa usada como "hoje" (ex.: '2026-09-30' para reproduzir o design).
  // null = usa a data real do computador.
  const DATA_REFERENCIA = null;

  function hoje() {
    if (DATA_REFERENCIA) {
      const [a, m, d] = DATA_REFERENCIA.split('-').map(Number);
      return new Date(a, m - 1, d);
    }
    const agora = new Date();
    return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  }

  /* ---------- Dados padrão e de demonstração ---------- */

  const CATEGORIAS_INICIAIS = [
    { id: 'alimentacao', nome: 'Alimentação', tipo: 'despesa', icone: 'utensils', cor: '#1B3A5C', orcamento: 90000 },
    { id: 'moradia',     nome: 'Moradia',     tipo: 'despesa', icone: 'house',    cor: '#2D5F8B', orcamento: 70000 },
    { id: 'transporte',  nome: 'Transporte',  tipo: 'despesa', icone: 'car',      cor: '#4A90C8', orcamento: 35000 },
    { id: 'lazer',       nome: 'Lazer',       tipo: 'despesa', icone: 'ticket',   cor: '#7DB5E0', orcamento: 30000 },
    { id: 'compras',     nome: 'Compras',     tipo: 'despesa', icone: 'bag',      cor: '#A9D3EF', orcamento: null },
    { id: 'assinaturas', nome: 'Assinaturas', tipo: 'despesa', icone: 'repeat',   cor: '#C9B57A', orcamento: null },
    { id: 'saude',       nome: 'Saúde',       tipo: 'despesa', icone: 'heart',    cor: '#8C7354', orcamento: null },
    { id: 'educacao',    nome: 'Educação',    tipo: 'despesa', icone: 'book',     cor: '#6B8F6B', orcamento: null },
    { id: 'salario',     nome: 'Salário',     tipo: 'receita', icone: 'briefcase', cor: '#2E7D32', orcamento: null },
    { id: 'outras-receitas', nome: 'Outras receitas', tipo: 'receita', icone: 'trending', cor: '#5E8C61', orcamento: null },
  ];

  // subcategorias das categorias padrão (só para quem começa do zero)
  const SUBCATEGORIAS_PADRAO = {
    alimentacao: ['Mercado', 'Restaurante', 'Delivery', 'Padaria', 'Lanche'],
    moradia: ['Aluguel', 'Condomínio', 'Luz', 'Água', 'Internet', 'Gás'],
    transporte: ['Combustível', 'Uber / 99', 'Ônibus / Metrô', 'Estacionamento', 'Manutenção'],
    lazer: ['Cinema', 'Bares', 'Viagem', 'Jogos', 'Passeios'],
    compras: ['Roupas', 'Eletrônicos', 'Casa', 'Presentes'],
    assinaturas: ['Streaming', 'Música', 'Academia', 'Aplicativos'],
    saude: ['Farmácia', 'Consulta', 'Exames', 'Plano de saúde'],
    educacao: ['Mensalidade', 'Cursos', 'Livros', 'Material'],
    salario: ['Salário do mês', 'Adiantamento', '13º salário', 'Férias', 'Bônus'],
    'outras-receitas': ['Freelance', 'Rendimentos', 'Reembolso', 'Vendas'],
  };

  const subcategoriasPadrao = categoriaId =>
    (SUBCATEGORIAS_PADRAO[categoriaId] || []).map(nome => ({ id: novoId('s'), nome }));

  // pacote opcional, baixado pelo botão "Baixar sugeridas" na tela Categorias
  const PACOTE_SUGERIDO = [
    { nome: 'Alimentação', tipo: 'despesa', icone: 'utensils', cor: '#1B3A5C', subcategorias: ['Mercado', 'Lanche na faculdade', 'Restaurante', 'Delivery', 'Doces e besteiras'] },
    { nome: 'Transporte', tipo: 'despesa', icone: 'car', cor: '#4A90C8', subcategorias: ['Uber / 99', 'Ônibus', 'Passagens'] },
    { nome: 'Rolês', tipo: 'despesa', icone: 'ticket', cor: '#7A5BC4', subcategorias: ['Bares', 'Festas', 'Churrasco', 'Shows'] },
    { nome: 'Relacionamento', tipo: 'despesa', icone: 'heart', cor: '#B5517E', subcategorias: ['Presentes', 'Encontros', 'Datas especiais'] },
    { nome: 'Viagens', tipo: 'despesa', icone: 'plane', cor: '#2F7BD8', subcategorias: ['Passagens', 'Hospedagem', 'Passeios', 'Comida na viagem'] },
    { nome: 'Faculdade', tipo: 'despesa', icone: 'book', cor: '#6B8F6B', subcategorias: ['Mensalidade', 'Material', 'Cursos'] },
    { nome: 'Assinaturas', tipo: 'despesa', icone: 'repeat', cor: '#C9B57A', subcategorias: ['Streaming', 'Música', 'Celular', 'Delivery por assinatura'] },
    { nome: 'Cuidados pessoais', tipo: 'despesa', icone: 'bag', cor: '#E9A21B', subcategorias: ['Cabelo', 'Roupas', 'Cosméticos'] },
    { nome: 'Dívidas', tipo: 'despesa', icone: 'tag', cor: '#C2392B', subcategorias: ['Empréstimos', 'Acordos', 'Juros e multas'] },
    { nome: 'Mesada', tipo: 'receita', icone: 'gift', cor: '#1FAF74', subcategorias: ['Mesada', 'Extra'] },
    { nome: 'Outras receitas', tipo: 'receita', icone: 'trending', cor: '#5E8C61', subcategorias: ['Vendas', 'Estornos', 'Rendimentos'] },
  ];

  // compara nomes sem ligar para acentos e maiúsculas
  const mesmoNome = (a, b) => {
    const n = s => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
    return n(a) === n(b);
  };

  const CARTEIRAS_INICIAIS = [
    { id: 'nubank',   nome: 'Nubank',                tipo: 'corrente', cor: '#2F7BD8', saldoInicial: 679840, credito: null },
    { id: 'itau',     nome: 'Itaú',                  tipo: 'corrente', cor: '#E8693A', saldoInicial: 252750, credito: null },
    { id: 'cartao',   nome: 'XP',                    tipo: 'corrente', cor: '#1FAF74', saldoInicial: 0,
      credito: { ativo: true, limite: 300000, diaFechamento: 25, diaVencimento: 5, pagarComId: 'nubank' } },
    { id: 'carteira', nome: 'Carteira',              tipo: 'dinheiro', cor: '#E9A21B', saldoInicial: 54530,  credito: null },
    { id: 'reserva',  nome: 'Reserva de emergência', tipo: 'poupanca', cor: '#8C7354', saldoInicial: 850000, credito: null },
  ];

  // [data, título, categoria, carteira, valor em centavos]
  // tudo que está na carteira 'cartao' (XP) foi comprado no crédito
  const TRANSACOES_INICIAIS = [
    ['2026-09-30', 'Passagem de ônibus', 'transporte', 'carteira', 600],
    ['2026-09-30', 'Almoço', 'alimentacao', 'nubank', 3290],
    ['2026-09-29', 'Livro da faculdade', 'educacao', 'cartao', 4500],
    ['2026-09-28', 'Uber para casa', 'transporte', 'nubank', 2340],
    ['2026-09-27', 'Mercado da semana', 'alimentacao', 'nubank', 9870],
    ['2026-09-27', 'Padaria', 'alimentacao', 'carteira', 1390],
    ['2026-09-26', 'Cinema', 'lazer', 'carteira', 5410],
    ['2026-09-25', 'Tênis de corrida', 'compras', 'cartao', 18990],
    ['2026-09-05', 'Aluguel', 'moradia', 'itau', 55000],
    ['2026-09-10', 'Conta de luz', 'moradia', 'itau', 10000],
    ['2026-09-03', 'Netflix', 'assinaturas', 'cartao', 4490],
    ['2026-09-08', 'Spotify', 'assinaturas', 'nubank', 2190],
    ['2026-09-15', 'iCloud', 'assinaturas', 'cartao', 800],
    ['2026-09-04', 'Farmácia', 'saude', 'nubank', 2840],
    ['2026-09-11', 'Remédio para gripe', 'saude', 'nubank', 1560],
    ['2026-09-11', 'Vitamina C', 'saude', 'nubank', 990],
    ['2026-09-18', 'Curativos', 'saude', 'nubank', 460],
    ['2026-09-22', 'Álcool em gel', 'saude', 'nubank', 400],
    ['2026-09-01', 'Mercado do mês', 'alimentacao', 'nubank', 24560],
    ['2026-09-02', 'Almoço', 'alimentacao', 'nubank', 2990],
    ['2026-09-04', 'Café', 'alimentacao', 'carteira', 850],
    ['2026-09-06', 'Pizza', 'alimentacao', 'nubank', 6200],
    ['2026-09-09', 'Almoço', 'alimentacao', 'nubank', 3150],
    ['2026-09-12', 'Feira', 'alimentacao', 'carteira', 4730],
    ['2026-09-13', 'Mercado da semana', 'alimentacao', 'nubank', 11240],
    ['2026-09-16', 'Lanche', 'alimentacao', 'carteira', 1890],
    ['2026-09-17', 'Almoço', 'alimentacao', 'nubank', 2870],
    ['2026-09-19', 'Hamburgueria', 'alimentacao', 'cartao', 5480],
    ['2026-09-20', 'Hortifrúti', 'alimentacao', 'nubank', 2540],
    ['2026-09-23', 'Café', 'alimentacao', 'carteira', 980],
    ['2026-09-24', 'Açaí', 'alimentacao', 'carteira', 2200],
    ['2026-09-02', 'Uber', 'transporte', 'nubank', 1870],
    ['2026-09-03', 'Passagem de ônibus', 'transporte', 'carteira', 600],
    ['2026-09-07', 'Recarga do cartão de transporte', 'transporte', 'nubank', 10000],
    ['2026-09-10', 'Uber', 'transporte', 'nubank', 2130],
    ['2026-09-14', 'Passagem de ônibus', 'transporte', 'carteira', 600],
    ['2026-09-16', 'Uber', 'transporte', 'nubank', 2680],
    ['2026-09-19', '99 Pop', 'transporte', 'nubank', 1540],
    ['2026-09-21', 'Estacionamento', 'transporte', 'nubank', 2000],
    ['2026-09-23', 'Uber para o aeroporto', 'transporte', 'nubank', 7480],
    ['2026-09-05', 'Barzinho com amigos', 'lazer', 'nubank', 6850],
    ['2026-09-12', 'Boliche', 'lazer', 'cartao', 4500],
    ['2026-09-13', 'Sorveteria', 'lazer', 'carteira', 1680],
    ['2026-09-19', 'Parque', 'lazer', 'carteira', 1200],
    ['2026-09-20', 'Jogo na Steam', 'lazer', 'cartao', 2490],
    ['2026-09-22', 'Museu', 'lazer', 'carteira', 1000],
    ['2026-09-21', 'Fliperama', 'lazer', 'carteira', 1560],
    ['2026-08-01', 'Mercado do mês', 'alimentacao', 'nubank', 26840],
    ['2026-08-02', 'Almoço', 'alimentacao', 'nubank', 3190],
    ['2026-08-03', 'Netflix', 'assinaturas', 'cartao', 4490],
    ['2026-08-05', 'Aluguel', 'moradia', 'itau', 55000],
    ['2026-08-06', 'Uber', 'transporte', 'nubank', 2210],
    ['2026-08-07', 'Recarga do cartão de transporte', 'transporte', 'nubank', 10000],
    ['2026-08-08', 'Spotify', 'assinaturas', 'nubank', 2190],
    ['2026-08-09', 'Pizza', 'alimentacao', 'nubank', 7150],
    ['2026-08-10', 'Conta de luz', 'moradia', 'itau', 11230],
    ['2026-08-11', 'Show de rock', 'lazer', 'cartao', 18000],
    ['2026-08-12', 'Feira', 'alimentacao', 'carteira', 3980],
    ['2026-08-14', 'Mercado da semana', 'alimentacao', 'nubank', 12670],
    ['2026-08-15', 'iCloud', 'assinaturas', 'cartao', 800],
    ['2026-08-16', 'Camiseta', 'compras', 'cartao', 8990],
    ['2026-08-17', 'Barzinho com amigos', 'lazer', 'nubank', 7420],
    ['2026-08-18', 'Farmácia', 'saude', 'nubank', 3680],
    ['2026-08-19', 'Almoço', 'alimentacao', 'nubank', 2950],
    ['2026-08-20', 'Uber', 'transporte', 'nubank', 1960],
    ['2026-08-21', 'Curso online', 'educacao', 'cartao', 12900],
    ['2026-08-22', 'Mercado da semana', 'alimentacao', 'nubank', 10430],
    ['2026-08-23', 'Cinema', 'lazer', 'carteira', 4800],
    ['2026-08-24', 'Passagem de ônibus', 'transporte', 'carteira', 600],
    ['2026-08-25', 'Fone de ouvido', 'compras', 'cartao', 14990],
    ['2026-08-26', 'Padaria', 'alimentacao', 'carteira', 1540],
    ['2026-08-27', 'Uber', 'transporte', 'nubank', 2430],
    ['2026-08-28', 'Hamburgueria', 'alimentacao', 'nubank', 5860],
    ['2026-08-29', 'Consulta dentista', 'saude', 'nubank', 15000],
    ['2026-08-30', 'Mercado da semana', 'alimentacao', 'nubank', 9400],
    ['2026-08-31', 'Café', 'alimentacao', 'carteira', 920],
  ];

  // títulos de demonstração que caem numa subcategoria
  const SUBCATEGORIA_DEMO = {
    'Aluguel': 'Aluguel', 'Conta de luz': 'Luz', 'Mercado da semana': 'Mercado', 'Mercado do mês': 'Mercado',
    'Padaria': 'Padaria', 'Lanche': 'Lanche', 'Pizza': 'Delivery', 'Uber': 'Uber / 99', 'Uber para casa': 'Uber / 99',
    '99 Pop': 'Uber / 99', 'Passagem de ônibus': 'Ônibus / Metrô', 'Estacionamento': 'Estacionamento',
    'Cinema': 'Cinema', 'Netflix': 'Streaming', 'Spotify': 'Música', 'Farmácia': 'Farmácia',
    'Consulta dentista': 'Consulta', 'Livro da faculdade': 'Livros', 'Curso online': 'Cursos',
  };

  // primeiro uso: só as categorias padrão (sem orçamento), sem carteiras nem lançamentos
  function dadosIniciais() {
    return {
      categorias: CATEGORIAS_INICIAIS.map(c => ({ ...c, orcamento: null, subcategorias: subcategoriasPadrao(c.id) })),
      carteiras: [],
      transacoes: [],
      preferencias: {},
    };
  }

  // dados fictícios usados no desenvolvimento: GS.api.restaurarDemo() no console
  function dadosDemo() {
    const base = Date.now();
    const categorias = CATEGORIAS_INICIAIS.map(c => ({ ...c, subcategorias: subcategoriasPadrao(c.id) }));
    const subcategoriaDe = (categoriaId, titulo) => {
      const sub = categorias.find(c => c.id === categoriaId).subcategorias.find(s => s.nome === SUBCATEGORIA_DEMO[titulo]);
      return sub ? sub.id : null;
    };
    return {
      categorias,
      carteiras: CARTEIRAS_INICIAIS.map(c => ({ ...c })),
      transacoes: [
        ...TRANSACOES_INICIAIS.map(([data, titulo, categoriaId, carteiraId, valor], i) => ({
          id: 't' + (i + 1),
          tipo: 'despesa',
          titulo,
          descricao: '',
          valor,
          data,
          categoriaId,
          subcategoriaId: subcategoriaDe(categoriaId, titulo),
          carteiraId,
          forma: carteiraId === 'cartao' ? 'credito' : 'debito',
          parcelas: titulo === 'Tênis de corrida' ? 3 : 1,
          criadoEm: base - i,
        })),
        {
          id: 'p1', tipo: 'pagamento', titulo: 'Fatura XP · agosto', descricao: '',
          valor: 60170, data: '2026-09-04', categoriaId: null, carteiraId: 'nubank',
          cartaoId: 'cartao', fatura: '2026-08', forma: 'debito', parcelas: 1, criadoEm: base - 1000,
        },
      ],
    };
  }

  // converte os dados da versão anterior (cartão de crédito era um tipo de carteira)
  function migrarV1(v1) {
    const eraCartao = new Set(v1.carteiras.filter(c => c.tipo === 'credito').map(c => c.id));
    const contaPadrao = (v1.carteiras.find(c => !eraCartao.has(c.id)) || {}).id || null;
    return {
      categorias: v1.categorias,
      carteiras: v1.carteiras.map(c => {
        const { limite, ...resto } = c;
        if (!eraCartao.has(c.id)) return { ...resto, credito: null };
        return {
          ...resto,
          tipo: 'corrente',
          saldoInicial: 0,
          credito: { ativo: true, limite: limite || 0, diaFechamento: 25, diaVencimento: 5, pagarComId: contaPadrao || c.id },
        };
      }),
      // receitas lançadas no antigo cartão só serviam para acertar o saldo dele; o novo modelo usa faturas
      transacoes: v1.transacoes
        .filter(t => !(eraCartao.has(t.carteiraId) && t.tipo === 'receita'))
        .map(t => ({
          ...t,
          forma: eraCartao.has(t.carteiraId) && t.tipo === 'despesa' ? 'credito' : 'debito',
          parcelas: 1,
        })),
    };
  }

  // versões antigas não tinham subcategorias: começam com a lista vazia
  // (as sugestões são opcionais, pelo pacote em Categorias)
  function migrarSubcategorias(db) {
    let mudou = false;
    db.categorias.forEach(c => {
      if (Array.isArray(c.subcategorias)) return;
      c.subcategorias = [];
      mudou = true;
    });
    return mudou;
  }

  /* ---------- Armazenamento ----------
     Os dados ficam no Supabase (tabelas categorias, subcategorias, carteiras,
     transacoes e perfis; a RLS garante que cada pessoa só vê as suas linhas).

     Ao abrir a página tudo é carregado para `cache`. As funções de GS.api
     mudam o `cache`; salvar() compara com `gravado` (a fotografia do que já
     está no banco) e envia só as diferenças. Se o envio falhar, o `cache`
     volta ao que está no banco e a chamada recebe o erro.

     Os dados antigos (localStorage, ou o dados.json do app de computador) só
     são lidos para importar, uma vez, quando a conta ainda está vazia.     */

  let cache = null;
  let gravado = null;
  let usuarioId = null;
  let gravando = Promise.resolve();
  let falhaGravacao = null;

  // o app de computador abre index.html?desktop=1; a marca vale para a janela toda
  const noDesktop = (() => {
    try {
      if (new URLSearchParams(location.search).has('desktop')) sessionStorage.setItem('gscash:desktop', '1');
      return sessionStorage.getItem('gscash:desktop') === '1';
    } catch (e) {
      return false;
    }
  })();

  function apiDesktop() {
    return new Promise(resolve => {
      const api = window.pywebview && window.pywebview.api;
      if (api && api.carregar) return resolve(api);
      window.addEventListener('pywebviewready', () => resolve(window.pywebview.api), { once: true });
    });
  }

  /* ---------- Dados do aparelho (só para importar) ---------- */

  async function lerDadosLocais() {
    let texto = null;
    try {
      texto = noDesktop ? await (await apiDesktop()).carregar() : localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      texto = null;
    }
    let local = null;
    try { local = texto ? JSON.parse(texto) : null; } catch (e) { local = null; }

    if (!local && !noDesktop) {
      try {
        const antigo = localStorage.getItem(STORAGE_KEY_V1);
        if (antigo) local = migrarV1(JSON.parse(antigo));
      } catch (e) {
        local = null;
      }
    }
    if (!local) return null;
    local.categorias = local.categorias || [];
    local.carteiras = local.carteiras || [];
    local.transacoes = local.transacoes || [];
    migrarSubcategorias(local);
    return local;
  }

  // o banco é mais rígido que o localStorage: ajusta o que o app antigo deixava passar
  function sanear(db) {
    const carteiras = new Set(db.carteiras.map(c => c.id));
    const subcategorias = new Set(db.categorias.flatMap(c => c.subcategorias.map(s => s.id)));
    db.carteiras.forEach(c => {
      if (c.credito && !carteiras.has(c.credito.pagarComId)) c.credito.pagarComId = null;
    });
    db.transacoes.forEach(t => {
      if (t.subcategoriaId && !subcategorias.has(t.subcategoriaId)) t.subcategoriaId = null;
      t.parcelas = Math.max(1, Math.min(24, Math.floor(t.parcelas) || 1));
      t.descricao = t.descricao || '';
    });
    return db;
  }

  /* ---------- Conversão: modelo do app <-> linhas do banco ---------- */

  const TABELAS = ['categorias', 'subcategorias', 'carteiras', 'transacoes', 'perfis'];
  const POR_PAGINA = 1000;
  const paraIso = ms => new Date(ms || Date.now()).toISOString();

  function paraLinhas(db) {
    const u = usuarioId;
    const linhas = {};
    TABELAS.forEach(t => { linhas[t] = new Map(); });

    db.categorias.forEach((c, i) => {
      linhas.categorias.set(c.id, {
        user_id: u, id: c.id, nome: c.nome, tipo: c.tipo, icone: c.icone, cor: c.cor,
        orcamento: c.orcamento || null, posicao: i,
      });
      (c.subcategorias || []).forEach((s, j) => {
        linhas.subcategorias.set(s.id, { user_id: u, id: s.id, categoria_id: c.id, nome: s.nome, posicao: j });
      });
    });

    db.carteiras.forEach((w, i) => {
      const cr = w.credito;
      linhas.carteiras.set(w.id, {
        user_id: u, id: w.id, nome: w.nome, tipo: w.tipo, cor: w.cor,
        saldo_inicial: w.saldoInicial || 0, oculta: !!w.oculta,
        credito_ativo: !!(cr && cr.ativo), credito_limite: cr ? cr.limite || 0 : 0,
        dia_fechamento: cr ? cr.diaFechamento : null, dia_vencimento: cr ? cr.diaVencimento : null,
        paga_com_id: cr ? cr.pagarComId || null : null, posicao: i,
      });
    });

    db.transacoes.forEach(t => {
      linhas.transacoes.set(t.id, {
        user_id: u, id: t.id, tipo: t.tipo, titulo: t.titulo, descricao: t.descricao || '',
        valor: t.valor, data: t.data, categoria_id: t.categoriaId || null,
        subcategoria_id: t.subcategoriaId || null, carteira_id: t.carteiraId,
        destino_id: t.destinoId || null, cartao_id: t.cartaoId || null, fatura: t.fatura || null,
        forma: t.forma || 'debito', parcelas: t.parcelas || 1, recorrencia_id: t.recorrenciaId || null,
        parcela: t.parcela == null ? null : t.parcela,
        total_parcelas: t.totalParcelas == null ? null : t.totalParcelas,
        criado_em: paraIso(t.criadoEm),
      });
    });

    linhas.perfis.set(u, { user_id: u, preferencias: db.preferencias || {} });
    return linhas;
  }

  function dasLinhas(l) {
    const porPosicao = (a, b) => a.posicao - b.posicao;
    const subsDe = new Map();
    l.subcategorias.slice().sort(porPosicao).forEach(s => {
      if (!subsDe.has(s.categoria_id)) subsDe.set(s.categoria_id, []);
      subsDe.get(s.categoria_id).push({ id: s.id, nome: s.nome });
    });

    return {
      categorias: l.categorias.slice().sort(porPosicao).map(c => ({
        id: c.id, nome: c.nome, tipo: c.tipo, icone: c.icone, cor: c.cor,
        orcamento: c.orcamento, subcategorias: subsDe.get(c.id) || [],
      })),
      carteiras: l.carteiras.slice().sort(porPosicao).map(w => ({
        id: w.id, nome: w.nome, tipo: w.tipo, cor: w.cor, saldoInicial: w.saldo_inicial, oculta: w.oculta,
        credito: w.dia_fechamento == null ? null : {
          ativo: w.credito_ativo, limite: w.credito_limite,
          diaFechamento: w.dia_fechamento, diaVencimento: w.dia_vencimento, pagarComId: w.paga_com_id,
        },
      })),
      transacoes: l.transacoes.map(r => {
        const t = {
          id: r.id, tipo: r.tipo, titulo: r.titulo, descricao: r.descricao, valor: r.valor, data: r.data,
          categoriaId: r.categoria_id, subcategoriaId: r.subcategoria_id, carteiraId: r.carteira_id,
          forma: r.forma, parcelas: r.parcelas, criadoEm: Date.parse(r.criado_em),
        };
        if (r.destino_id) t.destinoId = r.destino_id;
        if (r.cartao_id) t.cartaoId = r.cartao_id;
        if (r.fatura) t.fatura = r.fatura;
        if (r.recorrencia_id) t.recorrenciaId = r.recorrencia_id;
        if (r.parcela != null) t.parcela = r.parcela;
        if (r.total_parcelas != null) t.totalParcelas = r.total_parcelas;
        return t;
      }).sort((a, b) => a.criadoEm - b.criadoEm),
      preferencias: (l.perfis[0] && l.perfis[0].preferencias) || {},
    };
  }

  // texto de cada linha, para descobrir o que mudou desde o último envio
  function fotografia(linhas) {
    const foto = {};
    TABELAS.forEach(t => {
      foto[t] = new Map();
      linhas[t].forEach((linha, id) => foto[t].set(id, JSON.stringify(linha)));
    });
    return foto;
  }

  /* ---------- Banco ---------- */

  const verificar = resp => {
    if (resp.error) throw new Error(resp.error.message);
    return resp.data;
  };

  async function buscarTudo(tabela) {
    const todas = [];
    for (let de = 0; ; de += POR_PAGINA) {
      let consulta = GS.supabase.from(tabela).select('*');
      if (tabela !== 'perfis') consulta = consulta.is('excluido_em', null);
      const dados = verificar(await consulta.order('user_id').order(tabela === 'perfis' ? 'user_id' : 'id').range(de, de + POR_PAGINA - 1));
      todas.push(...dados);
      if (dados.length < POR_PAGINA) return todas;
    }
  }

  async function baixar() {
    const [categorias, subcategorias, carteiras, transacoes, perfis] = await Promise.all(TABELAS.map(buscarTudo));
    return {
      vazio: !categorias.length && !carteiras.length && !transacoes.length && !perfis.length,
      db: dasLinhas({ categorias, subcategorias, carteiras, transacoes, perfis }),
    };
  }

  function aplicar(db) {
    cache = db;
    gravado = fotografia(paraLinhas(db));
  }

  const CONFLITO = { perfis: 'user_id' };

  // envia ao banco o que mudou: novos e alterados com upsert, removidos como "excluídos"
  async function sincronizar() {
    const linhas = paraLinhas(cache);
    const foto = fotografia(linhas);
    const envio = {};
    const remocao = {};
    TABELAS.forEach(t => {
      envio[t] = [];
      remocao[t] = [];
      foto[t].forEach((texto, id) => { if (gravado[t].get(id) !== texto) envio[t].push(linhas[t].get(id)); });
      gravado[t].forEach((_, id) => { if (!foto[t].has(id)) remocao[t].push(id); });
    });

    // ordem importa: quem é apontado (categorias, carteiras) vem antes de quem aponta (transações)
    for (const t of TABELAS) {
      for (let i = 0; i < envio[t].length; i += 500) {
        const lote = envio[t].slice(i, i + 500).map(l => (t === 'perfis' ? l : { ...l, excluido_em: null }));
        verificar(await GS.supabase.from(t).upsert(lote, { onConflict: CONFLITO[t] || 'user_id,id' }));
      }
    }
    const agora = new Date().toISOString();
    for (const t of [...TABELAS].reverse()) {
      for (let i = 0; i < remocao[t].length; i += 100) {
        verificar(await GS.supabase.from(t).update({ excluido_em: agora }).eq('user_id', usuarioId).in('id', remocao[t].slice(i, i + 100)));
      }
    }
    gravado = foto;
  }

  let iniciando = null;

  // carrega os dados uma vez por página (e importa os dados do aparelho numa conta nova)
  function iniciar() {
    if (!iniciando) {
      iniciando = (async () => {
        const sessao = await GS.auth.sessao();
        if (!sessao) throw new Error('Faça login para continuar.');
        usuarioId = sessao.user.id;

        const { vazio, db } = await baixar();
        if (!vazio) return aplicar(db);

        // conta nova: oferece trazer os dados que estavam neste aparelho
        const local = await lerDadosLocais();
        const quer = local && (local.transacoes.length || local.carteiras.length) && confirm(
          `Encontramos neste aparelho ${local.transacoes.length} lançamentos e ${local.carteiras.length} carteiras do GSCASH.\n\n` +
          'OK = importar para a sua conta\nCancelar = começar do zero');
        cache = quer ? sanear(local) : dadosIniciais();
        gravado = fotografia(paraLinhas({ categorias: [], carteiras: [], transacoes: [] }));
        await sincronizar();
      })();
      iniciando.catch(() => { iniciando = null; });
    }
    return iniciando;
  }

  function carregar() {
    return cache;
  }

  // grava em fila; as respostas da API esperam a gravação terminar
  function salvar() {
    gravando = gravando.then(sincronizar).catch(async e => {
      console.error('Falha ao salvar os dados', e);
      falhaGravacao = new Error('Não foi possível salvar. Verifique a conexão e tente de novo.');
      try { aplicar((await baixar()).db); } catch (e2) { /* sem rede: o envio é refeito na próxima gravação */ }
    });
  }

  const novoId = prefixo => prefixo + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const copia = v => JSON.parse(JSON.stringify(v));
  // espera a gravação terminar; se ela falhou, quem pediu a mudança recebe o erro
  const responder = v => gravando.then(() => {
    if (falhaGravacao) {
      const erro = falhaGravacao;
      falhaGravacao = null;
      throw erro;
    }
    return copia(v);
  });
  const falhar = msg => Promise.reject(new Error(msg));

  function somarPeriodo(dataIso, frequencia, n) {
    const [a, m, d] = dataIso.split('-').map(Number);
    let dt;
    if (frequencia === 'semanal') dt = new Date(a, m - 1, d + 7 * n);
    else if (frequencia === 'anual') dt = new Date(a + n, m - 1, Math.min(d, diasNoMes(a + n, m - 1)));
    else {
      const alvo = new Date(a, m - 1 + n, 1);
      dt = new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(d, diasNoMes(alvo.getFullYear(), alvo.getMonth())));
    }
    return GS.isoData ? GS.isoData(dt) : dt.toISOString().slice(0, 10);
  }

  const diasNoMes = (a, m) => new Date(a, m + 1, 0).getDate();

  function limparTransacao(dados) {
    const tipo = dados.tipo === 'receita' ? 'receita' : 'despesa';
    const credito = tipo === 'despesa' && dados.forma === 'credito';
    return {
      tipo,
      titulo: String(dados.titulo || '').trim(),
      descricao: String(dados.descricao || '').trim(),
      valor: Math.round(Number(dados.valor) || 0),
      data: dados.data,
      categoriaId: dados.categoriaId,
      subcategoriaId: dados.subcategoriaId || null,
      carteiraId: dados.carteiraId,
      forma: credito ? 'credito' : 'debito',
      parcelas: credito ? Math.max(1, Math.min(24, Math.floor(dados.parcelas) || 1)) : 1,
    };
  }

  // a subcategoria precisa ser da categoria escolhida; sem título, o lançamento leva o nome dela
  function aplicarSubcategoria(db, t) {
    const cat = db.categorias.find(c => c.id === t.categoriaId);
    const sub = cat && (cat.subcategorias || []).find(s => s.id === t.subcategoriaId);
    t.subcategoriaId = sub ? sub.id : null;
    if (!t.titulo && sub) t.titulo = sub.nome;
  }

  // lista vinda do formulário ([{ id?, nome }]): tira vazios e repetidos e
  // mantém o id das que já existiam (para os lançamentos continuarem ligados)
  function limparSubcategorias(lista, atuais = []) {
    const ids = new Set(atuais.map(s => s.id));
    const vistos = new Set();
    const limpas = [];
    (lista || []).forEach(s => {
      const nome = String(s.nome || '').trim().slice(0, 40);
      if (!nome || vistos.has(nome.toLowerCase())) return;
      vistos.add(nome.toLowerCase());
      limpas.push({ id: ids.has(s.id) ? s.id : novoId('s'), nome });
    });
    return limpas;
  }

  // grava um lançamento (ou uma série, se recorrente) e devolve os criados
  function gravarSerie(db, base, rec) {
    const vezes = rec ? Math.max(1, Math.min(120, Math.floor(rec.vezes) || 1)) : 1;
    const recorrenciaId = rec ? novoId('r') : undefined;
    const criadas = [];
    for (let i = 0; i < vezes; i++) {
      const t = {
        ...base,
        id: novoId('t'),
        data: i === 0 ? base.data : somarPeriodo(base.data, rec.frequencia, i),
        criadoEm: Date.now() + i,
      };
      if (rec) Object.assign(t, { recorrenciaId, parcela: i + 1, totalParcelas: vezes });
      db.transacoes.push(t);
      criadas.push(t);
    }
    return criadas;
  }

  function limparTransferencia(dados) {
    return {
      tipo: 'transferencia',
      titulo: 'Transferência',
      descricao: String(dados.descricao || '').trim(),
      valor: Math.round(Number(dados.valor) || 0),
      data: dados.data,
      categoriaId: null,
      carteiraId: dados.origemId,
      destinoId: dados.destinoId,
      forma: 'debito',
      parcelas: 1,
    };
  }

  function validarTransferencia(db, t) {
    if (t.valor <= 0) return 'Informe um valor maior que zero.';
    if (!db.carteiras.some(c => c.id === t.carteiraId)) return 'Escolha a carteira de origem.';
    if (!db.carteiras.some(c => c.id === t.destinoId)) return 'Escolha a carteira de destino.';
    if (t.carteiraId === t.destinoId) return 'Escolha carteiras diferentes.';
    return null;
  }

  function validarCredito(db, t) {
    if (t.forma !== 'credito') return null;
    const c = db.carteiras.find(x => x.id === t.carteiraId);
    return c && c.credito && c.credito.ativo ? null : 'Esta carteira não tem crédito ativo.';
  }

  function limparCredito(cfg) {
    const dia = v => Math.max(1, Math.min(31, Math.floor(Number(v)) || 1));
    return {
      ativo: cfg.ativo !== false,
      limite: Math.max(0, Math.round(Number(cfg.limite) || 0)),
      diaFechamento: dia(cfg.diaFechamento),
      diaVencimento: dia(cfg.diaVencimento),
      pagarComId: cfg.pagarComId || null,
    };
  }

  /* ---------- API ---------- */

  GS.hoje = hoje;
  GS.noDesktop = noDesktop;
  GS.apiDesktop = apiDesktop;

  // a última exclusão, para o "Desfazer" do aviso (só a mais recente fica guardada)
  let ultimaExclusao = null;
  const lembrarExclusao = (tipo, itens, extra = {}) => { ultimaExclusao = { tipo, itens: copia(itens), ...extra }; };

  GS.api = {
    /* Transações */
    listarTransacoes() {
      return responder(carregar().transacoes);
    },

    // dados.recorrencia = { frequencia: 'semanal'|'mensal'|'anual', vezes: n } cria n lançamentos
    criarTransacao(dados) {
      const db = carregar();
      const base = limparTransacao(dados);
      aplicarSubcategoria(db, base);
      if (!base.titulo || base.valor <= 0) return falhar('Preencha título e valor.');
      const erroCredito = validarCredito(db, base);
      if (erroCredito) return falhar(erroCredito);

      const rec = dados.recorrencia;
      if (rec) base.parcelas = 1; // recorrente não é parcelado
      const criadas = gravarSerie(db, base, rec);
      salvar();
      return responder(criadas);
    },

    atualizarTransacao(id, dados) {
      const db = carregar();
      const t = db.transacoes.find(x => x.id === id);
      if (!t) return falhar('Transação não encontrada.');
      if (t.tipo === 'pagamento') return falhar('Pagamentos de fatura não podem ser editados.');
      if (t.tipo === 'transferencia') return falhar('Use atualizarTransferencia para transferências.');
      const novo = limparTransacao(dados);
      aplicarSubcategoria(db, novo);
      if (!novo.titulo || novo.valor <= 0) return falhar('Preencha título e valor.');
      const erroCredito = validarCredito(db, novo);
      if (erroCredito) return falhar(erroCredito);
      if (t.recorrenciaId) novo.parcelas = 1;
      Object.assign(t, novo);
      salvar();
      return responder(t);
    },

    excluirTransacao(id) {
      const db = carregar();
      lembrarExclusao('transacoes', db.transacoes.filter(x => x.id === id));
      db.transacoes = db.transacoes.filter(x => x.id !== id);
      salvar();
      return responder(true);
    },

    // várias de uma vez (ex.: "esta e as próximas" de uma transação recorrente)
    excluirTransacoes(ids) {
      const db = carregar();
      const alvo = new Set(ids);
      lembrarExclusao('transacoes', db.transacoes.filter(x => alvo.has(x.id)));
      db.transacoes = db.transacoes.filter(x => !alvo.has(x.id));
      salvar();
      return responder(true);
    },

    // traz de volta o que a última exclusão tirou (o banco só tinha marcado como excluído)
    desfazerExclusao() {
      const db = carregar();
      const u = ultimaExclusao;
      if (!u) return falhar('Não há nada para desfazer.');
      ultimaExclusao = null;
      const lista = db[u.tipo];
      const jaTem = new Set(lista.map(x => x.id));
      const voltam = u.itens.filter(x => !jaTem.has(x.id));
      if (u.tipo === 'transacoes') lista.push(...voltam);
      else lista.splice(Math.min(u.posicao ?? lista.length, lista.length), 0, ...voltam); // volta para o mesmo lugar da lista
      if (u.tipo === 'carteiras') {
        db.carteiras.forEach(c => {
          if (u.pagavamCom.includes(c.id) && c.credito && !c.credito.pagarComId) c.credito.pagarComId = u.itens[0].id;
        });
      }
      salvar();
      return responder(true);
    },

    /* Transferências entre carteiras */

    // dados = { valor, data, origemId, destinoId, descricao, recorrencia? }
    criarTransferencia(dados) {
      const db = carregar();
      const base = limparTransferencia(dados);
      const erro = validarTransferencia(db, base);
      if (erro) return falhar(erro);
      const criadas = gravarSerie(db, base, dados.recorrencia);
      salvar();
      return responder(criadas);
    },

    atualizarTransferencia(id, dados) {
      const db = carregar();
      const t = db.transacoes.find(x => x.id === id && x.tipo === 'transferencia');
      if (!t) return falhar('Transferência não encontrada.');
      const novo = limparTransferencia(dados);
      const erro = validarTransferencia(db, novo);
      if (erro) return falhar(erro);
      Object.assign(t, novo);
      salvar();
      return responder(t);
    },

    /* Faturas */

    // dados = { cartaoId, fatura: 'AAAA-MM', valor, data, contaId }
    pagarFatura(dados) {
      const db = carregar();
      const cartao = db.carteiras.find(c => c.id === dados.cartaoId);
      const conta = db.carteiras.find(c => c.id === dados.contaId);
      const valor = Math.round(Number(dados.valor) || 0);
      if (!cartao || !cartao.credito) return falhar('Cartão não encontrado.');
      if (!conta) return falhar('Escolha a conta que vai pagar a fatura.');
      if (valor <= 0) return falhar('Informe um valor maior que zero.');
      const t = {
        id: novoId('p'),
        tipo: 'pagamento',
        titulo: `Fatura ${cartao.nome} · ${GS.mesAnoDeIso(dados.fatura).split(' ')[0].toLowerCase()}`,
        descricao: '',
        valor,
        data: dados.data,
        categoriaId: null,
        carteiraId: conta.id,
        cartaoId: cartao.id,
        fatura: dados.fatura,
        forma: 'debito',
        parcelas: 1,
        criadoEm: Date.now(),
      };
      db.transacoes.push(t);
      salvar();
      return responder(t);
    },

    // remove todos os pagamentos de uma fatura
    desfazerPagamentos(cartaoId, fatura) {
      const db = carregar();
      const doPagamento = t => t.tipo === 'pagamento' && t.cartaoId === cartaoId && t.fatura === fatura;
      lembrarExclusao('transacoes', db.transacoes.filter(doPagamento));
      db.transacoes = db.transacoes.filter(t => !doPagamento(t));
      salvar();
      return responder(true);
    },

    // cfg = { ativo, limite, diaFechamento, diaVencimento, pagarComId }
    configurarCredito(carteiraId, cfg) {
      const db = carregar();
      const c = db.carteiras.find(x => x.id === carteiraId);
      if (!c) return falhar('Carteira não encontrada.');
      if (cfg.ativo === false) {
        const compras = db.transacoes.filter(t => t.carteiraId === carteiraId && t.forma === 'credito').length;
        if (compras) {
          return falhar(`Não dá para desligar: ${compras} ${compras === 1 ? 'compra usa' : 'compras usam'} o crédito desta carteira.`);
        }
        c.credito = c.credito ? { ...c.credito, ativo: false } : null;
      } else {
        c.credito = limparCredito({ ...(c.credito || {}), ...cfg, ativo: true });
      }
      salvar();
      return responder(c);
    },

    /* Categorias */
    listarCategorias() {
      return responder(carregar().categorias);
    },

    criarCategoria(dados) {
      const db = carregar();
      const nome = String(dados.nome || '').trim();
      if (!nome) return falhar('Informe o nome da categoria.');
      if (db.categorias.some(c => c.nome.toLowerCase() === nome.toLowerCase())) {
        return falhar('Já existe uma categoria com esse nome.');
      }
      const c = {
        id: novoId('c'),
        nome,
        tipo: dados.tipo === 'receita' ? 'receita' : 'despesa',
        icone: dados.icone || 'tag',
        cor: dados.cor || '#1D3A5E',
        orcamento: dados.orcamento > 0 ? Math.round(dados.orcamento) : null,
        subcategorias: limparSubcategorias(dados.subcategorias),
      };
      db.categorias.push(c);
      salvar();
      return responder(c);
    },

    atualizarCategoria(id, dados) {
      const db = carregar();
      const c = db.categorias.find(x => x.id === id);
      if (!c) return falhar('Categoria não encontrada.');
      if (dados.nome !== undefined) {
        const nome = String(dados.nome).trim();
        if (!nome) return falhar('Informe o nome da categoria.');
        if (db.categorias.some(o => o.id !== id && o.nome.toLowerCase() === nome.toLowerCase())) {
          return falhar('Já existe uma categoria com esse nome.');
        }
        c.nome = nome;
      }
      if (dados.icone !== undefined) c.icone = dados.icone;
      if (dados.cor !== undefined) c.cor = dados.cor;
      if (dados.orcamento !== undefined) c.orcamento = dados.orcamento > 0 ? Math.round(dados.orcamento) : null;
      if (dados.subcategorias !== undefined) {
        const antigas = new Map((c.subcategorias || []).map(s => [s.id, s]));
        const novas = limparSubcategorias(dados.subcategorias, c.subcategorias || []);
        const ficam = new Map(novas.map(s => [s.id, s]));
        db.transacoes.forEach(t => {
          if (t.categoriaId !== id || !t.subcategoriaId) return;
          const antes = antigas.get(t.subcategoriaId);
          const depois = ficam.get(t.subcategoriaId);
          // renomeada: lançamentos sem título próprio acompanham o novo nome
          if (antes && depois && t.titulo === antes.nome) t.titulo = depois.nome;
          // removida: o lançamento continua, só perde a subcategoria
          if (!depois) t.subcategoriaId = null;
        });
        c.subcategorias = novas;
      }
      salvar();
      return responder(c);
    },

    // cria uma subcategoria sem sair do formulário de transação (se já existir, devolve a existente)
    criarSubcategoria(categoriaId, nome) {
      const db = carregar();
      const c = db.categorias.find(x => x.id === categoriaId);
      if (!c) return falhar('Categoria não encontrada.');
      const limpo = String(nome || '').trim().slice(0, 40);
      if (!limpo) return falhar('Informe o nome da subcategoria.');
      c.subcategorias = c.subcategorias || [];
      const existente = c.subcategorias.find(s => s.nome.toLowerCase() === limpo.toLowerCase());
      if (existente) return responder(existente);
      const s = { id: novoId('s'), nome: limpo };
      c.subcategorias.push(s);
      salvar();
      return responder(s);
    },

    excluirCategoria(id) {
      const db = carregar();
      const usadas = db.transacoes.filter(t => t.categoriaId === id).length;
      if (usadas) {
        return falhar(`Não dá para excluir: ${usadas} ${usadas === 1 ? 'transação usa' : 'transações usam'} esta categoria.`);
      }
      const posicao = db.categorias.findIndex(c => c.id === id);
      lembrarExclusao('categorias', db.categorias.filter(c => c.id === id), { posicao });
      db.categorias = db.categorias.filter(c => c.id !== id);
      salvar();
      return responder(true);
    },

    /* Carteiras */
    listarCarteiras() {
      return responder(carregar().carteiras);
    },

    criarCarteira(dados) {
      const db = carregar();
      const nome = String(dados.nome || '').trim();
      if (!nome) return falhar('Informe o nome da carteira.');
      const c = {
        id: novoId('w'),
        nome,
        tipo: dados.tipo || 'corrente',
        cor: dados.cor || '#2F7BD8',
        saldoInicial: Math.round(Number(dados.saldoInicial) || 0),
        oculta: !!dados.oculta,
        credito: null,
      };
      db.carteiras.push(c);
      salvar();
      return responder(c);
    },

    atualizarCarteira(id, dados) {
      const db = carregar();
      const c = db.carteiras.find(x => x.id === id);
      if (!c) return falhar('Carteira não encontrada.');
      const nome = String(dados.nome || '').trim();
      if (!nome) return falhar('Informe o nome da carteira.');
      Object.assign(c, {
        nome,
        tipo: dados.tipo || c.tipo,
        cor: dados.cor || c.cor,
        saldoInicial: Math.round(Number(dados.saldoInicial) || 0),
        oculta: dados.oculta === undefined ? !!c.oculta : !!dados.oculta,
      });
      salvar();
      return responder(c);
    },

    excluirCarteira(id) {
      const db = carregar();
      const usadas = db.transacoes.filter(t => t.carteiraId === id || t.cartaoId === id || t.destinoId === id).length;
      if (usadas) {
        return falhar(`Não dá para excluir: ${usadas} ${usadas === 1 ? 'transação usa' : 'transações usam'} esta carteira.`);
      }
      const posicao = db.carteiras.findIndex(c => c.id === id);
      const pagavamCom = db.carteiras.filter(c => c.credito && c.credito.pagarComId === id).map(c => c.id);
      lembrarExclusao('carteiras', db.carteiras.filter(c => c.id === id), { posicao, pagavamCom });
      db.carteiras = db.carteiras.filter(c => c.id !== id);
      // carteiras que pagavam a fatura com esta ficam sem conta definida
      db.carteiras.forEach(c => { if (c.credito && c.credito.pagarComId === id) c.credito.pagarComId = null; });
      salvar();
      return responder(true);
    },

    /* Preferências da interface (ex.: ocultar valores), guardadas junto com os dados */
    obterPreferencias() {
      return responder(carregar().preferencias || {});
    },

    salvarPreferencia(chave, valor) {
      const db = carregar();
      db.preferencias = { ...(db.preferencias || {}), [chave]: valor };
      salvar();
      return responder(db.preferencias);
    },

    /* Utilitário de desenvolvimento: troca TODOS os dados pelos fictícios */
    /* Pacote de categorias sugeridas */
    pacoteSugerido() {
      return responder(PACOTE_SUGERIDO);
    },

    // junta ao que o usuário tem as categorias do pacote escolhidas (pelo nome):
    // se já existe uma com o mesmo nome, só entram as subcategorias que faltam.
    // Nada é apagado nem duplicado. Devolve os ids das categorias novas.
    baixarPacote(nomes) {
      const db = carregar();
      const novas = [];
      let subcategorias = 0;
      PACOTE_SUGERIDO.filter(p => nomes.includes(p.nome)).forEach(p => {
        let c = db.categorias.find(x => mesmoNome(x.nome, p.nome));
        if (!c) {
          c = { id: novoId('c'), nome: p.nome, tipo: p.tipo, icone: p.icone, cor: p.cor, orcamento: null, subcategorias: [] };
          db.categorias.push(c);
          novas.push(c.id);
        }
        c.subcategorias = c.subcategorias || [];
        p.subcategorias.forEach(nome => {
          if (c.subcategorias.some(s => mesmoNome(s.nome, nome))) return;
          c.subcategorias.push({ id: novoId('s'), nome });
          subcategorias++;
        });
      });
      salvar();
      return responder({ novas, subcategorias });
    },

    restaurarDemo() {
      if (!confirm('Isto troca TODOS os dados da sua conta pelos fictícios. Continuar?')) return falhar('Cancelado.');
      cache = { ...dadosDemo(), preferencias: cache.preferencias || {} };
      salvar();
      return responder(true);
    },
  };

  // licença vencida (js/licenca.js): o app fica só leitura e só estas funções seguem liberadas
  GS.somenteLeitura = false;
  GS.TEXTO_SO_LEITURA = 'Licença vencida: o GSCASH está em modo só leitura.';
  const LIBERADAS_SO_LEITURA = new Set(['listarTransacoes', 'listarCategorias', 'listarCarteiras', 'obterPreferencias', 'salvarPreferencia']);

  // toda chamada espera os dados terem sido carregados do banco
  Object.keys(GS.api).forEach(nome => {
    const funcao = GS.api[nome];
    GS.api[nome] = (...args) => iniciar().then(() => {
      if (GS.somenteLeitura && !LIBERADAS_SO_LEITURA.has(nome)) throw new Error(GS.TEXTO_SO_LEITURA);
      return funcao(...args);
    });
  });
})();
