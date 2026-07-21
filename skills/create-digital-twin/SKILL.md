---
name: create-digital-twin
description: Create a digital twin — a persona built from a REAL person's likeness and voice — via POST /public/digital-twins. Use when the developer says "digital twin", "clone a real person", "an avatar of me / of our CEO", "make it look and sound like this person", or has a voice recording and a photo/video of a specific individual. Produces a persona (companion) ID you pass to [[create-agent]], same as a normal persona. For a fictional or generated character, use [[create-persona]] instead.
---

# create-digital-twin

A **digital twin** is a persona based on a real person — it uses their actual appearance and voice so the avatar looks and sounds like them. It's the counterpart to [[create-persona]]: same output (a persona / `companion` ID you hand to [[create-agent]]), different input (a real individual instead of a described or catalog character).

Reach for this when the developer wants the agent to *be* a specific person — a founder, an executive, a brand spokesperson — not a generated character.

<Callout type="warn">
**Consent is required first.** An admin must enable digital twins for the organization in the dashboard. Without it, `POST /public/digital-twins` fails with `DigitalTwinConsentRequired`. This is a legal gate — creating a likeness of a real person needs their consent — so don't work around it; have the admin enable it.
</Callout>

## Create the digital twin

Provide the person's identity, a voice recording, and a reference image or video for the avatar.

```bash
curl -X POST https://companion-api.napster.com/public/digital-twins \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Sarah",
    "lastName": "Johnson",
    "description": "VP of Customer Success at Acme. Warm, direct, and knowledgeable; explains things clearly and focuses on helping the customer succeed.",
    "gender": "female",
    "ethnicity": "Caucasian",
    "externalClientId": "sarah-johnson-001",
    "voiceUrl": "https://example.com/recordings/sarah-voice.wav",
    "videoUrl": "https://example.com/videos/sarah-speaking.mp4",
    "version": "v2"
  }'
```

```python
import os, requests

res = requests.post(
    "https://companion-api.napster.com/public/digital-twins",
    headers={"X-Api-Key": os.environ["NAPSTER_API_KEY"]},
    json={
        "firstName": "Sarah",
        "lastName": "Johnson",
        "description": "VP of Customer Success at Acme. Warm, direct, knowledgeable.",
        "gender": "female",
        "ethnicity": "Caucasian",
        "externalClientId": "sarah-johnson-001",
        "voiceUrl": "https://example.com/recordings/sarah-voice.wav",
        "videoUrl": "https://example.com/videos/sarah-speaking.mp4",
        "version": "v2",
    },
)
print(res.json()["id"])  # comp_… — a persona ID, same as any companion
```

### Fields

| Parameter | Type | Required | Description |
|---|---|---|---|
| `firstName` | string | Yes | The person's first name. |
| `lastName` | string | Yes | The person's last name. |
| `description` | string | Yes | Role, personality, tone. Becomes the agent's base system prompt. |
| `gender` | string | Yes | `male`, `female`, or `nonBinary`. |
| `ethnicity` | string | Yes | A value from `GET /public/companions/ethnicities`. |
| `externalClientId` | string | Yes | Ties the twin to the real individual in your system. |
| `voiceUrl` | string | No | Recording of the person's voice, used to clone it. Optional for `v2` (see below). Must be publicly reachable over HTTPS. |
| `videoUrl` | string | No | Reference video of the person speaking — the `v2` input; best lip sync and expressions. |
| `pictureUrl` | string | No | Reference image, if you don't have a video. |
| `version` | string | No | Avatar model: `v1` (from a still image) or `v2` (higher quality). |
| `tags` | object | No | String key-value labels. |

All hosted URLs (`voiceUrl`, `videoUrl`, `pictureUrl`) must be **publicly reachable over HTTPS** — the API fetches them during generation. A `localhost` URL, an expiring signed URL, or anything behind auth fails.

### v1 vs v2 — and where the voice comes from

- **`v1`** — appearance from a still image (`pictureUrl`); voice from `voiceUrl`.
- **`v2`** — higher quality. Appearance from a `videoUrl` (best) or `pictureUrl`. If you pass a `videoUrl` with clear speech, the voice is cloned from the **video's own audio**, so **`voiceUrl` becomes optional** — one good video supplies both the look and the voice. Provide a separate `voiceUrl` only when you want a different or higher-quality voice sample than the video's audio.

## Status lifecycle

Like a custom persona, a digital twin's avatar is generated asynchronously. Fetch it (`GET /public/companions/{companionId}`) and watch `status` move `pending` → `generationCompleted` → `readyToUse` → `completed`. v2 generation can take a while (allow up to several hours for video-based v2). Poll until `readyToUse` to attach it to an agent, or `completed` if you also need to edit it. (Same poll loop as [[create-persona]].)

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| `DigitalTwinConsentRequired` | Digital twins not enabled for the org | An admin must enable digital twins in the dashboard first |
| `400` on create | Missing a required field | `firstName`, `lastName`, `description`, `gender`, `ethnicity`, `externalClientId` are all required |
| `400` on `ethnicity` | Unsupported value | Use a value from `/public/companions/ethnicities` |
| Generation fails | A `voiceUrl`/`videoUrl`/`pictureUrl` isn't publicly reachable | Host on public HTTPS (CDN or object storage with public read) |
| Poor lip sync on v2 | Weak reference video | Use 1–5 min of natural speech, head-and-shoulders, evenly lit, clear audio |

## Next steps

- Assemble a deployable agent from the twin: [[create-agent]] (it's a persona ID like any other).
- Fictional/generated character instead: [[create-persona]].
- Persona lifecycle issues: [[troubleshoot-omniagent]] § Persona lifecycle.
