---
description: Create a feature branch, deploy to mobile for testing, and revert or merge.
---

# Feature Testing Workflow

This workflow guides you through creating a new branch, deploying it to your phone (via GAP/clasp) for testing, and managing the result.

## 1. Create and Switch to Feature Branch
Start a new branch for your feature.
```bash
git checkout -b feature/my-new-feature
```

## 2. Make Changes and Push to GAS
Make your code edits. When ready to test on mobile:
```bash
// turbo
clasp push
```
*Note: This overwrites the current Apps Script deployment.*

## 3. Test on Mobile
Open the app on your phone and verify the changes.

## 4. Decision: Keep or Discard?

### Option A: Testing Failed (Revert)
If the changes are broken and you want to go back to the stable version:
```bash
# Switch back to main
git checkout main

# Restore the stable code to GAS
clasp push
```

### Option B: Testing Passed (Merge)
If the feature works and you want to keep it:
```bash
# Save your changes to git
git add .
git commit -m "Feature complete"

# Switch to main and merge
git checkout main
git merge feature/my-new-feature

# Update GitHub
git push origin main
```
