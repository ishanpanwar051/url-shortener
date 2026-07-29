import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';
declare const register: client.Registry<"text/plain; version=0.0.4; charset=utf-8">;
declare const urlCreatedTotal: client.Counter<string>;
declare const redirectTotal: client.Counter<"status" | "cached">;
declare const cacheHitTotal: client.Counter<"layer">;
declare const cacheMissTotal: client.Counter<"layer">;
declare const dbQueryDuration: client.Histogram<"operation">;
declare const redisOperationDuration: client.Histogram<"operation">;
declare const errorTotal: client.Counter<"type">;
export declare function metricsMiddleware(req: Request, res: Response, next: NextFunction): void;
export declare function metricsEndpoint(_req: Request, res: Response): Promise<void>;
export { urlCreatedTotal, redirectTotal, cacheHitTotal, cacheMissTotal, dbQueryDuration, redisOperationDuration, errorTotal, register, };
//# sourceMappingURL=metrics.d.ts.map