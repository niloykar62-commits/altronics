import { z } from 'zod';

// ── Email validation ─────────────────────────────────────────────────────────────
// Validates email format, domain structure, and max length
export const emailSchema = z
  .string()
  .trim()
  .max(254, 'Email is too long')
  .refine(
    (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
    'Invalid email format'
  )
  .refine(
    (val) => {
      const domain = val.split('@')[1];
      if (!domain) return false;
      // Domain must have at least one dot and valid TLD
      const domainParts = domain.split('.');
      return domainParts.length >= 2 && domainParts[domainParts.length - 1].length >= 2;
    },
    'Invalid email domain'
  )
  .refine(
    (val) => !val.includes('..'),
    'Invalid email format'
  );

// ── Password validation ───────────────────────────────────────────────────────────
// Enforces: min 8 chars, max 72 chars (bcrypt limit), at least 3 of: uppercase, lowercase, number, special char
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password is too long (max 72 characters)')
  .refine(
    (val) => {
      const hasUpper = /[A-Z]/.test(val);
      const hasLower = /[a-z]/.test(val);
      const hasNumber = /[0-9]/.test(val);
      const hasSpecial = /[^A-Za-z0-9]/.test(val);
      const complexityCount = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
      return complexityCount >= 3;
    },
    'Password must contain at least 3 of: uppercase, lowercase, number, or special character'
  );

// ── Username validation ───────────────────────────────────────────────────────────
// Strict whitelist: alphanumeric, underscore, hyphen only. Max length 20.
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username must be at most 20 characters')
  .refine(
    (val) => /^[a-z0-9_-]+$/.test(val),
    'Username can only contain letters, numbers, underscores, and hyphens'
  )
  .refine(
    (val) => !val.startsWith('-') && !val.endsWith('-') && !val.startsWith('_') && !val.endsWith('_'),
    'Username cannot start or end with underscore or hyphen'
  );

// Reserved usernames list
export const RESERVED_USERNAMES = [
  'admin',
  'root',
  'altronics',
  'support',
  'help',
  'mod',
  'moderator',
  'system',
  'official',
  'staff',
  'api',
  'www',
  'mail',
  'email',
  'login',
  'signup',
  'auth',
  'account',
  'settings',
  'profile',
  'feed',
  'notifications',
  'messages',
  'search',
  'explore',
  'trending',
  'bookmarks',
  'circles',
  'stories',
  'post',
  'create',
  'edit',
  'delete',
  'update',
  'about',
  'terms',
  'privacy',
  'security',
];

// ── Full name / display name validation ───────────────────────────────────────────
// Strips HTML tags, max length 50
export const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Full name must be at least 2 characters')
  .max(50, 'Full name must be at most 50 characters')
  .transform((val) => {
    // Strip HTML tags to prevent XSS
    return val.replace(/<[^>]*>/g, '').trim();
  })
  .refine(
    (val) => val.length >= 2,
    'Full name is required'
  );

// ── Bio validation ───────────────────────────────────────────────────────────────
// Strips HTML tags, max length 150
export const bioSchema = z
  .string()
  .trim()
  .max(150, 'Bio must be at most 150 characters')
  .transform((val) => {
    // Strip HTML tags to prevent XSS
    return val.replace(/<[^>]*>/g, '').trim();
  })
  .optional();

// ── Phone number validation ───────────────────────────────────────────────────────
// Basic international format validation
export const phoneSchema = z
  .string()
  .trim()
  .refine(
    (val) => /^\+[1-9]\d{1,14}$/.test(val),
    'Invalid phone number format. Use international format: +8801XXXXXXXXX'
  );

// ── Signup schema ────────────────────────────────────────────────────────────────
export const signupSchema = z.object({
  fullName: fullNameSchema,
  username: usernameSchema.refine(
    (val) => !RESERVED_USERNAMES.includes(val),
    'This username is reserved'
  ),
  email: emailSchema,
  password: passwordSchema,
});

// ── Login schema ─────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

// ── Password reset schema ────────────────────────────────────────────────────────
export const passwordResetSchema = z.object({
  email: emailSchema,
});

// ── Profile update schema ────────────────────────────────────────────────────────
export const profileUpdateSchema = z.object({
  fullName: fullNameSchema.optional(),
  bio: bioSchema,
});

// ── Helper function to validate and return generic error ───────────────────────────
// Returns a generic error message to prevent account enumeration
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Log the actual error for debugging
      console.error('[Validation Error]', error.issues);
      // Return the first specific error message to help the user
      const firstError = error.issues[0]?.message || 'Invalid input. Please check your data and try again.';
      return { success: false, error: firstError };
    }
    return { success: false, error: 'Invalid request' };
  }
}
