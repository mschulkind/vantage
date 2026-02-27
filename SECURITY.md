# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Vantage, please report it responsibly.

**Email:** mschulkind@gmail.com

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Response Timeline

- **Acknowledgment:** Within 48 hours
- **Initial assessment:** Within 1 week
- **Fix timeline:** Depends on severity, typically within 2 weeks for critical issues

## Scope

Vantage is designed to run on **localhost** serving local files. It does not include authentication or authorization. If you expose Vantage to a network, you do so at your own risk.

Security-relevant areas include:
- **Path traversal** — preventing access to files outside the served directory
- **Cross-site scripting (XSS)** — Markdown rendering must not execute arbitrary scripts
- **Command injection** — Git operations must not allow command injection
- **Information disclosure** — API responses must not leak server filesystem paths

## Supported Versions

Only the latest version on the `main` branch is supported with security fixes. There are no LTS releases at this time.

## Disclosure Policy

We follow coordinated disclosure. Please allow reasonable time for a fix before public disclosure.
