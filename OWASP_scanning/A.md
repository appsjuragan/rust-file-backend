# ZAP Scanning Report

ZAP by [Checkmarx](https://checkmarx.com/).


## Summary of Alerts

| Risk Level | Number of Alerts |
| --- | --- |
| High | 0 |
| Medium | 1 |
| Low | 0 |
| Informational | 2 |




## Insights

| Level | Reason | Site | Description | Statistic |
| --- | --- | --- | --- | --- |
| Info | Informational | http://myfiles1.thepihouse.my.id | Percentage of responses with status code 3xx | 50 % |
| Info | Informational | http://myfiles1.thepihouse.my.id | Percentage of responses with status code 4xx | 50 % |
| Info | Informational | https://myfiles1.thepihouse.my.id | Percentage of responses with status code 2xx | 4 % |
| Info | Informational | https://myfiles1.thepihouse.my.id | Percentage of responses with status code 4xx | 95 % |
| Info | Informational | https://myfiles1.thepihouse.my.id | Percentage of endpoints with method GET | 100 % |
| Info | Informational | https://myfiles1.thepihouse.my.id | Count of total endpoints | 3    |
| Info | Informational | https://myfiles1.thepihouse.my.id | Percentage of slow responses | 2 % |




## Alerts

| Name | Risk Level | Number of Instances |
| --- | --- | --- |
| Proxy Disclosure | Medium | 4 |
| CORS Header | Informational | 4 |
| Non-Storable Content | Informational | 3 |




## Alert Detail



### [ Proxy Disclosure ](https://www.zaproxy.org/docs/alerts/40025/)



##### Medium (Medium)

### Description

1 proxy server(s) were detected or fingerprinted. This information helps a potential attacker to determine
- A list of targets for an attack against the application.
 - Potential vulnerabilities on the proxy servers that service the application.
 - The presence or absence of any proxy-based components that might cause attacks against the application to be detected, prevented, or mitigated.

* URL: https://myfiles1.thepihouse.my.id
  * Node Name: `https://myfiles1.thepihouse.my.id`
  * Method: `GET`
  * Parameter: ``
  * Attack: `TRACE, OPTIONS methods with 'Max-Forwards' header. TRACK method.`
  * Evidence: ``
  * Other Info: `Using the TRACE, OPTIONS, and TRACK methods, the following proxy servers have been identified between ZAP and the application/web server:
- cloudflare
The following web/application server has been identified:
- cloudflare
`
* URL: https://myfiles1.thepihouse.my.id/
  * Node Name: `https://myfiles1.thepihouse.my.id/`
  * Method: `GET`
  * Parameter: ``
  * Attack: `TRACE, OPTIONS methods with 'Max-Forwards' header. TRACK method.`
  * Evidence: ``
  * Other Info: `Using the TRACE, OPTIONS, and TRACK methods, the following proxy servers have been identified between ZAP and the application/web server:
- cloudflare
The following web/application server has been identified:
- cloudflare
`
* URL: https://myfiles1.thepihouse.my.id/robots.txt
  * Node Name: `https://myfiles1.thepihouse.my.id/robots.txt`
  * Method: `GET`
  * Parameter: ``
  * Attack: `TRACE, OPTIONS methods with 'Max-Forwards' header. TRACK method.`
  * Evidence: ``
  * Other Info: `Using the TRACE, OPTIONS, and TRACK methods, the following proxy servers have been identified between ZAP and the application/web server:
- cloudflare
The following web/application server has been identified:
- cloudflare
`
* URL: https://myfiles1.thepihouse.my.id/sitemap.xml
  * Node Name: `https://myfiles1.thepihouse.my.id/sitemap.xml`
  * Method: `GET`
  * Parameter: ``
  * Attack: `TRACE, OPTIONS methods with 'Max-Forwards' header. TRACK method.`
  * Evidence: ``
  * Other Info: `Using the TRACE, OPTIONS, and TRACK methods, the following proxy servers have been identified between ZAP and the application/web server:
- cloudflare
The following web/application server has been identified:
- cloudflare
`


Instances: 4

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

### [ CORS Header ](https://www.zaproxy.org/docs/alerts/40040/)



##### Informational (High)

### Description

Cross-Origin Resource Sharing (CORS) is an HTTP-header based mechanism that allows a server to indicate any other origins (domain, scheme, or port) than its own from which a browser should permit loading of resources. It relaxes the Same-Origin Policy (SOP).

* URL: https://myfiles1.thepihouse.my.id
  * Node Name: `https://myfiles1.thepihouse.my.id`
  * Method: `GET`
  * Parameter: ``
  * Attack: `origin: https://myfiles1.thepihouse.my.id`
  * Evidence: `access-control-allow-origin: https://myfiles1.thepihouse.my.id`
  * Other Info: ``
* URL: https://myfiles1.thepihouse.my.id/
  * Node Name: `https://myfiles1.thepihouse.my.id/`
  * Method: `GET`
  * Parameter: ``
  * Attack: `origin: https://myfiles1.thepihouse.my.id`
  * Evidence: `access-control-allow-origin: https://myfiles1.thepihouse.my.id`
  * Other Info: ``
* URL: https://myfiles1.thepihouse.my.id/robots.txt
  * Node Name: `https://myfiles1.thepihouse.my.id/robots.txt`
  * Method: `GET`
  * Parameter: ``
  * Attack: `origin: https://myfiles1.thepihouse.my.id`
  * Evidence: `access-control-allow-origin: https://myfiles1.thepihouse.my.id`
  * Other Info: ``
* URL: https://myfiles1.thepihouse.my.id/sitemap.xml
  * Node Name: `https://myfiles1.thepihouse.my.id/sitemap.xml`
  * Method: `GET`
  * Parameter: ``
  * Attack: `origin: https://myfiles1.thepihouse.my.id`
  * Evidence: `access-control-allow-origin: https://myfiles1.thepihouse.my.id`
  * Other Info: ``


Instances: 4

### Solution

If a web resource contains sensitive information, the origin should be properly specified in the Access-Control-Allow-Origin header. Only trusted websites needing this resource should be specified in this header, with the most secured protocol supported.

### Reference


* [ https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS ](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
* [ https://portswigger.net/web-security/cors ](https://portswigger.net/web-security/cors)


#### CWE Id: [ 942 ](https://cwe.mitre.org/data/definitions/942.html)


#### WASC Id: 14

#### Source ID: 1

### [ Non-Storable Content ](https://www.zaproxy.org/docs/alerts/10049/)



##### Informational (Medium)

### Description

The response contents are not storable by caching components such as proxy servers. If the response does not contain sensitive, personal or user-specific information, it may benefit from being stored and cached, to improve performance.

* URL: https://myfiles1.thepihouse.my.id/
  * Node Name: `https://myfiles1.thepihouse.my.id/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `no-store`
  * Other Info: ``
* URL: https://myfiles1.thepihouse.my.id/robots.txt
  * Node Name: `https://myfiles1.thepihouse.my.id/robots.txt`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `no-store`
  * Other Info: ``
* URL: https://myfiles1.thepihouse.my.id/sitemap.xml
  * Node Name: `https://myfiles1.thepihouse.my.id/sitemap.xml`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `no-store`
  * Other Info: ``


Instances: 3

### Solution

The content may be marked as storable by ensuring that the following conditions are satisfied:
The request method must be understood by the cache and defined as being cacheable ("GET", "HEAD", and "POST" are currently defined as cacheable)
The response status code must be understood by the cache (one of the 1XX, 2XX, 3XX, 4XX, or 5XX response classes are generally understood)
The "no-store" cache directive must not appear in the request or response header fields
For caching by "shared" caches such as "proxy" caches, the "private" response directive must not appear in the response
For caching by "shared" caches such as "proxy" caches, the "Authorization" header field must not appear in the request, unless the response explicitly allows it (using one of the "must-revalidate", "public", or "s-maxage" Cache-Control response directives)
In addition to the conditions above, at least one of the following conditions must also be satisfied by the response:
It must contain an "Expires" header field
It must contain a "max-age" response directive
For "shared" caches such as "proxy" caches, it must contain a "s-maxage" response directive
It must contain a "Cache Control Extension" that allows it to be cached
It must have a status code that is defined as cacheable by default (200, 203, 204, 206, 300, 301, 404, 405, 410, 414, 501).

### Reference


* [ https://datatracker.ietf.org/doc/html/rfc7234 ](https://datatracker.ietf.org/doc/html/rfc7234)
* [ https://datatracker.ietf.org/doc/html/rfc7231 ](https://datatracker.ietf.org/doc/html/rfc7231)
* [ https://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html ](https://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html)


#### CWE Id: [ 524 ](https://cwe.mitre.org/data/definitions/524.html)


#### WASC Id: 13

#### Source ID: 3


