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
    openaiApiKey: process.env.OPENAI_API_KEY,
    replicateApiToken: process.env.REPLICATE_API_TOKEN,
    auddApiToken: process.env.AUDD_API_TOKEN,
    public: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_KEY
    }
  }
})
