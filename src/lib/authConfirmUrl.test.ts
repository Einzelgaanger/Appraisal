import { describe, expect, it } from 'vitest';
import { authEmailLink } from '../../supabase/functions/_shared/auth-confirm-url';

const redirect = 'https://executive.vgg.tools/reset-password?tenant=executiveteam';

describe('authEmailLink', () => {
  it('sends recovery to the company site so a mail scanner cannot burn the token', () => {
    const link = authEmailLink({
      tokenHash: 'hashed-token',
      emailActionType: 'recovery',
      redirectTo: redirect,
      supabaseUrl: 'https://qnorggoycwbbxdlvbcvq.supabase.co',
    });
    const url = new URL(link);
    expect(url.origin).toBe('https://executive.vgg.tools');
    expect(url.pathname).toBe('/reset-password');
    expect(url.searchParams.get('tenant')).toBe('executiveteam');
    expect(url.searchParams.get('token_hash')).toBe('hashed-token');
    expect(url.searchParams.get('type')).toBe('recovery');
    expect(link).not.toContain('/auth/v1/verify');
  });

  it('keeps a Greenhouse recovery on that company host', () => {
    const link = authEmailLink({
      tokenHash: 'hashed-token',
      emailActionType: 'recovery',
      redirectTo: 'https://ghc.vgg.tools/reset-password?tenant=ghc',
      supabaseUrl: 'https://qnorggoycwbbxdlvbcvq.supabase.co',
    });
    const url = new URL(link);
    expect(url.origin).toBe('https://ghc.vgg.tools');
    expect(url.searchParams.get('tenant')).toBe('ghc');
    expect(url.searchParams.get('type')).toBe('recovery');
  });

  it('sends invite, sign-in, and signup links to the same page', () => {
    for (const action of ['invite', 'magiclink', 'signup', 'email_change']) {
      const link = authEmailLink({
        tokenHash: 'hashed-token',
        emailActionType: action,
        redirectTo: 'https://ghc.vgg.tools/?tenant=ghc',
        supabaseUrl: 'https://qnorggoycwbbxdlvbcvq.supabase.co',
      });
      const url = new URL(link);
      expect(url.origin).toBe('https://ghc.vgg.tools');
      expect(url.pathname).toBe('/reset-password');
      expect(url.searchParams.get('tenant')).toBe('ghc');
      expect(url.searchParams.get('type')).toBe(action);
      expect(link).not.toContain('/auth/v1/verify');
    }
  });
});
