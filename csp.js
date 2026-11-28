// script-src for HTML responses, so far in Report-Only mode: the browser runs everything as
// before and only reports what the policy would block (POST /api/csp-report, logged by
// app.js). Once the log stays quiet, the header can become Content-Security-Policy.
//
// The inline scripts are hashed from the HTML being sent rather than listed by hand: the SSR
// event replay bootstrap (`window.__jsaction_bootstrap(…)`) lists the event types of the
// components on the page, so it differs from page to page and between Angular versions.

const crypto = require("crypto");

const INLINE_SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
// Data blocks (TransferState, JSON-LD) are never executed, so CSP does not apply to them.
const DATA_BLOCK = /\btype\s*=\s*["']?application\/(?:ld\+)?json/i;

// Hosts of external scripts: the Google Maps loader and the libraries it pulls in.
const SCRIPT_HOSTS = ["https://maps.googleapis.com"];

const REPORT_PATH = "/api/csp-report";

/** `'sha256-…'` of every inline script of the document, in order, without repeats. */
function inlineScriptHashes(html) {
    const hashes = new Set();
    for (const [, attrs, body] of html.matchAll(INLINE_SCRIPT)) {
        if (/\bsrc\s*=/i.test(attrs) || DATA_BLOCK.test(attrs) || !body) continue;
        hashes.add(`'sha256-${crypto.createHash("sha256").update(body).digest("base64")}'`);
    }
    return [...hashes];
}

/** The Report-Only policy for this document. */
function scriptPolicy(html) {
    return [
        // 'report-sample': the report carries the first characters of a blocked inline script
        ["script-src", "'self'", ...inlineScriptHashes(html), ...SCRIPT_HOSTS, "'report-sample'"].join(" "),
        "object-src 'none'",
        "base-uri 'self'",
        `report-uri ${REPORT_PATH}`
    ].join("; ");
}

/** Sets the header on the response and hands the HTML back, for `.send(withScriptPolicy(…))`. */
function withScriptPolicy(res, html) {
    res.set("Content-Security-Policy-Report-Only", scriptPolicy(html));
    return html;
}

// One log line per distinct violation and process: a broken script on every page would
// otherwise repeat the same line for each visitor.
const MAX_LOGGED = 500;
const logged = new Set();

/** Logs a report body (report-uri format, or the Reporting API's list). */
function logReport(body) {
    const reports = Array.isArray(body) ? body.map(item => item && item.body) : [body && body["csp-report"]];
    for (const report of reports) {
        if (!report || typeof report !== "object") continue;
        const directive = report["effective-directive"] || report.effectiveDirective || report["violated-directive"];
        const blocked = report["blocked-uri"] || report.blockedURL || "";
        const source = report["source-file"] || report.sourceFile || "";
        const line = report["line-number"] || report.lineNumber || "";
        const sample = report["script-sample"] || report.sample || "";
        const page = report["document-uri"] || report.documentURL || "";
        const key = [directive, blocked, source, line, sample].join("|");
        if (logged.has(key) || logged.size >= MAX_LOGGED) continue;
        logged.add(key);
        console.log(
            new Date(),
            "[csp]",
            String(directive).slice(0, 40),
            "blocked:",
            String(blocked).slice(0, 200),
            "source:",
            `${String(source).slice(0, 200)}:${line}`,
            "sample:",
            JSON.stringify(String(sample).slice(0, 80)),
            "page:",
            String(page).slice(0, 200)
        );
    }
}

module.exports = { REPORT_PATH, inlineScriptHashes, scriptPolicy, withScriptPolicy, logReport };
