---
allowed-tools: Bash(git:*)
argument-hint: [short description of the task]
description: Start a new task on a fresh branch off development
---

## Context

- Current branch: !`git branch --show-current`
- Uncommitted changes: !`git status --porcelain`
- Your git identity: !`git config user.name`
- Latest on development: !`git fetch -pq origin 2>/dev/null; git log --oneline -1 origin/development`
- Local branches: !`git branch --format='%(refname:short)'`

## Task

Create a feature branch off the latest `development`, per `CONTRIBUTING.md`.

### Branch name

Format is `<person>/<topic>`: one slash, all lowercase, hyphens between words.

- `<person>` = the first word of `git config user.name`, lowercased (`Leya` → `leya`).
- `<topic>` = kebab-case, from `$ARGUMENTS`. If `$ARGUMENTS` is empty, derive it from the uncommitted changes.
  If there are no changes either, ask for a few words.
- Name it after what the change does, not which file it touches: `leya/drone-picker` beats `leya/menus`.

**Never** create a branch named exactly `<person>` with no topic: a bare `leya` ref blocks every `leya/...` branch.

### Steps

1. `git fetch -pq origin`
2. **Check you should start fresh.** If the current branch is already a `<person>/…` branch with commits not on
   `origin/development`, stop and say so: the user is probably mid-task. Ask before continuing.
3. **Get onto the latest development:**
   - On `development` already: `git pull --ff-only`
   - Otherwise: `git checkout development`, then `git pull --ff-only`

   Uncommitted changes carry across the checkout; that is expected. If the checkout fails because a local change
   would be overwritten, **stop and report it**. Never discard, stash-drop or force past uncommitted work.
4. `git checkout -b <person>/<topic>`
5. Report the branch name, and that the next steps are `/commit-push` then `/pr_dev`.

### Do not

- Do not commit or push here (`/commit-push` publishes the branch).
- Do not branch off `main`, except for a production hotfix the user asks for: then `hotfix/<topic>` off `main`,
  and remind them it must be merged forward into `development` afterwards.
