import { bearerToken, id, json, normalizeText, parseJson, slugify, verifyToken } from './lib.mjs';

async function isAdmin(request, env) {
  return Boolean(await verifyToken(bearerToken(request), env.AUTH_SECRET));
}

async function requireAdmin(request, env) {
  return (await isAdmin(request, env)) ? null : json({ error: 'unauthorized' }, { status: 401 });
}

function clean(value, max = 500) {
  return normalizeText(value, max);
}

function parseMetadata(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function extractText(result) {
  if (typeof result === 'string') return result;
  if (typeof result?.response === 'string') return result.response;
  if (typeof result?.result?.response === 'string') return result.result.response;
  return JSON.stringify(result || {});
}

function extractJson(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
    }
  }
  return null;
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function listMedia(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const url = new URL(request.url);
  const contentId = clean(url.searchParams.get('contentId'), 100);
  const statement = contentId
    ? env.DB.prepare('SELECT * FROM media_assets WHERE content_item_id = ? ORDER BY created_at DESC LIMIT 100').bind(contentId)
    : env.DB.prepare('SELECT * FROM media_assets ORDER BY created_at DESC LIMIT 100');
  const result = await statement.all();
  return json({ assets: result.results.map((row) => ({ ...row, metadata: parseMetadata(row.metadata_json) })) });
}

async function mediaFile(request, env, assetId) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  if (!env.MEDIA?.get) return json({ error: 'r2_binding_not_configured' }, { status: 503 });
  const asset = await env.DB.prepare('SELECT storage_key FROM media_assets WHERE id = ?').bind(assetId).first();
  if (!asset?.storage_key) return json({ error: 'not_found' }, { status: 404 });
  const object = await env.MEDIA.get(asset.storage_key);
  if (!object) return json({ error: 'object_not_found' }, { status: 404 });
  const headers = new Headers();
  if (object.httpMetadata?.contentType) headers.set('Content-Type', object.httpMetadata.contentType);
  else headers.set('Content-Type', 'application/octet-stream');
  headers.set('Cache-Control', 'private, max-age=300');
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  return new Response(object.body, { headers });
}

async function generateImage(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  if (!env.AI?.run) return json({ error: 'ai_binding_not_configured' }, { status: 503 });
  if (!env.MEDIA?.put) return json({ error: 'r2_binding_not_configured' }, { status: 503 });

  const body = await parseJson(request, 30_000);
  const contentId = clean(body.contentId, 100);
  let content = null;
  if (contentId) content = await env.DB.prepare('SELECT id, title, hook, body, pillar, channel FROM content_items WHERE id = ?').bind(contentId).first();

  const requestedPrompt = clean(body.prompt, 1500);
  const context = content ? `${content.title}. ${content.hook || ''}. Pilar ${content.pillar || ''}. Canal ${content.channel || ''}.` : '';
  const prompt = clean(`${requestedPrompt || context} Editorial corporate visual for a senior technology, product and project management professional. Sophisticated navy and graphite palette with subtle warm gold accent. Clean premium composition, strong hierarchy, realistic editorial lighting, no visible text, no logos, no watermarks, no celebrity or real-person likeness.`, 2048);
  if (prompt.length < 20) return json({ error: 'prompt_required' }, { status: 422 });

  const runId = id('agent');
  const assetId = id('media');
  const started = Date.now();
  await env.DB.prepare(`INSERT INTO agent_runs (id, agent_key, trigger_type, input_ref, status, started_at, metadata_json) VALUES (?, 'art_director', 'manual', ?, 'running', CURRENT_TIMESTAMP, ?)`)
    .bind(runId, contentId || prompt.slice(0, 160), JSON.stringify({ contentId: contentId || null, model: '@cf/black-forest-labs/flux-1-schnell' })).run();

  try {
    const generated = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
      prompt,
      steps: 4,
      seed: Math.floor(Math.random() * 2147483647)
    });
    if (!generated?.image || typeof generated.image !== 'string') throw new Error('AI_IMAGE_MISSING');
    const bytes = base64ToBytes(generated.image);
    const day = new Date().toISOString().slice(0, 10);
    const storageKey = `growth/${day}/${assetId}.jpg`;
    await env.MEDIA.put(storageKey, bytes, {
      httpMetadata: { contentType: 'image/jpeg', cacheControl: 'private, max-age=300' },
      customMetadata: { contentId: contentId || '', generatedBy: 'art_director' }
    });

    const title = clean(body.title || content?.title || 'Imagem editorial gerada', 180);
    const altText = clean(body.altText || `Imagem editorial para ${title}`, 300);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO media_assets (id, content_item_id, asset_type, title, storage_key, public_url, alt_text, status, metadata_json) VALUES (?, ?, 'image', ?, ?, ?, ?, 'review', ?)`)
        .bind(assetId, contentId || null, title, storageKey, `/api/growth/media/${assetId}/file`, altText, JSON.stringify({ aiGenerated: true, prompt, model: '@cf/black-forest-labs/flux-1-schnell', bytes: bytes.byteLength })),
      env.DB.prepare(`UPDATE agent_runs SET output_ref = ?, status = 'completed', duration_ms = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(assetId, Date.now() - started, runId)
    ]);
    return json({ asset: { id: assetId, contentId: contentId || null, title, status: 'review', url: `/api/growth/media/${assetId}/file` }, runId }, { status: 201 });
  } catch (error) {
    await env.DB.prepare(`UPDATE agent_runs SET status = 'failed', duration_ms = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(Date.now() - started, clean(error?.message || 'IMAGE_GENERATION_ERROR', 500), runId).run();
    return json({ error: 'image_generation_failed', runId }, { status: 502 });
  }
}

async function updateMedia(request, env, assetId) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 8_000);
  const current = await env.DB.prepare('SELECT id, status FROM media_assets WHERE id = ?').bind(assetId).first();
  if (!current) return json({ error: 'not_found' }, { status: 404 });
  const allowed = new Set(['review', 'approved', 'rejected', 'archived']);
  const status = allowed.has(body.status) ? body.status : current.status;
  await env.DB.prepare('UPDATE media_assets SET status = ? WHERE id = ?').bind(status, assetId).run();
  return json({ id: assetId, status });
}

function normalizeVariant(value, fallbackTitle) {
  return {
    title: clean(value?.title || fallbackTitle, 180),
    hook: clean(value?.hook, 600),
    body: String(value?.body || '').trim().slice(0, 50_000),
    cta: clean(value?.cta, 600)
  };
}

async function repurposeContent(request, env, contentId) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  if (!env.AI?.run) return json({ error: 'ai_binding_not_configured' }, { status: 503 });
  const source = await env.DB.prepare('SELECT * FROM content_items WHERE id = ?').bind(contentId).first();
  if (!source) return json({ error: 'not_found' }, { status: 404 });
  if (!String(source.body || '').trim()) return json({ error: 'source_content_empty' }, { status: 422 });

  const runId = id('agent');
  const started = Date.now();
  await env.DB.prepare(`INSERT INTO agent_runs (id, agent_key, trigger_type, input_ref, status, started_at, metadata_json) VALUES (?, 'social_repurposer', 'manual', ?, 'running', CURRENT_TIMESTAMP, ?)`)
    .bind(runId, contentId, JSON.stringify({ sourceChannel: source.channel, pillar: source.pillar })).run();

  try {
    const prompt = `Você é o Social Repurposer do perfil profissional de Victor Hugo Teixeira Simon.\nTransforme o conteúdo-base em versões específicas de canal sem inventar fatos, métricas, clientes ou resultados.\nPilar: ${source.pillar || 'Produto, Projetos e Tecnologia'}\nTítulo original: ${source.title}\nConteúdo-base:\n${String(source.body).slice(0, 12000)}\n\nRetorne SOMENTE JSON válido com as chaves linkedin, instagram, newsletter e imagePrompt.\nlinkedin: objeto com title, hook, body, cta. Tom executivo, natural, 1200-2200 caracteres.\ninstagram: objeto com title, hook, body, cta. Estruture o body como 6 a 8 slides numerados de carrossel, claros e curtos.\nnewsletter: objeto com title, hook, body, cta. Texto de 500-900 palavras.\nimagePrompt: string em inglês para uma imagem editorial conceitual, sem texto, logos ou pessoas reais.\nPreserve a ideia central, adapte a linguagem ao canal e mantenha revisão humana obrigatória.`;
    const aiResult = await env.AI.run('@cf/zai-org/glm-4.7-flash', { prompt, max_tokens: 4000 });
    const result = extractJson(extractText(aiResult));
    if (!result?.linkedin?.body || !result?.instagram?.body || !result?.newsletter?.body) throw new Error('AI_INVALID_REPURPOSE_JSON');

    const linkedin = normalizeVariant(result.linkedin, source.title);
    const instagram = normalizeVariant(result.instagram, source.title);
    const newsletter = normalizeVariant(result.newsletter, source.title);
    const variants = [
      { id: id('content'), channel: 'linkedin', type: 'post', data: linkedin },
      { id: id('content'), channel: 'instagram', type: 'carousel', data: instagram },
      { id: id('content'), channel: 'newsletter', type: 'newsletter', data: newsletter }
    ];
    const imagePrompt = clean(result.imagePrompt, 1500);

    const statements = variants.map((variant) => env.DB.prepare(`
      INSERT INTO content_items (id, parent_id, content_type, channel, language, title, body, hook, cta, pillar, status, slug, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
    `).bind(
      variant.id, contentId, variant.type, variant.channel, source.language === 'en' ? 'en' : 'pt',
      variant.data.title, variant.data.body, variant.data.hook, variant.data.cta, source.pillar,
      `${slugify(variant.data.title)}-${variant.channel}`,
      JSON.stringify({ aiGenerated: true, repurposedFrom: contentId, imagePrompt })
    ));
    statements.push(env.DB.prepare(`UPDATE agent_runs SET output_ref = ?, status = 'completed', duration_ms = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(variants.map((item) => item.id).join(','), Date.now() - started, runId));
    await env.DB.batch(statements);
    return json({ runId, sourceId: contentId, variants: variants.map(({ id: variantId, channel }) => ({ id: variantId, channel, status: 'draft' })), imagePrompt }, { status: 201 });
  } catch (error) {
    await env.DB.prepare(`UPDATE agent_runs SET status = 'failed', duration_ms = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(Date.now() - started, clean(error?.message || 'REPURPOSE_ERROR', 500), runId).run();
    return json({ error: 'repurpose_failed', runId }, { status: 502 });
  }
}

export async function handleGrowthAutomationRoute(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (!path.startsWith('/api/growth')) return null;

  if (request.method === 'GET' && path === '/api/growth/media') return listMedia(request, env);
  if (request.method === 'POST' && path === '/api/growth/media/generate') return generateImage(request, env);

  const fileMatch = path.match(/^\/api\/growth\/media\/([a-zA-Z0-9_-]+)\/file$/);
  if (request.method === 'GET' && fileMatch) return mediaFile(request, env, fileMatch[1]);
  const mediaMatch = path.match(/^\/api\/growth\/media\/([a-zA-Z0-9_-]+)$/);
  if (request.method === 'PATCH' && mediaMatch) return updateMedia(request, env, mediaMatch[1]);
  const repurposeMatch = path.match(/^\/api\/growth\/content\/([a-zA-Z0-9_-]+)\/repurpose$/);
  if (request.method === 'POST' && repurposeMatch) return repurposeContent(request, env, repurposeMatch[1]);
  return null;
}
