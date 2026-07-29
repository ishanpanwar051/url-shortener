import { Request, Response, NextFunction } from 'express';
export interface AuthPayload {
    userId: number;
    email?: string;
    username?: string;
    role?: string;
}
declare global {
    namespace Express {
        interface Request {
            user?: AuthPayload;
            requestId: string;
        }
    }
}
export declare function generateToken(payload: AuthPayload): string;
export declare function blacklistToken(token: string): Promise<void>;
export declare function extractToken(req: Request): string | null;
export declare function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void>;
export declare function adminMiddleware(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=auth.d.ts.map