export default defineEventHandler((event) => {
  const { public: pub } = useRuntimeConfig()
  const siteUrl = (pub.siteUrl || '').replace(/\/$/, '')

  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')

  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /admin/',
    'Disallow: /account',
    'Disallow: /bookmarks',
    'Disallow: /login',
    'Disallow: /register',

    'Disallow: /api/',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    ''
  ].join('\n')
})
