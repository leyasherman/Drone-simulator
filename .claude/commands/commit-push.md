---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*), Bash(git push:*), Bash(git branch:*), Bash(git remote:*)
description: Commit the task's changes and push the branch to GitHub
---

## Context

- Current branch: !`git branch --show-current`
- Current git status: !`git status`
- Unstaged changes: !`git diff`
- Staged changes: !`git diff --cached`
- Recent commits for style reference: !`git log --oneline -5`
- Upstream: !`git log @{u}..HEAD --oneline 2>/dev/null || echo "no upstream yet — new branch"`

## Task

### Guard: check the branch first

If the current branch is `development` or `main`, **stop: do not commit or push.** `development` takes changes only
through a pull request and only Pavel releases to `main`. Offer to run `/feature_branch`; uncommitted changes carry
over.

Continue only on a feature branch (`<person>/<topic>` or `hotfix/<topic>`).

### Then commit and push

1. Review all changes, staged and unstaged.
2. **Stage only the files belonging to this task**, by name. Never `git add -A` or `git add .`.
   If it is not obvious which files belong to the task, ask.
3. Write the message from the diff: conventional prefix, first line at most 72 characters, body says why,
   no AI attribution line.
4. Commit.
5. Push: `git push -u origin <branch>` for a new branch, otherwise `git push`.
6. Report:
   - which files were committed, and which were left unstaged on purpose
   - the push result
   - that the next step is `/pr_dev`
   - if a PR already exists for this branch, that the push has updated it

Do not ask for a commit message or for confirmation.
