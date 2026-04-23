// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      titleTemplate: '%s · Hookcrow',
      title: 'Hookcrow — Creative reference for short-form marketing videos',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' },
        { rel: 'alternate icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }
      ],
      meta: [
        { name: 'description', content: 'Thousands of short-form marketing videos from creators who sell — a reference library of hooks, bridges, and CTAs for your next campaign.' },
        { name: 'robots', content: 'index,follow' },
        { name: 'theme-color', content: '#5505a0' },
        { property: 'og:site_name', content: 'Hookcrow' },
        { property: 'og:type', content: 'website' },
        { property: 'og:image', content: '/og-image.png' },
        { property: 'og:image:type', content: 'image/png' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:image', content: '/og-image.png' }
      ]
    }
  },
  ui: {
    colorMode: false
  },
  runtimeConfig: {
    geminiApiKey: process.env.GEMINI_API_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseKey: process.env.SUPABASE_KEY,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_ID_MONTHLY,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ID_ANNUAL,
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM,
    public: {
      supabaseUrl: process.env.SUPABASE_URL,
      siteUrl: process.env.SITE_URL || 'http://localhost:3000'
    }
  },
  nitro: {
    routeRules: {
      '/api/stripe/webhook': { cors: false }
    }
  }
})
