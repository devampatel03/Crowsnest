---
title: What to do when Crowsnest says Hold
h1: What to do when Crowsnest says Hold.
description: "A calm walkthrough of a Crowsnest Hold: read the call, see who else is affected, take the first step, then scan again. What to do and what to avoid."
slug: what-to-do-when-crowsnest-says-hold
order: 3
published: 2026-10-07
updated: 2026-10-07
author: Crowsnest contributors
dek: A calm, step-by-step way to read the call and take the first step.
question: What should I do when Crowsnest says Hold?
answer: Stay calm and read the sentence. Check which of your projects use the package. Take the first step under "What to do", which is usually to remove it or stay on an older version. Then scan again. If a secret could have been exposed, replace it.
facts:
  - "Reading time: about 4 minutes (estimate at 200 words a minute)."
  - "Three calls: Clear, Watch and Hold; Hold means stop and check (product copy, 2026-10-07)."
  - "The override flag is --crowsnest-acknowledge-risk, used with crowsnest install (CLI source, 2026-10-07)."
  - "A stopped install exits with code 3 (CLI source, 2026-10-07)."
related:
  - /blog/how-to-stay-safe-from-malicious-packages
  - /blog/what-is-slopsquatting
  - /docs/dashboard
  - /docs/cli
---

Stay calm and read the sentence. Check which of your projects use the package. Take the first step under "What to do", which is usually to remove it or stay on an older version. Then scan again. If a secret could have been exposed, replace it.

## What does a Hold look like?

This is a made-up call, shown to explain the steps. The package and its numbers are invented.

> **Hold.** quikrequest is six days old, almost nobody downloads it, and its name is very close to a popular package.
> *quikrequest@1.0.0 · used in 2 projects · found 2 days ago*
> **What to do:** Do not install it. Check that you typed the name you meant.

## Step 1. What does the sentence say?

It says what happened in plain words. Hold means stop. You are not being told the package is certainly harmful. You are being told there is enough reason to check before going further.

## Step 2. Who else is affected?

Open "Used in 2 projects". It lists each project and version. If the package is in only one place and you have not shipped it, you have the easy case. The [dashboard guide](/docs/dashboard) shows where this list sits.

## Step 3. What is the first step?

The first item under "What to do" is the one to take now. Common first steps:

- If you have not installed it yet, do not.
- If it is in your project and you did not mean to add it, remove it.
- If the maintainer changed, stay on the last version you trust until you have looked at what changed. This is a [maintainer takeover](/glossary/maintainer-takeover) warning sign.
- If the call is Hold with "urgent", or it says the package is on a list of known harmful packages, remove it now.

## Step 4. What could it have reached?

If a harmful package ran on your machine or in your build, treat any keys or secrets available there as exposed. Replace them. Crowsnest's advice for the most serious calls says so in the first steps.

## Step 5. Did the Hold go away?

Run the scan again. The call should be gone. If it is not, read the new sentence.

## What if I think the call is wrong?

Look at the reasons. A real new package from a person you know can look like a Hold. If you are sure, you can install anyway with `crowsnest install some-package --crowsnest-acknowledge-risk`. Use that only after you have read the reasons, and tell the project if the call looked wrong. A report on [GitHub](https://github.com/devampatel03/Crowsnest/issues/new/choose) helps everyone.

## What this does not do

- Crowsnest cannot clean up for you. It says what to do; you do it.
- It cannot tell you whether a secret was really taken. It can only say that it could have been.
- It does not stop a plain `npm install`, so a package can reach your project without a Hold ever showing.

For the habits that prevent a Hold, read [How to stay safe from malicious packages](/blog/how-to-stay-safe-from-malicious-packages). For one of the most common causes, read [What is slopsquatting?](/blog/what-is-slopsquatting). The terminal command is on the [CLI usage](/docs/cli) page. [Install Crowsnest](/#install) to get calls like this one.

**A Hold is a pause, not a verdict. Use the pause.**
