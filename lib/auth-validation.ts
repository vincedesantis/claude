const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

// Pure so it's testable without touching Supabase Auth. Returns an error
// message, or null if the input is acceptable to submit.
export function validateSignupInput(email: string, password: string, confirmPassword: string): string | null {
  if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address.";
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password !== confirmPassword) return "Passwords don't match.";
  return null;
}
