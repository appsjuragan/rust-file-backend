# ZAP Scanning Report

ZAP by [Checkmarx](https://checkmarx.com/).


## Summary of Alerts

| Risk Level | Number of Alerts |
| --- | --- |
| High | 0 |
| Medium | 10 |
| Low | 5 |
| Informational | 6 |




## Insights

| Level | Reason | Site | Description | Statistic |
| --- | --- | --- | --- | --- |
| Low | Warning |  | ZAP warnings logged - see the zap.log file for details | 7    |
| Low | Exceeded High | https://myfiles.thepihouse.my.id | Percentage of responses with status code 4xx | 56 % |
| Low | Exceeded High | https://myfiles.thepihouse.my.id | Percentage of slow responses | 85 % |
| Info | Informational | http://myfiles.thepihouse.my.id | Percentage of responses with status code 2xx | 5 % |
| Info | Informational | http://myfiles.thepihouse.my.id | Percentage of responses with status code 3xx | 44 % |
| Info | Informational | http://myfiles.thepihouse.my.id | Percentage of responses with status code 4xx | 50 % |
| Info | Informational | http://myfiles.thepihouse.my.id | Percentage of endpoints with content type application/javascript | 100 % |
| Info | Informational | http://myfiles.thepihouse.my.id | Percentage of endpoints with method GET | 100 % |
| Info | Informational | http://myfiles.thepihouse.my.id | Count of total endpoints | 1    |
| Info | Informational | http://myfiles.thepihouse.my.id | Percentage of slow responses | 2 % |
| Info | Informational | https://bing.biturl.top | Percentage of responses with status code 2xx | 100 % |
| Info | Informational | https://bing.biturl.top | Percentage of slow responses | 100 % |
| Info | Informational | https://fonts.googleapis.com | Percentage of responses with status code 2xx | 100 % |
| Info | Informational | https://fonts.googleapis.com | Percentage of slow responses | 100 % |
| Info | Informational | https://fonts.gstatic.com | Percentage of responses with status code 2xx | 100 % |
| Info | Informational | https://fonts.gstatic.com | Percentage of slow responses | 100 % |
| Info | Informational | https://myfiles.thepihouse.my.id | Percentage of responses with status code 2xx | 37 % |
| Info | Informational | https://myfiles.thepihouse.my.id | Percentage of responses with status code 3xx | 5 % |
| Info | Informational | https://myfiles.thepihouse.my.id | Percentage of endpoints with content type application/javascript | 9 % |
| Info | Informational | https://myfiles.thepihouse.my.id | Percentage of endpoints with content type image/svg+xml | 4 % |
| Info | Informational | https://myfiles.thepihouse.my.id | Percentage of endpoints with content type text/css | 4 % |
| Info | Informational | https://myfiles.thepihouse.my.id | Percentage of endpoints with content type text/html | 77 % |
| Info | Informational | https://myfiles.thepihouse.my.id | Percentage of endpoints with method GET | 100 % |
| Info | Informational | https://myfiles.thepihouse.my.id | Count of total endpoints | 22    |
| Info | Informational | https://www.bing.com | Percentage of responses with status code 2xx | 100 % |
| Info | Informational | https://www.bing.com | Percentage of slow responses | 100 % |




## Alerts

| Name | Risk Level | Number of Instances |
| --- | --- | --- |
| Backup File Disclosure | Medium | 12 |
| Bypassing 403 | Medium | 1 |
| CSP: Failure to Define Directive with No Fallback | Medium | 2 |
| CSP: Wildcard Directive | Medium | 2 |
| CSP: script-src unsafe-eval | Medium | 2 |
| CSP: script-src unsafe-inline | Medium | 2 |
| CSP: style-src unsafe-inline | Medium | 2 |
| Content Security Policy (CSP) Header Not Set | Medium | 1 |
| Missing Anti-clickjacking Header | Medium | 1 |
| Proxy Disclosure | Medium | Systemic |
| HTTPS Content Available via HTTP | Low | 1 |
| Insufficient Site Isolation Against Spectre Vulnerability | Low | 7 |
| Permissions Policy Header Not Set | Low | 2 |
| Strict-Transport-Security Header Not Set | Low | 4 |
| X-Content-Type-Options Header Missing | Low | 3 |
| Information Disclosure - Suspicious Comments | Informational | 2 |
| Modern Web Application | Informational | 3 |
| Re-examine Cache-control Directives | Informational | 2 |
| Retrieved from Cache | Informational | 3 |
| Storable and Cacheable Content | Informational | Systemic |
| User Agent Fuzzer | Informational | Systemic |




## Alert Detail



### [ Backup File Disclosure ](https://www.zaproxy.org/docs/alerts/10095/)



##### Medium (Medium)

### Description

A backup of the file was disclosed by the web server.

* URL: https://myfiles.thepihouse.my.id/assets/Copy%2520(2&29%2520of%2520index-BhLaRAAs.css
  * Node Name: `https://myfiles.thepihouse.my.id/assets/Copy (2) of index-BhLaRAAs.css`
  * Method: `GET`
  * Parameter: ``
  * Attack: `https://myfiles.thepihouse.my.id/assets/Copy%20(2)%20of%20index-BhLaRAAs.css`
  * Evidence: ``
  * Other Info: `A backup of [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css] is available at [https://myfiles.thepihouse.my.id/assets/Copy%20(2)%20of%20index-BhLaRAAs.css]`
* URL: https://myfiles.thepihouse.my.id/assets/Copy%2520(3&29%2520of%2520index-BhLaRAAs.css
  * Node Name: `https://myfiles.thepihouse.my.id/assets/Copy (3) of index-BhLaRAAs.css`
  * Method: `GET`
  * Parameter: ``
  * Attack: `https://myfiles.thepihouse.my.id/assets/Copy%20(3)%20of%20index-BhLaRAAs.css`
  * Evidence: ``
  * Other Info: `A backup of [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css] is available at [https://myfiles.thepihouse.my.id/assets/Copy%20(3)%20of%20index-BhLaRAAs.css]`
* URL: https://myfiles.thepihouse.my.id/assets/Copy%2520of%2520index-BhLaRAAs.css
  * Node Name: `https://myfiles.thepihouse.my.id/assets/Copy of index-BhLaRAAs.css`
  * Method: `GET`
  * Parameter: ``
  * Attack: `https://myfiles.thepihouse.my.id/assets/Copy%20of%20index-BhLaRAAs.css`
  * Evidence: ``
  * Other Info: `A backup of [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css] is available at [https://myfiles.thepihouse.my.id/assets/Copy%20of%20index-BhLaRAAs.css]`
* URL: https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs%2520-%2520Copy%2520(2&29.css
  * Node Name: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs - Copy (2).css`
  * Method: `GET`
  * Parameter: ``
  * Attack: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs%20-%20Copy%20(2).css`
  * Evidence: ``
  * Other Info: `A backup of [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css] is available at [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs%20-%20Copy%20(2).css]`
* URL: https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs%2520-%2520Copy%2520(3&29.css
  * Node Name: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs - Copy (3).css`
  * Method: `GET`
  * Parameter: ``
  * Attack: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs%20-%20Copy%20(3).css`
  * Evidence: ``
  * Other Info: `A backup of [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css] is available at [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs%20-%20Copy%20(3).css]`
* URL: https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs%2520-%2520Copy.css
  * Node Name: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs - Copy.css`
  * Method: `GET`
  * Parameter: ``
  * Attack: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs%20-%20Copy.css`
  * Evidence: ``
  * Other Info: `A backup of [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css] is available at [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs%20-%20Copy.css]`
* URL: https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css.jar
  * Node Name: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css.jar`
  * Method: `GET`
  * Parameter: ``
  * Attack: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css.jar`
  * Evidence: ``
  * Other Info: `A backup of [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css] is available at [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css.jar]`
* URL: https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css.tar
  * Node Name: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css.tar`
  * Method: `GET`
  * Parameter: ``
  * Attack: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css.tar`
  * Evidence: ``
  * Other Info: `A backup of [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css] is available at [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css.tar]`
* URL: https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css.zip
  * Node Name: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css.zip`
  * Method: `GET`
  * Parameter: ``
  * Attack: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css.zip`
  * Evidence: ``
  * Other Info: `A backup of [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css] is available at [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css.zip]`
* URL: https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.jar
  * Node Name: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.jar`
  * Method: `GET`
  * Parameter: ``
  * Attack: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.jar`
  * Evidence: ``
  * Other Info: `A backup of [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css] is available at [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.jar]`
* URL: https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.zip
  * Node Name: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.zip`
  * Method: `GET`
  * Parameter: ``
  * Attack: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.zip`
  * Evidence: ``
  * Other Info: `A backup of [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css] is available at [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.zip]`
* URL: https://myfiles.thepihouse.my.id/assets/index-BhLaRAAsbackup.css
  * Node Name: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAsbackup.css`
  * Method: `GET`
  * Parameter: ``
  * Attack: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAsbackup.css`
  * Evidence: ``
  * Other Info: `A backup of [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css] is available at [https://myfiles.thepihouse.my.id/assets/index-BhLaRAAsbackup.css]`


Instances: 12

### Solution

Do not edit files in-situ on the web server, and ensure that un-necessary files (including hidden files) are removed from the web server.

### Reference


* [ https://cwe.mitre.org/data/definitions/530.html ](https://cwe.mitre.org/data/definitions/530.html)
* [ https://owasp.org/www-project-web-security-testing-guide/v41/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/04-Review_Old_Backup_and_Unreferenced_Files_for_Sensitive_Information.html ](https://owasp.org/www-project-web-security-testing-guide/v41/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/04-Review_Old_Backup_and_Unreferenced_Files_for_Sensitive_Information.html)


#### CWE Id: [ 530 ](https://cwe.mitre.org/data/definitions/530.html)


#### WASC Id: 34

#### Source ID: 1

### [ Bypassing 403 ](https://www.zaproxy.org/docs/alerts/40038/)



##### Medium (Medium)

### Description

Bypassing 403 endpoints may be possible, the scan rule sent a payload that caused the response to be accessible (status code 200).

* URL: https://myfiles.thepihouse.my.id/assets%2520/
  * Node Name: `https://myfiles.thepihouse.my.id/assets /`
  * Method: `GET`
  * Parameter: ``
  * Attack: `/assets%20/`
  * Evidence: ``
  * Other Info: `https://myfiles.thepihouse.my.id/assets`


Instances: 1

### Solution



### Reference


* [ https://www.acunetix.com/blog/articles/a-fresh-look-on-reverse-proxy-related-attacks/ ](https://www.acunetix.com/blog/articles/a-fresh-look-on-reverse-proxy-related-attacks/)
* [ https://i.blackhat.com/us-18/Wed-August-8/us-18-Orange-Tsai-Breaking-Parser-Logic-Take-Your-Path-Normalization-Off-And-Pop-0days-Out-2.pdf ](https://i.blackhat.com/us-18/Wed-August-8/us-18-Orange-Tsai-Breaking-Parser-Logic-Take-Your-Path-Normalization-Off-And-Pop-0days-Out-2.pdf)
* [ https://seclists.org/fulldisclosure/2011/Oct/273 ](https://seclists.org/fulldisclosure/2011/Oct/273)


#### CWE Id: [ 348 ](https://cwe.mitre.org/data/definitions/348.html)


#### Source ID: 1

### [ CSP: Failure to Define Directive with No Fallback ](https://www.zaproxy.org/docs/alerts/10055/)



##### Medium (High)

### Description

The Content Security Policy fails to define one of the directives that has no fallback. Missing/excluding them is the same as allowing anything.

* URL: https://myfiles.thepihouse.my.id/
  * Node Name: `https://myfiles.thepihouse.my.id/`
  * Method: `GET`
  * Parameter: `content-security-policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://www.bing.com; connect-src 'self' *; frame-ancestors 'none';`
  * Other Info: `The directive(s): form-action is/are among the directives that do not fallback to default-src.`
* URL: https://myfiles.thepihouse.my.id/sitemap.xml
  * Node Name: `https://myfiles.thepihouse.my.id/sitemap.xml`
  * Method: `GET`
  * Parameter: `content-security-policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://www.bing.com; connect-src 'self' *; frame-ancestors 'none';`
  * Other Info: `The directive(s): form-action is/are among the directives that do not fallback to default-src.`


Instances: 2

### Solution

Ensure that your web server, application server, load balancer, etc. is properly configured to set the Content-Security-Policy header.

### Reference


* [ https://www.w3.org/TR/CSP/ ](https://www.w3.org/TR/CSP/)
* [ https://caniuse.com/#search=content+security+policy ](https://caniuse.com/#search=content+security+policy)
* [ https://content-security-policy.com/ ](https://content-security-policy.com/)
* [ https://github.com/HtmlUnit/htmlunit-csp ](https://github.com/HtmlUnit/htmlunit-csp)
* [ https://web.dev/articles/csp#resource-options ](https://web.dev/articles/csp#resource-options)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 15

#### Source ID: 3

### [ CSP: Wildcard Directive ](https://www.zaproxy.org/docs/alerts/10055/)



##### Medium (High)

### Description

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks. Including (but not limited to) Cross Site Scripting (XSS), and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page — covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: https://myfiles.thepihouse.my.id/
  * Node Name: `https://myfiles.thepihouse.my.id/`
  * Method: `GET`
  * Parameter: `content-security-policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://www.bing.com; connect-src 'self' *; frame-ancestors 'none';`
  * Other Info: `The following directives either allow wildcard sources (or ancestors), are not defined, or are overly broadly defined:
connect-src`
* URL: https://myfiles.thepihouse.my.id/sitemap.xml
  * Node Name: `https://myfiles.thepihouse.my.id/sitemap.xml`
  * Method: `GET`
  * Parameter: `content-security-policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://www.bing.com; connect-src 'self' *; frame-ancestors 'none';`
  * Other Info: `The following directives either allow wildcard sources (or ancestors), are not defined, or are overly broadly defined:
connect-src`


Instances: 2

### Solution

Ensure that your web server, application server, load balancer, etc. is properly configured to set the Content-Security-Policy header.

### Reference


* [ https://www.w3.org/TR/CSP/ ](https://www.w3.org/TR/CSP/)
* [ https://caniuse.com/#search=content+security+policy ](https://caniuse.com/#search=content+security+policy)
* [ https://content-security-policy.com/ ](https://content-security-policy.com/)
* [ https://github.com/HtmlUnit/htmlunit-csp ](https://github.com/HtmlUnit/htmlunit-csp)
* [ https://web.dev/articles/csp#resource-options ](https://web.dev/articles/csp#resource-options)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 15

#### Source ID: 3

### [ CSP: script-src unsafe-eval ](https://www.zaproxy.org/docs/alerts/10055/)



##### Medium (High)

### Description

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks. Including (but not limited to) Cross Site Scripting (XSS), and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page — covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: https://myfiles.thepihouse.my.id/
  * Node Name: `https://myfiles.thepihouse.my.id/`
  * Method: `GET`
  * Parameter: `content-security-policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://www.bing.com; connect-src 'self' *; frame-ancestors 'none';`
  * Other Info: `script-src includes unsafe-eval.`
* URL: https://myfiles.thepihouse.my.id/sitemap.xml
  * Node Name: `https://myfiles.thepihouse.my.id/sitemap.xml`
  * Method: `GET`
  * Parameter: `content-security-policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://www.bing.com; connect-src 'self' *; frame-ancestors 'none';`
  * Other Info: `script-src includes unsafe-eval.`


Instances: 2

### Solution

Ensure that your web server, application server, load balancer, etc. is properly configured to set the Content-Security-Policy header.

### Reference


* [ https://www.w3.org/TR/CSP/ ](https://www.w3.org/TR/CSP/)
* [ https://caniuse.com/#search=content+security+policy ](https://caniuse.com/#search=content+security+policy)
* [ https://content-security-policy.com/ ](https://content-security-policy.com/)
* [ https://github.com/HtmlUnit/htmlunit-csp ](https://github.com/HtmlUnit/htmlunit-csp)
* [ https://web.dev/articles/csp#resource-options ](https://web.dev/articles/csp#resource-options)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 15

#### Source ID: 3

### [ CSP: script-src unsafe-inline ](https://www.zaproxy.org/docs/alerts/10055/)



##### Medium (High)

### Description

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks. Including (but not limited to) Cross Site Scripting (XSS), and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page — covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: https://myfiles.thepihouse.my.id/
  * Node Name: `https://myfiles.thepihouse.my.id/`
  * Method: `GET`
  * Parameter: `content-security-policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://www.bing.com; connect-src 'self' *; frame-ancestors 'none';`
  * Other Info: `script-src includes unsafe-inline.`
* URL: https://myfiles.thepihouse.my.id/sitemap.xml
  * Node Name: `https://myfiles.thepihouse.my.id/sitemap.xml`
  * Method: `GET`
  * Parameter: `content-security-policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://www.bing.com; connect-src 'self' *; frame-ancestors 'none';`
  * Other Info: `script-src includes unsafe-inline.`


Instances: 2

### Solution

Ensure that your web server, application server, load balancer, etc. is properly configured to set the Content-Security-Policy header.

### Reference


* [ https://www.w3.org/TR/CSP/ ](https://www.w3.org/TR/CSP/)
* [ https://caniuse.com/#search=content+security+policy ](https://caniuse.com/#search=content+security+policy)
* [ https://content-security-policy.com/ ](https://content-security-policy.com/)
* [ https://github.com/HtmlUnit/htmlunit-csp ](https://github.com/HtmlUnit/htmlunit-csp)
* [ https://web.dev/articles/csp#resource-options ](https://web.dev/articles/csp#resource-options)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 15

#### Source ID: 3

### [ CSP: style-src unsafe-inline ](https://www.zaproxy.org/docs/alerts/10055/)



##### Medium (High)

### Description

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks. Including (but not limited to) Cross Site Scripting (XSS), and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page — covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: https://myfiles.thepihouse.my.id/
  * Node Name: `https://myfiles.thepihouse.my.id/`
  * Method: `GET`
  * Parameter: `content-security-policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://www.bing.com; connect-src 'self' *; frame-ancestors 'none';`
  * Other Info: `style-src includes unsafe-inline.`
* URL: https://myfiles.thepihouse.my.id/sitemap.xml
  * Node Name: `https://myfiles.thepihouse.my.id/sitemap.xml`
  * Method: `GET`
  * Parameter: `content-security-policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://www.bing.com; connect-src 'self' *; frame-ancestors 'none';`
  * Other Info: `style-src includes unsafe-inline.`


Instances: 2

### Solution

Ensure that your web server, application server, load balancer, etc. is properly configured to set the Content-Security-Policy header.

### Reference


* [ https://www.w3.org/TR/CSP/ ](https://www.w3.org/TR/CSP/)
* [ https://caniuse.com/#search=content+security+policy ](https://caniuse.com/#search=content+security+policy)
* [ https://content-security-policy.com/ ](https://content-security-policy.com/)
* [ https://github.com/HtmlUnit/htmlunit-csp ](https://github.com/HtmlUnit/htmlunit-csp)
* [ https://web.dev/articles/csp#resource-options ](https://web.dev/articles/csp#resource-options)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 15

#### Source ID: 3

### [ Content Security Policy (CSP) Header Not Set ](https://www.zaproxy.org/docs/alerts/10038/)



##### Medium (High)

### Description

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks, including Cross Site Scripting (XSS) and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page — covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: https://myfiles.thepihouse.my.id/robots.txt
  * Node Name: `https://myfiles.thepihouse.my.id/robots.txt`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: ``


Instances: 1

### Solution

Ensure that your web server, application server, load balancer, etc. is configured to set the Content-Security-Policy header.

### Reference


* [ https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP ](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP)
* [ https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html ](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
* [ https://www.w3.org/TR/CSP/ ](https://www.w3.org/TR/CSP/)
* [ https://w3c.github.io/webappsec-csp/ ](https://w3c.github.io/webappsec-csp/)
* [ https://web.dev/articles/csp ](https://web.dev/articles/csp)
* [ https://caniuse.com/#feat=contentsecuritypolicy ](https://caniuse.com/#feat=contentsecuritypolicy)
* [ https://content-security-policy.com/ ](https://content-security-policy.com/)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 15

#### Source ID: 3

### [ Missing Anti-clickjacking Header ](https://www.zaproxy.org/docs/alerts/10020/)



##### Medium (Medium)

### Description

The response does not protect against 'ClickJacking' attacks. It should include either Content-Security-Policy with 'frame-ancestors' directive or X-Frame-Options.

* URL: https://myfiles.thepihouse.my.id/robots.txt
  * Node Name: `https://myfiles.thepihouse.my.id/robots.txt`
  * Method: `GET`
  * Parameter: `x-frame-options`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``


Instances: 1

### Solution

Modern Web browsers support the Content-Security-Policy and X-Frame-Options HTTP headers. Ensure one of them is set on all web pages returned by your site/app.
If you expect the page to be framed only by pages on your server (e.g. it's part of a FRAMESET) then you'll want to use SAMEORIGIN, otherwise if you never expect the page to be framed, you should use DENY. Alternatively consider implementing Content Security Policy's "frame-ancestors" directive.

### Reference


* [ https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options ](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options)


#### CWE Id: [ 1021 ](https://cwe.mitre.org/data/definitions/1021.html)


#### WASC Id: 15

#### Source ID: 3

### [ Proxy Disclosure ](https://www.zaproxy.org/docs/alerts/40025/)



##### Medium (Medium)

### Description

1 proxy server(s) were detected or fingerprinted. This information helps a potential attacker to determine
- A list of targets for an attack against the application.
 - Potential vulnerabilities on the proxy servers that service the application.
 - The presence or absence of any proxy-based components that might cause attacks against the application to be detected, prevented, or mitigated.

* URL: https://myfiles.thepihouse.my.id/
  * Node Name: `https://myfiles.thepihouse.my.id/`
  * Method: `GET`
  * Parameter: ``
  * Attack: `TRACE, OPTIONS methods with 'Max-Forwards' header. TRACK method.`
  * Evidence: ``
  * Other Info: `Using the TRACE, OPTIONS, and TRACK methods, the following proxy servers have been identified between ZAP and the application/web server:
- cloudflare
The following web/application server has been identified:
- cloudflare
`
* URL: https://myfiles.thepihouse.my.id/assets
  * Node Name: `https://myfiles.thepihouse.my.id/assets`
  * Method: `GET`
  * Parameter: ``
  * Attack: `TRACE, OPTIONS methods with 'Max-Forwards' header. TRACK method.`
  * Evidence: ``
  * Other Info: `Using the TRACE, OPTIONS, and TRACK methods, the following proxy servers have been identified between ZAP and the application/web server:
- cloudflare
The following web/application server has been identified:
- cloudflare
`
* URL: https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css
  * Node Name: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css`
  * Method: `GET`
  * Parameter: ``
  * Attack: `TRACE, OPTIONS methods with 'Max-Forwards' header. TRACK method.`
  * Evidence: ``
  * Other Info: `Using the TRACE, OPTIONS, and TRACK methods, the following proxy servers have been identified between ZAP and the application/web server:
- cloudflare
The following web/application server has been identified:
- cloudflare
`
* URL: https://myfiles.thepihouse.my.id/assets/index-DNlVwsws.js
  * Node Name: `https://myfiles.thepihouse.my.id/assets/index-DNlVwsws.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: `TRACE, OPTIONS methods with 'Max-Forwards' header. TRACK method.`
  * Evidence: ``
  * Other Info: `Using the TRACE, OPTIONS, and TRACK methods, the following proxy servers have been identified between ZAP and the application/web server:
- cloudflare
The following web/application server has been identified:
- cloudflare
`
* URL: https://myfiles.thepihouse.my.id/cdn-cgi
  * Node Name: `https://myfiles.thepihouse.my.id/cdn-cgi`
  * Method: `GET`
  * Parameter: ``
  * Attack: `TRACE, OPTIONS methods with 'Max-Forwards' header. TRACK method.`
  * Evidence: ``
  * Other Info: `Using the TRACE, OPTIONS, and TRACK methods, the following proxy servers have been identified between ZAP and the application/web server:
- cloudflare
The following web/application server has been identified:
- cloudflare
`

Instances: Systemic


### Solution

Disable the 'TRACE' method on the proxy servers, as well as the origin web/application server.
Disable the 'OPTIONS' method on the proxy servers, as well as the origin web/application server, if it is not required for other purposes, such as 'CORS' (Cross Origin Resource Sharing).
Configure the web and application servers with custom error pages, to prevent 'fingerprintable' product-specific error pages being leaked to the user in the event of HTTP errors, such as 'TRACK' requests for non-existent pages.
Configure all proxies, application servers, and web servers to prevent disclosure of the technology and version information in the 'Server' and 'X-Powered-By' HTTP response headers.


### Reference


* [ https://datatracker.ietf.org/doc/html/rfc7231#section-5.1.2 ](https://datatracker.ietf.org/doc/html/rfc7231#section-5.1.2)


#### CWE Id: [ 204 ](https://cwe.mitre.org/data/definitions/204.html)


#### WASC Id: 45

#### Source ID: 1

### [ HTTPS Content Available via HTTP ](https://www.zaproxy.org/docs/alerts/10047/)



##### Low (Medium)

### Description

Content which was initially accessed via HTTPS (i.e.: using SSL/TLS encryption) is also accessible via HTTP (without encryption).

* URL: https://myfiles.thepihouse.my.id/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js
  * Node Name: `http://myfiles.thepihouse.my.id/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `http://myfiles.thepihouse.my.id/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js`
  * Other Info: `ZAP attempted to connect via: http://myfiles.thepihouse.my.id/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js`


Instances: 1

### Solution

Ensure that your web server, application server, load balancer, etc. is configured to only serve such content via HTTPS. Consider implementing HTTP Strict Transport Security.

### Reference


* [ https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html ](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html)
* [ https://owasp.org/www-community/Security_Headers ](https://owasp.org/www-community/Security_Headers)
* [ https://en.wikipedia.org/wiki/HTTP_Strict_Transport_Security ](https://en.wikipedia.org/wiki/HTTP_Strict_Transport_Security)
* [ https://caniuse.com/stricttransportsecurity ](https://caniuse.com/stricttransportsecurity)
* [ https://datatracker.ietf.org/doc/html/rfc6797 ](https://datatracker.ietf.org/doc/html/rfc6797)


#### CWE Id: [ 311 ](https://cwe.mitre.org/data/definitions/311.html)


#### WASC Id: 4

#### Source ID: 1

### [ Insufficient Site Isolation Against Spectre Vulnerability ](https://www.zaproxy.org/docs/alerts/90004/)



##### Low (Medium)

### Description

Cross-Origin-Embedder-Policy header is a response header that prevents a document from loading any cross-origin resources that don't explicitly grant the document permission (using CORP or CORS).

* URL: https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css
  * Node Name: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css`
  * Method: `GET`
  * Parameter: `Cross-Origin-Resource-Policy`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://myfiles.thepihouse.my.id/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js
  * Node Name: `https://myfiles.thepihouse.my.id/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js`
  * Method: `GET`
  * Parameter: `Cross-Origin-Resource-Policy`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://myfiles.thepihouse.my.id/favicon.svg
  * Node Name: `https://myfiles.thepihouse.my.id/favicon.svg`
  * Method: `GET`
  * Parameter: `Cross-Origin-Resource-Policy`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://myfiles.thepihouse.my.id/robots.txt
  * Node Name: `https://myfiles.thepihouse.my.id/robots.txt`
  * Method: `GET`
  * Parameter: `Cross-Origin-Resource-Policy`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://myfiles.thepihouse.my.id/
  * Node Name: `https://myfiles.thepihouse.my.id/`
  * Method: `GET`
  * Parameter: `Cross-Origin-Embedder-Policy`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://myfiles.thepihouse.my.id/robots.txt
  * Node Name: `https://myfiles.thepihouse.my.id/robots.txt`
  * Method: `GET`
  * Parameter: `Cross-Origin-Embedder-Policy`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://myfiles.thepihouse.my.id/robots.txt
  * Node Name: `https://myfiles.thepihouse.my.id/robots.txt`
  * Method: `GET`
  * Parameter: `Cross-Origin-Opener-Policy`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``


Instances: 7

### Solution

Ensure that the application/web server sets the Cross-Origin-Embedder-Policy header appropriately, and that it sets the Cross-Origin-Embedder-Policy header to 'require-corp' for documents.
If possible, ensure that the end user uses a standards-compliant and modern web browser that supports the Cross-Origin-Embedder-Policy header (https://caniuse.com/mdn-http_headers_cross-origin-embedder-policy).

### Reference


* [ https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy ](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 14

#### Source ID: 3

### [ Permissions Policy Header Not Set ](https://www.zaproxy.org/docs/alerts/10063/)



##### Low (Medium)

### Description

Permissions Policy Header is an added layer of security that helps to restrict from unauthorized access or usage of browser/client features by web resources. This policy ensures the user privacy by limiting or specifying the features of the browsers can be used by the web resources. Permissions Policy provides a set of standard HTTP headers that allow website owners to limit which features of browsers can be used by the page such as camera, microphone, location, full screen etc.

* URL: https://myfiles.thepihouse.my.id/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js
  * Node Name: `https://myfiles.thepihouse.my.id/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://myfiles.thepihouse.my.id/robots.txt
  * Node Name: `https://myfiles.thepihouse.my.id/robots.txt`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: ``


Instances: 2

### Solution

Ensure that your web server, application server, load balancer, etc. is configured to set the Permissions-Policy header.

### Reference


* [ https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy ](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy)
* [ https://developer.chrome.com/blog/feature-policy/ ](https://developer.chrome.com/blog/feature-policy/)
* [ https://scotthelme.co.uk/a-new-security-header-feature-policy/ ](https://scotthelme.co.uk/a-new-security-header-feature-policy/)
* [ https://w3c.github.io/webappsec-feature-policy/ ](https://w3c.github.io/webappsec-feature-policy/)
* [ https://www.smashingmagazine.com/2018/12/feature-policy/ ](https://www.smashingmagazine.com/2018/12/feature-policy/)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 15

#### Source ID: 3

### [ Strict-Transport-Security Header Not Set ](https://www.zaproxy.org/docs/alerts/10035/)



##### Low (High)

### Description

HTTP Strict Transport Security (HSTS) is a web security policy mechanism whereby a web server declares that complying user agents (such as a web browser) are to interact with it using only secure HTTPS connections (i.e. HTTP layered over TLS/SSL). HSTS is an IETF standards track protocol and is specified in RFC 6797.

* URL: https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css
  * Node Name: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://myfiles.thepihouse.my.id/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js
  * Node Name: `https://myfiles.thepihouse.my.id/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://myfiles.thepihouse.my.id/favicon.svg
  * Node Name: `https://myfiles.thepihouse.my.id/favicon.svg`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://myfiles.thepihouse.my.id/robots.txt
  * Node Name: `https://myfiles.thepihouse.my.id/robots.txt`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: ``


Instances: 4

### Solution

Ensure that your web server, application server, load balancer, etc. is configured to enforce Strict-Transport-Security.

### Reference


* [ https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html ](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html)
* [ https://owasp.org/www-community/Security_Headers ](https://owasp.org/www-community/Security_Headers)
* [ https://en.wikipedia.org/wiki/HTTP_Strict_Transport_Security ](https://en.wikipedia.org/wiki/HTTP_Strict_Transport_Security)
* [ https://caniuse.com/stricttransportsecurity ](https://caniuse.com/stricttransportsecurity)
* [ https://datatracker.ietf.org/doc/html/rfc6797 ](https://datatracker.ietf.org/doc/html/rfc6797)


#### CWE Id: [ 319 ](https://cwe.mitre.org/data/definitions/319.html)


#### WASC Id: 15

#### Source ID: 3

### [ X-Content-Type-Options Header Missing ](https://www.zaproxy.org/docs/alerts/10021/)



##### Low (Medium)

### Description

The Anti-MIME-Sniffing header X-Content-Type-Options was not set to 'nosniff'. This allows older versions of Internet Explorer and Chrome to perform MIME-sniffing on the response body, potentially causing the response body to be interpreted and displayed as a content type other than the declared content type. Current (early 2014) and legacy versions of Firefox will use the declared content type (if one is set), rather than performing MIME-sniffing.

* URL: https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css
  * Node Name: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css`
  * Method: `GET`
  * Parameter: `x-content-type-options`
  * Attack: ``
  * Evidence: ``
  * Other Info: `This issue still applies to error type pages (401, 403, 500, etc.) as those pages are often still affected by injection issues, in which case there is still concern for browsers sniffing pages away from their actual content type.
At "High" threshold this scan rule will not alert on client or server error responses.`
* URL: https://myfiles.thepihouse.my.id/favicon.svg
  * Node Name: `https://myfiles.thepihouse.my.id/favicon.svg`
  * Method: `GET`
  * Parameter: `x-content-type-options`
  * Attack: ``
  * Evidence: ``
  * Other Info: `This issue still applies to error type pages (401, 403, 500, etc.) as those pages are often still affected by injection issues, in which case there is still concern for browsers sniffing pages away from their actual content type.
At "High" threshold this scan rule will not alert on client or server error responses.`
* URL: https://myfiles.thepihouse.my.id/robots.txt
  * Node Name: `https://myfiles.thepihouse.my.id/robots.txt`
  * Method: `GET`
  * Parameter: `x-content-type-options`
  * Attack: ``
  * Evidence: ``
  * Other Info: `This issue still applies to error type pages (401, 403, 500, etc.) as those pages are often still affected by injection issues, in which case there is still concern for browsers sniffing pages away from their actual content type.
At "High" threshold this scan rule will not alert on client or server error responses.`


Instances: 3

### Solution

Ensure that the application/web server sets the Content-Type header appropriately, and that it sets the X-Content-Type-Options header to 'nosniff' for all web pages.
If possible, ensure that the end user uses a standards-compliant and modern web browser that does not perform MIME-sniffing at all, or that can be directed by the web application/web server to not perform MIME-sniffing.

### Reference


* [ https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/compatibility/gg622941(v=vs.85) ](https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/compatibility/gg622941(v=vs.85))
* [ https://owasp.org/www-community/Security_Headers ](https://owasp.org/www-community/Security_Headers)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 15

#### Source ID: 3

### [ Information Disclosure - Suspicious Comments ](https://www.zaproxy.org/docs/alerts/10027/)



##### Informational (Low)

### Description

The response appears to contain suspicious comments which may help an attacker.

* URL: https://myfiles.thepihouse.my.id/assets/index-DNlVwsws.js
  * Node Name: `https://myfiles.thepihouse.my.id/assets/index-DNlVwsws.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `select`
  * Other Info: `The following pattern was used: \bSELECT\b and was detected in likely comment: "//www.w3.org/2000/svg";case"math":return"http://www.w3.org/1998/Math/MathML";default:return"http://www.w3.org/1999/xhtml"}}funct", see evidence field for the suspicious comment/snippet.`
* URL: https://myfiles.thepihouse.my.id/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js
  * Node Name: `https://myfiles.thepihouse.my.id/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `from`
  * Other Info: `The following pattern was used: \bFROM\b and was detected in likely comment: "//www.w3.org/2000/svg",E={"application/ecmascript":!0,"application/javascript":!0,"application/x-ecmascript":!0,"application/x-j", see evidence field for the suspicious comment/snippet.`


Instances: 2

### Solution

Remove all comments that return information that may help an attacker and fix any underlying problems they refer to.

### Reference



#### CWE Id: [ 615 ](https://cwe.mitre.org/data/definitions/615.html)


#### WASC Id: 13

#### Source ID: 3

### [ Modern Web Application ](https://www.zaproxy.org/docs/alerts/10109/)



##### Informational (Medium)

### Description

The application appears to be a modern web application. If you need to explore it automatically then the Ajax Spider may well be more effective than the standard one.

* URL: https://myfiles.thepihouse.my.id/
  * Node Name: `https://myfiles.thepihouse.my.id/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script type="4eb2d37706d1c4ec17324b65-text/javascript">
    (function () {
      try {
        var theme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
          document.documentElement.style.backgroundColor = '#0f172a';
        } else {
          document.documentElement.classList.remove('dark');
          document.documentElement.style.backgroundColor = '#f8fafc';
        }
      } catch (e) { }
    })();
  </script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`
* URL: https://myfiles.thepihouse.my.id/
  * Node Name: `https://myfiles.thepihouse.my.id/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script>
    (function () {
      try {
        var theme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
          document.documentElement.style.backgroundColor = '#0f172a';
        } else {
          document.documentElement.classList.remove('dark');
          document.documentElement.style.backgroundColor = '#f8fafc';
        }
      } catch (e) { }
    })();
  </script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`
* URL: https://myfiles.thepihouse.my.id/robots.txt
  * Node Name: `https://myfiles.thepihouse.my.id/robots.txt`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script type="e88ef86743c6323cd7bcb4a2-text/javascript">
    (function () {
      try {
        var theme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
          document.documentElement.style.backgroundColor = '#0f172a';
        } else {
          document.documentElement.classList.remove('dark');
          document.documentElement.style.backgroundColor = '#f8fafc';
        }
      } catch (e) { }
    })();
  </script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`


Instances: 3

### Solution

This is an informational alert and so no changes are required.

### Reference




#### Source ID: 3

### [ Re-examine Cache-control Directives ](https://www.zaproxy.org/docs/alerts/10015/)



##### Informational (Low)

### Description

The cache-control header has not been set properly or is missing, allowing the browser and proxies to cache content. For static assets like css, js, or image files this might be intended, however, the resources should be reviewed to ensure that no sensitive content will be cached.

* URL: https://myfiles.thepihouse.my.id/
  * Node Name: `https://myfiles.thepihouse.my.id/`
  * Method: `GET`
  * Parameter: `cache-control`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://myfiles.thepihouse.my.id/robots.txt
  * Node Name: `https://myfiles.thepihouse.my.id/robots.txt`
  * Method: `GET`
  * Parameter: `cache-control`
  * Attack: ``
  * Evidence: `max-age=14400`
  * Other Info: ``


Instances: 2

### Solution

For secure content, ensure the cache-control HTTP header is set with "no-cache, no-store, must-revalidate". If an asset should be cached consider setting the directives "public, max-age, immutable".

### Reference


* [ https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#web-content-caching ](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#web-content-caching)
* [ https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control ](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control)
* [ https://grayduck.mn/2021/09/13/cache-control-recommendations/ ](https://grayduck.mn/2021/09/13/cache-control-recommendations/)


#### CWE Id: [ 525 ](https://cwe.mitre.org/data/definitions/525.html)


#### WASC Id: 13

#### Source ID: 3

### [ Retrieved from Cache ](https://www.zaproxy.org/docs/alerts/10050/)



##### Informational (Medium)

### Description

The content was retrieved from a shared cache. If the response data is sensitive, personal or user-specific, this may result in sensitive information being leaked. In some cases, this may even result in a user gaining complete control of the session of another user, depending on the configuration of the caching components in use in their environment. This is primarily an issue where caching servers such as "proxy" caches are configured on the local network. This configuration is typically found in corporate or educational environments, for instance.

* URL: https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css
  * Node Name: `https://myfiles.thepihouse.my.id/assets/index-BhLaRAAs.css`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `Age: 3861`
  * Other Info: `The presence of the 'Age' header indicates that a HTTP/1.1 compliant caching server is in use.`
* URL: https://myfiles.thepihouse.my.id/favicon.svg
  * Node Name: `https://myfiles.thepihouse.my.id/favicon.svg`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `Age: 5015`
  * Other Info: `The presence of the 'Age' header indicates that a HTTP/1.1 compliant caching server is in use.`
* URL: https://myfiles.thepihouse.my.id/robots.txt
  * Node Name: `https://myfiles.thepihouse.my.id/robots.txt`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `Age: 3861`
  * Other Info: `The presence of the 'Age' header indicates that a HTTP/1.1 compliant caching server is in use.`


Instances: 3

### Solution

Validate that the response does not contain sensitive, personal or user-specific information. If it does, consider the use of the following HTTP response headers, to limit, or prevent the content being stored and retrieved from the cache by another user:
Cache-Control: no-cache, no-store, must-revalidate, private
Pragma: no-cache
Expires: 0
This configuration directs both HTTP 1.0 and HTTP 1.1 compliant caching servers to not store the response, and to not retrieve the response (without validation) from the cache, in response to a similar request.

### Reference


* [ https://datatracker.ietf.org/doc/html/rfc7234 ](https://datatracker.ietf.org/doc/html/rfc7234)
* [ https://datatracker.ietf.org/doc/html/rfc7231 ](https://datatracker.ietf.org/doc/html/rfc7231)
* [ https://www.rfc-editor.org/rfc/rfc9110.html ](https://www.rfc-editor.org/rfc/rfc9110.html)


#### CWE Id: [ 525 ](https://cwe.mitre.org/data/definitions/525.html)


#### Source ID: 3

### [ Storable and Cacheable Content ](https://www.zaproxy.org/docs/alerts/10049/)



##### Informational (Medium)

### Description

The response contents are storable by caching components such as proxy servers, and may be retrieved directly from the cache, rather than from the origin server by the caching servers, in response to similar requests from other users. If the response data is sensitive, personal or user-specific, this may result in sensitive information being leaked. In some cases, this may even result in a user gaining complete control of the session of another user, depending on the configuration of the caching components in use in their environment. This is primarily an issue where "shared" caching servers such as "proxy" caches are configured on the local network. This configuration is typically found in corporate or educational environments, for instance.

* URL: https://myfiles.thepihouse.my.id/
  * Node Name: `https://myfiles.thepihouse.my.id/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: `In the absence of an explicitly specified caching lifetime directive in the response, a liberal lifetime heuristic of 1 year was assumed. This is permitted by rfc7234.`
* URL: https://myfiles.thepihouse.my.id/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js
  * Node Name: `https://myfiles.thepihouse.my.id/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `Tue, 10 Feb 2026 20:50:18 GMT`
  * Other Info: ``
* URL: https://myfiles.thepihouse.my.id/favicon.svg
  * Node Name: `https://myfiles.thepihouse.my.id/favicon.svg`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=14400`
  * Other Info: ``
* URL: https://myfiles.thepihouse.my.id/robots.txt
  * Node Name: `https://myfiles.thepihouse.my.id/robots.txt`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=14400`
  * Other Info: ``
* URL: https://myfiles.thepihouse.my.id/sitemap.xml
  * Node Name: `https://myfiles.thepihouse.my.id/sitemap.xml`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: `In the absence of an explicitly specified caching lifetime directive in the response, a liberal lifetime heuristic of 1 year was assumed. This is permitted by rfc7234.`

Instances: Systemic


### Solution

Validate that the response does not contain sensitive, personal or user-specific information. If it does, consider the use of the following HTTP response headers, to limit, or prevent the content being stored and retrieved from the cache by another user:
Cache-Control: no-cache, no-store, must-revalidate, private
Pragma: no-cache
Expires: 0
This configuration directs both HTTP 1.0 and HTTP 1.1 compliant caching servers to not store the response, and to not retrieve the response (without validation) from the cache, in response to a similar request.

### Reference


* [ https://datatracker.ietf.org/doc/html/rfc7234 ](https://datatracker.ietf.org/doc/html/rfc7234)
* [ https://datatracker.ietf.org/doc/html/rfc7231 ](https://datatracker.ietf.org/doc/html/rfc7231)
* [ https://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html ](https://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html)


#### CWE Id: [ 524 ](https://cwe.mitre.org/data/definitions/524.html)


#### WASC Id: 13

#### Source ID: 3

### [ User Agent Fuzzer ](https://www.zaproxy.org/docs/alerts/10104/)



##### Informational (Medium)

### Description

Check for differences in response based on fuzzed User Agent (eg. mobile sites, access as a Search Engine Crawler). Compares the response statuscode and the hashcode of the response body with the original response.

* URL: https://myfiles.thepihouse.my.id
  * Node Name: `https://myfiles.thepihouse.my.id`
  * Method: `GET`
  * Parameter: `Header User-Agent`
  * Attack: `Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.0)`
  * Evidence: ``
  * Other Info: ``
* URL: https://myfiles.thepihouse.my.id
  * Node Name: `https://myfiles.thepihouse.my.id`
  * Method: `GET`
  * Parameter: `Header User-Agent`
  * Attack: `Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.1)`
  * Evidence: ``
  * Other Info: ``
* URL: https://myfiles.thepihouse.my.id/
  * Node Name: `https://myfiles.thepihouse.my.id/`
  * Method: `GET`
  * Parameter: `Header User-Agent`
  * Attack: `Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)`
  * Evidence: ``
  * Other Info: ``
* URL: https://myfiles.thepihouse.my.id/
  * Node Name: `https://myfiles.thepihouse.my.id/`
  * Method: `GET`
  * Parameter: `Header User-Agent`
  * Attack: `Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.0)`
  * Evidence: ``
  * Other Info: ``
* URL: https://myfiles.thepihouse.my.id/
  * Node Name: `https://myfiles.thepihouse.my.id/`
  * Method: `GET`
  * Parameter: `Header User-Agent`
  * Attack: `Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.1)`
  * Evidence: ``
  * Other Info: ``

Instances: Systemic


### Solution



### Reference


* [ https://owasp.org/wstg ](https://owasp.org/wstg)



#### Source ID: 1


