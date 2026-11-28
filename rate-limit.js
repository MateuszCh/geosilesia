// Per-IP request counters in memory, one fixed window each. No store shared between
// processes: every Passenger process counts on its own, so the real limit is the one set
// here times the number of processes – enough against a loop from one address, which is
// what this is for. req.ip comes from X-Forwarded-For through `trust proxy` (app.js).

// Above this many addresses the counters are dropped in one go instead of growing without
// bound (a flood from many addresses, an IPv6 range).
const MAX_KEYS = 50000;

function createRateLimit({ windowMs, max }) {
    let counts = new Map();
    let windowStart = Date.now();

    /** Counts one request of this address; false once it is over the limit for the window. */
    function hit(req) {
        const now = Date.now();
        if (now - windowStart >= windowMs || counts.size >= MAX_KEYS) {
            counts = new Map();
            windowStart = now;
        }
        const key = req.ip || "";
        const count = (counts.get(key) || 0) + 1;
        counts.set(key, count);
        return count <= max;
    }

    /** Express middleware: 429 with Retry-After once the address is over the limit. */
    function middleware(req, res, next) {
        if (hit(req)) return next();
        const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - Date.now()) / 1000));
        res.set("Retry-After", String(retryAfter));
        res.status(429).send({ error: "Too many requests" });
    }

    return { hit, middleware };
}

module.exports = { createRateLimit };
