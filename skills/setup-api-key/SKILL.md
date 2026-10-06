---
name: setup-api-key
description: Get a Napster API key from the developer dashboard and store it as the NAPSTER_API_KEY environment variable. Use when the developer is starting from scratch, hits a 401 Unauthorized, asks "how do I authenticate", "where do I get an API key", or needs to set up credentials before any other Omniagent work. The front door for new users — most other skills assume the key is already set.
---

# setup-api-key

Every Napster API request authenticates with an API key sent in the `X-Api-Key` header. The key is a secret scoped to one organization and project. This skill gets the developer a key and stores it the right way: in an environment variable, never hardcoded.

## 0. Get an account

The fastest path — no Azure required: **sign up at [napster.com/developer](https://www.napster.com/developer)**. New accounts start with **$6 of free credits** (roughly 100 minutes of conversation); top up with a card or enable auto-recharge from the dashboard when they run out.

Prefer billing through an Azure subscription? Create the Azure Marketplace resource instead: follow [Create a Resource in Azure Portal](https://developers.napster.com/docs/guides/azure-resource) — in the Azure Portal, search for **Napster API**, click **+ Create**, fill in subscription / resource group / name / region, create it, then **Go to Napster API** to land in the dashboard.

If you can already open the dashboard, skip to step 1.

## 1. Generate a key in the dashboard

The key is created in the dashboard — there is no API to mint one.

1. Open the dashboard at [companion-api.napster.com/admin](https://companion-api.napster.com/admin).
2. **Choose a project**, or create a new one. API keys are **scoped per project** — the key only works for the personas, agents, tools, and knowledge in that project, so pick the project you intend to build in.
3. In the left nav, go to **Keys**, then click **+ Create API key**.
4. Fill in the form:
   - **Key Name** — a label for you (e.g. `Production Key`).
   - **Project** — confirms which project the key is bound to.
   - **Architecture** — how the agent listens, thinks, and speaks. Architecture is not a provider; each one has its own provider options:
     - **Realtime** (default, recommended for a first key) — one model handles speech in and out. **Provider**: **Azure OpenAI** (runs on Napster's managed infrastructure — no credentials needed — unless you tick **Use my own credentials** and enter your deployment name, endpoint, and API key) or **OpenAI** (always your own OpenAI API key; required for MCP connectors).
     - **Cascade** — speech recognition (ASR), the language model (LLM), and the voice (TTS) run as separate stages, each with its own provider: ASR = Azure OpenAI; LLM = Azure OpenAI or Anthropic; TTS = Azure OpenAI or OpenAI. Azure OpenAI stages can run on Napster's infrastructure; Anthropic and OpenAI stages need your own API key and model. Some features differ on Cascade (e.g. no MCP) — see [Cascade architecture](https://developers.napster.com/docs/building-your-omniagent/configuration#cascade-architecture). Cascade is also the architecture that enables **puppeteer mode** (the agent speaks only lines you send). A Cascade key with only a TTS stage is enough for it.
     - **Other** → platform **Microsoft Foundry** — connects to an agent the developer already built on Microsoft Foundry; the Napster API adds the avatar. Not enabled by default (request access at https://help.napster.com). Fields: **Foundry project endpoint** (`https://<resource>.services.ai.azure.com/api/projects/<project>`, from the project's Home page), **Agent name**, **Agent version**, **Tenant ID** (Microsoft Entra ID → Overview). Before the key works, the Foundry agent must have Interaction type **Text** with **Voice mode** on (saved as a new version), and the developer must assign the **Foundry User** role to the **Napster.API** application on the Foundry resource (Access control (IAM) → Add role assignment). Without that role, sessions fail with Azure `401`. Foundry keys don't support digital twins or the SIP and VoIP channels. See [Connect a Microsoft Foundry agent](https://developers.napster.com/docs/guides/microsoft-foundry-agent).
   - The **Pricing** panel beside the form shows the per-minute rate for the current selection.
5. Click **+ Create API Key**. The **API Key Generated** page shows the key — copy it now and treat it like a password.

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
