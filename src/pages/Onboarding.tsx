import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronLeft, ArrowRight, Search, KeyRound } from 'lucide-react';
import { useTenant } from '@/tenants/TenantContext';
import { getTenantBrandAssets } from '@/tenants/brandingAssets';
import { isGhcTenant } from '@/tenants/config';
import heroFeedbackSession from '@/assets/hero-feedback-session.jpg';
import heroReflectionData from '@/assets/hero-reflection-data.jpg';
import heroTeam from '@/assets/hero-team-mobile.jpg';

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const SLIDE = { duration: 0.5, ease: EASE };

type SlideDef = {
  no: string;
  label: string;
  kicker: string;
  headlineHTML: string;
  body: string;
  image: string;
  caption: string;
};

const EO_SLIDES: SlideDef[] = [
  {
    no: '01',
    label: 'Overview',
    kicker: 'Executive Office — BOOM programme',
    headlineHTML: 'One hub for <em>EO performance.</em>',
    body:
      'Built for the Executive Office of the GCEO: BOOM peer 360 (anonymous aggregated results), quarterly executive self-assessment (EPA), monthly reflection, and optional multi-subsidiary survey — role-based assignments, one workspace after you sign in.',
    image: heroTeam,
    caption: 'Fig. 01 — EO performance workspace',
  },
  {
    no: '02',
    label: 'Inside the hub',
    kicker: 'Survey · Dashboard · Growth · Rankings',
    headlineHTML: 'Assignments first. <em>Insight second.</em>',
    body:
      'Open the Survey tab for your BOOM queue (peer reviews, executive form, EA or monthly tasks). My Dashboard shows legacy survey scores and/or released peer-360 averages by behaviour section. Growth Hub and Rankings turn feedback into development — HR controls when aggregate 360 is visible.',
    image: heroFeedbackSession,
    caption: 'Fig. 02 — Reviews and analytics together',
  },
  {
    no: '03',
    label: 'Access',
    kicker: 'Sign in securely',
    headlineHTML: 'Honest input. <em>Protected identity.</em>',
    body:
      'Sign in with your VGG email. Peer 360 ratings stay anonymous to reviewees; only consolidated averages surface on your dashboard. Use Find my account if you still need to activate your login.',
    image: heroReflectionData,
    caption: 'Fig. 03 — Secure access',
  },
];

const GHC_SLIDES: SlideDef[] = [
  {
    no: '01',
    label: 'Overview',
    kicker: 'GreenHouse Capital appraisal',
    headlineHTML: 'Monthly, 360, and <em>formal quarterly evals.</em>',
    body:
      'GreenHouse Capital runs on the same VGG platform with its own cadence: manager monthly reviews, anonymous peer 360, and scored quarterly evaluations (Culture /25 + Technical /5 + Growth /5).',
    image: heroTeam,
    caption: 'Fig. 01 — GHC appraisal workspace',
  },
  {
    no: '02',
    label: 'Inside the hub',
    kicker: 'Tasks · Results · Directory · Monitor',
    headlineHTML: 'Line-manager work. <em>Clear pools.</em>',
    body:
      'Tasks follow your reporting line. My results show released 360 themes, monthly reviews you received, and quarterly evaluation detail plus discussion. HR releases aggregates and finalises partner actions.',
    image: heroFeedbackSession,
    caption: 'Fig. 02 — GHC reviews and results',
  },
  {
    no: '03',
    label: 'Access',
    kicker: 'Sign in securely',
    headlineHTML: 'Your GHC login. <em>Your workspace.</em>',
    body:
      'Sign in with your GreenHouse Capital email. Use Find my account if you still need to activate. Live host: ghc.vgg.app.',
    image: heroReflectionData,
    caption: 'Fig. 03 — Secure GHC access',
  },
];

export default function Onboarding() {
  const { tenant } = useTenant();
  const brand = getTenantBrandAssets(tenant);
  const ghc = isGhcTenant(tenant);
  const slides = ghc ? GHC_SLIDES : EO_SLIDES;
  const [slide, setSlide] = useState(0);
  const navigate = useNavigate();

  const next = useCallback(() => setSlide((s) => Math.min(s + 1, slides.length - 1)), [slides.length]);
  const prev = useCallback(() => setSlide((s) => Math.max(s - 1, 0)), []);
  const current = slides[slide];
  const isLast = slide === slides.length - 1;
  const progress = ((slide + 1) / slides.length) * 100;

  return (
    <div className="mobile-flow-shell app-page flex min-h-dvh-screen flex-col">
      {/* Editorial masthead */}
      <header
        className="mobile-top-safe flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-10 sm:py-4"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <img src={brand.logoMark} alt={brand.logoAlt} className="h-7 w-auto sm:h-8 object-contain" />
          <div className="hidden h-5 w-px bg-border sm:block" />
          <span className="font-mono hidden sm:inline text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
            {ghc ? 'GreenHouse Capital · Appraisal' : 'VGG / BOOM — EO Appraisal'}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="font-mono hidden lg:inline text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
            {ghc ? 'GHC · 2026' : 'BOOM v2 · 2026'}
          </span>
          <Button variant="green" size="sm" className="h-8 px-3 text-xs" onClick={() => navigate(ghc ? '/login?tenant=ghc' : '/login')}>
            Sign In
          </Button>
        </div>
      </header>

      {/* Step strip */}
      <div className="border-b border-border bg-card/45 px-3 py-2.5 sm:px-0 sm:py-0">
        <div className="grid grid-cols-3 gap-2 pb-1.5 sm:gap-0 sm:pb-0">
          {slides.map((s, i) => {
            const active = i === slide;
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => setSlide(i)}
                className={`group flex min-h-[52px] min-w-0 items-center gap-2 rounded-md border border-border px-2.5 py-2.5 text-left transition-colors sm:min-h-[64px] sm:rounded-none sm:border-y-0 sm:border-l-0 sm:border-r sm:px-4 sm:py-3.5 sm:last:border-r-0 ${
                  active ? 'bg-secondary/75' : 'bg-card hover:bg-secondary/35'
                }`}
                aria-current={active ? 'step' : undefined}
              >
                <span
                  className={`numeral text-sm sm:text-base ${
                    active ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {s.no}
                </span>
                <div className="min-w-0">
                  <div className="text-[9px] font-medium text-muted-foreground sm:text-[10px]">
                    {i + 1} / {slides.length}
                  </div>
                  <div className="truncate text-[12px] font-semibold text-foreground sm:mt-0.5 sm:text-[13px]">
                    {s.label}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-1 w-full bg-border/60">
        <motion.div
          className="h-full bg-primary"
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.35, ease: EASE }}
        />
      </div>

      {/* Mobile: full-bleed slide imagery (desktop uses left column) */}
      <div className="relative border-b border-border bg-paper-deep/30 lg:hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.image}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SLIDE}
            className="relative aspect-[16/10] max-h-[34vh] w-full overflow-hidden"
          >
            <img
              src={current.image}
              alt={current.caption}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-background/85 px-4 py-2">
              <p className="text-[10px] font-medium text-muted-foreground">
                {current.caption}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Spread */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Left: editorial photo with caption */}
        <div className="relative order-2 hidden flex-1 flex-col bg-paper-deep/40 lg:order-1 lg:flex">
          <div className="flex items-center justify-between border-b border-border px-8 py-4">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
              Index {String(slide + 1).padStart(3, '0')} / 2026
            </span>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
              {current.kicker}
            </span>
          </div>

          <div className="relative flex-1 p-8 xl:p-12">
            <AnimatePresence mode="wait">
              <motion.div
                key={current.image}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={SLIDE}
                className="ink-frame relative h-full w-full overflow-hidden"
              >
                <img
                  src={current.image}
                  alt={current.caption}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between border-t border-border px-8 py-4">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
              {current.caption}
            </span>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
              № {current.no}
            </span>
          </div>
        </div>

        {/* Right: copy */}
        <div className="relative order-1 flex min-h-0 flex-1 flex-col justify-between overflow-hidden px-4 py-4 sm:px-8 sm:py-7 lg:order-2 lg:overflow-visible lg:py-14 xl:px-16">
          <AnimatePresence mode="wait">
            <motion.div
              key={slide}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={SLIDE}
              className="max-w-xl"
            >
              <span className="eyebrow-primary">◉ {current.kicker}</span>

              <h1
                className="headline-collage display-serif mt-2.5 text-[clamp(1.35rem,5.8vw,3.8rem)] font-semibold leading-[1] tracking-[-0.02em] text-foreground sm:mt-4"
                dangerouslySetInnerHTML={{ __html: current.headlineHTML }}
              />

              <p className="mt-3.5 max-w-md text-[13px] leading-relaxed text-muted-foreground sm:text-[14px]">
                {current.body}
              </p>

              {!isLast && (
                <div className="mt-5 rounded-md border border-border bg-card/80 p-3 sm:p-3.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                    Coming next
                  </p>
                  <p className="mt-1 text-[13px] text-foreground">
                    {slides[slide + 1].label}: {slides[slide + 1].kicker}
                  </p>
                </div>
              )}

              {isLast && (
                <div className="mt-6 grid grid-cols-1 gap-2 sm:mt-8 sm:grid-cols-2">
                  <Button size="lg" variant="green" onClick={() => navigate('/login')} className="h-9 w-full justify-center gap-1.5 rounded-md px-3.5 text-xs font-medium normal-case">
                    <KeyRound className="h-3.5 w-3.5" /> Sign in
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => navigate('/find-account')} className="h-9 w-full justify-center gap-1.5 rounded-md px-3.5 text-xs font-medium normal-case">
                    <Search className="h-3.5 w-3.5" /> Find my account
                  </Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Footer controls — sticky on small screens for thumb reach */}
          <div className="z-10 -mx-4 mt-6 flex items-center justify-between border-t border-border bg-background/95 px-4 pt-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/85 pb-safe sm:mx-0 sm:mt-9 sm:bg-transparent sm:px-0 sm:pt-5 sm:pb-0 sm:backdrop-blur-none lg:mt-10">
            <span className="rounded-md border border-border bg-card px-2 py-0.5 text-[9px] font-medium tracking-normal text-muted-foreground sm:text-[10px]">
              {String(slide + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={prev}
                disabled={slide === 0}
                aria-label="Previous"
                className="h-8 w-8 shrink-0 rounded-md"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              {isLast ? (
                <Button size="default" variant="green" onClick={() => navigate('/login')} className="h-8 min-w-[90px] rounded-md px-3 text-xs font-medium normal-case">
                  Enter
                </Button>
              ) : (
                <Button variant="default" size="default" onClick={next} aria-label="Next" className="h-8 rounded-md px-3 text-xs font-medium normal-case">
                  Next
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
