interface WrapperInvoice {
  id: string
  customer: string | null
  subscription: string | null
  status: string | null
  total: number | null
  currency: string | null
  period_start: string | null
  period_end: string | null
  created: string | null
  number: string | null
  amount_paid: number | null
  amount_due: number | null
  hosted_invoice_url: string | null
  invoice_pdf: string | null
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const supabase = useServerSupabase()

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (!profile?.stripe_customer_id) {
    return { data: [] as WrapperInvoice[] }
  }

  // Pushed down to GET /v1/invoices?customer=cus_... by the Stripe Wrapper.
  // See supabase/migrations/010_stripe_wrapper.sql.
  const { data, error } = await supabase
    .from('v_stripe_invoices')
    .select('id, customer, subscription, status, total, currency, period_start, period_end, created, number, amount_paid, amount_due, hosted_invoice_url, invoice_pdf')
    .eq('customer', profile.stripe_customer_id)
    .order('created', { ascending: false })
    .limit(24)
    .returns<WrapperInvoice[]>()

  if (error) {
    throw createError({ statusCode: 502, message: `Failed to load invoices: ${error.message}` })
  }

  return { data: data ?? [] }
})
