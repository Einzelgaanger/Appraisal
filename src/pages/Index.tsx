import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import heroFeedbackSession from '@/assets/hero-feedback-session.jpg';
import vggLogo from '@/assets/vgg-logo.webp';

const Index = () => {
  return (
    <div className="app-page flex min-h-dvh-screen flex-col">
      <header
        className="mobile-top-safe flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-10 sm:py-4"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <img src={vggLogo} alt="VGG" className="h-6 w-auto sm:h-7" />
          <div className="hidden h-5 w-px bg-border sm:block" />
          <span className="font-mono hidden text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground sm:inline">
            ◉ VGG / BOOM — Executive Office
          </span>
        </div>
        <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:text-[10.5px] sm:tracking-[0.22em]">
          BOOM v2
        </span>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <div className="mobile-hero max-h-[36vh] shrink-0 lg:hidden">
          <img
            src={heroFeedbackSession}
            alt="Team reviewing performance analytics together"
          />
          <div className="mobile-hero-caption">
            <span>◉ Fig. 01</span>
            <span>Feedback, with data</span>
          </div>
        </div>

        <section className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-5 py-7 sm:px-12 sm:py-16 lg:px-20">
          <span className="eyebrow-primary">◉ BOOM — Executive Office appraisal</span>

          <h1 className="headline-collage display-serif mt-4 text-[clamp(1.85rem,7vw,5.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-foreground sm:mt-5">
            Peer 360, EPA, and <em>growth in one place.</em>
          </h1>

          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground sm:mt-6 sm:text-base">
            The live app opens on the guided intro at <span className="font-mono text-foreground/90">/</span>. Employees use{' '}
            <strong className="text-foreground/90">Survey</strong> for BOOM assignments, <strong className="text-foreground/90">Dashboard</strong> for scores,
            and optional AI insights where enabled. Admins use the console for releases, OKR text, and exports.
          </p>

          <div className="mt-8 hidden flex-col gap-2.5 sm:flex-row sm:gap-3 lg:flex">
            <Button variant="green" size="lg" asChild>
              <Link to="/login">Employee sign in</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link to="/onboarding">Explore programme</Link>
            </Button>
            <Button variant="ghost" size="lg" asChild>
              <Link to="/admin">Admin console</Link>
            </Button>
          </div>
        </section>

        <section className="relative hidden min-h-[360px] border-l border-border p-12 lg:block">
          <div className="ink-frame relative h-full w-full overflow-hidden">
            <img
              src={heroFeedbackSession}
              alt="Team reviewing performance analytics together, with subtle data overlay"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        </section>
      </main>

      {/* Mobile: primary actions docked for thumb reach */}
      <div className="mobile-flow-sticky-cta mt-auto flex flex-col gap-2 lg:hidden">
        <Button variant="green" size="lg" className="h-12 w-full rounded-xl text-base shadow-sm" asChild>
          <Link to="/login">Employee sign in</Link>
        </Button>
        <Button variant="outline" size="lg" className="h-12 w-full rounded-xl text-base" asChild>
          <Link to="/onboarding">Explore programme</Link>
        </Button>
        <Button variant="ghost" size="lg" className="h-11 w-full rounded-xl text-sm" asChild>
          <Link to="/admin">Admin console</Link>
        </Button>
      </div>

      <footer className="hidden items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-10 sm:py-4 lg:flex">
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:text-[10.5px] sm:tracking-[0.22em]">
          © Venture Garden Group
        </span>
        <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:text-[10.5px] sm:tracking-[0.22em]">
          vgg.tools
        </span>
      </footer>
    </div>
  );
};

export default Index;
