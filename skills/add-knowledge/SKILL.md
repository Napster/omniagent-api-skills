---
name: add-knowledge
description: Give an Omniagent domain expertise — upload documents to a knowledge base, define curated FAQ collections, and attach them to an agent. Use when the developer says "add knowledge", "upload docs/PDFs", "ground the agent in my content", "add FAQs", "make the agent answer from our docs", or wants the agent to stop guessing and cite real material. Covers knowledge collections, file upload by URL, FAQ collections, and how the two differ.
---

# add-knowledge

Two ways to ground an agent in your content:

- **Knowledge base** — upload documents; the agent retrieves relevant passages during a conversation. Use for open-ended material (manuals, specs, guides).
- **FAQ collection** — curated question/answer pairs; when a user's question is **semantically similar** to one of yours (not an exact string match), the agent answers with the answer you defined instead of generating one. Use for high-stakes, controlled answers (pricing, policy, compliance).

Both attach to an agent by ID ([[create-agent]] / [[manage-agents]]).

## Knowledge base — documents

### 1. Create a collection

Create the collection with `provider: "azureOpenAI"` — it works with agents on Realtime and Cascade API keys, whichever provider they use.

```bash
curl -X POST https://companion-api.napster.com/public/knowledge-bases \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Product Documentation", "provider": "azureOpenAI" }'
```

### 2. Upload a file by public URL

The platform downloads and processes the file. The URL must be publicly reachable.

```bash
curl -X POST https://companion-api.napster.com/public/knowledge-bases/kb_abc123/files \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://example.com/docs/product-guide.pdf" }'
```

Supported types and limits:

| Format | Max size | | Format | Max size |
|---|---|---|---|---|
| `.pdf` | 50 MB | | `.txt` | 10 MB |
| `.docx` | 50 MB | | `.md` | 10 MB |
| `.doc` | 10 MB | | `.png` | 10 MB |
| `.jpeg` | 10 MB | | | |

A collection holds up to **30 files**. When it's full, delete files you no longer need or merge related documents before uploading. Because a session uses only one collection (see below), splitting content across several collections does **not** raise the effective limit for a single agent — consolidate instead.

### 3. (Optional) Override the file summary

The platform **automatically generates a summary for each file on upload** — you don't have to set one. The summary helps retrieval pick the right file, so override it only when you want something more specific or accurate than the auto-generated text:

```bash
curl -X PATCH https://companion-api.napster.com/public/knowledge-bases/kb_abc123/files/file_abc123/summary \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "summary": "Return policy and refund procedures for all regions" }'
```

<Callout type="warn">
A session uses exactly **one** knowledge collection. To draw on several sources, combine the files into a single collection rather than attaching multiple.
</Callout>

## FAQ collection — curated answers

Create a collection and seed it with pairs in one call (the `faqs` array is optional — you can add pairs later). A collection holds up to **50 Q&A pairs**, and an agent uses **one** collection, so this is the agent's full FAQ budget:

```bash
curl -X POST https://companion-api.napster.com/public/faqs \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Return Policy",
    "faqs": [
      { "question": "What is your return policy?", "answer": "Return any item within 30 days for a full refund. Items must be in original condition with tags attached." },
      { "question": "How long do refunds take?", "answer": "Refunds are processed within 5-7 business days after we receive the item." }
    ]
  }'
```

Add a pair to an existing collection:

```bash
curl -X POST https://companion-api.napster.com/public/faqs/faq_abc123/items \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "question": "Do you ship internationally?", "answer": "Yes, to over 40 countries." }'
```

```ts
// Create an FAQ collection with seed pairs
const res = await fetch("https://companion-api.napster.com/public/faqs", {
  method: "POST",
  headers: { "X-Api-Key": process.env.NAPSTER_API_KEY!, "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Return Policy",
    faqs: [{ question: "What is your return policy?", answer: "Return within 30 days for a full refund." }],
  }),
});
console.log((await res.json()).id); // faq_…
```

```python
import os, requests
res = requests.post(
    "https://companion-api.napster.com/public/faqs",
    headers={"X-Api-Key": os.environ["NAPSTER_API_KEY"]},
    json={"name": "Return Policy",
          "faqs": [{"question": "What is your return policy?", "answer": "Return within 30 days."}]},
)
print(res.json()["id"])  # faq_…
```

## Attach to an agent

Pass the IDs when creating or updating the agent ([[create-agent]]):

```bash
curl -X PATCH https://companion-api.napster.com/public/agents/agent_abc123 \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "knowledgeBaseId": "kb_abc123", "faqCollections": ["faq_abc123"] }'
```

`faqCollections` takes an array with **one** ID. Passing more returns `400` ("At most 1 FAQ collection can be attached."), on agents, channel configs, and connections alike. `knowledgeBaseId` is also a single collection. To cover more topics, add the pairs to the same FAQ collection.

## When to use which

| Need | Use |
|---|---|
| Answer open-ended questions from large docs | Knowledge base |
| Give one exact, controlled answer to a known question | FAQ |
| Pricing, legal, compliance, eligibility wording | FAQ |
| Product manuals, specs, onboarding material | Knowledge base |

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| File never processes | URL not publicly reachable | Host on public HTTPS |
| Upload rejected | Unsupported type or over size limit | Check the table above |
| `400 KnowledgeBaseFileLimitReached` | Collection is at the 30-file limit | Delete unused files or merge documents |
| `400 FaqLimitExceeded` | Creating a collection or adding pairs past 50 | Trim or merge pairs; the limit is per collection |
| `400` on `faqCollections` | More than one FAQ collection attached | Attach one; merge pairs into it |

## Next steps

- Attach and tune the agent: [[create-agent]], [[manage-agents]].
- Verify it's grounding answers in a real session: [[monitor-sessions]].
