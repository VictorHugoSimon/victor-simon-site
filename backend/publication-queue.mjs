import { bearerToken, createToken, id, json, normalizeText, parseJson, verifyToken } from './lib.mjs';
import { handleSocialRoute } from './social.mjs';

const CHANNELS = new Set(['blog', 'linkedin', 'instagram']);
const ACTIVE = new Set(['queued', 'retry', 'processing']);

function clean(value, max = 500) { return normalizeText(value, max); }
function asJson(value, fallback = {}) { try { return JSON.parse(value || ''); } catch { return fallback; } }

async function isAdmin(request, env) {
  return Boolean(await verifyToken(bearerToken(request), env.AUTH_SECRET));
}
async function requireAdmin(request, env) {
  return (await isAdmin(request, env)) ? null : json({ error: 'unauthorized' }, { status: 401 });
}
function isRobot(request, env) {
  const key = request.headers.get('X-Robot-Key') || bearerToken(request);
  return Boolean(env.ROBOT_KEY && key === env.ROBOT_KEY);
}

async function enqueueScheduledContent(env) {
  const due = await env.DB.prepare(`
    SELECT c.id, c.channel, c.scheduled_at
    FROM content_items c
    WHERE c.status = 'scheduled'
      AND c.approved_at IS NOT NULL
      AND c.channel IN ('blog','linkedin','instagram')
      AND c.scheduled_at IS NOT NULL
      AND c.scheduled_at <= CURRENT_TIMESTAMP
      AND NOT EXISTS (
        SELECT 1 FROM publication_jobs j
        WHERE j.content_item_id = c.id
          AND j.channel = c.channel
          AND j.job_type = 'publish'
          AND j.status IN ('queued','retry','processing','completed','blocked_external')
      )
    ORDER BY c.scheduled_at ASC
    LIMIT 50
  `).all();
  if (!due.results.length) return 0;
  const statements = due.results.map((item) => env.DB.prepare(`
    INSERT INTO publication_jobs (id, content_item_id, channel, job_type, status, next_attempt_at, metadata_json)
    VALUES (?, ?, ?, 'publish', 'queued', CURRENT_TIMESTAMP, ?)
  `).bind(id('pubjob'), item.id, item.channel, JSON.stringify({ scheduledAt: item.scheduled_at, autoQueued: true })));
  await env.DB.batch(statements);
  return statements.length;
}

async function listJobs(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const url = new URL(request.url);
  const status = clean(url.searchParams.get('status'), 40);
  const stmt = status
    ? env.DB.prepare(`SELECT j.*, c.title FROM publication_jobs j JOIN content_items c ON c.id=j.content_item_id WHERE j.status=? ORDER BY j.created_at DESC LIMIT 150`).bind(status)
    : env.DB.prepare(`SELECT j.*, c.title FROM publication_jobs j JOIN content_items c ON c.id=j.content_item_id ORDER BY j.created_at DESC LIMIT 150`);
  const result = await stmt.all();
  return json({ jobs: result.results.map((row) => ({ ...row, metadata: asJson(row.metadata_json) })) });
}

async function enqueueJob(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 12_000);
  const contentId = clean(body.contentId, 100);
  const channel = CHANNELS.has(body.channel) ? body.channel : '';
  if (!contentId || !channel) return json({ error: 'validation_error' }, { status: 422 });
  const content = await env.DB.prepare(`SELECT id, status, approved_at, scheduled_at, channel FROM content_items WHERE id=?`).bind(contentId).first();
  if (!content) return json({ error: 'content_not_found' }, { status: 404 });
  if (!content.approved_at || !['approved','scheduled'].includes(content.status)) return json({ error: 'approved_content_required' }, { status: 422 });
  if (content.channel !== channel) return json({ error: 'channel_mismatch' }, { status: 422 });
  const existing = await env.DB.prepare(`SELECT id, status FROM publication_jobs WHERE content_item_id=? AND channel=? AND status IN ('queued','retry','processing','completed') ORDER BY created_at DESC LIMIT 1`).bind(contentId, channel).first();
  if (existing) return json({ id: existing.id, status: existing.status, deduplicated: true });
  const jobId = id('pubjob');
  const nextAttempt = clean(body.scheduledAt || content.scheduled_at, 60) || new Date().toISOString();
  await env.DB.prepare(`INSERT INTO publication_jobs (id,content_item_id,channel,job_type,status,next_attempt_at,metadata_json)
    VALUES (?, ?, ?, 'publish', 'queued', ?, ?)`)
    .bind(jobId, contentId, channel, nextAttempt, JSON.stringify({ assetId: clean(body.assetId, 100) || null, manualQueue: true })).run();
  return json({ id: jobId, status: 'queued', nextAttemptAt: nextAttempt }, { status: 201 });
}

function retryDelay(attempt) {
  const minutes = Math.min(360, 5 * (2 ** Math.max(0, attempt - 1)));
  return `+${minutes} minutes`;
}

async function markJob(env, jobId, fields) {
  const metadata = fields.metadata ? JSON.stringify(fields.metadata) : null;
  await env.DB.prepare(`UPDATE publication_jobs SET status=?, attempts=?, next_attempt_at=COALESCE(?,next_attempt_at),
    publication_id=COALESCE(?,publication_id), locked_at=NULL, last_error=?, metadata_json=COALESCE(?,metadata_json), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(fields.status, fields.attempts, fields.nextAttemptAt || null, fields.publicationId || null, clean(fields.lastError, 1200) || null, metadata, jobId).run();
}

async function processOne(env, job) {
  const attempt = Number(job.attempts || 0) + 1;
  await env.DB.prepare(`UPDATE publication_jobs SET status='processing', attempts=?, locked_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(attempt, job.id).run();
  if (job.channel === 'blog') return publishBlog(env, job, attempt);
  const token = await createToken({ sub: 'growth-loop-scheduler', role: 'admin' }, env.AUTH_SECRET, 600);
  const base = String(env.PUBLIC_API_BASE || 'https://growth-loop.internal').replace(/\/+$/, '');
  const metadata = asJson(job.metadata_json);
  const request = new Request(`${base}/api/social/${job.channel}/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentId: job.content_item_id, assetId: metadata.assetId || undefined })
  });
  let response;
  try {
    response = await handleSocialRoute(request, env);
  } catch (error) {
    response = json({ error: clean(error?.message || 'publish_exception', 400) }, { status: 502 });
  }
  const data = await response.clone().json().catch(() => ({}));
  if (response.ok && response.status !== 202 && data?.status === 'published') {
    await markJob(env, job.id, { status: 'completed', attempts: attempt, publicationId: data.publicationId, metadata: { ...metadata, result: data } });
    return { id: job.id, status: 'completed', publicationId: data.publicationId };
  }
  if (response.status === 202) {
    await markJob(env, job.id, { status: 'processing', attempts: attempt, publicationId: data.publicationId, lastError: 'external_processing', metadata: { ...metadata, result: data } });
    return { id: job.id, status: 'processing', publicationId: data.publicationId };
  }
  if ([401, 409, 422].includes(response.status)) {
    await markJob(env, job.id, { status: 'blocked_external', attempts: attempt, lastError: data.error || `HTTP_${response.status}`, metadata: { ...metadata, result: data } });
    return { id: job.id, status: 'blocked_external', error: data.error };
  }
  if (attempt >= Number(job.max_attempts || 4)) {
    await markJob(env, job.id, { status: 'failed', attempts: attempt, lastError: data.error || `HTTP_${response.status}`, metadata: { ...metadata, result: data } });
    return { id: job.id, status: 'failed', error: data.error };
  }
  const next = await env.DB.prepare(`SELECT datetime('now', ?) next_at`).bind(retryDelay(attempt)).first();
  await markJob(env, job.id, { status: 'retry', attempts: attempt, nextAttemptAt: next?.next_at, lastError: data.error || `HTTP_${response.status}`, metadata: { ...metadata, result: data } });
  return { id: job.id, status: 'retry', nextAttemptAt: next?.next_at };
}

async function publishBlog(env, job, attempt) {
  const content = await env.DB.prepare(`
    SELECT id, channel, language, title, body, hook, pillar, slug, seo_title, seo_description,
      metadata_json, approved_at, scheduled_at
    FROM content_items WHERE id = ?
  `).bind(job.content_item_id).first();
  if (!content || content.channel !== 'blog' || !content.approved_at) {
    await markJob(env, job.id, { status: 'blocked_external', attempts: attempt, lastError: 'approved_blog_content_required' });
    return { id: job.id, status: 'blocked_external', error: 'approved_blog_content_required' };
  }
  const title = clean(content.title, 180);
  const body = String(content.body || '').trim().slice(0, 150_000);
  if (title.length < 8 || body.length < 300) {
    await markJob(env, job.id, { status: 'blocked_external', attempts: attempt, lastError: 'blog_preflight_failed' });
    return { id: job.id, status: 'blocked_external', error: 'blog_preflight_failed' };
  }
  const metadata = asJson(content.metadata_json);
  const existing = await env.DB.prepare('SELECT id, slug FROM posts WHERE content_item_id = ? LIMIT 1').bind(content.id).first();
  const postId = existing?.id || id('post');
  const slug = clean(existing?.slug || content.slug, 180) || `${clean(title, 120).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${postId.slice(-6)}`;
  const excerpt = clean(content.hook || content.seo_description || body.slice(0, 300), 320);
  const keywords = Array.isArray(metadata.keywords) ? metadata.keywords.slice(0, 12) : [];
  const readingMinutes = Math.max(1, Math.ceil(body.split(/\s+/).filter(Boolean).length / 220));
  const canonicalBase = String(env.SITE_BASE || 'https://victor-hugo-teixeira-simon-ac9.pages.dev').replace(/\/+$/, '');
  const canonicalUrl = `${canonicalBase}/blog.html?post=${encodeURIComponent(slug)}`;
  if (existing) {
    await env.DB.prepare(`UPDATE posts SET language=?, title=?, excerpt=?, content=?, category=?, keywords_json=?, status='published',
      seo_title=?, seo_description=?, canonical_url=?, reading_minutes=?, published_at=COALESCE(published_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP
      WHERE id=?`).bind(content.language === 'en' ? 'en' : 'pt', title, excerpt, body, clean(content.pillar, 80), JSON.stringify(keywords),
      clean(content.seo_title || title, 180), clean(content.seo_description || excerpt, 320), canonicalUrl, readingMinutes, postId).run();
  } else {
    await env.DB.prepare(`INSERT INTO posts (id,slug,language,title,excerpt,content,category,keywords_json,status,published_at,
      content_item_id,seo_title,seo_description,canonical_url,reading_minutes)
      VALUES (?,?,?,?,?,?,?,?,'published',CURRENT_TIMESTAMP,?,?,?,?,?)`).bind(
      postId, slug, content.language === 'en' ? 'en' : 'pt', title, excerpt, body, clean(content.pillar, 80), JSON.stringify(keywords),
      content.id, clean(content.seo_title || title, 180), clean(content.seo_description || excerpt, 320), canonicalUrl, readingMinutes
    ).run();
  }
  const publicationId = id('publication');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO publications (id,content_item_id,channel,external_id,external_url,status,scheduled_at,published_at,metadata_json)
      VALUES (?,?, 'blog', ?, ?, 'published', ?, CURRENT_TIMESTAMP, ?)`)
      .bind(publicationId, content.id, postId, canonicalUrl, content.scheduled_at, JSON.stringify({ automatic: true, postId, slug })),
    env.DB.prepare(`UPDATE content_items SET status='published', published_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(content.id)
  ]);
  await markJob(env, job.id, { status: 'completed', attempts: attempt, publicationId, metadata: { postId, slug, canonicalUrl, automatic: true } });
  return { id: job.id, status: 'completed', publicationId, postId, slug };
}

export async function processPublicationJobs(env, limit = 10) {
  const enqueued = await enqueueScheduledContent(env);
  const jobs = await env.DB.prepare(`SELECT * FROM publication_jobs
    WHERE status IN ('queued','retry') AND attempts < max_attempts AND next_attempt_at <= CURRENT_TIMESTAMP
    ORDER BY next_attempt_at ASC LIMIT ?`).bind(Math.max(1, Math.min(Number(limit || 10), 25))).all();
  const results = [];
  for (const job of jobs.results) results.push(await processOne(env, job));
  return { enqueued, processed: results.length, results };
}

async function runJobs(request, env) {
  const authorized = (await isAdmin(request, env)) || isRobot(request, env);
  if (!authorized) return json({ error: 'unauthorized' }, { status: 401 });
  return json(await processPublicationJobs(env, 10));
}

async function requeue(request, env, jobId) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const current = await env.DB.prepare('SELECT * FROM publication_jobs WHERE id=?').bind(jobId).first();
  if (!current) return json({ error: 'not_found' }, { status: 404 });
  if (current.status === 'completed') return json({ error: 'completed_job_cannot_requeue' }, { status: 409 });
  await env.DB.prepare(`UPDATE publication_jobs SET status='queued', attempts=0, next_attempt_at=CURRENT_TIMESTAMP, locked_at=NULL, last_error=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(jobId).run();
  return json({ id: jobId, status: 'queued' });
}

export async function handlePublicationQueueRoute(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (!path.startsWith('/api/publication-jobs')) return null;
  if (request.method === 'GET' && path === '/api/publication-jobs') return listJobs(request, env);
  if (request.method === 'POST' && path === '/api/publication-jobs') return enqueueJob(request, env);
  if (request.method === 'POST' && path === '/api/publication-jobs/run') return runJobs(request, env);
  const match = path.match(/^\/api\/publication-jobs\/([a-zA-Z0-9_-]+)\/requeue$/);
  if (request.method === 'POST' && match) return requeue(request, env, match[1]);
  return json({ error: 'not_found' }, { status: 404 });
}

export { enqueueScheduledContent };

export { publishBlog };
