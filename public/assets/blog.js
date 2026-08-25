const API_BASE = document.querySelector('meta[name="api-base"]')?.content?.replace(/\/+$/, '') || '';
let language = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'pt';
let activeCategory = 'all';

const fallbackPosts = [
  ['PMO', 'PMO que decide: como sair do painel bonito para a governança real', 'Decision-making PMO: moving from pretty dashboards to real governance'],
  ['PMO', 'Cadência executiva: o ritmo que protege a entrega', 'Executive cadence: the rhythm that protects delivery'],
  ['Projetos', 'Riscos de projeto: registre cedo, trate antes', 'Project risks: register early, act sooner'],
  ['Projetos', 'Roadmap não é cronograma: como usar cada ferramenta', 'A roadmap is not a schedule: how to use each tool'],
  ['Produto', 'Backlog orientado a valor, não a volume', 'A backlog driven by value, not volume'],
  ['Produto', 'Discovery com prazo: aprender sem paralisar', 'Time-boxed discovery: learn without freezing'],
  ['Produto', 'Métricas de produto para decisões executivas', 'Product metrics for executive decisions'],
  ['Dados', 'Painéis executivos: menos indicadores, mais decisão', 'Executive dashboards: fewer metrics, better decisions'],
  ['Dados', 'Inteligência de mercado como sistema de sinais', 'Market intelligence as a signal system'],
  ['Dados', 'Qualidade de dados começa na definição do indicador', 'Data quality starts with metric definition'],
  ['Tecnologia', 'Integrações: onde o projeto realmente fica complexo', 'Integrations: where projects truly get complex'],
  ['Tecnologia', 'Stage e produção: separação simples, risco menor', 'Staging and production: simple separation, lower risk'],
  ['Tecnologia', 'Deploy automático é governança, não luxo', 'Automated deployment is governance, not a luxury'],
  ['IA', 'IA aplicada: comece pelo problema, não pelo modelo', 'Applied AI: start with the problem, not the model'],
  ['IA', 'Agentes de suporte com humano no ponto certo', 'Support agents with humans at the right point'],
  ['Liderança', 'A reunião que não decide custa duas vezes', 'A meeting that does not decide costs twice'],
  ['Liderança', 'Transparência sem ruído em projetos críticos', 'Clarity without noise in critical projects']
].map(([category, pt, en], index) => ({
  id: `fallback-${index + 1}`,
  category,
  title: language === 'en' ? en : pt,
  excerpt: language === 'en'
    ? 'A practical perspective connecting governance, delivery and business outcomes.'
    : 'Uma perspectiva prática conectando governança, entrega e resultado de negócio.',
  published_at: new Date(Date.UTC(2026, 7, 25 - index)).toISOString()
}));

let posts = fallbackPosts;

function applyLanguage() {
  document.documentElement.lang = language === 'en' ? 'en' : 'pt-BR';
  document.querySelectorAll('[data-pt][data-en]').forEach((element) => { element.textContent = element.dataset[language]; });
  const next = new URL(location.href); next.searchParams.set('lang', language); history.replaceState({}, '', next);
  render();
}

document.querySelector('#langToggle').addEventListener('click', () => {
  language = language === 'pt' ? 'en' : 'pt';
  posts = fallbackPosts.map((post, index) => ({ ...post, title: language === 'en' ? fallbackPostsSource[index][2] : fallbackPostsSource[index][1] }));
  loadPosts();
  applyLanguage();
});

const fallbackPostsSource = [
  ['PMO', 'PMO que decide: como sair do painel bonito para a governança real', 'Decision-making PMO: moving from pretty dashboards to real governance'],
  ['PMO', 'Cadência executiva: o ritmo que protege a entrega', 'Executive cadence: the rhythm that protects delivery'],
  ['Projetos', 'Riscos de projeto: registre cedo, trate antes', 'Project risks: register early, act sooner'],
  ['Projetos', 'Roadmap não é cronograma: como usar cada ferramenta', 'A roadmap is not a schedule: how to use each tool'],
  ['Produto', 'Backlog orientado a valor, não a volume', 'A backlog driven by value, not volume'],
  ['Produto', 'Discovery com prazo: aprender sem paralisar', 'Time-boxed discovery: learn without freezing'],
  ['Produto', 'Métricas de produto para decisões executivas', 'Product metrics for executive decisions'],
  ['Dados', 'Painéis executivos: menos indicadores, mais decisão', 'Executive dashboards: fewer metrics, better decisions'],
  ['Dados', 'Inteligência de mercado como sistema de sinais', 'Market intelligence as a signal system'],
  ['Dados', 'Qualidade de dados começa na definição do indicador', 'Data quality starts with metric definition'],
  ['Tecnologia', 'Integrações: onde o projeto realmente fica complexo', 'Integrations: where projects truly get complex'],
  ['Tecnologia', 'Stage e produção: separação simples, risco menor', 'Staging and production: simple separation, lower risk'],
  ['Tecnologia', 'Deploy automático é governança, não luxo', 'Automated deployment is governance, not a luxury'],
  ['IA', 'IA aplicada: comece pelo problema, não pelo modelo', 'Applied AI: start with the problem, not the model'],
  ['IA', 'Agentes de suporte com humano no ponto certo', 'Support agents with humans at the right point'],
  ['Liderança', 'A reunião que não decide custa duas vezes', 'A meeting that does not decide costs twice'],
  ['Liderança', 'Transparência sem ruído em projetos críticos', 'Clarity without noise in critical projects']
];

function render() {
  const categories = ['all', ...new Set(posts.map((post) => post.category).filter(Boolean))];
  document.querySelector('#filters').innerHTML = categories.map((category) => `<button type="button" class="filter ${category === activeCategory ? 'active' : ''}" data-category="${category}">${category === 'all' ? (language === 'en' ? 'All' : 'Todos') : category}</button>`).join('');
  document.querySelectorAll('[data-category]').forEach((button) => button.addEventListener('click', () => { activeCategory = button.dataset.category; render(); }));
  const visible = activeCategory === 'all' ? posts : posts.filter((post) => post.category === activeCategory);
  document.querySelector('#postsGrid').innerHTML = visible.map((post) => `<article class="card post-card"><div class="card-index">${escapeHtml(post.category || 'Insight')}</div><h3>${escapeHtml(post.title)}</h3><p class="muted">${escapeHtml(post.excerpt || '')}</p><div class="post-meta">${new Date(post.published_at || Date.now()).toLocaleDateString(language === 'en' ? 'en-US' : 'pt-BR')}</div></article>`).join('');
  document.querySelector('#postsStatus').textContent = visible.length ? '' : (language === 'en' ? 'No posts found.' : 'Nenhum conteúdo encontrado.');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

async function loadPosts() {
  if (!API_BASE || API_BASE.includes('example.invalid')) { render(); return; }
  try {
    const response = await fetch(`${API_BASE}/api/posts?lang=${language}`);
    const data = await response.json();
    if (response.ok && data.posts?.length) posts = data.posts;
  } catch { /* Mantém o conteúdo estático indexável. */ }
  render();
}

applyLanguage();
loadPosts();
