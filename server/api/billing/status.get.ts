export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const supabase = useServerSupabase()

  const { data } = await supabase
    .from('profiles')
    .select('subscription_status, plan, current_period_end, cancel_at_period_end, stripe_customer_id')
    .eq('id', user.id)
    .single()

  return {
    data: {
      subscription_status: data?.subscription_status ?? 'free',
      plan: data?.plan ?? null,
      current_period_end: data?.current_period_end ?? null,
      cancel_at_period_end: data?.cancel_at_period_end ?? false,
      is_pro: data?.subscription_status === 'active',
      has_customer: !!data?.stripe_customer_id
    }
  }
})
