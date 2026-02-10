
const fs = require('fs');
const https = require('https');
const http = require('http');

const TARGET_URL = "https://myfiles1.thepihouse.my.id/";
const REPORT_FILE = "OWASP_scanning/quick_report.md";

async function checkHeaders(url) {
    console.log(`Scanning ${url}...`);

    try {
        const response = await fetch(url, { method: 'GET' });
        const headers = response.headers;

        let report = [
            "# OWASP Quick Scan Report",
            `Target: ${url}`,
            "",
            "## Security Headers Analysis"
        ];

        const securityHeaders = {
            "strict-transport-security": "Missing (HSTS ensures HTTPS usage)",
            "content-security-policy": "Missing (Mitigates XSS)",
            "x-frame-options": "Missing (Prevents Clickjacking)",
            "x-content-type-options": "Missing (Prevents MIME sniffing)",
            "referrer-policy": "Missing (Controls referrer information)",
            "permissions-policy": "Missing (Controls browser features)"
        };

        for (const [header, advice] of Object.entries(securityHeaders)) {
            if (headers.has(header)) {
                report.push(`- [OK] ${header}: ${headers.get(header)}`);
            } else {
                report.push(`- [FAIL] ${header}: ${advice}`);
            }
        }

        report.push("\n## Information Disclosure");
        if (headers.has("server")) {
            report.push(`- [WARN] Server Header Present: ${headers.get("server")} (Reveal potential tech stack)`);
        }
        if (headers.has("x-powered-by")) {
            report.push(`- [WARN] X-Powered-By Header Present: ${headers.get("x-powered-by")}`);
        }

        report.push("\n## Transport Security");
        if (url.startsWith("https")) {
            report.push("- [OK] Using HTTPS");
        } else {
            report.push("- [FAIL] Not using HTTPS");
        }

        // Write report
        fs.writeFileSync(REPORT_FILE, report.join("\n"));
        console.log(`Quick scan completed. Report saved to ${REPORT_FILE}`);

    } catch (error) {
        console.error("Error during scan:", error);
    }
}

checkHeaders(TARGET_URL);
