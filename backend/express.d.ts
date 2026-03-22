import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by `requireAuth` after validating `Authorization: Bearer`. */
    userId?: string;
  }
}

export {};
