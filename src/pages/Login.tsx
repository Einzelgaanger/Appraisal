import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useEmployeeAuth } from '@/contexts/EmployeeAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { resolveLoginEmail } from '@/lib/loginEmail';
import { companyWorkspaceUrl, lookupSignedInCompanySlug } from '@/tenants/companyHome';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Mail, AlertCircle, ArrowRight, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import vggLogo from '@/assets/vgg-logo.webp';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitTick, setSubmitTick] = useState(0);
  const { login: legacyLogin } = useAuth();
  const { login: employeeLogin, refreshProfile } = useEmployeeAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitTick((t) => t + 1);
    setLoading(true);
    try {
      const emailNorm = email.trim().toLowerCase();
      const legacyEmail = import.meta.env.VITE_LEGACY_ADMIN_EMAIL?.trim().toLowerCase();
      const legacyPassword = import.meta.env.VITE_LEGACY_ADMIN_PASSWORD;

      const matchesLegacyDemo =
        !!legacyEmail &&
        !!legacyPassword &&
        emailNorm === legacyEmail &&
        password === legacyPassword;

      if (matchesLegacyDemo) {
        const legacyOk = await legacyLogin(email, password);
        if (legacyOk) {
          navigate('/dashboard');
          return;
        }
      }

      const loginEmail = await resolveLoginEmail(email);
      const { error: signInErr } = await employeeLogin(loginEmail, password);
      if (signInErr) {
        setError(
          loginEmail.toLowerCase() !== email.trim().toLowerCase()
            ? `That address now signs in as ${loginEmail}. The password was not accepted.`
            : 'Invalid credentials. Please try again.',
        );
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        setError('Unable to verify session. Please try again.');
        return;
      }

      const { data: adminRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (!adminRole) {
        await refreshProfile();
        const slug = await lookupSignedInCompanySlug();
        window.location.assign(slug ? companyWorkspaceUrl(slug, '/hub?tab=survey') : '/hub?tab=survey');
        return;
      }

      await refreshProfile();
      navigate('/dashboard');
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mobile-flow-shell app-page flex min-h-dvh-screen flex-col bg-background">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden lg:min-h-0">
        <motion.div
          key={submitTick}
          className="pointer-events-none absolute top-0 left-0 right-0 z-10 h-0.5 bg-primary/25 lg:left-0"
          initial={{ scaleX: 0, transformOrigin: '0% 50%' }}
          animate={
            loading
              ? { scaleX: [0.12, 0.55, 0.28, 0.72, 0.4, 0.95], transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } }
              : { scaleX: 1, opacity: 0, transition: { duration: 0.25 } }
          }
        />

        <div className="mobile-flow-header mobile-top-safe border-b border-foreground/10">
          <div className="flex items-center justify-between lg:hidden">
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 rounded-2xl font-sans text-sm font-medium normal-case tracking-normal text-muted-foreground" asChild>
              <Link to="/">
                <ArrowLeft className="h-4 w-4" /> Home
              </Link>
            </Button>
            <span className="text-sm text-muted-foreground">Admin sign in</span>
          </div>
          <div className="hidden lg:flex items-center justify-between">
            <span className="text-sm font-medium text-foreground/80">Restricted access</span>
            <span className="text-sm text-muted-foreground">Admin sign in</span>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col lg:justify-center lg:px-6 lg:py-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-1 flex-col min-h-0 w-full max-w-md mx-auto px-4 sm:px-6 lg:flex-none lg:justify-center"
          >
            <div className="mobile-flow-content px-0 py-2 sm:px-0 lg:overflow-visible lg:px-0 lg:py-0">
              <img src={vggLogo} alt="Venture Garden Group" className="h-6 w-auto mb-6 sm:mb-8" />

              <div className="mb-6 sm:mb-8">
                <span className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-[13px] font-medium text-sky-800">
                  Administrator
                </span>
                <h1 className="mt-3 font-display text-[1.75rem] font-semibold leading-tight sm:text-4xl">
                  Sign in
                </h1>
                <p className="mt-2 text-[13px] text-foreground/60 sm:text-sm">
                  VGG 360° Performance Analytics console.
                </p>
              </div>

              <form id="admin-login-form" onSubmit={handleSubmit} className="mobile-flow-card space-y-4.5 sm:space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-foreground/80">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@company.com"
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
                  <p className="text-[11px] text-muted-foreground">
                    Use the same email and password as the employee portal if your account has admin access, or the configured legacy admin credentials.
                  </p>
                  <Link to="/find-account" className="text-[11px] font-medium text-primary hover:underline">
                    Need help?
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

                <div className="hidden pb-1 lg:block">
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
                        Enter console <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>

              <p className="mt-3 px-1 text-sm text-muted-foreground">
                Protected administrator channel. Contact platform owner if access fails.
              </p>
            </div>

            <div className="mobile-flow-sticky-cta lg:hidden">
              <Button
                type="submit"
                form="admin-login-form"
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
                    Enter console <ArrowRight className="h-4 w-4" />
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
