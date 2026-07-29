"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestIdMiddleware = requestIdMiddleware;
const crypto_1 = require("crypto");
function requestIdMiddleware(req, res, next) {
    const requestId = (0, crypto_1.randomUUID)();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
}
//# sourceMappingURL=requestId.js.map