---
name: create-persona
description: Create or pick a persona — the appearance and personality entity for a Napster Omniagent. Use when the developer says "create a persona", "design my agent's character", "pick an avatar", "give my agent a personality", or needs a persona ID before building an agent. Covers the catalog, custom personas with a generated avatar, image hosting, and the generation status lifecycle. This produces a persona ID only — it does NOT yet produce a deployable Omniagent; route to [[create-agent]] for that.
---

# create-persona

A **persona** defines who your agent is: its visual appearance and personality. (The voice is chosen separately when you create the agent — see [[create-agent]].) In the API the resource is named `companion` (`/public/companions`), so generated code calls that endpoint while prose says "persona."

You get a persona two ways: pick one from Napster's catalog (ready immediately), or create a custom one (an avatar is generated from your inputs, which takes time). Either way the output is a **persona ID** you pass to [[create-agent]]. A persona on its own is not reachable by end users.

## Option A — pick from the catalog (fastest)

Catalog personas have ready-made avatars and personalities and can be used the moment you create an agent.

```bash
curl "https://companion-api.napster.com/public/companions/napster-stock?pageSize=10" \
  -H "X-Api-Key: $NAPSTER_API_KEY"
```

Filter with `search`, `gender`, `ethnicity`, and paginate with `pageIndex` / `pageSize`. Pick an `id` from the results — that's your persona ID. Done; skip to [[create-agent]].

## Option B — create a custom persona

Use this when the catalog doesn't fit. The `description` is the most important field — it becomes the foundation of the agent's system prompt.

```bash
curl -X POST https://companion-api.napster.com/public/companions \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Alex",
    "lastName": "Chen",
    "description": "A senior tech support specialist with a decade of experience. Warm, patient, detail-oriented. Explains technical concepts in plain language and walks users through solutions step by step. Professional but approachable; light humor to put frustrated users at ease.",
    "pictureUrl": "https://example.com/images/alex.png",
    "gender": "male",
    "ethnicity": "Asian"
  }'
```

```ts
const res = await fetch("https://companion-api.napster.com/public/companions", {
  method: "POST",
  headers: { "X-Api-Key": process.env.NAPSTER_API_KEY!, "Content-Type": "application/json" },
  body: JSON.stringify({
    firstName: "Alex",
    lastName: "Chen",
    description: "A senior tech support specialist… warm, patient, explains things in plain language.",
    pictureUrl: "https://example.com/images/alex.png",
    gender: "male",
    ethnicity: "Asian",
  }),
});
const persona = await res.json();
console.log(persona.id); // comp_…
```

```python
import os, requests

res = requests.post(
    "https://companion-api.napster.com/public/companions",
    headers={"X-Api-Key": os.environ["NAPSTER_API_KEY"]},
    json={
        "firstName": "Alex",
        "lastName": "Chen",
        "description": "A senior tech support specialist… warm, patient, explains things in plain language.",
        "pictureUrl": "https://example.com/images/alex.png",
        "gender": "male",
        "ethnicity": "Asian",
    },
)
print(res.json()["id"])  # comp_…
```

### Fields

| Parameter | Type | Required | Description |
|---|---|---|---|
| `description` | string | Yes | Role, personality, tone, communication style. Becomes the agent's base system prompt. |
| `firstName` | string | No | First name. |
| `lastName` | string | No | Last name. |
| `pictureUrl` | string | No | Publicly reachable image URL used to generate the avatar. |
| `gender` | string | No | `male`, `female`, or `nonBinary`. |
| `ethnicity` | string | No | A value from `GET /public/companions/ethnicities`. |
| `tags` | object | No | String key-value labels. |

A `headline` (short tagline, e.g. "Senior Tech Support Specialist") is set after creation with `PATCH /public/companions/{companionId}`.

### Image hosting

`pictureUrl` is optional. If you omit it, the system generates an avatar for you from the persona's `description`, `gender`, and `ethnicity`. Provide one only when you want a specific look.

When you do provide it, `pictureUrl` must be **publicly reachable over HTTPS** — the API fetches it to generate the avatar. A `localhost` URL, a signed URL that expires, or anything behind auth will fail generation. Host the image on a CDN, object storage with public read, or any static host. For the best result, use a **16:9** image of the person **looking straight into the camera, framed from roughly the waist up**, well-lit.

To get valid `ethnicity` values:

```bash
curl https://companion-api.napster.com/public/companions/ethnicities \
  -H "X-Api-Key: $NAPSTER_API_KEY"
```

## Status lifecycle — custom personas only

A custom persona's avatar is generated asynchronously. Fetch the persona and watch its status:

```bash
curl https://companion-api.napster.com/public/companions/comp_abc123 \
  -H "X-Api-Key: $NAPSTER_API_KEY"
```

The status moves through: `pending` → `generationCompleted` → `readyToUse` → `completed`. Generation can take several minutes (allow up to ~15). Catalog personas skip this — they are usable immediately.

Two milestones matter:

- **`readyToUse`** — the persona can be **used** (attach it to an agent and run sessions), but you **cannot edit it** yet.
- **`completed`** — the persona is fully ready: you can use it **and edit it** (`PATCH` the description, headline, etc.).

Poll until `readyToUse` if you only need to use the persona, or until `completed` if you also need to edit it. A quick poll loop (stops at `completed`):

```bash
while :; do
  s=$(curl -s https://companion-api.napster.com/public/companions/comp_abc123 \
        -H "X-Api-Key: $NAPSTER_API_KEY" | python3 -c "import sys,json;print(json.load(sys.stdin).get('status',''))")
  echo "status: $s"; [ "$s" = "completed" ] && break; sleep 20
done
```

<Callout type="warn">
Don't block your whole flow on `completed` if you only need to use the persona — once it's `readyToUse` you can attach it to an agent and run sessions. Wait for `completed` only if you need to edit the persona.
</Callout>

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| `400` on create | Missing `description` | `description` is required |
| `400` on `ethnicity` | Unsupported value | Use a value from `/public/companions/ethnicities` |
| Avatar looks wrong | Low-quality source image | Use a 16:9, well-lit image; person looking into the camera, waist up |

## Next steps

- Assemble a deployable agent from this persona: [[create-agent]].
- Add actions the agent can take: [[create-tool]].
- Ground it in your content: [[add-knowledge]].
- Persona issues in depth: [[troubleshoot-omniagent]] § Persona lifecycle.
