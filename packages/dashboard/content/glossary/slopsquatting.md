---
title: Slopsquatting
term: Slopsquatting
h1: What is slopsquatting?
description: "Slopsquatting is registering a package name an AI assistant invented, so anyone who installs the suggestion gets the attacker's code. Meaning and defences."
slug: slopsquatting
order: 1
updated: 2026-10-07
question: What is slopsquatting?
definition: "Slopsquatting is registering a package name that an AI coding assistant has invented, so that anyone who installs the suggestion gets the attacker's code instead of an error."
answer: Slopsquatting is registering a package name that an AI coding assistant has invented, so that anyone who installs the suggestion gets the attacker's code instead of an error. Check that a suggested package exists, is old and is widely used before you install it.
facts:
  - "Slopsquatting needs three things: an invented name, an attacker who registers it, and someone who installs it (definition, 2026-10-07)."
  - "crowsnest install weighs how new a package is: under 30 days adds 0.4 risk (install check, 2026-10-07)."
  - "crowsnest install stops at risk 0.6 or above; the limit is fixed (install check, 2026-10-07)."
  - "A package Crowsnest has no data on adds 0.2 risk and still installs (install check, 2026-10-07)."
related:
  - /glossary/typosquatting
  - /glossary/supply-chain-attack
  - /blog/what-is-slopsquatting
  - /docs/faq
---

Slopsquatting is registering a package name that an AI coding assistant has invented, so that anyone who installs the suggestion gets the attacker's code instead of an error.

## Why does it matter?

The name looks reasonable because a program chose it. The package is new, so nobody has reported it. You trust the suggestion and install without looking.

## How do I stay safe?

- Search for the package yourself before you install an assistant's suggestion.
- Check how old it is and how many people download it.
- Look for a link to a code repository that matches the name.
- Install through `crowsnest install`.

## What this does not do

This page defines the term. It does not list invented names, and Crowsnest cannot stop a package it has no data on. A plain `npm install` is not checked.

## Where do I read more?

Related terms: [typosquatting](/glossary/typosquatting) and [supply chain attack](/glossary/supply-chain-attack). Read the full post, [What is slopsquatting?](/blog/what-is-slopsquatting), or see the [FAQ](/docs/faq). Back to the [glossary](/glossary).
