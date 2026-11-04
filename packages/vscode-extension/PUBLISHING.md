# Publishing the Crowsnest extension to the VS Code Marketplace

The extension is built, tested and packaged. What is left needs your Microsoft account, so it is listed here in
order. Allow about 30 minutes the first time.

## Before you start: check it works

```bash
cd packages/vscode-extension
npm run typecheck
npm test           # unit tests (89)
npm run test:e2e   # opens a real VS Code, loads the extension, checks the flags (10 checks)
npm run package    # builds crowsnest-vscode-<version>.vsix
```

`test:e2e` uses the VS Code already installed on your machine (set `CROWSNEST_VSCODE` to the executable if it is
not found) and a mock Crowsnest API, so it needs no backend and downloads nothing.

To look at it yourself instead: open `packages/vscode-extension` in VS Code, run `npm run compile`, press **F5**,
and in the new window open a `.ts` file that imports a package your backend scores above the threshold (50% by
default). The e2e fixtures in `test-e2e/fixtures` show the shape; their package names only exist in the mock API.

To try the packaged file exactly as a user would get it:

```bash
code --install-extension crowsnest-vscode-0.1.0.vsix
```

## One-time setup

1. **Create the publisher.** Go to https://marketplace.visualstudio.com/manage and choose *Create publisher*. Marketplace
   sign-in goes through a Microsoft account, and it may ask for an Azure DevOps organisation behind it.
   - The **ID** must equal `"publisher"` in `package.json`, which is `crowsnest`. IDs are global and permanent.
   - If `crowsnest` is taken, choose another ID, then change `"publisher"` in `package.json` and the extension ID
     `crowsnest.crowsnest-vscode` in `test-e2e/suite.ts` to match.
2. **Publish the first version by hand** (see below). Uploading the `.vsix` on the publisher page needs no token.
3. **Set up Trusted Publishing, so later versions need no token.** On the publisher page choose *Trusted Publishing*,
   then *Create*, and fill in:
   - Repository owner: `devampatel03`, and Repository: `Crowsnest`.
   - Workflow: `publish-vscode.yml`, and Environment: `vscode-marketplace` (the exact name).
4. **Create the GitHub environment.** Repository, Settings, Environments, New environment `vscode-marketplace`, and add
   yourself under *Required reviewers*. There is no secret to add.

Microsoft retires global Azure DevOps personal access tokens on 2026-12-01, so this guide no longer uses one.

## Every release

1. Update the version in `packages/vscode-extension/package.json` and add a section to `CHANGELOG.md`. If you tag a
   repo release, `scripts/release-check.mjs` wants every manifest version to match the tag.
2. Run the four checks above.
3. Publish, either way:
   - **From GitHub:** Actions, *Publish VS Code extension*, Run workflow. Leave *Dry run* ticked first. It builds
     the `.vsix` and attaches it to the run so you can download and test it. Run it again with *Dry run* unticked. It
     publishes with `vsce publish --oidc`, using the Trusted Publishing policy from step 3 above.
   - **By hand, no token:** `pnpm run package` builds `crowsnest-vscode-<version>.vsix`. Upload it at
     https://marketplace.visualstudio.com/manage (your publisher, *New extension*, *Visual Studio Code*). Use this for
     the very first version.
4. The listing goes live within a few minutes, after an automatic scan:
   https://marketplace.visualstudio.com/items?itemName=crowsnest.crowsnest-vscode
5. Check it: in VS Code open Extensions, search "Crowsnest", install, open a JavaScript file.


## Also publish to Open VSX (optional, recommended)

VSCodium, Cursor, Gitpod, Eclipse Theia and several others cannot use the Microsoft Marketplace and read
https://open-vsx.org instead.

1. Sign in at https://open-vsx.org with GitHub, then sign the publisher agreement on your profile page.
2. Create an access token under your profile settings.
3. One time: `npx ovsx@1.2.0 create-namespace crowsnest -p <token>`
4. Each release: `OVSX_PAT=<token> npm run publish:openvsx` (or tick *Also publish to Open VSX* in the workflow
   and add an `OVSX_PAT` secret).

## Rules the Marketplace enforces

- The README is the listing page. Images in it must be HTTPS and cannot be SVG. Ours has none.
- The `icon` must be a PNG of at least 128 by 128 pixels. `media/icon.png` is 256 by 256.
- A published version cannot be edited or republished. To fix something, bump the version. `vsce unpublish` exists
  but takes the listing down, so nobody can install or update it.
- Versions are plain `major.minor.patch`. For a trial release use `--pre-release` and an odd minor number
  (for example 0.3.0), keeping stable releases on even ones.
- Never commit a token (the Open VSX one, if you use it). If one leaks, revoke it straight away.

## Things to know before the first publish

- **The extension needs the Crowsnest backend.** With the default settings it talks to `http://localhost:8000`.
  Someone who installs it without the backend sees "Crowsnest (offline)" in the status bar and no flags. The
  README says this at the top, but it is the most likely cause of a one-star review. Consider linking a
  one-command start (Docker) from the listing once you are happy with it.
- **Only tested against VS Code 1.141.** `engines.vscode` is `^1.85.0` because the APIs used are old and stable,
  but 1.85 to 1.140 were not run.
- **Not tested on macOS or Linux.** The code uses no platform-specific calls, but only Windows was run.
- **Telemetry:** none. The README's privacy section states exactly what is sent.
