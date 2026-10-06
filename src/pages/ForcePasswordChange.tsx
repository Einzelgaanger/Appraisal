import { useState } from 'react';
import { useEmployeeAuth } from '@/contexts/EmployeeAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { isSharedDemoPassword, SHARED_PASSWORD_MESSAGE } from '@/lib/sharedPasswords';

export default function ForcePasswordChange() {
  const { user, updatePassword, refreshProfile, logout } = useEmployeeAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
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
      const { error: updateError } = await updatePassword(password);
      if (updateError) throw new Error(updateError);

      await (supabase as unknown as {
        rpc: (fn: string) => Promise<{ error: { message: string } | null }>;
      }).rpc('refresh_password_change_requirement');

      const { data, error: readError } = await supabase
        .from('profiles')
        .select('must_change_password')
        .eq('id', user?.id ?? '')
        .maybeSingle();
      if (readError) throw readError;
      if (data?.must_change_password) {
        setError(SHARED_PASSWORD_MESSAGE);
        return;
      }
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-page flex min-h-dvh-screen items-center justify-center px-5 py-8">
      <form onSubmit={handleSubmit} className="mobile-flow-card w-full max-w-sm">
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <Lock className="h-5 w-5 text-primary" />
        </div>
        <h1 className="mb-1 text-xl font-semibold">You're signed in</h1>
        <p className="mb-5 text-[13px] leading-relaxed text-muted-foreground">
          This account still uses a shared company password. Choose a personal one and the appraisal opens straight away.
        </p>

        <div className="space-y-3">
          <div>
            <Label htmlFor="new-password" className="mb-1.5 block text-[10px] font-semibold">New password</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-10 pr-10"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowPassword((shown) => !shown)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label htmlFor="confirm-password" className="mb-1.5 block text-[10px] font-semibold">Confirm password</Label>
            <Input
              id="confirm-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className="h-10"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 flex items-start gap-2 text-[12px] text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        <Button type="submit" className="mt-5 h-11 w-full" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save password'}
        </Button>
        <Button type="button" variant="ghost" className="mt-2 h-10 w-full" onClick={() => void logout()}>
          Sign out
        </Button>
      </form>
    </div>
  );
}
