---
title: Choose your AI model
description: "Crowsnest can use Claude, OpenAI, Gemini, Groq, Ollama on your own machine, or any other provider. One command sets it up, and no model is needed to start."
slug: integrations/models
order: 8
section: Integrations
updated: 2026-10-13
howTo: true
question: How do I make Crowsnest use a different AI model?
answer: Run python -m packages.core.llm setup, pick a provider from the list, paste its key and press Enter. It makes one real test call and saves the result to .env. Or set the provider's usual key, such as OPENAI_API_KEY. No model at all is also fine.
facts:
  - "Twelve provider choices: Anthropic, OpenAI, Google Gemini, OpenRouter, Groq, Mistral, DeepSeek, Together AI, xAI, Ollama, LM Studio and any OpenAI-compatible address (packages/core/llm/providers.py, 2026-10-13)."
  - "Setting a provider's usual key is enough: Crowsnest finds it (packages/core/llm/config.py, 2026-10-13)."
  - "Nothing is required: with no model, fixed rules do the work (packages/core/llm/config.py, 2026-10-13)."
  - "A model only helps with two jobs, choosing which checks to run and writing up each finding. The checks themselves are fixed queries (packages/core/agents, 2026-10-13)."
related:
  - /docs/configuration
  - /docs/troubleshooting
  - /docs/integrations/slack
  - /docs/faq
---

Crowsnest works with no AI model at all. If you add one, it helps with two jobs: choosing which checks to run on a project, and writing up what the checks found. You can pick the provider you already pay for, or one that runs on your own machine.

## How do I set it up?

1. **Start the setup.** From the Crowsnest folder, run:
   ```bash
   python -m packages.core.llm setup
   ```
2. **Pick a provider** from the numbered list.
3. **Paste your key.** It is hidden as you type. Local providers such as Ollama need none.
4. **Choose a model**, or press Enter to keep the suggested one. It then makes one real test call, and saves to `.env` only if the test worked.
5. **Restart Crowsnest** so it picks up the change.

Prefer to edit the file yourself? Set the usual key for your provider and nothing else:

```env
OPENAI_API_KEY=sk-...
```

Crowsnest looks for these keys in this order and uses the first it finds: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `DEEPSEEK_API_KEY`, `TOGETHER_API_KEY`, `XAI_API_KEY`. If you have more than one set, name the one you want:

```env
CROWSNEST_LLM_PROVIDER=groq
CROWSNEST_LLM_MODEL=llama-3.1-8b-instant   # optional
```

Anyone who already had `ANTHROPIC_API_KEY` set sees no change.

## Which providers work?

| Name for `CROWSNEST_LLM_PROVIDER` | Provider | Needs a key |
|---|---|---|
| `anthropic` | Claude | `ANTHROPIC_API_KEY` |
| `openai` | OpenAI | `OPENAI_API_KEY` |
| `gemini` | Google Gemini | `GEMINI_API_KEY` |
| `openrouter` | OpenRouter, many models behind one key | `OPENROUTER_API_KEY` |
| `groq` | Groq | `GROQ_API_KEY` |
| `mistral` | Mistral | `MISTRAL_API_KEY` |
| `deepseek` | DeepSeek | `DEEPSEEK_API_KEY` |
| `together` | Together AI | `TOGETHER_API_KEY` |
| `xai` | xAI | `XAI_API_KEY` |
| `ollama` | Ollama, on your machine | none |
| `lmstudio` | LM Studio, on your machine | none |
| `custom` | Any address that speaks the OpenAI format, such as vLLM or a company gateway | `CROWSNEST_LLM_API_KEY` if it wants one |

`python -m packages.core.llm list` prints the same list. For `custom`, also set `CROWSNEST_LLM_BASE_URL` (for example `http://localhost:8080/v1`) and `CROWSNEST_LLM_MODEL`.

## How do I keep everything on my own machine?

Install [Ollama](https://ollama.com), pull a model (`ollama pull llama3.1`), and set:

```env
CROWSNEST_LLM_PROVIDER=ollama
CROWSNEST_LLM_MODEL=llama3.1
```

Nothing then leaves your computer for the model step. Smaller local models follow instructions less reliably. Crowsnest checks everything a model writes, so a poor answer is corrected or replaced by the fixed rules, but a stronger model gives better write-ups.

## How do I check what is in use?

Run `python -m packages.core.llm test` for one real test call (it uses a few tokens of your provider's allowance). Or open `http://localhost:8000/api/llm`, which shows the provider and model in use and never shows a key.

## What does a model never get to decide?

- **Whether a package exists.** Every package a model names must appear in the findings. Invented names are dropped, and if that leaves nothing, the finding is written by the fixed rules instead.
- **The label on a known-bad match.** A package on a known-bad list is always the most serious level.
- **Anything outside the allowed values.** An unknown attack type or severity is replaced by the one the check itself implies.

A model that is down, slow, out of credit or wrong never stops a scan. Crowsnest falls back to fixed rules for that step.

## What this does not do

- It does not choose the cheapest model for you. The suggested models are small and fast, and any model your provider offers can be named instead.
- It does not send your source code. The model sees the project folder path, the GitHub organisation name if you set one, and the findings from the checks: package names, versions, registry details, and the paths of projects that use an affected package.
- It does not store keys safely. They sit in a plain text `.env` file, so keep it out of version control.

Related pages: [Configuration](/docs/configuration), [Troubleshooting](/docs/troubleshooting) and the [Slack bot](/docs/integrations/slack).

**No model is a fine place to start.**
