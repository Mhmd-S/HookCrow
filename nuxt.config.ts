// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
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
