# Army Transport — Review Before Merge

This pack adds a GitHub Actions check for pull requests. It does **not** edit or automatically correct application code.

## 1. Upload these files

Extract the ZIP at the root of your repository so the folder structure is preserved. Upload/commit:

- `.github/workflows/review-before-merge.yml`
- `REVIEW_BEFORE_MERGE.md`
- `tests/regression/README.md`

Do not upload the ZIP itself as a substitute for the extracted files.

## 2. How to see warnings

1. Open your repository on GitHub.
2. Create a **Pull request** from your working branch into the branch you want to protect.
3. Open the pull request and select **Checks** (or look at the checks section in Conversation).
4. Select **Details** beside `Static checks (no automatic code edits)` to view logs.
5. A red X means a required step failed. Yellow warnings may indicate a missing test script or lockfile.
6. Open **Files changed** to review the exact proposed code diff.

This workflow reports static-check failures. It does not automatically understand every business-logic error. For example, a reversed vehicle-status condition can pass lint and type checks unless a regression test covers the intended behavior.

## 3. Require your approval before merging

Uploading the workflow alone does **not** block merges. Configure repository rules:

1. On GitHub, open **Settings → Rules → Rulesets** (or **Settings → Branches**, depending on the repository UI).
2. Create a branch ruleset/branch protection rule for the branch you want to protect (normally `main`; choose the actual deployment branch).
3. Enable **Require a pull request before merging**.
4. Require at least **1 approval**.
5. Enable **Require status checks to pass before merging** and select the check named `Static checks (no automatic code edits)` after it has run once.
6. Enable **Do not allow bypassing the above settings**, if available and appropriate for your account/team.
7. Save the ruleset.

If you work directly on `new-branch`, protect `new-branch` instead or choose the correct target branch. Do not assume the branch name is `main`.

## 4. Important limitations and safety

- No automated code correction is performed by this workflow.
- It does not replace your review of **Files changed**.
- Static checks can miss incorrect business logic.
- The regression-test step is currently a scaffold/reminder. It only runs a test command if your project has a `test` script; test failures are marked as warnings in this starter pack so an unconfigured test setup does not block all PRs. Once real tests are added and verified, change that step to fail the workflow when tests fail.
- The build may require environment variables or services specific to your deployment. If it fails due to missing environment configuration, review the logs and configure safe CI-only values. Never add production secrets to this workflow.
- The workflow uses Node.js 22. If your deployment requires a different supported Node version, align it with your project.
- The GitHub Actions setup-node npm cache may not find a lockfile. If that happens, remove the `cache: npm` line or commit the project's npm lockfile.

## 5. Recommended review routine

For each pull request:
- Read the purpose and summary of the change.
- Review every changed file in **Files changed**.
- Look especially for reversed comparisons, changed status strings, permission checks, database writes, and trip/gate state transitions.
- Confirm tests cover the expected behavior and at least one failure/edge case.
- Merge only when you understand and approve the change.
