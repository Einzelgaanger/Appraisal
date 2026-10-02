/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Text } from 'npm:@react-email/components@0.0.22'
import { EMAIL_BRANDS, type EmailBrand } from './email-brand.ts'
import { BrandedEmailFrame, CtaBlock, brandStyles } from './branded-layout.tsx'

interface RecoveryEmailProps {
  siteName?: string
  confirmationUrl: string
  brand?: EmailBrand
}

export const RecoveryEmail = ({
  confirmationUrl,
  brand = EMAIL_BRANDS.executiveteam,
}: RecoveryEmailProps) => {
  const styles = brandStyles(brand)
  return (
    <BrandedEmailFrame
      brand={brand}
      preview={`Reset your password for ${brand.siteName}`}
      eyebrow={`${brand.siteName} / Password`}
      heading="Set your new password"
      footer="If you weren't expecting this email, you can safely ignore it — no changes will be made to your account."
    >
      <Text style={styles.text}>
        You're a step away from your {brand.siteName} {brand.productName}. Tap the button below to choose a new password — then we'll guide you through confirming your profile and opening your workspace.
      </Text>
      <CtaBlock brand={brand} href={confirmationUrl} label="Set New Password" />
      <Text style={{ ...styles.text, fontSize: '12px', margin: '22px 0 0', color: brand.muted }}>
        For your security, this link will expire shortly. If it does, just request a new one from the sign-in page.
      </Text>
    </BrandedEmailFrame>
  )
}

export default RecoveryEmail
