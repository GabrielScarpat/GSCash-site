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
   Recorrencia { id, frequencia: 'semanal'|'mensal'|'anual', inicio, semFim, geradaAte }
               · a regra de uma série. Os lançamentos dela são gravados um a um
                 (recorrenciaId = id, parcela = n, data = inicio + n-1 períodos).
               · semFim ("Até eu cancelar"): a série é completada sozinha até
                 HORIZONTE_MESES à frente. geradaAte = último n já criado, para um
                 lançamento excluído com "Só esta" não voltar.
               · séries antigas não têm regra: a frequência sai das datas.
   Investimento { id (= id da carteira tipo 'investimento'), tipo, indexador, taxa,
               liquidez: 'diaria'|'vencimento', vencimento, destinoId,
               valorAtual, valorAtualEm, resgatadoEm }
               · a aplicação é uma carteira (oculta) do tipo 'investimento': o dinheiro
                 entra por transferência e volta por outra no resgate; o ganho entra
                 nela como receita "Rendimentos" na hora do resgate.
               · indexador: cdi_pct | cdi_mais | prefixado | ipca_mais | selic |
                 poupanca | sem_taxa (veja js/indices.js).
               · carteira 'investimento' sem registro aqui (criada antes): "sem taxa".
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
      recorrencias: [],
      investimentos: [],
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

  // os dados antigos do aparelho são oferecidos a uma conta só (a primeira conta nova que aparecer)
  const CHAVE_LEGADO = 'gscash:legado-oferecido';
  async function legadoJaOferecido() {
    try {
      return noDesktop ? !!(await (await apiDesktop()).sessao_ler(CHAVE_LEGADO)) : !!localStorage.getItem(CHAVE_LEGADO);
    } catch (e) {
      return false;
    }
  }
  async function marcarLegadoOferecido() {
    try {
      if (noDesktop) await (await apiDesktop()).sessao_gravar(CHAVE_LEGADO, '1');
      else localStorage.setItem(CHAVE_LEGADO, '1');
    } catch (e) { /* sem onde guardar: pode oferecer de novo */ }
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

  // a ordem importa no envio: quem é apontado (carteiras) vai antes de quem aponta (investimentos, transações)
  const TABELAS = ['categorias', 'subcategorias', 'carteiras', 'investimentos', 'transacoes', 'recorrencias', 'perfis'];
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

    (db.investimentos || []).forEach(v => {
      linhas.investimentos.set(v.id, {
        user_id: u, id: v.id, tipo: v.tipo, indexador: v.indexador, taxa: v.taxa || 0,
        liquidez: v.liquidez, vencimento: v.vencimento || null, destino_id: v.destinoId || null,
        valor_atual: v.valorAtual == null ? null : v.valorAtual, valor_atual_em: v.valorAtualEm || null,
        resgatado_em: v.resgatadoEm || null,
      });
    });

    (db.recorrencias || []).forEach(r => {
      linhas.recorrencias.set(r.id, {
        user_id: u, id: r.id, frequencia: r.frequencia, inicio: r.inicio, sem_fim: !!r.semFim, gerada_ate: r.geradaAte,
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
      investimentos: (l.investimentos || []).map(v => ({
        id: v.id, tipo: v.tipo, indexador: v.indexador, taxa: Number(v.taxa) || 0, liquidez: v.liquidez,
        vencimento: v.vencimento, destinoId: v.destino_id, valorAtual: v.valor_atual == null ? null : Number(v.valor_atual),
        valorAtualEm: v.valor_atual_em, resgatadoEm: v.resgatado_em,
      })),
      recorrencias: (l.recorrencias || []).map(r => ({
        id: r.id, frequencia: r.frequencia, inicio: r.inicio, semFim: r.sem_fim, geradaAte: r.gerada_ate,
      })),
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
    const lidas = await Promise.all(TABELAS.map(buscarTudo));
    const l = Object.fromEntries(TABELAS.map((t, i) => [t, lidas[i]]));
    return {
      vazio: !l.categorias.length && !l.carteiras.length && !l.transacoes.length && !l.perfis.length,
      db: dasLinhas(l),
    };
  }

  function aplicar(db) {
    db.recorrencias = db.recorrencias || [];   // cópia ou dados de antes das regras de repetição
    db.investimentos = db.investimentos || [];
    cache = db;
    gravado = fotografia(paraLinhas(db));
    guardarCopia();
  }

  // Cópia dos dados nesta aba do navegador: ao trocar de tela, a próxima aparece na hora com
  // ela, enquanto a versão da nuvem é buscada em segundo plano. Fica só nesta aba (some ao
  // fechar a aba) e é apagada ao sair da conta (supabase.js).
  const CHAVE_COPIA = 'gscash:copia';
  let mudancas = 0;   // conta as gravações, para a atualização em segundo plano não desfazer uma

  function guardarCopia() {
    try {
      sessionStorage.setItem(CHAVE_COPIA, JSON.stringify({ usuario: usuarioId, db: cache }));
    } catch (e) { /* cheio ou bloqueado: segue sem cópia */ }
  }

  function lerCopia() {
    try {
      const c = JSON.parse(sessionStorage.getItem(CHAVE_COPIA));
      return c && c.usuario === usuarioId && c.db ? c.db : null;
    } catch (e) {
      return null;
    }
  }

  // confere com a nuvem depois de mostrar a cópia; se mudou algo (ex.: lançado em outro aparelho), redesenha
  function atualizarEmSegundoPlano() {
    const versao = mudancas;
    gravando.then(baixar).then(({ db }) => {
      if (versao !== mudancas) return;   // a pessoa gravou algo enquanto isso: o que vale é o que ela fez
      if (JSON.stringify(db) === JSON.stringify(cache)) return;
      aplicar(db);
      if (GS.notificarMudanca) GS.notificarMudanca();
    }).catch(e => console.warn('Não foi possível conferir os dados com a nuvem', e));
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
    guardarCopia();
  }

  let iniciando = null;

  // carrega os dados uma vez por página (e importa os dados do aparelho numa conta nova)
  function iniciar() {
    if (!iniciando) {
      iniciando = (async () => {
        const sessao = await GS.auth.sessao();
        if (!sessao) throw new Error('Faça login para continuar.');
        usuarioId = sessao.user.id;

        const copiaDaAba = lerCopia();
        if (copiaDaAba) {
          aplicar(copiaDaAba);
          atualizarEmSegundoPlano();
          return;
        }

        const { vazio, db } = await baixar();
        if (!vazio) return aplicar(db);

        // vazio pode ser o banco escondendo os dados: a verificação em duas etapas foi ligada em
        // outro aparelho e esta sessão ainda não passou pelo código. Não é conta nova: pede o código.
        if (await GS.auth.duasEtapas.precisaCodigo({ servidor: true })) {
          location.replace('entrar.html');
          return new Promise(() => {});
        }

        // conta nova: oferece trazer os dados que estavam neste aparelho. Só uma vez por aparelho:
        // com várias contas, uma segunda conta nova não pode receber de novo os dados da primeira.
        const local = await legadoJaOferecido() ? null : await lerDadosLocais();
        if (local && (local.transacoes.length || local.carteiras.length)) await marcarLegadoOferecido();
        const quer = local && (local.transacoes.length || local.carteiras.length) && confirm(
          `Encontramos neste aparelho ${local.transacoes.length} lançamentos e ${local.carteiras.length} carteiras do GSCASH.\n\n` +
          'OK = importar para a sua conta\nCancelar = começar do zero');
        cache = quer ? sanear(local) : dadosIniciais();
        cache.recorrencias = cache.recorrencias || [];
        cache.investimentos = cache.investimentos || [];
        gravado = fotografia(paraLinhas({ categorias: [], carteiras: [], transacoes: [], recorrencias: [], investimentos: [] }));
        await sincronizar();
      })();
      iniciando.catch(() => { iniciando = null; });
      // não segura a abertura: as séries "Até eu cancelar" são completadas logo depois
      iniciando.then(() => completarSeriesAoAbrir()).catch(e => console.warn('Não foi possível completar as séries', e));
    }
    return iniciando;
  }

  function carregar() {
    return cache;
  }

  // grava em fila; as respostas da API esperam a gravação terminar
  function salvar() {
    mudancas++;
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

  /* ---------- Séries (lançamentos que se repetem) ---------- */

  // quantas vezes cada frequência aceita (5 anos de semanas, 10 de meses, 30 de anos)
  const LIMITE_VEZES = { semanal: 260, mensal: 120, anual: 30 };
  // "Até eu cancelar": lançamentos ficam gravados até esta distância à frente
  const HORIZONTE_MESES = 12;
  const FREQUENCIAS = Object.keys(LIMITE_VEZES);

  const horizonte = () => {
    const h = hoje();
    return GS.isoData(new Date(h.getFullYear(), h.getMonth() + HORIZONTE_MESES, h.getDate()));
  };

  // { frequencia, vezes, semFim } vindo do formulário -> valores aceitos (ou null = não repete)
  function limparRepeticao(rec) {
    if (!rec) return null;
    const frequencia = FREQUENCIAS.includes(rec.frequencia) ? rec.frequencia : 'mensal';
    const semFim = !!rec.semFim;
    const vezes = semFim ? null : Math.max(2, Math.min(LIMITE_VEZES[frequencia], Math.floor(rec.vezes) || 2));
    return { frequencia, semFim, vezes };
  }

  const serieDe = (db, recorrenciaId) => db.transacoes.filter(x => x.recorrenciaId === recorrenciaId);
  const regraDe = (db, recorrenciaId) => (db.recorrencias || []).find(r => r.id === recorrenciaId);
  // x vem depois de t na mesma série?
  const depoisDe = (t, x) => (x.parcela != null && t.parcela != null ? x.parcela > t.parcela : x.data > t.data);

  // o lançamento n da série, copiando os campos do modelo (o último que existe)
  function linhaDaSerie(regra, modelo, n, total) {
    const { id, data, parcela, criadoEm, ...campos } = modelo;
    return {
      ...campos,
      id: `${regra.id}-${n}`,   // id fixo: dois aparelhos completando a mesma série não duplicam
      data: somarPeriodo(regra.inicio, regra.frequencia, n - 1),
      recorrenciaId: regra.id,
      parcela: n,
      totalParcelas: total,
      criadoEm: Date.now() + n,
    };
  }

  // começa uma série a partir de um lançamento já pronto (o 1º) e cria os seguintes
  function comecarSerie(db, primeiro, rep) {
    const regra = { id: novoId('r'), frequencia: rep.frequencia, inicio: primeiro.data, semFim: rep.semFim, geradaAte: 1 };
    db.recorrencias.push(regra);
    Object.assign(primeiro, { recorrenciaId: regra.id, parcela: 1, totalParcelas: rep.semFim ? null : rep.vezes, parcelas: 1 });
    const criadas = [];
    if (rep.semFim) criadas.push(...completarSerie(db, regra));
    else {
      for (let n = 2; n <= rep.vezes; n++) {
        const t = linhaDaSerie(regra, primeiro, n, rep.vezes);
        db.transacoes.push(t);
        criadas.push(t);
      }
      regra.geradaAte = rep.vezes;
    }
    return criadas;
  }

  // "Até eu cancelar": cria os lançamentos que faltam até o horizonte; devolve os criados
  function completarSerie(db, regra) {
    if (!regra.semFim) return [];
    const serie = serieDe(db, regra.id);
    if (!serie.length) return [];
    const modelo = serie.reduce((a, b) => ((b.parcela || 0) > (a.parcela || 0) ? b : a));
    const limite = horizonte();
    const ids = new Set(db.transacoes.map(x => x.id));
    const criadas = [];
    for (let n = regra.geradaAte + 1; somarPeriodo(regra.inicio, regra.frequencia, n - 1) <= limite; n++) {
      regra.geradaAte = n;
      const t = linhaDaSerie(regra, modelo, n, null);
      if (ids.has(t.id)) continue;   // outro aparelho já criou este
      db.transacoes.push(t);
      criadas.push(t);
    }
    return criadas;
  }

  // regra sem nenhum lançamento: não tem mais o que repetir
  function limparRegras(db) {
    const usadas = new Set(db.transacoes.map(t => t.recorrenciaId).filter(Boolean));
    db.recorrencias = (db.recorrencias || []).filter(r => usadas.has(r.id));
  }

  // grava um lançamento (ou uma série, se recorrente) e devolve os criados
  function gravarSerie(db, base, rec) {
    const primeiro = { ...base, id: novoId('t'), criadoEm: Date.now() };
    db.transacoes.push(primeiro);
    const rep = limparRepeticao(rec);
    return rep ? [primeiro, ...comecarSerie(db, primeiro, rep)] : [primeiro];
  }

  // séries "Até eu cancelar" completadas ao abrir o app (licença vencida: não grava nada)
  async function completarSeriesAoAbrir() {
    await (GS.licenca && GS.licenca.pronta);
    if (GS.somenteLeitura || !cache) return;
    const criadas = (cache.recorrencias || []).flatMap(r => completarSerie(cache, r));
    if (!criadas.length) return;
    salvar();
    if (GS.notificarMudanca) GS.notificarMudanca();
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

  /* ---------- Investimentos ---------- */

  const TIPOS_INV = ['cdb', 'lci_lca', 'tesouro', 'poupanca', 'fundos', 'outro'];
  const INDEXADORES = ['cdi_pct', 'cdi_mais', 'prefixado', 'ipca_mais', 'selic', 'poupanca', 'sem_taxa'];

  // dados do formulário -> registro do investimento (com nome), ou o texto do erro
  function limparInvestimento(db, d) {
    const nome = String(d.nome || '').trim().slice(0, 60);
    if (!nome) return 'Dê um nome ao investimento.';
    const indexador = INDEXADORES.includes(d.indexador) ? d.indexador : 'sem_taxa';
    const semTaxa = ['selic', 'poupanca', 'sem_taxa'].includes(indexador);
    const taxa = semTaxa ? 0 : Math.round((Number(d.taxa) || 0) * 10000) / 10000;
    if (!semTaxa && !(taxa > 0 && taxa <= 1000)) return 'Informe quanto o investimento rende.';
    const liquidez = d.liquidez === 'vencimento' ? 'vencimento' : 'diaria';
    const vencimento = liquidez === 'vencimento' ? d.vencimento : null;
    if (liquidez === 'vencimento' && !/^\d{4}-\d{2}-\d{2}$/.test(vencimento || '')) return 'Informe quando o dinheiro fica disponível.';
    const destino = d.destinoId && db.carteiras.find(c => c.id === d.destinoId && c.tipo !== 'investimento');
    if (liquidez === 'vencimento' && !destino) return 'Escolha a conta para onde o dinheiro volta.';
    return {
      nome, tipo: TIPOS_INV.includes(d.tipo) ? d.tipo : 'outro', indexador, taxa, liquidez, vencimento,
      destinoId: destino ? destino.id : null,
    };
  }

  // as "Previstas" do vencimento (ids fixos por investimento)
  function removerPrevistas(db, id) {
    db.transacoes = db.transacoes.filter(t => t.id !== `${id}-vr` && t.id !== `${id}-vt`);
  }

  // ganho -> receita "Rendimentos" na carteira do investimento; perda -> gasto
  function lancamentoDoGanho(db, carteira, ganho, data) {
    const tipo = ganho > 0 ? 'receita' : 'despesa';
    const nomeCat = ganho > 0 ? 'Rendimentos' : 'Investimentos';
    let cat = db.categorias.find(c => c.tipo === tipo && mesmoNome(c.nome, nomeCat));
    if (!cat) {
      cat = { id: novoId('c'), nome: nomeCat, tipo, icone: 'trending', cor: ganho > 0 ? '#3F7D5C' : '#8C7354', orcamento: null, subcategorias: [] };
      db.categorias.push(cat);
    }
    return {
      tipo, titulo: `${ganho > 0 ? 'Rendimento' : 'Perda'} · ${carteira.nome}`, descricao: '', valor: Math.abs(ganho), data,
      categoriaId: cat.id, subcategoriaId: null, carteiraId: carteira.id, forma: 'debito', parcelas: 1,
      id: novoId('t'), criadoEm: Date.now(),
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

    // importação (extrato, fatura, planilha): grava vários de uma vez, com o id que vier
    // (o id fixo é o que impede importar o mesmo lançamento duas vezes); ids já usados ficam de fora
    importarTransacoes(lista) {
      const db = carregar();
      const usados = new Set(db.transacoes.map(t => t.id));
      const criadas = [];
      for (const dados of lista) {
        const t = limparTransacao(dados);
        aplicarSubcategoria(db, t);
        if (!t.titulo || t.valor <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(t.data || '')) continue;
        if (validarCredito(db, t)) continue;
        const id = String(dados.id || novoId('t'));
        if (usados.has(id)) continue;
        usados.add(id);
        Object.assign(t, { id, criadoEm: Date.now() + criadas.length });
        db.transacoes.push(t);
        criadas.push(t);
      }
      if (!criadas.length) return falhar('Nenhum lançamento novo para importar.');
      salvar();
      return responder(criadas);
    },

    // escopo: 'esta' (padrão) ou 'proximas' (esta e as seguintes da série)
    // dados.recorrencia: ausente = a repetição fica como está; null = deixa de repetir;
    // { frequencia, vezes, semFim } = repete assim a partir deste lançamento. Mudar a repetição
    // vale sempre para esta e as próximas: as seguintes são refeitas, as anteriores ficam.
    atualizarTransacao(id, dados, escopo = 'esta') {
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

      if ('recorrencia' in dados) {
        const rep = limparRepeticao(dados.recorrencia);
        if (rep) novo.parcelas = 1;   // recorrente não é parcelado
        if (t.recorrenciaId) {
          // as seguintes saem (serão refeitas pela regra nova) e a série antiga para aqui
          db.transacoes = db.transacoes.filter(x => x.recorrenciaId !== t.recorrenciaId || !depoisDe(t, x));
          const antiga = regraDe(db, t.recorrenciaId);
          if (antiga) antiga.semFim = false;
        }
        Object.assign(t, novo);
        delete t.recorrenciaId; delete t.parcela; delete t.totalParcelas;
        if (rep) comecarSerie(db, t, rep);
      } else if (escopo === 'proximas' && t.recorrenciaId) {
        novo.parcelas = 1;
        const { data, ...campos } = novo;   // as seguintes mantêm cada uma a sua data
        serieDe(db, t.recorrenciaId).filter(x => depoisDe(t, x)).forEach(x => Object.assign(x, campos));
        Object.assign(t, novo);
      } else {
        if (t.recorrenciaId) novo.parcelas = 1;
        Object.assign(t, novo);
      }
      limparRegras(db);
      salvar();
      return responder(t);
    },

    // como a série de um lançamento se repete (para o formulário e para a exclusão)
    // { frequencia, semFim, numero, total, seguintes } ou null se não repete
    infoSerie(id) {
      const db = carregar();
      const t = db.transacoes.find(x => x.id === id);
      if (!t || !t.recorrenciaId) return responder(null);
      const serie = serieDe(db, t.recorrenciaId).sort((a, b) => (a.parcela || 0) - (b.parcela || 0) || a.data.localeCompare(b.data));
      const regra = regraDe(db, t.recorrenciaId);
      let frequencia = regra && regra.frequencia;
      if (!frequencia) {   // série antiga, sem regra: a distância entre duas datas diz a frequência
        const outra = serie.find(x => x.id !== t.id);
        const dias = outra ? Math.abs(Date.parse(outra.data) - Date.parse(t.data)) / 864e5 / Math.max(1, Math.abs((outra.parcela || 0) - (t.parcela || 0)) || 1) : 30;
        frequencia = dias < 15 ? 'semanal' : dias > 200 ? 'anual' : 'mensal';
      }
      return responder({
        frequencia,
        semFim: !!(regra && regra.semFim),
        numero: t.parcela || serie.indexOf(t) + 1,
        total: serie.length,
        seguintes: serie.filter(x => depoisDe(t, x)).length,
      });
    },

    excluirTransacao(id) {
      const db = carregar();
      lembrarExclusao('transacoes', db.transacoes.filter(x => x.id === id), { regras: copia(db.recorrencias) });
      db.transacoes = db.transacoes.filter(x => x.id !== id);
      limparRegras(db);
      salvar();
      return responder(true);
    },

    // lançamento de uma série: 'esta' | 'esta-e-proximas' | 'so-proximas' (fica esta, as seguintes saem).
    // Nos dois últimos a série para de se repetir. As que já passaram nunca são apagadas por aqui.
    // Devolve quantos saíram.
    excluirDaSerie(id, modo) {
      const db = carregar();
      const t = db.transacoes.find(x => x.id === id);
      if (!t) return falhar('Transação não encontrada.');
      const sai = x => x.id === t.id ? modo !== 'so-proximas'
        : modo !== 'esta' && x.recorrenciaId === t.recorrenciaId && depoisDe(t, x);
      const removidas = db.transacoes.filter(sai);
      lembrarExclusao('transacoes', removidas, { regras: copia(db.recorrencias) });
      db.transacoes = db.transacoes.filter(x => !sai(x));
      const regra = t.recorrenciaId && regraDe(db, t.recorrenciaId);
      if (regra && modo !== 'esta') regra.semFim = false;
      limparRegras(db);
      salvar();
      return responder(removidas.length);
    },

    // várias de uma vez (ex.: "esta e as próximas" de uma transação recorrente)
    excluirTransacoes(ids) {
      const db = carregar();
      const alvo = new Set(ids);
      lembrarExclusao('transacoes', db.transacoes.filter(x => alvo.has(x.id)), { regras: copia(db.recorrencias) });
      db.transacoes = db.transacoes.filter(x => !alvo.has(x.id));
      limparRegras(db);
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
      if (u.tipo === 'transacoes') {
        lista.push(...voltam);
        // a regra de cada série que voltou volta como estava (inclusive "Até eu cancelar")
        const series = new Set(voltam.map(x => x.recorrenciaId).filter(Boolean));
        (u.regras || []).filter(r => series.has(r.id)).forEach(r => {
          db.recorrencias = db.recorrencias.filter(x => x.id !== r.id).concat(r);
        });
      }
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
      Object.assign(t, novo, { titulo: t.titulo || novo.titulo });   // "Aplicação · CDB Inter" continua
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
      db.investimentos = (db.investimentos || []).filter(v => v.id !== id);
      db.investimentos.forEach(v => { if (v.destinoId === id) v.destinoId = null; });
      // carteiras que pagavam a fatura com esta ficam sem conta definida
      db.carteiras.forEach(c => { if (c.credito && c.credito.pagarComId === id) c.credito.pagarComId = null; });
      salvar();
      return responder(true);
    },

    /* Investimentos (js/investimentos.js, js/indices.js) */

    listarInvestimentos() {
      return responder(carregar().investimentos);
    },

    // dados = { nome, tipo, indexador, taxa, valor, data, origemId (null = já estava investido),
    //           liquidez, vencimento, destinoId }
    criarInvestimento(dados) {
      const db = carregar();
      const inv = limparInvestimento(db, dados);
      if (typeof inv === 'string') return falhar(inv);
      const valor = Math.round(Number(dados.valor) || 0);
      if (valor <= 0) return falhar('Informe o valor aplicado.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.data || '')) return falhar('Informe a data da aplicação.');
      if (inv.liquidez === 'vencimento' && inv.vencimento <= dados.data) return falhar('A data de resgate precisa ser depois da aplicação.');
      const origem = dados.origemId ? db.carteiras.find(c => c.id === dados.origemId && c.tipo !== 'investimento') : null;
      if (dados.origemId && !origem) return falhar('Escolha de qual conta o dinheiro saiu.');

      const carteira = {
        id: novoId('w'), nome: inv.nome, tipo: 'investimento', cor: '#3F7D5C',
        // já estava investido: o valor entra como saldo inicial e nenhuma conta muda
        saldoInicial: origem ? 0 : valor,
        oculta: true,   // fora do saldo também na versão antiga do app
        credito: null,
      };
      db.carteiras.push(carteira);
      delete inv.nome;
      inv.id = carteira.id;
      db.investimentos.push(inv);
      if (origem) {
        db.transacoes.push({
          ...limparTransferencia({ valor, data: dados.data, origemId: origem.id, destinoId: carteira.id }),
          titulo: `Aplicação · ${carteira.nome}`, id: novoId('t'), criadoEm: Date.now(),
        });
        // sem valor informado à mão, o rendimento conta a partir desta transferência
      } else {
        inv.valorAtual = valor;
        inv.valorAtualEm = dados.data;
      }
      salvar();
      return responder({ ...inv, nome: carteira.nome });
    },

    // muda como o investimento rende, quando resgata e o nome (o valor aplicado não muda aqui)
    atualizarInvestimento(id, dados) {
      const db = carregar();
      const carteira = db.carteiras.find(c => c.id === id && c.tipo === 'investimento');
      if (!carteira) return falhar('Investimento não encontrado.');
      const novo = limparInvestimento(db, dados);
      if (typeof novo === 'string') return falhar(novo);
      carteira.nome = novo.nome;
      delete novo.nome;
      let inv = db.investimentos.find(v => v.id === id);
      if (!inv) {   // carteira de investimento antiga: ganha o registro agora
        inv = { id, valorAtual: null, valorAtualEm: null, resgatadoEm: null };
        db.investimentos.push(inv);
      }
      Object.assign(inv, novo);
      if (inv.liquidez !== 'vencimento') removerPrevistas(db, id);
      salvar();
      return responder({ ...inv, nome: carteira.nome });
    },

    // "Atualizar valor": quanto o investimento vale hoje, segundo o banco (o cálculo segue a partir dele)
    informarValorAtual(id, valor, data) {
      const db = carregar();
      const carteira = db.carteiras.find(c => c.id === id && c.tipo === 'investimento');
      if (!carteira) return falhar('Investimento não encontrado.');
      const v = Math.round(Number(valor));
      if (!(v >= 0)) return falhar('Informe o valor de hoje.');
      let inv = db.investimentos.find(x => x.id === id);
      if (!inv) {
        inv = { id, tipo: 'outro', indexador: 'sem_taxa', taxa: 0, liquidez: 'diaria', vencimento: null, destinoId: null, resgatadoEm: null };
        db.investimentos.push(inv);
      }
      inv.valorAtual = v;
      inv.valorAtualEm = data || GS.isoData(hoje());
      salvar();
      return responder(inv);
    },

    // resgate: dados = { valor (o que entrou na conta), data, destinoId, total, estimado }
    // O ganho entra como receita "Rendimentos" (ou a perda como gasto) e o dinheiro volta por transferência.
    // Parcial (só liquidez diária): o ganho é proporcional ao que saiu.
    resgatarInvestimento(id, dados) {
      const db = carregar();
      const carteira = db.carteiras.find(c => c.id === id && c.tipo === 'investimento');
      if (!carteira) return falhar('Investimento não encontrado.');
      const destino = db.carteiras.find(c => c.id === dados.destinoId && c.tipo !== 'investimento');
      if (!destino) return falhar('Escolha a conta que recebe o dinheiro.');
      const valor = Math.round(Number(dados.valor) || 0);
      if (valor <= 0) return falhar('Informe quanto entrou na conta.');
      const data = dados.data || GS.isoData(hoje());
      removerPrevistas(db, id);
      const contabil = GS.calc.saldoCarteira(carteira, db.transacoes, data);
      const estimado = Math.round(Number(dados.estimado) || 0);
      const ganho = dados.total ? valor - contabil
        : estimado > 0 ? Math.round(valor * (estimado - contabil) / estimado) : 0;
      if (ganho) db.transacoes.push(lancamentoDoGanho(db, carteira, ganho, data));
      db.transacoes.push({
        ...limparTransferencia({ valor, data, origemId: carteira.id, destinoId: destino.id }),
        titulo: `Resgate · ${carteira.nome}`, id: novoId('t'), criadoEm: Date.now() + 1,
      });
      let inv = db.investimentos.find(v => v.id === id);
      if (!inv) {
        inv = { id, tipo: 'outro', indexador: 'sem_taxa', taxa: 0, liquidez: 'diaria', vencimento: null, destinoId: null, valorAtual: null, valorAtualEm: null, resgatadoEm: null };
        db.investimentos.push(inv);
      }
      if (dados.total) inv.resgatadoEm = data;
      else if (inv.valorAtual != null) {   // o valor informado à mão diminui o que saiu
        inv.valorAtual = Math.max(0, estimado - valor);
        inv.valorAtualEm = data;
      }
      salvar();
      return responder({ ganho });
    },

    // apaga o investimento e tudo o que foi lançado nele (aplicação, rendimentos, resgates)
    excluirInvestimento(id) {
      const db = carregar();
      if (!db.carteiras.some(c => c.id === id && c.tipo === 'investimento')) return falhar('Investimento não encontrado.');
      db.transacoes = db.transacoes.filter(t => t.carteiraId !== id && t.destinoId !== id);
      db.investimentos = db.investimentos.filter(v => v.id !== id);
      db.carteiras = db.carteiras.filter(c => c.id !== id);
      db.investimentos.forEach(v => { if (v.destinoId === id) v.destinoId = null; });
      salvar();
      return responder(true);
    },

    // extrato: aplicações e resgates vindos da importação.
    // novos: [{ chave, dados (como no formulário, sem valor) }] -> investimentos criados sem dinheiro
    // movimentos: [{ id, chave | investimentoId, mov: 'aplicacao'|'resgate', valor, data, titulo, contaId }]
    // Aplicação = transferência da conta para o investimento; resgate = do investimento para a conta.
    // Resgate maior do que havia no investimento: a diferença entra antes como receita "Rendimentos".
    // Devolve { transacoes: ids criados, investimentos: ids criados } (para o "Desfazer").
    importarMovimentosInvestimento(novos, movimentos) {
      const db = carregar();
      const criadosInv = new Map();
      for (const n of novos) {
        const inv = limparInvestimento(db, n.dados);
        if (typeof inv === 'string') return falhar(inv);
        const carteira = { id: novoId('w'), nome: inv.nome, tipo: 'investimento', cor: '#3F7D5C', saldoInicial: 0, oculta: true, credito: null };
        db.carteiras.push(carteira);
        delete inv.nome;
        db.investimentos.push({ ...inv, id: carteira.id, valorAtual: null, valorAtualEm: null, resgatadoEm: null });
        criadosInv.set(n.chave, carteira.id);
      }
      const usados = new Set(db.transacoes.map(t => t.id));
      const criadas = [];
      let movimentosCriados = 0;
      const ordem = movimentos.slice().sort((a, b) => a.data.localeCompare(b.data) || (a.mov === 'aplicacao' ? -1 : 1));
      for (const m of ordem) {
        const invId = m.investimentoId || criadosInv.get(m.chave);
        const carteira = db.carteiras.find(c => c.id === invId && c.tipo === 'investimento');
        const conta = db.carteiras.find(c => c.id === m.contaId && c.tipo !== 'investimento');
        const valor = Math.round(Number(m.valor) || 0);
        if (!carteira || !conta || valor <= 0 || usados.has(m.id)) continue;
        usados.add(m.id);
        if (m.mov === 'resgate') {
          const tinha = GS.calc.saldoCarteira(carteira, db.transacoes, m.data);
          if (valor > tinha) {
            const ganho = { ...lancamentoDoGanho(db, carteira, valor - Math.max(0, tinha), m.data), id: `${m.id}r` };
            db.transacoes.push(ganho);
            criadas.push(ganho.id);
          }
        }
        const de = m.mov === 'resgate' ? carteira.id : conta.id;
        const para = m.mov === 'resgate' ? conta.id : carteira.id;
        db.transacoes.push({
          ...limparTransferencia({ valor, data: m.data, origemId: de, destinoId: para }),
          titulo: String(m.titulo || (m.mov === 'resgate' ? 'Resgate' : 'Aplicação')).slice(0, 80),
          id: m.id, criadoEm: Date.now() + criadas.length,
        });
        criadas.push(m.id);
        movimentosCriados++;
      }
      if (!criadas.length && !criadosInv.size) return falhar('Nenhum movimento novo de investimento.');
      salvar();
      return responder({ transacoes: criadas, investimentos: [...criadosInv.values()], movimentos: movimentosCriados });
    },

    // mantém o dinheiro do vencimento como "Prevista" na data: o ganho estimado (receita "Rendimentos")
    // e a volta para a conta (transferência). Só grava se mudou mais de R$ 1. Devolve true se mudou.
    preverVencimento(id, estimadoNoVencimento) {
      const db = carregar();
      const inv = db.investimentos.find(v => v.id === id);
      const carteira = db.carteiras.find(c => c.id === id);
      const destino = inv && db.carteiras.find(c => c.id === inv.destinoId);
      if (!inv || !carteira || inv.resgatadoEm || inv.liquidez !== 'vencimento' || !inv.vencimento || !destino) {
        const tinha = db.transacoes.some(t => t.id === `${id}-vr` || t.id === `${id}-vt`);
        if (tinha) { removerPrevistas(db, id); salvar(); }
        return responder(tinha);
      }
      const estimado = Math.round(Number(estimadoNoVencimento) || 0);
      const outras = db.transacoes.filter(t => t.id !== `${id}-vr` && t.id !== `${id}-vt`);
      const contabil = GS.calc.saldoCarteira(carteira, outras, inv.vencimento);
      const ganho = estimado - contabil;
      const atualT = db.transacoes.find(t => t.id === `${id}-vt`);
      const atualR = db.transacoes.find(t => t.id === `${id}-vr`);
      const perto = (a, b) => Math.abs((a || 0) - (b || 0)) < 100;
      if (atualT && perto(atualT.valor, estimado) && perto(atualR ? atualR.valor : 0, Math.max(0, ganho))
        && atualT.data === inv.vencimento && atualT.destinoId === destino.id) return responder(false);
      removerPrevistas(db, id);
      if (ganho > 0) db.transacoes.push({ ...lancamentoDoGanho(db, carteira, ganho, inv.vencimento), id: `${id}-vr` });
      if (estimado > 0) {
        db.transacoes.push({
          ...limparTransferencia({ valor: estimado, data: inv.vencimento, origemId: carteira.id, destinoId: destino.id }),
          titulo: `Vencimento · ${carteira.nome}`, descricao: 'Valor estimado, antes de impostos', id: `${id}-vt`, criadoEm: Date.now(),
        });
      }
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
      cache = { ...dadosDemo(), recorrencias: [], investimentos: [], preferencias: cache.preferencias || {} };
      salvar();
      return responder(true);
    },
  };

  // licença vencida (js/licenca.js): o app fica só leitura e só estas funções seguem liberadas
  GS.somenteLeitura = false;
  GS.TEXTO_SO_LEITURA = 'Licença vencida: o GSCASH está em modo só leitura.';
  const LIBERADAS_SO_LEITURA = new Set(['infoSerie', 'listarTransacoes','listarCategorias', 'listarCarteiras', 'obterPreferencias', 'salvarPreferencia']);

  // toda chamada espera os dados terem sido carregados do banco
  Object.keys(GS.api).forEach(nome => {
    const funcao = GS.api[nome];
    GS.api[nome] = (...args) => iniciar().then(() => {
      if (GS.somenteLeitura && !LIBERADAS_SO_LEITURA.has(nome)) throw new Error(GS.TEXTO_SO_LEITURA);
      return funcao(...args);
    });
  });
})();
