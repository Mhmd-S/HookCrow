export default defineEventHandler(async (event) => {
  const { public: pub } = useRuntimeConfig()
  const siteUrl = (pub.siteUrl || '').replace(/\/$/, '')

  const supabase = useServerSupabase()

  // Static pages
  const staticRoutes = [
    { path: '/', priority: '1.0', changefreq: 'daily' },
    { path: '/search', priority: '0.9', changefreq: 'daily' },
    { path: '/terms', priority: '0.3', changefreq: 'yearly' },
    { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
    { path: '/contact', priority: '0.5', changefreq: 'monthly' }
  ]

  const now = new Date().toISOString()

  // Dynamic recipe pages — published + complete only
  let recipeRoutes: Array<{ path: string; priority: string; lastmod: string }> = []
  try {
    const { data: recipes } = await supabase
      .from('videos')
      .select('id, title, updated_at')
      .eq('is_published', true)
      .eq('status', 'complete')
      .order('updated_at', { ascending: false })
      .limit(5000)

    recipeRoutes = (recipes || []).map((r) => ({
      path: `/recipe/${r.id}`,
      priority: '0.8',
      lastmod: r.updated_at ? new Date(r.updated_at).toISOString() : now
    }))
  } catch {
    // Degrade gracefully — static routes still ship
  }

  const allRoutes = [
    ...staticRoutes.map(r => ({ ...r, lastmod: now })),
    ...recipeRoutes.map(r => ({ ...r, changefreq: 'weekly' }))
  ]

  const urlset = allRoutes
    .map(r => `  <url>
    <loc>${siteUrl}${r.path}</loc>
    <lastmod>${r.lastmod}</lastmod>
    <changefreq>${r.changefreq || 'weekly'}</changefreq>
    <priority>${r.priority}</priority>
  </url>`)
    .join('\n')

  setHeader(event, 'Content-Type', 'application/xml; charset=utf-8')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlset}
</urlset>
`
})
