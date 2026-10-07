/**
 * One-time auth links must open our site, not Supabase's /auth/v1/verify.
 * Corporate mail scanners (Microsoft Safe Links and similar) GET every URL in
 * an email. That verify endpoint burns the token, so the person then lands on
 * "otp_expired" / "this link is no longer valid".
 *
 * The site redeems token_hash only after the person taps Continue.
 */

export type AuthEmailLinkInput = {
  tokenHash?: string | null
  emailActionType?: string | null
  redirectTo?: string | null
  siteUrl?: string | null
  supabaseUrl?: string | null
}

const APP_REDEEMED_TYPES = new Set([
  'recovery',
  'signup',
  'invite',
  'magiclink',
  'email_change',
  'email',
])

export function normalizeAuthActionType(action: string | null | undefined): string {
  const key = (action || '').trim().toLowerCase()
  if (key === 'magic_link') return 'magiclink'
  if (key.startsWith('email_change')) return 'email_change'
  return key
}

function resetLanding(redirectTo: string, siteUrl?: string | null): URL {
  if (redirectTo) {
    try {
      const dest = new URL(redirectTo)
      dest.pathname = '/reset-password'
      dest.hash = ''
      return dest
    } catch {
      // Fall through to the site URL.
    }
  }

  let origin = 'https://executive.vgg.tools'
  if (siteUrl) {
    try {
      origin = new URL(siteUrl).origin
    } catch {
      // Keep the executive host.
    }
  }
  return new URL('/reset-password', origin)
}

export function authEmailLink(input: AuthEmailLinkInput): string {
  const type = normalizeAuthActionType(input.emailActionType)
  const tokenHash = (input.tokenHash || '').trim()
  const redirectTo = input.redirectTo?.trim() || ''

  if (APP_REDEEMED_TYPES.has(type) && tokenHash) {
    const dest = resetLanding(redirectTo, input.siteUrl)
    dest.searchParams.set('token_hash', tokenHash)
    dest.searchParams.set('type', type)
    return dest.toString()
  }

  const base = (input.supabaseUrl || '').replace(/\/$/, '')
  const params = new URLSearchParams({
    token: tokenHash,
    type: input.emailActionType || '',
  })
  if (redirectTo) params.set('redirect_to', redirectTo)
  return `${base}/auth/v1/verify?${params.toString()}`
}
