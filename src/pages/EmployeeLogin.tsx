import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEmployeeAuth } from '@/contexts/EmployeeAuthContext';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Mail, AlertCircle, ArrowLeft, ArrowRight, Eye, EyeOff } from 'lucide-react';
import vggLogo from '@/assets/vgg-logo.webp';
import { useTenant } from '@/tenants/TenantContext';

export default function EmployeeLogin() {
  const { tenant } = useTenant();
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
  const afterLogin = returnTo ? `${returnTo.pathname}${returnTo.search ?? ''}` : '/hub?tab=survey';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitTick((t) => t + 1);
    setLoading(true);
    try {
      const { error } = await login(email, password);
      if (error) setError(error);
      else {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setError('Sign-in succeeded but the session was not saved. Check that cookies/storage are allowed and try again.');
          return;
        }
        window.location.assign(afterLogin);
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
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="gap-1.5 -ml-2 h-9">
              <ArrowLeft className="h-4 w-4" /> Home
            </Button>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-foreground/50">
              Employee / 02
            </span>
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
              <img src={vggLogo} alt="Venture Garden Group" className="h-6 w-auto mb-6 sm:mb-8" />

              <div className="mb-6 sm:mb-8">
                <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-foreground/60">
                  Employee
                </span>
                <h1 className="mt-2.5 font-serif text-[1.65rem] font-semibold leading-[1.0] tracking-[-0.02em] sm:text-[2.35rem] sm:leading-[0.98]">
                  Welcome back.
                </h1>
                <p className="mt-2 text-[13px] text-foreground/60 sm:text-sm leading-relaxed">
                  {tenant.branding.workspaceLabel} - after sign-in you&apos;ll open your appraisal hub with tasks, dashboard, and growth tools based on your role. Secure employee access only.
                </p>
              </div>

              <form id="employee-login-form" onSubmit={handleSubmit} className="mobile-flow-card space-y-4.5 sm:space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="font-mono text-[9px] uppercase tracking-[0.16em] text-foreground/70">
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
                      className="h-11 pl-10 rounded-lg border-foreground/20 bg-background text-sm sm:rounded-sm"
                      inputMode="email"
                      autoComplete="username"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="font-mono text-[9px] uppercase tracking-[0.16em] text-foreground/70">
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
                      className="h-11 pl-10 pr-11 rounded-lg border-foreground/20 bg-background text-sm sm:rounded-sm"
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
                  <Link to="/find-account" className="text-[11px] font-medium text-primary hover:underline">
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
                  <Button type="submit" disabled={loading} className="h-10 w-full gap-2 text-sm font-semibold transition-transform active:scale-[0.98]">
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
                        Sign In <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>

              <div className="mt-5 flex flex-col gap-1.5 border-t border-foreground/10 px-1 pt-4 sm:mt-7 sm:flex-row sm:items-center sm:justify-between lg:mt-9">
                <Link
                  to="/find-account"
                  className="inline-flex min-h-10 items-center font-mono text-[9px] uppercase tracking-[0.16em] text-foreground/70 hover:text-foreground"
                >
                  First time? → Find your account
                </Link>
                <Link
                  to="/admin"
                  className="inline-flex min-h-10 items-center font-mono text-[9px] uppercase tracking-[0.16em] text-foreground/50 hover:text-foreground"
                >
                  Admin sign-in →
                </Link>
              </div>
            </div>

            <div className="mobile-flow-sticky-cta lg:hidden">
              <Button
                type="submit"
                form="employee-login-form"
                disabled={loading}
                className="h-10 w-full gap-2 rounded-lg text-sm font-semibold shadow-sm active:scale-[0.98] sm:rounded-sm"
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
                    Sign In <ArrowRight className="h-4 w-4" />
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
