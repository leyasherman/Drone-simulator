---
allowed-tools: Bash(git push:*), Bash(git status:*), Bash(git branch:*), Bash(git log:*), Bash(git remote:*)
description: Push the current feature branch to GitHub
---

## Context

- Current branch: !`git branch --show-current`
- Remote info: !`git remote -v`
- Unpushed commits: !`git log @{u}..HEAD --oneline 2>/dev/null || echo "No upstream or new branch"`

## Task

### Guard: check the branch first

If the current branch is `development` or `main`, **stop: do not push.** Tell the user to run `/feature_branch` to
move the work onto its own branch, then `/pr_dev`.

Continue only on a feature branch (`<person>/<topic>` or `hotfix/<topic>`).

### Then push

1. If there are no commits to push, say so and stop.
2. Push: `git push -u origin <branch>` for a new branch, otherwise `git push`.
3. Check it succeeded.
4. Report the result, and:
   - if no PR exists for this branch yet, that `/pr_dev` is next
   - if one exists, that the push has updated it (give the URL)

Do this without asking for confirmation.
