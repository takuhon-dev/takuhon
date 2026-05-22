# Security Policy

## Supported Versions

The Takuhon project is in an early development phase (pre-v1.0). Security fixes are applied to the latest `main` branch only. Once a stable release is published, this policy will be updated to cover supported version windows.

## Reporting a Vulnerability

Please **do not open a public GitHub issue** for security vulnerabilities.

The preferred reporting channel is GitHub Private Vulnerability Reporting (PVR):

> https://github.com/takuhon-dev/takuhon/security/advisories/new

If the PVR channel is unavailable to you (no GitHub account, or PVR not yet enabled when you read this), email the maintainers instead:

> **hello@takuhon.org**

Either channel works; PVR is preferred because it gives you a private threaded conversation with the maintainers and a clear path to CVE assignment.

Include:

- A clear description of the issue and its impact
- Steps to reproduce (proof-of-concept if possible)
- Affected version(s) / commit(s)
- Your suggested remediation (optional)

### Response timeline

We aim for:

- **Acknowledgement**: within 7 days of report
- **Initial assessment**: within 14 days
- **Fix or mitigation plan**: depends on severity, typically within 30–90 days

We follow **coordinated disclosure**. Once a fix is available, we will:

1. Coordinate a release window with the reporter
2. Publish a GitHub Security Advisory with a CVE if applicable
3. Credit the reporter (unless they prefer to remain anonymous)

## Scope

In scope:

- Code published from this repository (core, api, ui, cli, adapters)
- npm packages published from this repository
- CI / release infrastructure under this repository

Out of scope:

- Third-party dependencies (please report upstream)
- Self-hosted deployments (instance owners are responsible for their own deployment)
- Cloudflare / GitHub / npm platform security (please report to those vendors directly)

## Sensitive data

If your report contains profile data, credentials, or other sensitive information, please redact it before sending. We will work with you to obtain only the minimum reproduction information needed.
