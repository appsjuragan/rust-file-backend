
@echo off
echo Starting OWASP ZAP FULL Scan...
podman stop zap-security
podman rm zap-security
podman run --name zap-security -v %cd%:/zap/wrk/:rw -t zaproxy/zap-stable zap-full-scan.py -t https://myfiles.thepihouse.my.id/ -r zap_report.html -J zap_report.json -w zap_report.md >> test_report.txt
echo Scan complete. Reports saved in OWASP_scanning folder.
pause
