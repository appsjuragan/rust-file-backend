
import requests
import socket
import ssl
from urllib.parse import urlparse

TARGET_URL = "https://myfiles1.thepihouse.my.id/"

def check_headers_and_config(url):
    print(f"Scanning {url}...")
    try:
        response = requests.get(url, verify=True, timeout=10)
        headers = response.headers
        
        report = ["# OWASP Quick Scan Report",f"Target: {url}", ""]
        
        # 1. Security Headers
        security_headers = {
            "Strict-Transport-Security": "Missing (HSTS ensures HTTPS usage)",
            "Content-Security-Policy": "Missing (Mitigates XSS)",
            "X-Frame-Options": "Missing (Prevents Clickjacking)",
            "X-Content-Type-Options": "Missing (Prevents MIME sniffing)",
            "Referrer-Policy": "Missing (Controls referrer information)",
            "Permissions-Policy": "Missing (Controls browser features)"
        }
        
        report.append("## Security Headers Analysis")
        for header, advice in security_headers.items():
            if header in headers:
                report.append(f"- [OK] {header}: {headers[header]}")
            else:
                report.append(f"- [FAIL] {header}: {advice}")
        
        # 2. Server Information Disclosure
        report.append("\n## Information Disclosure")
        if "Server" in headers:
            report.append(f"- [WARN] Server Header Present: {headers['Server']} (Reveal potential tech stack)")
        if "X-Powered-By" in headers:
            report.append(f"- [WARN] X-Powered-By Header Present: {headers['X-Powered-By']}")
            
        # 3. Cookie Attributes
        report.append("\n## Cookie Security")
        if response.cookies:
            for cookie in response.cookies:
                secure = "Secure" if cookie.secure else "Not Secure"
                httponly = "HttpOnly" if cookie.has_nonstandard_attr("HttpOnly") or cookie.secure else "HttpOnly status unknown" # requests cookiejar handling varies
                # Checking HttpOnly manually is tricky with requests CookieJar, usually better to inspect specific attributes
                # Simplified check:
                report.append(f"- Cookie: {cookie.name}")
                if not cookie.secure:
                    report.append(f"  - [FAIL] Missing 'Secure' flag")
        else:
             report.append("- No cookies found")

        # 4. HTTPS (Basic Check)
        report.append("\n## Transport Security")
        if url.startswith("https"):
            report.append("- [OK] Using HTTPS")
            # Tries to connect to HTTP port 80 to see if it redirects
            try:
                http_url = url.replace("https://", "http://")
                r_http = requests.get(http_url, allow_redirects=False, timeout=5)
                if r_http.status_code in [301, 302, 307, 308] and r_http.headers.get('Location', '').startswith("https"):
                    report.append("- [OK] HTTP redirects to HTTPS")
                else:
                    report.append("- [FAIL] HTTP does not redirect to HTTPS (Status: {r_http.status_code})")
            except Exception as e:
                report.append(f"- [WARN] HTTP check failed: {e}")
                
        # Write Report
        with open("OWASP_scanning/quick_report.md", "w") as f:
            f.write("\n".join(report))
        print("Quick scan completed. Report saved to OWASP_scanning/quick_report.md")

    except Exception as e:
        print(f"Error during scan: {e}")

if __name__ == "__main__":
    check_headers_and_config(TARGET_URL)
