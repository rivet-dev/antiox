---
name: release
description: Bump version, build, test, commit, tag, push, and publish to npm. Use when the user asks to release, publish, cut a release, or bump the version.
---

# Release

## Usage
- `/release patch` / `minor` / `major` — semver bump from current version
- `/release 0.2.0` or `/release 0.2.0-rc.1` — exact version

## Workflow

### 1. Preflight
```bash
git branch --show-current        # must be main
git status --porcelain            # must be clean
git fetch origin main && git rev-parse HEAD && git rev-parse origin/main  # must match
```
Stop and report if any check fails.

### 2. Determine version
- `patch` / `minor` / `major`: strip any prerelease suffix from current `package.json` version, then bump (e.g. `0.1.0-rc.1` + patch = `0.1.1`)
- Exact version (e.g. `0.2.0`, `0.3.0-rc.1`): use as-is

### 3. Determine npm tag
- Check the latest stable (non-prerelease) version published on npm: `npm view antiox versions --json`
- If the target version has a prerelease suffix (contains `-`): use `--tag rc`
- If the target version is stable and greater than the current latest stable on npm: use `--tag latest`
- If the target version is stable but older than the current latest on npm: stop and warn the user (this would move the `latest` tag backwards)

Show the user: current version, target version, npm tag. Ask to confirm.

### 4. Build and test
```bash
pnpm build
pnpm check-types
pnpm test
```
Stop if any step fails.

### 5. Bump version
Update `version` in `package.json` to the target version.

### 6. Commit, tag, push
```bash
git add package.json
git commit -m "release: v<version>"
git tag v<version>
git push origin main
git push origin v<version>
```

### 7. Trigger GitHub release workflow
```bash
gh workflow run release.yml -f version=<version> -f npm-tag=<latest|rc>
```
This dispatches the `release.yml` workflow, which checks out the tag, builds, publishes to npm, and creates a GitHub release.

### 8. Report
Show the user: final commit hash, tag, and the link to the triggered workflow run.

## Rules
- Never skip git checks unless the user explicitly asks.
- Never force-push.
- Always build + test before publishing.
- Never publish to npm locally; always use the GitHub release workflow.
- If anything fails, stop and report — do not retry automatically.
