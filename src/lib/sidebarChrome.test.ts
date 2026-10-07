import { describe, expect, it } from 'vitest';
import {
  autoSidebarWidth,
  clampSidebarWidth,
  maxSidebarWidth,
  sidebarDensity,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
} from './sidebarChrome';

describe('sidebar chrome', () => {
  it('uses a tighter rail on short or narrow windows', () => {
    expect(autoSidebarWidth(1100, 900)).toBe(208);
    expect(autoSidebarWidth(1440, 700)).toBe(208);
    expect(autoSidebarWidth(1440, 820)).toBe(224);
    expect(autoSidebarWidth(1600, 1000)).toBe(240);
  });

  it('never lets the rail take more than about a fifth of a small screen', () => {
    expect(maxSidebarWidth(1024)).toBe(225);
    expect(maxSidebarWidth(1600)).toBe(SIDEBAR_MAX);
    expect(clampSidebarWidth(400, 1024)).toBe(225);
    expect(clampSidebarWidth(40, 1600)).toBe(SIDEBAR_MIN);
  });

  it('packs the chrome when the window is short', () => {
    expect(sidebarDensity(680)).toBe('tight');
    expect(sidebarDensity(800)).toBe('compact');
    expect(sidebarDensity(960)).toBe('regular');
  });
});
