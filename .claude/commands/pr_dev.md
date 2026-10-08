---
allowed-tools: Bash(git:*), Bash(gh:*)
argument-hint: [optional PR title]
description: Open a pull request from this feature branch into development
---

## Context

- Current branch: !`git branch --show-current`
- Commits not yet on development: !`git fetch -pq origin 2>/dev/null; git log origin/development..HEAD --oneline`
- Changed files: !`git diff origin/development...HEAD --stat`
- Upstream / unpushed: !`git log @{u}..HEAD --oneline 2>/dev/null || echo "no upstream yet — new branch"`
- Working tree: !`git status --porcelain`
- Existing PR for this branch: !`gh pr list --head "$(git branch --show-current)" --json number,url,baseRefName --jq '.[] | "#\(.number) -> \(.baseRefName)  \(.url)"' 2>/dev/null || echo none`

## Task

Open (or update) a pull request from the current feature branch into `development`.

### Refuse in these cases

- **On `development` or `main`.** Tell the user to run `/feature_branch` first; uncommitted work carries over.
- **No commits ahead of `development`.** Nothing to propose.

### Steps

1. **Uncommitted changes?** Report them and ask whether to include them. Do not commit silently. If told to include
   them, stage only this task's files by name, never `git add -A` or `git add .`.
2. **Push**: `git push -u origin <branch>` without an upstream, otherwise `git push`.
3. **If a PR already exists** for this branch, do not open a second one: the push updated it. Report the URL, stop.
4. **Run the checks** before opening: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
   If one fails, stop and report it.
5. **Create the PR:**
   ```
   gh pr create --base development --head <branch> --title "..." --body "..."
   ```
   - Add `--draft` when the user asks for a draft.
   - **Title**: `$ARGUMENTS` if given; otherwise from the commits. Conventional prefix, under 72 characters.
   - **Body**: what changed and why (the reasoning the diff does not show), then how it was checked: tests and
     what was tried in the browser. No AI attribution line.
6. **Flag what needs a human decision** in the PR body:
   - `supabase/migrations/`: there is one database for every environment, and migrations applied with the
     Supabase MCP are live in production at once. State whether each migration works with the code currently
     on `main` (it must), and whether it has already been applied.
   - New Vercel environment variables or Supabase dashboard settings the change needs: they are not in the diff.
7. **Report**: the PR URL, that Pavel reviews and merges it, and that the Vercel preview URL will appear on the PR
   shortly.

### Merging

Into `development` with **Squash and merge**. Do not merge on the user's behalf unless they ask.
