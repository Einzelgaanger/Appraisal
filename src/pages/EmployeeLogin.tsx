import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEmployeeAuth } from '@/contexts/EmployeeAuthContext';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Mail, AlertCircle, ArrowLeft, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useTenant } from '@/tenants/TenantContext';
import { getTenantBrandAssets } from '@/tenants/brandingAssets';
import {
  companyWorkspaceUrl,
  lookupSignedInCompanySlug,
  lookupTenantSlugForEmail,
} from '@/tenants/companyHome';
import { resolveLoginEmail } from '@/lib/loginEmail';

export default function EmployeeLogin() {
  const { tenant } = useTenant();
  const brand = getTenantBrandAssets(tenant);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitTick, setSubmitTick] = useState(0);
  const { login } = useEmployeeAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo =
    (location.state as { from?: { pathname: string; search?: string } } | null)?.from;
  const afterLoginBase = returnTo ? `${returnTo.pathname}${returnTo.search ?? ''}` : '/hub?tab=survey';

  // Keep the current query so an explicit ?tenant= override survives the hop, and
  // tell the account page whether this is a reset or a first-time activation.
  const findAccountLink = (mode?: 'reset') => {
    const params = new URLSearchParams(location.search);
    if (mode) params.set('mode', mode);
    const search = params.toString();
    return `/find-account${search ? `?${search}` : ''}`;
  };

  const resolveAfterLogin = async (loginEmail: string) => {
    try {
      const url = new URL(afterLoginBase, window.location.origin);
      const slug =
        (await lookupSignedInCompanySlug()) ||
        (await lookupTenantSlugForEmail(loginEmail));
      if (slug) {
        url.searchParams.set('tenant', slug);
        return companyWorkspaceUrl(slug, `${url.pathname}${url.search}`);
      }
      if (!url.searchParams.get('tenant')) {
        url.searchParams.set('tenant', tenant.slug);
      }
      return `${url.pathname}${url.search}`;
    } catch {
      return afterLoginBase;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitTick((t) => t + 1);
    setLoading(true);
    try {
      const loginEmail = await resolveLoginEmail(email);
      const { error } = await login(loginEmail, password);
      if (error) {
        setError(
          loginEmail.toLowerCase() !== email.trim().toLowerCase()
            ? `That address now signs in as ${loginEmail}. The password was not accepted.`
            : error,
        );
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setError('Sign-in succeeded but the session was not saved. Check that cookies/storage are allowed and try again.');
          return;
        }
        window.location.assign(await resolveAfterLogin(loginEmail));
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mobile-flow-shell app-page flex min-h-dvh-screen flex-col bg-background">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <motion.div
          key={submitTick}
          className="pointer-events-none absolute top-0 left-0 right-0 z-10 h-0.5 bg-primary/25"
          initial={{ scaleX: 0, transformOrigin: '0% 50%' }}
          animate={
            loading
              ? { scaleX: [0.12, 0.55, 0.28, 0.72, 0.4, 0.95], transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } }
              : { scaleX: 1, opacity: 0, transition: { duration: 0.25 } }
          }
        />

        <div className="mobile-flow-header mobile-top-safe border-b border-foreground/10">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="h-9 gap-1.5 rounded-2xl font-sans text-sm font-medium normal-case tracking-normal">
              <ArrowLeft className="h-4 w-4" /> Home
            </Button>
            <span className="text-sm text-muted-foreground">Employee sign in</span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:justify-center lg:px-6 lg:py-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-1 flex-col min-h-0 w-full max-w-md mx-auto px-4 sm:px-6 lg:flex-none lg:justify-center"
          >
            <div className="mobile-flow-content px-0 py-2 sm:px-0 lg:overflow-visible lg:px-0 lg:py-0">
              {brand.logoStyle === 'lockup' ? (
                <div className="mb-6 flex items-center gap-3 sm:mb-8">
                  <img src={brand.logoMark} alt="" className="h-11 w-11 shrink-0 rounded-md object-contain" />
                  <span className="font-display text-2xl font-semibold tracking-[-0.02em]">
                    {brand.wordmark}
                  </span>
                </div>
              ) : brand.logoStyle === 'banner' ? (
                <img
                  src={brand.logo}
                  alt={brand.logoAlt}
                  className="mb-6 h-16 w-auto max-w-full object-contain object-left sm:mb-8 sm:h-[4.5rem]"
                />
              ) : (
                <img
                  src={brand.logo}
                  alt={brand.logoAlt}
                  className="mb-6 h-10 w-auto object-contain sm:mb-8 sm:h-12"
                />
              )}
              {brand.parentCredit ? (
                <p className="mb-4 -mt-3 text-[11px] text-muted-foreground">{brand.parentCredit}</p>
              ) : null}

              <div className="mb-6 sm:mb-8">
                <h1 className="font-display text-[1.75rem] font-semibold leading-tight sm:text-4xl">
                  Welcome back
                </h1>
                <p className="mt-2 text-[13px] leading-relaxed text-foreground/60 sm:text-sm">
                  Sign in with your work email.
                </p>
              </div>

              <form id="employee-login-form" onSubmit={handleSubmit} className="mobile-flow-card space-y-4.5 sm:space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-foreground/80">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11 rounded-2xl border-foreground/15 bg-background pl-10 text-sm"
                      inputMode="email"
                      autoComplete="username"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium text-foreground/80">
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 rounded-2xl border-foreground/15 bg-background pl-10 pr-11 text-sm"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/50 hover:text-foreground"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] text-muted-foreground">Use your employee work email and password.</p>
                  <Link to={findAccountLink('reset')} className="text-[11px] font-medium text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 rounded-xl border border-destructive bg-destructive/5 p-3 text-sm text-destructive sm:rounded-sm"
                  >
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                  </motion.div>
                )}

                <div className="hidden lg:block">
                  <Button type="submit" disabled={loading} className="h-11 w-full gap-2 rounded-2xl bg-teal-500 font-sans text-sm font-medium normal-case tracking-normal text-white hover:bg-teal-600">
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <motion.span
                          className="inline-block h-2 w-2 rounded-full bg-primary-foreground"
                          animate={{ opacity: [0.35, 1, 0.35], scale: [0.9, 1, 0.9] }}
                          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        Signing in…
                      </span>
                    ) : (
                      <>
                        Sign in <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>

              <div className="mt-5 border-t border-foreground/10 px-1 pt-4 sm:mt-7 lg:mt-9">
                <Link
                  to={findAccountLink()}
                  className="inline-flex min-h-10 items-center text-sm font-medium text-foreground/80 hover:text-foreground"
                >
                  First time? → Find your account
                </Link>
              </div>
            </div>

            <div className="mobile-flow-sticky-cta lg:hidden">
              <Button
                type="submit"
                form="employee-login-form"
                disabled={loading}
                className="h-11 w-full gap-2 rounded-2xl bg-teal-500 font-sans text-sm font-medium normal-case tracking-normal text-white hover:bg-teal-600"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <motion.span
                      className="inline-block h-2 w-2 rounded-full bg-primary-foreground"
                      animate={{ opacity: [0.35, 1, 0.35], scale: [0.9, 1, 0.9] }}
                      transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    Signing in…
                  </span>
                ) : (
                  <>
                    Sign in <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
