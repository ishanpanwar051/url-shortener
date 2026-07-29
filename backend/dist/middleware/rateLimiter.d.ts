import { Request, Response, NextFunction } from 'express';
export declare function rateLimiter(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function authRateLimiter(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=rateLimiter.d.ts.map