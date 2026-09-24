import type { TenantConfig } from './types';
import vggLogo from '@/assets/vgg-logo.webp';
import ghcLogoMark from '@/assets/ghc-logo-mark.png';
import ghcLogoBanner from '@/assets/ghc-logo-banner.png';
import vigipayLogoMark from '@/assets/vigipay-logo-mark.png';
import vigipayLogoBanner from '@/assets/vigipay-logo-banner.png';

export interface TenantBrandAssets {
  /** Compact mark — mobile header, favicon-sized UI, profile gate */
  logoMark: string;
  /** Primary / sidebar logo (GHC uses the full wordmark banner) */
  logo: string;
  /**
   * How to render `logo` in the sidebar and on auth screens.
   * 'banner' — `logo` contains the wordmark, so show it edge to edge.
   * 'lockup' — `logo` is cover art with no wordmark, so pair `logoMark` with `wordmark` and
   *            keep the cover art as a backdrop only.
   * 'plain'  — single inline image, no branded dark chrome.
   */
  logoStyle: 'banner' | 'lockup' | 'plain';
  /** Wordmark text, required by the 'lockup' style */
  wordmark?: string;
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
      logoStyle: 'banner',
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
      logoMark: vigipayLogoMark,
      logo: vigipayLogoBanner,
      logoStyle: 'lockup',
      wordmark: 'VigiPay',
      faviconHref: '/vigipay-favicon.png',
      logoAlt: 'VigiPay',
      // The mark is a filled teal tile, so it needs its own corner radius
      logoMarkClassName: 'h-9 w-auto rounded-md object-contain sm:h-10',
      logoClassName: 'h-10 w-auto rounded-md object-contain',
      parentCredit: 'A Venture Garden Group company',
      themeColor: '#003A48',
    };
  }

  return {
    logoMark: vggLogo,
    logo: vggLogo,
    logoStyle: 'plain',
    faviconHref: '/favicon.png',
    logoAlt: 'Venture Garden Group',
    logoMarkClassName: 'h-7 w-auto object-contain sm:h-8',
    logoClassName: 'h-8 w-auto object-contain',
    themeColor: '#1a2e22',
  };
}
