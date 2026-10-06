import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, CheckCircle2, AlertCircle, Loader2, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import heroTeam from '@/assets/hero-team-mobile.jpg';
import { useTenant } from '@/tenants/TenantContext';
import { getTenantBrandAssets } from '@/tenants/brandingAssets';
import { isGhcStyleAppraisal } from '@/tenants/config';
import { isSharedDemoPassword, SHARED_PASSWORD_MESSAGE } from '@/lib/sharedPasswords';

/** Drop the consumed recovery token from the address bar, including an older fragment token. */
function stripTokensFromUrl() {
  const url = new URL(window.location.href);
  for (const key of ['token_hash', 'token', 'code', 'type']) url.searchParams.delete(key);
  window.history.replaceState({}, '', `${url.pathname}${url.search}`);
}

export default function ResetPassword() {
  const { tenant } = useTenant();
  const brand = getTenantBrandAssets(tenant);
  const ghc = isGhcStyleAppraisal(tenant);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [linkState, setLinkState] = useState<'verifying' | 'ready' | 'invalid'>('verifying');
  const [linkError, setLinkError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const settle = (state: 'ready' | 'invalid', message = '') => {
      if (cancelled) return;
      setLinkState(state);
      setLinkError(message);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) settle('ready');
    });

    void (async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ''));

      // An expired or already-used link arrives as a description in the fragment
      // rather than as a thrown error.
      const described = hash.get('error_description') ?? url.searchParams.get('error_description');
      if (described) {
        settle('invalid', described);
        return;
      }

      // Depending on how the email template and auth flow are configured, the
      // token reaches us as a verifiable hash, a PKCE code, or (handled by
      // detectSessionInUrl) an access token in the fragment. Accept all three so
      // the flow does not depend on one Supabase project setting.
      const tokenHash = url.searchParams.get('token_hash') ?? url.searchParams.get('token');
      const code = url.searchParams.get('code');
      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');

      // Links issued before the code flow still carry the session in the fragment.
      // Accept them once, then remove them from the address bar.
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        stripTokensFromUrl();
        settle(sessionError ? 'invalid' : 'ready', sessionError?.message ?? '');
        return;
      }

      if (tokenHash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        });
        stripTokensFromUrl();
        settle(verifyError ? 'invalid' : 'ready', verifyError?.message ?? '');
        return;
      }

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        stripTokensFromUrl();
        settle(exchangeError ? 'invalid' : 'ready', exchangeError?.message ?? '');
        return;
      }

      // detectSessionInUrl consumes the fragment asynchronously, so poll briefly
      // instead of declaring the link dead on the first miss.
      const deadline = Date.now() + 4000;
      while (!cancelled) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          stripTokensFromUrl();
          settle('ready');
          return;
        }
        if (Date.now() > deadline) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      settle('invalid');
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (isSharedDemoPassword(password)) {
      setError(SHARED_PASSWORD_MESSAGE);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="app-page flex min-h-dvh-screen items-center justify-center px-5 py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mobile-flow-card w-full max-w-sm text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
            className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5"
          >
            <CheckCircle2 className="w-7 h-7 text-primary" />
          </motion.div>
          <h1 className="text-xl font-semibold mb-1.5">Password set</h1>
          <p className="text-muted-foreground text-[13px] mb-5">
            Next, confirm a few profile details so we can place you in the right review pools.
          </p>
          <Button onClick={() => navigate('/hub')} className="w-full h-11 rounded-md text-sm">
            Continue to profile
          </Button>
        </motion.div>
      </div>
    );
  }

  if (linkState === 'verifying') {
    return (
      <div className="mobile-flow-shell app-page flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mobile-flow-card max-w-sm w-full text-center"
        >
          <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-4" />
          <h1 className="text-base font-semibold mb-1.5">Verifying Link</h1>
          <p className="text-muted-foreground text-[13px]">
            Please wait while we verify your reset link...
          </p>
        </motion.div>
      </div>
    );
  }

  if (linkState === 'invalid') {
    return (
      <div className="mobile-flow-shell app-page flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mobile-flow-card max-w-sm w-full text-center"
        >
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="mb-1.5 text-xl font-semibold">This link is no longer valid</h1>
          <p className="mb-5 text-[13px] text-muted-foreground">
            Password links expire after a short while and can only be used once. Request a fresh one
            and it will work straight away.
          </p>
          {linkError && (
            <p className="mb-5 rounded-md bg-muted/50 p-2.5 text-[11px] text-muted-foreground">
              {linkError}
            </p>
          )}
          <Button asChild className="h-11 w-full rounded-md text-sm">
            <Link to="/find-account">Send me a new link</Link>
          </Button>
          <Button asChild variant="ghost" className="mt-2 h-10 w-full text-sm">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="app-page flex min-h-dvh-screen flex-col">
      <div className="mobile-hero shrink-0">
        <img src={heroTeam} alt="Team collaboration at VGG" />
        <div className="mobile-hero-caption">
          <span>{ghc ? `◉ ${tenant.branding.fullName} / Activate` : '◉ VGG / Activate'}</span>
          <span>Auth / Set password</span>
        </div>
      </div>

      <div className="mobile-flow-header mobile-top-safe">
        <Button variant="ghost" size="sm" asChild className="gap-1.5 -ml-2 h-9">
          <Link to="/login">
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </Link>
        </Button>
      </div>

      <div className="flex flex-1 flex-col items-stretch justify-start px-4 py-4 sm:items-center sm:justify-center sm:px-6 sm:py-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md mobile-flow-card"
        >
          <div className="mb-6">
            <img src={brand.logoMark} alt={brand.logoAlt} className="h-8 w-auto mb-5 rounded-md object-contain" />
            <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center mb-3">
              <Lock className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-semibold">Set your new password</h1>
            <p className="text-muted-foreground mt-1 text-[13px]">
              Choose a secure password — you&apos;ll use this every time you sign in to{' '}
              {ghc ? `${tenant.branding.fullName} appraisal` : 'VGG Appraisals'}.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="space-y-2">
              <Label htmlFor="password" className="font-mono text-[9px] uppercase tracking-[0.16em] text-foreground/70">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Minimum 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 rounded-lg border-foreground/20 pl-10 pr-11 text-sm sm:rounded-sm"
                  required
                  minLength={8}
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

            <div className="space-y-2">
              <Label htmlFor="confirm" className="font-mono text-[9px] uppercase tracking-[0.16em] text-foreground/70">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="confirm"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Re-enter password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="h-10 rounded-lg border-foreground/20 pl-10 pr-11 text-sm sm:rounded-sm"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/50 hover:text-foreground"
                  aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">Use at least 8 characters with a mix of letters and numbers.</p>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[13px] sm:rounded-sm"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            <Button type="submit" disabled={loading} className="w-full h-11 rounded-md text-sm">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Set password & continue'}
            </Button>
          </form>

          <p className="mt-4 text-[11px] text-muted-foreground">
            Link expired? Go back to <Link to="/find-account" className="font-medium text-primary hover:underline">activate your account</Link> and request a new email.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
