import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useEmployeeAuth } from '@/contexts/EmployeeAuthContext';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Search, ArrowLeft, CheckCircle2, AlertCircle, Loader2, Building2, Mail, X, ArrowRight,
} from 'lucide-react';
import heroTeam from '@/assets/hero-team-mobile.jpg';
import { useTenant } from '@/tenants/TenantContext';
import { getTenantBrandAssets } from '@/tenants/brandingAssets';
import { isGhcStyleAppraisal } from '@/tenants/config';

interface EmployeeResult {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  department: string | null;
  subsidiaries: { name: string } | null;
}

interface AccountCandidate {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  department: string | null;
  company_name: string | null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_ACCOUNT_QUERY = 3;

/** Who we are about to email. `name` is absent when the address was typed in directly. */
interface PendingReset {
  email: string;
  name: string | null;
}

export default function FindAccount() {
  const { tenant } = useTenant();
  const [searchParams] = useSearchParams();
  // Reached from "Forgot password?" rather than from first-time activation.
  const resetMode = searchParams.get('mode') === 'reset';
  const brand = getTenantBrandAssets(tenant);
  const ghc = isGhcStyleAppraisal(tenant);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<EmployeeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const { resetPassword } = useEmployeeAuth();
  const navigate = useNavigate();

  const searchAccounts = useCallback(async (query: string) => {
    const { data, error: err } = await supabase.rpc('find_account_candidates', { _query: query });
    if (err) throw err;
    return ((data ?? []) as AccountCandidate[]).map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      email: row.email,
      department: row.department,
      subsidiaries: row.company_name ? { name: row.company_name } : null,
    }));
  }, []);

  // Search on the server. A short or empty query returns nobody.
  useEffect(() => {
    const query = searchQuery.trim();

    const timeout = setTimeout(async () => {
      if (query.length < MIN_ACCOUNT_QUERY) {
        setResults([]);
        setHasSearched(false);
        setSearching(false);
        return;
      }

      setSearching(true);
      setError('');
      try {
        setResults(await searchAccounts(query));
        setHasSearched(true);
      } catch {
        setError('Search failed. Please try again.');
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [searchQuery, searchAccounts]);

  const [pendingReset, setPendingReset] = useState<PendingReset | null>(null);
  const query = searchQuery.trim();
  const typedEmail = query.toLowerCase();
  const queryIsEmail = EMAIL_PATTERN.test(typedEmail);

  const handleSelectEmployee = (employee: EmployeeResult) => {
    if (!employee.email) {
      setError('No email on file for this account. Please contact your administrator.');
      return;
    }
    setError('');
    setPendingReset({ email: employee.email, name: employee.name });
  };

  const handleConfirmSendReset = async () => {
    if (!pendingReset) return;
    setSending(true);
    setError('');
    try {
      const { error } = await resetPassword(pendingReset.email);
      if (error) throw new Error(error);
      setSent(true);
      setSentTo(pendingReset.email.replace(/(.{3})(.*)(@.*)/, '$1***$3'));
    } catch (err) {
      // Show the real reason — a throttled request otherwise looks the same as a
      // genuine failure, and both look the same as success to the person waiting.
      setError(err instanceof Error && err.message
        ? err.message
        : 'Failed to send reset email. Please try again.');
    } finally {
      setSending(false);
      setPendingReset(null);
    }
  };

  // Highlight matching text
  const highlightMatch = (text: string) => {
    const query = searchQuery.trim();
    if (!query) return text;
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    const parts = text.split(regex);
    const loweredQuery = query.toLowerCase();

    return parts.map((part, i) => (
      part.toLowerCase() === loweredQuery
        ? <mark key={i} className="bg-primary/20 text-primary font-semibold rounded-sm px-0.5">{part}</mark>
        : part
    ));
  };

  if (sent) {
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
            className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6"
          >
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </motion.div>
          <h1 className="text-xl font-semibold font-serif mb-1.5">Check your email</h1>
          <p className="text-muted-foreground text-[13px] mb-1">
            {resetMode ? "We've sent a password reset link to" : "We've sent an activation link to"}
          </p>
          <p className="text-foreground font-semibold text-[13px] mb-5 break-all">{sentTo}</p>
          <div className="space-y-2 text-left bg-muted/50 rounded-md p-3.5 mb-6">
            <p className="text-[11px] font-semibold text-foreground mb-1.5">What happens next:</p>
            <ol className="text-[11px] text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>Open the email and tap the link</li>
              <li>Set your new password</li>
              {resetMode
                ? <li>Sign in and pick up where you left off</li>
                : <li>Confirm your profile details, then start your appraisals</li>}
            </ol>
          </div>
          <Button onClick={() => navigate('/login')} className="w-full h-11 rounded-md text-sm">
            Back to sign in
          </Button>
          <p className="mt-4 text-[11px] text-muted-foreground">
            Didn't receive it? Check spam, or wait a minute and try again.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="app-page flex min-h-dvh-screen flex-col bg-background">
      <div className="mobile-hero shrink-0 max-h-[24vh]">
        <img src={heroTeam} alt="A team in collaboration" />
        <div className="mobile-hero-caption">
          <span>{ghc ? `◉ ${tenant.branding.fullName} — Account` : '◉ VGG / BOOM — Account'}</span>
          <span>Auth / 03</span>
        </div>
      </div>

      <div className="mobile-flow-header mobile-top-safe">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="gap-1.5 -ml-2 h-10">
            <ArrowLeft className="w-4 h-4" /> Home
          </Button>
          <span className="text-[10px] font-medium text-muted-foreground">Account recovery</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-stretch justify-start px-4 py-4 sm:items-center sm:justify-center sm:px-6 sm:py-5">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md mobile-flow-card"
        >
          <div className="mb-4">
            <img src={brand.logoMark} alt={brand.logoAlt} className="h-8 w-auto mb-5 rounded-md object-contain" />
            <h1 className="text-xl font-semibold mb-1">
              {resetMode ? 'Reset your password' : 'Activate your account'}
            </h1>
            <p className="text-muted-foreground text-[13px] leading-relaxed">
              {resetMode ? (
                <>
                  Enter your work email or find your name below, and we&apos;ll send you a link to set a
                  new password. The link works once and expires shortly after.
                </>
              ) : (
                <>
                  Find your name below — we&apos;ll email you a link to set your password and complete your profile. Then you can
                  access {ghc
                    ? `${tenant.branding.fullName} appraisal tasks (monthly reviews, peer 360, quarterly evaluations)`
                    : 'BOOM assessments (peer 360, executive self, monthly reflection)'} from the hub.
                </>
              )}
            </p>
          </div>

          {/* Search */}
          <div className="sticky top-0 z-10 -mx-1 mb-4 border-b border-border/70 bg-card px-1 pb-3 pt-1">
            <Label htmlFor="search" className="mb-2 block text-[10px] font-semibold text-foreground/70">Name or Email</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="e.g. John Doe or john@company.com"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 rounded-md border-foreground/20 pl-10 pr-16 text-sm"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-8 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {query.length < MIN_ACCOUNT_QUERY ? (
              <p className="mt-2 text-[11px] text-muted-foreground">Type at least 3 letters of your name or work email.</p>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">Tap your profile and we'll email you a link to set your password.</p>
            )}

            {/*
              Not everyone can find themselves in the directory — a missing record or
              a name spelt differently would otherwise be a dead end. Anyone who
              knows their work email can send the link straight to it.
            */}
            {queryIsEmail && (
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setPendingReset({ email: typedEmail, name: null });
                }}
                disabled={sending}
                className="mt-2.5 flex w-full items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 p-2.5 text-left transition-colors hover:bg-primary/10 disabled:opacity-50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Mail className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                  <span className="truncate text-[11px] text-foreground">
                    Email the link straight to <span className="font-semibold">{typedEmail}</span>
                  </span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
              </button>
            )}
          </div>

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[13px] mb-4 sm:rounded-sm"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </motion.div>
        )}

        {/* Results */}
        <AnimatePresence mode="wait">
          {hasSearched && results.length === 0 && !searching && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center py-8"
            >
              <Search className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-[13px] text-muted-foreground">No matching employees found.</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Try a different spelling, or type your work email above to have the link sent straight to it.
              </p>
            </motion.div>
          )}

          {results.length > 0 && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              <p className="text-[11px] text-muted-foreground font-medium mb-2.5">
                {results.length} result{results.length !== 1 ? 's' : ''} — pick your profile to receive your{' '}
                {resetMode ? 'password reset email' : 'activation email'}:
              </p>
              {query.length > 0 && (
                <p className="mb-2.5 text-[11px] text-foreground/70">
                  Searching for <span className="font-semibold text-foreground">{query}</span>
                </p>
              )}
              <div className="space-y-2">
                {results.map((emp) => (
                  <button
                    key={emp.id}
                    onClick={() => handleSelectEmployee(emp)}
                    disabled={sending}
                    className="w-full flex items-center justify-between p-3.5 rounded-md border border-border bg-card hover:bg-muted/50 hover:border-primary/40 transition-all text-left group disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-primary">
                          {emp.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium text-[13px] block truncate">{highlightMatch(emp.name)}</span>
                        {emp.email && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                            <Mail className="w-3 h-3 flex-shrink-0" />
                            {highlightMatch(emp.email)}
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3 flex-shrink-0" />
                          {emp.subsidiaries?.name || 'Unknown'}
                          {emp.department && ` · ${emp.department}`}
                        </span>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] text-primary opacity-80 group-hover:opacity-100 transition-opacity font-medium whitespace-nowrap ml-2">
                      That's me <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Confirmation Dialog */}
        <AnimatePresence>
          {pendingReset && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm px-3 pb-3 sm:items-center sm:px-4 sm:pb-0"
              onClick={() => !sending && setPendingReset(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm bg-card border border-border rounded-xl p-4 shadow-xl sm:rounded-sm"
              >
                <h2 className="text-base font-semibold mb-1">
                  {pendingReset.name ? 'Is this you?' : 'Send the link here?'}
                </h2>
                <p className="text-[13px] text-muted-foreground mb-4">
                  {resetMode
                    ? "We'll send a secure link to this email so you can set a new password."
                    : "We'll send a secure link to this email so you can set your new password and complete your profile."}
                </p>
                <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50 border border-border mb-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    {pendingReset.name ? (
                      <span className="text-xs font-semibold text-primary">
                        {pendingReset.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </span>
                    ) : (
                      <Mail className="h-3.5 w-3.5 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0">
                    {pendingReset.name && (
                      <p className="font-medium text-[13px] truncate">{pendingReset.name}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                      {pendingReset.name && <Mail className="w-3 h-3 flex-shrink-0" />}
                      <span className="truncate">
                        {pendingReset.name
                          ? pendingReset.email.replace(/(.{3})(.*)(@.*)/, '$1***$3')
                          : pendingReset.email}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-2.5">
                  <Button
                    variant="outline"
                    className="w-full h-11 text-sm sm:flex-1"
                    onClick={() => setPendingReset(null)}
                    disabled={sending}
                  >
                    {pendingReset.name ? 'Not me' : 'Cancel'}
                  </Button>
                  <Button
                    className="w-full h-11 text-sm sm:flex-1"
                    onClick={handleConfirmSendReset}
                    disabled={sending}
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Email me my link'}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

          <div className="mt-5 text-center">
            <Link to="/login" className="text-[13px] text-primary hover:underline font-medium">
              Already have a password? Sign in
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
