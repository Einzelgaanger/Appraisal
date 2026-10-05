export type ResendMessage = {
  from: string
  to: string
  subject: string
  html: string
  text?: string
  inlinePng?: { filename: string; content: string; contentId: string }
}

/** Send one transactional message through Resend. Throws with the API status on failure. */
export async function sendResendEmail(message: ResendMessage): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim()
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: message.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: message.inlinePng
        ? [{
          filename: message.inlinePng.filename,
          content: message.inlinePng.content,
          content_type: 'image/png',
          content_id: message.inlinePng.contentId,
        }]
        : undefined,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Resend ${response.status}: ${detail.slice(0, 500)}`)
  }
}
