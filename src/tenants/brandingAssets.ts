import type { TenantConfig } from './types';
import vggLogo from '@/assets/vgg-logo.webp';
import ghcLogoMark from '@/assets/ghc-logo-mark.png';
import ghcLogoBanner from '@/assets/ghc-logo-banner.png';

export interface TenantBrandAssets {
  /** Compact mark — mobile header, favicon-sized UI, profile gate */
  logoMark: string;
  /** Primary / sidebar logo (GHC uses the full wordmark banner) */
  logo: string;
  /** Public favicon path under /public */
  faviconHref: string;
  logoAlt: string;
  logoMarkClassName: string;
  logoClassName: string;
  parentCredit?: string;
  themeColor: string;
}

export function getTenantBrandAssets(tenant: TenantConfig): TenantBrandAssets {
  if (tenant.slug === 'ghc') {
    return {
      logoMark: ghcLogoMark,
      logo: ghcLogoBanner,
      faviconHref: '/ghc-favicon.png',
      logoAlt: 'GreenHouse Capital',
      logoMarkClassName: 'h-9 w-auto object-contain sm:h-10',
      logoClassName: 'h-auto w-full object-cover object-left',
      parentCredit: 'A Venture Garden Group company',
      themeColor: '#003333',
    };
  }

  if (tenant.slug === 'vigipay') {
    return {
      logoMark: vggLogo,
      logo: vggLogo,
      faviconHref: '/favicon.png',
      logoAlt: 'VigiPay',
      logoMarkClassName: 'h-7 w-auto object-contain sm:h-8',
      logoClassName: 'h-8 w-auto object-contain',
      parentCredit: 'A Venture Garden Group company',
      themeColor: '#0f2744',
    };
  }

  return {
    logoMark: vggLogo,
    logo: vggLogo,
    faviconHref: '/favicon.png',
    logoAlt: 'Venture Garden Group',
    logoMarkClassName: 'h-7 w-auto object-contain sm:h-8',
    logoClassName: 'h-8 w-auto object-contain',
    themeColor: '#1a2e22',
  };
}
