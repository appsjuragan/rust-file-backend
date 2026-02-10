
@echo off
echo Starting OWASP ZAP Baseline Scan...
docker run -v %cd%:/zap/wrk/:rw -t zaproxy/zap-stable zap-baseline.py -t https://myfiles1.thepihouse.my.id/ -r OWASP_scanning/zap_report.html -J OWASP_scanning/zap_report.json -w OWASP_scanning/zap_report.md
echo Scan complete. Reports saved in OWASP_scanning folder.
pause
