---
allowed-tools: Bash(git:*), Bash(gh:*)
argument-hint: [optional release title]
description: Open the release pull request from development into main (production)
---

## Context

- Current branch: !`git branch --show-current`
- Commits on development not on main: !`git fetch -pq origin 2>/dev/null; git log origin/main..origin/development --oneline`
- Changed files: !`git diff origin/main...origin/development --stat`
- Migrations in this release: !`git diff origin/main...origin/development --name-only -- supabase/migrations/ || echo none`
- Open release PR: !`gh pr list --base main --state open --json number,headRefName,url --jq '.[] | "#\(.number)  \(.headRefName)  \(.url)"' 2>/dev/null || echo none`

## Task

Open the release pull request that takes `development` into `main`. **This ships to players**: `main` is the live
site. Releasing is Pavel's call; this command prepares the PR, it never merges.

### Refuse in these cases

- **Nothing on `development` that is not on `main`.** No release to make.
- **A release PR is already open.** Report its URL instead.

### Before creating it

1. **Ask whether `development` has been tried** on its Vercel preview: menus, a lesson start to finish, free flight,
   sign-in. This is the last gate before players.
2. **If the release contains migrations**, name each one and say whether it is already applied (the database is
   shared, see `CONTRIBUTING.md`) and that it works with the code now on `main`.

### Steps

1. Cut a release branch exactly at `origin/development`:
   `git fetch -pq origin && git push origin origin/development:refs/heads/release/<UTC yyyymmdd-hhmm>`
2. Write the body to a file in the scratchpad, then:
   `gh pr create --base main --head release/<time> --title "<title>" --body-file <file>`
   - **Title**: `$ARGUMENTS` if given, otherwise `Release: <two or three themes>`.
   - **Body**: group the commits by theme; for each, what changed and why it matters. Then a section with
     migrations (or "none"), anything to do after deploy (Vercel env vars, Supabase dashboard settings), and how
     the release was checked. No AI attribution line.
3. **Report** the PR URL, and remind:
   - **Merge with a merge commit, never squash.** Squashing gives the same work different SHAs on `main` and
     `development`, so the branches diverge and every later merge conflicts.
   - Delete the `release/*` branch after the merge.

### Do not

- Do not merge the release PR. That is always a deliberate human action.
- Do not open it from a feature branch or with `--head development`.
