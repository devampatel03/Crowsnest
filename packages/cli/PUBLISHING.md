# Publishing `@crowsnest/cli` to npm

Everything in the repo is ready. These are the steps only you can do, in order.

## One-time setup (about 10 minutes)

1. **Get an npm account** at https://www.npmjs.com/signup and turn on two-factor authentication. npm requires it
   for publishing.
2. **Claim the `@crowsnest` scope.** Create a free organisation named `crowsnest` at
   https://www.npmjs.com/org/create (public packages are free).
   - The plain name `crowsnest` is taken by an unrelated project, so the scope is required.
   - If `crowsnest` is already taken as an organisation, pick another scope or use the unscoped
     name `crowsnest-cli`, which was free when checked on 2026-10-13. Then change `"name"` in
     `packages/cli/package.json` and update the install line in `packages/cli/README.md`.
3. **Create a stage-only token.** npm, Access Tokens, Generate New Token, *Granular access token*.
   - Packages and scopes: **Read and write (stage only)**, and select only the `@crowsnest` scope.
   - Organizations: **No access**. Publishing a package does not need it.
   - Leave *Allowed IP ranges* empty (GitHub's runners change address), and pick a short expiry. Copy the token once.
   - A stage-only token cannot publish. It can only stage a version, and you approve that version yourself with
     two-factor authentication. npm rejects a direct `npm publish` with it (error `E_STAGE_REQUIRED`).
   - Needs npm 11.15 or newer and Node 22.14 or newer, which the workflow sets up. npm plans to retire direct
     publishing with 2FA-bypass tokens in January 2027, so this is the route that keeps working.
4. **Add it to GitHub.** Repository, Settings, Environments, New environment named `npm`. Add a secret
   `NPM_TOKEN` with the token. Under *Required reviewers*, add yourself, so every publish needs your click.

## Every release

1. Bump the version in `packages/cli/package.json`. `scripts/release-check.mjs` expects every manifest
   (root, cli, dashboard, slack-bot, vscode-extension, `pyproject.toml`) and `CHANGELOG.md` to agree with the
   `vX.Y.Z` tag, so bump them together. For the very first release the versions already read `0.1.0`; rename
   `## [Unreleased]` in `CHANGELOG.md` to `## [0.1.0] - <date>`. Check with `node scripts/release-check.mjs v0.1.0`.
2. Push the tag. The existing `Release` workflow creates the GitHub release, and the `Publish API image` workflow
   pushes the backend image to `ghcr.io/devampatel03/crowsnest-api:<version>`. `crowsnest start` pulls exactly that
   image, so **publish the CLI only after the image exists and is public**:
   - Wait for the `Publish API image` run to finish (it builds, scans and starts the image before pushing).
   - The first time only: GitHub, your profile, Packages, `crowsnest-api`, Package settings, change visibility to
     **Public**. GitHub creates new packages as private.
   - Check it anonymously: `docker logout ghcr.io && docker pull ghcr.io/devampatel03/crowsnest-api:<version>`.
3. Actions, **Publish CLI to npm**, Run workflow.
   - Leave *Dry run* ticked first. It lints, tests, builds and prints exactly which files would ship.
   - Run it again with *Dry run* unticked. It **stages** the version, and the log ends with the staged list. It
     refuses a version that already exists. Nothing is public yet.
4. **Approve it.** On your own machine, signed in to npm with 2FA on (npm 11.15 or newer):
   ```bash
   npm stage list @crowsnest/cli          # shows the stage id
   npm stage view <stage-id>              # look at what would ship
   npm stage approve <stage-id>           # asks for your 2FA code; the version goes live
   ```
   Use `npm stage reject <stage-id>` to throw it away, then fix the problem and stage again.
5. Check: `npm view @crowsnest/cli`, then in an empty folder `npx @crowsnest/cli --version`.

The published package carries a provenance statement, so people can see it was built from this repository.

## Publishing by hand instead

```bash
cd packages/cli
npm login
npm publish --dry-run     # lint, test and build run first via prepublishOnly; read the file list
npm publish               # access is already set to public; asks for your 2FA code
```

This uses your own login and 2FA code, not the stage-only token, so it is fine for a first publish if the workflow
gives trouble.

## Things to know before the first publish

- **The CLI needs a backend.** It only talks to a Crowsnest backend (Python, DuckDB), which is not in this package.
  The README says so and points to the main quickstart, and a failed connection now explains what to do.
  If you want `npx @crowsnest/cli scan` to work with no other setup, the backend would have to be hosted
  or shipped some other way. That is a product decision, not a packaging one.
- **A published version cannot be changed.** `npm unpublish` is only allowed for 72 hours and breaks anyone
  who installed it. Use a dry run first, and fix mistakes by publishing a new version.
- **`config set` stores keys in plain text** in the user's config folder. The README tells people to prefer
  environment variables for secrets.
