---
name: setup-api-key
description: Get a Napster Omniagent API key from the developer dashboard and store it as the NAPSTER_API_KEY environment variable. Use when the developer is starting from scratch, hits a 401 Unauthorized, asks "how do I authenticate", "where do I get an API key", or needs to set up credentials before any other Omniagent work. The front door for new users — most other skills assume the key is already set.
---

# setup-api-key

Every Omniagent API request authenticates with an API key sent in the `X-Api-Key` header. The key is a secret scoped to one organization and project. This skill gets the developer a key and stores it the right way: in an environment variable, never hardcoded.

## 0. Prerequisite — a Napster Companion API resource in Azure

Before you can reach the dashboard, your Azure subscription needs a **Napster Companion API resource**. If you've never set one up, do that first: follow [Create a Resource in Azure Portal](https://developers.napster.com/docs/guides/azure-resource). In short — in the Azure Portal, search for **Napster Companion API**, click **+ Create**, fill in subscription / resource group / name / region, create it, then **Go to Napster Companion API** to land in the Omniagent API dashboard.

If you already have the resource and can open the dashboard, skip to step 1.

## 1. Generate a key in the dashboard

The key is created in the dashboard — there is no API to mint one.

1. Open the dashboard at [companion-api.napster.com/admin](https://companion-api.napster.com/admin).
2. **Choose a project**, or create a new one. API keys are **scoped per project** — the key only works for the personas, agents, tools, and knowledge in that project, so pick the project you intend to build in.
3. In the left nav, go to **Keys**, then click **New API Key**.
4. Fill in the form:
   - **Key Name** — a label for you (e.g. `Production Key`).
   - **Project** — confirms which project the key is bound to.
   - **Provider** — select the LLM provider (**Azure OpenAI**).
   - **Deployment** — **Napster** (Napster's managed infrastructure — no credentials needed) or **Custom** (connects to your own deployment; requires your endpoint and API key, so inference runs in your cloud).
5. Click **+ Create API Key** and copy it. Treat it like a password — you may not be able to see it again.

## 2. Store it as `NAPSTER_API_KEY`

Never hardcode the key in committed source. Use an environment variable named `NAPSTER_API_KEY`.

For shell sessions:

```bash
export NAPSTER_API_KEY="your-key-here"
```

For a project, put it in a gitignored env file:

```bash
# .env  (add ".env" to .gitignore)
NAPSTER_API_KEY=your-key-here
```

Confirm it's set:

```bash
echo "${NAPSTER_API_KEY:0:6}…"   # prints the first chars only, not the whole key
```

## 3. Verify the key works

The cheapest authenticated call is listing the public persona catalog. A `200` means the key is valid.

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  https://companion-api.napster.com/public/companions/napster-stock?pageSize=1 \
  -H "X-Api-Key: $NAPSTER_API_KEY"
# 200
```

```ts
const res = await fetch(
  "https://companion-api.napster.com/public/companions/napster-stock?pageSize=1",
  { headers: { "X-Api-Key": process.env.NAPSTER_API_KEY! } },
);
console.log(res.status); // 200
```

```python
import os, requests

res = requests.get(
    "https://companion-api.napster.com/public/companions/napster-stock",
    params={"pageSize": 1},
    headers={"X-Api-Key": os.environ["NAPSTER_API_KEY"]},
)
print(res.status_code)  # 200
```

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| `401 Unauthorized` | Key missing, expired, or wrong | Re-check `NAPSTER_API_KEY`; regenerate in the dashboard |
| Used `Authorization: Bearer …` | Wrong auth scheme | This API uses `X-Api-Key: <key>`, not bearer tokens |
| Works locally, fails in CI | Env var not set in CI | Add `NAPSTER_API_KEY` to the CI/secret store |
| Key visible in browser network tab | Key used client-side | The key is server-side only — see [[deploy-webrtc]] for the token pattern |

## Next steps

- Create the agent's identity: [[create-persona]].
- Or run the full guided setup: the `omniagent-quickstart` command.
- For the secure browser pattern (token issuance), see [[deploy-webrtc]].
