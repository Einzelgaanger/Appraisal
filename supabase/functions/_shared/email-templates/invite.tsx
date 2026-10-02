/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Text } from 'npm:@react-email/components@0.0.22'
import { EMAIL_BRANDS, type EmailBrand } from './email-brand.ts'
import { BrandedEmailFrame, CtaBlock, brandStyles } from './branded-layout.tsx'

interface InviteEmailProps {
  siteName?: string
  siteUrl?: string
  confirmationUrl: string
  brand?: EmailBrand
}

export const InviteEmail = ({
  confirmationUrl,
  brand = EMAIL_BRANDS.executiveteam,
}: InviteEmailProps) => {
  const styles = brandStyles(brand)
  return (
    <BrandedEmailFrame
      brand={brand}
      preview={`You've been invited to ${brand.siteName}`}
      eyebrow={`${brand.siteName} / Invitation`}
      heading="Your workspace is ready"
      footer="If you were not expecting this invitation, you may safely ignore this email."
    >
      <Text style={styles.text}>
        You have been invited to join the {brand.siteName} {brand.productName}. Click below to accept your invitation and set up your account.
      </Text>
      <CtaBlock brand={brand} href={confirmationUrl} label="Accept Invite" />
    </BrandedEmailFrame>
  )
}

export default InviteEmail
