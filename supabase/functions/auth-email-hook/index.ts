import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { Webhook } from 'npm:standardwebhooks@1.0.0'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'
import { sendResendEmail } from '../_shared/send-resend.ts'
import {
  brandFromSlug,
  emailSubject,
  fromHeader,
  slugFromConfirmationUrl,
  type EmailBrand,
} from '../_shared/email-templates/email-brand.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature',
}

const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

type EmailData = {
  token?: string
  token_hash?: string
  redirect_to?: string
  email_action_type?: string
  site_url?: string
  token_new?: string
  token_hash_new?: string
  new_email?: string
}

type HookPayload = {
  user?: { email?: string }
  email_data?: EmailData
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function hookSecret(): string {
  const raw = Deno.env.get('SEND_EMAIL_HOOK_SECRET')?.trim() ?? ''
  return raw.replace(/^v1,whsec_/, '')
}

function templateKey(action: string | undefined): string {
  const key = (action || '').trim().toLowerCase()
  if (key === 'magic_link') return 'magiclink'
  if (key.startsWith('email_change')) return 'email_change'
  return key
}

function confirmationUrl(emailData: EmailData): string {
  const base = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '')
  const params = new URLSearchParams({
    token: emailData.token_hash || '',
    type: emailData.email_action_type || '',
  })
  if (emailData.redirect_to) params.set('redirect_to', emailData.redirect_to)
  return `${base}/auth/v1/verify?${params.toString()}`
}

function sender(brand: EmailBrand): string {
  const explicit = Deno.env.get('RESEND_FROM_EMAIL')?.trim()
  if (explicit) {
    return explicit.includes('<') ? explicit : `${brand.fromName} <${explicit}>`
  }
  const domain = Deno.env.get('RESEND_FROM_DOMAIN')?.trim() || 'vgg.tools'
  return fromHeader(brand, domain)
}

async function resolveBrand(
  supabase: ReturnType<typeof createClient>,
  email: string | undefined,
  confirmationUrlValue: string | undefined,
): Promise<EmailBrand> {
  if (email) {
    const { data } = await supabase.rpc('tenant_slug_for_email', { _email: email })
    if (typeof data === 'string' && data.trim()) return brandFromSlug(data)
  }
  return brandFromSlug(slugFromConfirmationUrl(confirmationUrlValue))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const secret = hookSecret()
  if (!secret) {
    console.error('SEND_EMAIL_HOOK_SECRET is not configured')
    return json(500, { error: 'Server configuration error' })
  }

  const rawBody = await req.text()
  let payload: HookPayload
  try {
    const verified = new Webhook(secret).verify(rawBody, Object.fromEntries(req.headers))
    payload = (typeof verified === 'string' ? JSON.parse(verified) : verified) as HookPayload
  } catch (error) {
    console.error('Auth email hook signature rejected', {
      error: error instanceof Error ? error.message : String(error),
    })
    return json(401, { error: 'Invalid signature' })
  }

  const emailData = payload.email_data
  const recipient = payload.user?.email?.trim()
  const emailType = templateKey(emailData?.email_action_type)
  const EmailTemplate = EMAIL_TEMPLATES[emailType]

  if (!recipient || !emailData || !EmailTemplate) {
    console.error('Auth email hook payload missing a sendable template', { emailType })
    return json(400, { error: `Unknown email type: ${emailData?.email_action_type ?? ''}` })
  }

  const link = confirmationUrl(emailData)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const brand = await resolveBrand(supabase, recipient, emailData.redirect_to || link)
  const templateProps = {
    brand,
    siteName: brand.siteName,
    siteUrl: brand.siteUrl,
    recipient,
    confirmationUrl: link,
    token: emailData.token,
    email: recipient,
    newEmail: emailData.new_email,
  }

  const html = await renderAsync(React.createElement(EmailTemplate, templateProps))
  const text = await renderAsync(React.createElement(EmailTemplate, templateProps), { plainText: true })
  const messageId = crypto.randomUUID()
  const subject = emailSubject(brand, emailType)
  const from = sender(brand)

  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: emailType,
    recipient_email: recipient,
    status: 'pending',
  })

  try {
    await sendResendEmail({ from, to: recipient, subject, html, text })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Branded auth email failed', { emailType, error: errorMessage })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: emailType,
      recipient_email: recipient,
      status: 'failed',
      error_message: errorMessage.slice(0, 1000),
    })
    return json(500, { error: 'Failed to send email' })
  }

  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: emailType,
    recipient_email: recipient,
    status: 'sent',
  })

  console.log('Branded auth email sent', { emailType, brand: brand.slug })
  return json(200, {})
})
