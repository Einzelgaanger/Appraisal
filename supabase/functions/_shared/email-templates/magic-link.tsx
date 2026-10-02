/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Text } from 'npm:@react-email/components@0.0.22'
import { EMAIL_BRANDS, type EmailBrand } from './email-brand.ts'
import { BrandedEmailFrame, CtaBlock, brandStyles } from './branded-layout.tsx'

interface MagicLinkEmailProps {
  siteName?: string
  confirmationUrl: string
  brand?: EmailBrand
}

export const MagicLinkEmail = ({
  confirmationUrl,
  brand = EMAIL_BRANDS.executiveteam,
}: MagicLinkEmailProps) => {
  const styles = brandStyles(brand)
  return (
    <BrandedEmailFrame
      brand={brand}
      preview={`Your secure login link for ${brand.siteName}`}
      eyebrow={`${brand.siteName} / Sign-in`}
      heading="Your sign-in link"
      footer="If you did not request this link, you can safely ignore this email."
    >
      <Text style={styles.text}>
        Click the button below to securely sign in to your {brand.siteName} {brand.productName}. For security, this link is single-use and will expire shortly.
      </Text>
      <CtaBlock brand={brand} href={confirmationUrl} label="Sign In" />
    </BrandedEmailFrame>
  )
}

export default MagicLinkEmail
