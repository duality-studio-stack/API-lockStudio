import { createClerkClient } from '@clerk/express';

if (!process.env.CLERK_SECRET_KEY) {
  throw new Error('CLERK_SECRET_KEY est requis');
}

export const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});
