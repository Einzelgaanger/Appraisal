/** Passwords that used to be handed to a whole company. They are not personal. */
const SHARED_DEMO_PASSWORDS = ['GhcDemo2026!', 'BoomEoDemo2026!', 'VigiPayDemo2026!'];

export function isSharedDemoPassword(password: string): boolean {
  return SHARED_DEMO_PASSWORDS.includes(password);
}

export const SHARED_PASSWORD_MESSAGE =
  'That password is shared across demo accounts. Choose a personal password.';
