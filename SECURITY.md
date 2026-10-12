# Security policy

Crowsnest is a security tool, so we take reports about it seriously.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Use GitHub's private reporting instead:

1. Go to the [Security tab](https://github.com/devampatel03/Crowsnest/security) of the repository.
2. Choose **Report a vulnerability**.
3. Describe what you found, how to reproduce it, and what it could let someone do.

Only the maintainers can see the report. If you are unsure whether something counts, report it anyway.

## What to expect

Crowsnest is maintained by volunteers, so we cannot promise fixed response times. We aim to
acknowledge a report within a few days, keep you updated while we investigate, and credit you in the
release notes if you want that. Please give us reasonable time to ship a fix before you share
details publicly.

## Supported versions

Crowsnest is at version 0.1.0 and is early. Only the latest release, and the `main` branch, receive
security fixes.

| Version | Supported |
|---|---|
| Latest release and `main` | Yes |
| Anything older | No |

## Scope

In scope: the Python service, the dashboard, the command line tool, the Slack bot, the VS Code
extension, the Docker images, and the detection queries.

Out of scope: problems in third-party services Crowsnest talks to, and findings that need an
attacker to already control your machine.

## A note on running it

The dashboard has no login. Run it on your own machine or a trusted network, and do not expose
ports 3000 or 8000 to the internet.
