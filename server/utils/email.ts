import { Resend } from 'resend'
import type { SubscriptionPlan } from '~/types'

const log = createLogger('email')

let client: Resend | null = null

function getClient(): Resend | null {
  if (client) return client
  const config = useRuntimeConfig()
  const key = config.resendApiKey as string
  if (!key) return null
  client = new Resend(key)
  return client
}

function getFrom(): string {
  const config = useRuntimeConfig()
  return (config.emailFrom as string) || 'Hookcrow <no-reply@hookcrow.com>'
}

function formatDate(iso: string | null): string {
  if (!iso) return 'the end of your billing period'
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return 'the end of your billing period'
  }
}

function planLabel(plan: SubscriptionPlan | null): string {
  if (plan === 'annual') return 'Hookcrow Pro (Annual)'
  if (plan === 'monthly') return 'Hookcrow Pro (Monthly)'
  return 'Hookcrow Pro'
}

function layout(heading: string, bodyHtml: string, ctaHref: string, ctaText: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:6px;padding:32px;max-width:560px;">
        <tr><td style="font-size:20px;font-weight:600;letter-spacing:-0.01em;padding-bottom:16px;">Hookcrow</td></tr>
        <tr><td style="font-size:22px;font-weight:600;letter-spacing:-0.01em;padding-bottom:12px;">${heading}</td></tr>
        <tr><td style="font-size:15px;line-height:1.55;color:#374151;padding-bottom:24px;">${bodyHtml}</td></tr>
        <tr><td style="padding-bottom:24px;">
          <a href="${ctaHref}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:4px;">${ctaText}</a>
        </td></tr>
        <tr><td style="font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:16px;">Questions? Reply to this email and we'll get back to you.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export interface SubscriptionEmailArgs {
  email: string
  plan: SubscriptionPlan | null
  periodEnd: string | null
}

export async function sendSubscriptionConfirmationEmail(args: SubscriptionEmailArgs): Promise<void> {
  const resend = getClient()
  if (!resend) {
    log.warn('RESEND_API_KEY not set — skipping subscription confirmation', { to: args.email })
    return
  }
  const site = getSiteUrl()
  const accountUrl = `${site}/account`
  const planName = planLabel(args.plan)
  const renewsOn = formatDate(args.periodEnd)

  const bodyHtml = `<p>You're subscribed to <strong>${planName}</strong>. Every video in the library — including Pro-only ones — is now unlocked.</p>
    <p>Your next renewal is on <strong>${renewsOn}</strong>. You can update payment or cancel at any time from your account.</p>`
  const text = `You're subscribed to ${planName}. Every video in the library — including Pro-only ones — is now unlocked.\n\nYour next renewal is on ${renewsOn}. You can update payment or cancel at any time from ${accountUrl}.`

  try {
    const { error } = await resend.emails.send({
      from: getFrom(),
      to: args.email,
      subject: `Welcome to ${planName}`,
      html: layout(`Welcome to ${planName}`, bodyHtml, accountUrl, 'Manage subscription'),
      text
    })
    if (error) {
      log.error('Resend rejected subscription confirmation', error, { to: args.email })
      return
    }
    log.info('Sent subscription confirmation', { to: args.email, plan: args.plan })
  } catch (err) {
    log.error('Failed to send subscription confirmation', err as Error, { to: args.email })
  }
}

export async function sendSubscriptionCancellationEmail(args: SubscriptionEmailArgs): Promise<void> {
  const resend = getClient()
  if (!resend) {
    log.warn('RESEND_API_KEY not set — skipping cancellation email', { to: args.email })
    return
  }
  const site = getSiteUrl()
  const accountUrl = `${site}/account`
  const planName = planLabel(args.plan)
  const endsOn = formatDate(args.periodEnd)

  const bodyHtml = `<p>Your <strong>${planName}</strong> subscription is scheduled to cancel on <strong>${endsOn}</strong>. You'll keep full Pro access until then.</p>
    <p>Changed your mind? You can resume anytime from your account before that date and nothing will change on your card.</p>`
  const text = `Your ${planName} subscription is scheduled to cancel on ${endsOn}. You'll keep full Pro access until then.\n\nChanged your mind? Resume anytime from ${accountUrl}.`

  try {
    const { error } = await resend.emails.send({
      from: getFrom(),
      to: args.email,
      subject: 'Your subscription is scheduled to cancel',
      html: layout('Your cancellation is scheduled', bodyHtml, accountUrl, 'Resume subscription'),
      text
    })
    if (error) {
      log.error('Resend rejected cancellation email', error, { to: args.email })
      return
    }
    log.info('Sent cancellation email', { to: args.email, plan: args.plan, endsOn: args.periodEnd })
  } catch (err) {
    log.error('Failed to send cancellation email', err as Error, { to: args.email })
  }
}
