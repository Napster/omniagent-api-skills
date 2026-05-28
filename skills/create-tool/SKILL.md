---
name: create-tool
description: Define a function (tool) the Omniagent can call mid-conversation — look up data, trigger workflows, take actions. Use when the developer says "add a tool", "let the agent call my API", "create a function", "give the agent an action", or needs the agent to do something beyond talking. Covers implicit vs explicit execution flows, the JSON-Schema parameters, and writing the tool `prompt` that controls when the agent fires it.
---

# create-tool

A tool (function) lets the agent act during a session — query an order, book an appointment, log an event. You create a tool once with `POST /public/functions`, then attach its ID to an agent's `functions` array ([[create-agent]]). Tools are reusable across agents.

## Execution flow — choose one per tool

| Flow | Where the call is delivered | Use when |
|---|---|---|
| `implicit` | To the connected client (the Web SDK in the browser, or your WebSocket client). Your client runs the logic and returns the result. | The action lives client-side — update the UI, read local state. |
| `explicit` | To a `url` you specify (HTTP or WebSocket on your server). | The action needs your backend — a database, an internal API, a third-party system. |

You can mix both in one session.

## Create a tool

Explicit (server-side) example:

```bash
curl -X POST https://companion-api.napster.com/public/functions \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "name": "get_order_status",
      "description": "Look up the current status of a customer order by order ID",
      "parameters": {
        "type": "object",
        "properties": {
          "order_id": { "type": "string", "description": "The unique order identifier" }
        },
        "required": ["order_id"]
      }
    },
    "flow": "explicit",
    "url": "https://your-api.example.com/tools/get-order-status",
    "headers": { "x-internal-key": "…" },
    "prompt": "Use when the user asks about their order, delivery, or shipment status. Before calling, say \"Let me check that for you.\" Do NOT use for returns, refunds, or product questions."
  }'
```

```ts
const res = await fetch("https://companion-api.napster.com/public/functions", {
  method: "POST",
  headers: { "X-Api-Key": process.env.NAPSTER_API_KEY!, "Content-Type": "application/json" },
  body: JSON.stringify({
    data: {
      name: "get_order_status",
      description: "Look up the current status of a customer order by order ID",
      parameters: {
        type: "object",
        properties: { order_id: { type: "string", description: "The unique order identifier" } },
        required: ["order_id"],
      },
    },
    flow: "explicit",
    url: "https://your-api.example.com/tools/get-order-status",
    prompt: "Use when the user asks about their order status. Before calling, say 'Let me check that.' Do NOT use for returns.",
  }),
});
const tool = await res.json();
console.log(tool.id); // fn_…
```

```python
import os, requests

res = requests.post(
    "https://companion-api.napster.com/public/functions",
    headers={"X-Api-Key": os.environ["NAPSTER_API_KEY"]},
    json={
        "data": {
            "name": "get_order_status",
            "description": "Look up the current status of a customer order by order ID",
            "parameters": {
                "type": "object",
                "properties": {"order_id": {"type": "string", "description": "The unique order identifier"}},
                "required": ["order_id"],
            },
        },
        "flow": "explicit",
        "url": "https://your-api.example.com/tools/get-order-status",
        "prompt": "Use when the user asks about their order status. Do NOT use for returns.",
    },
)
print(res.json()["id"])  # fn_…
```

Implicit (client-side) tools drop the `url` and set `"flow": "implicit"`. Your client handles the call — see [[session-runtime]] for the `function_implicitly_called` / `send_function_output` event loop.

### Fields

| Field | Required | Description |
|---|---|---|
| `data.name` | Yes | Function name the model calls. snake_case. |
| `data.description` | Yes | What the tool does. The model reads this to decide relevance. |
| `data.parameters` | Yes | JSON Schema for the arguments (`type`, `properties`, `required`). |
| `flow` | Yes | `implicit` or `explicit`. |
| `url` | explicit only | HTTP or WebSocket endpoint that receives the call. |
| `headers` | No | Custom headers sent with explicit calls (auth, routing). |
| `receiveMessages` | No | WebSocket explicit tools only — stream the live conversation to your endpoint. |
| `prompt` | No (but important) | Controls *when* and *how* the agent calls the tool. See below. |

## The `prompt` field is your main lever

At runtime the API injects your `prompt` into the system instruction next to the auto-generated function signature:

```
## get_order_status(order_id)
[your prompt here]
```

**Put invocation guidance in `prompt`, not in the persona/agent instructions.** A good prompt covers three things:

1. **When to use it** — concrete user intents. `Use when the user asks to book, reserve, or schedule a table.`
2. **When NOT to use it** — similar-looking intents that should not trigger it. `Do NOT use when the user asks about menu items or hours.`
3. **How to behave** — announce, confirm, or call silently.

Behavior patterns:

- **Proactive (silent):** read-only / no side effects. `Call automatically when the user expresses a clear emotion. Do not announce it.`
- **Preamble (brief ack):** the recommended default. `Before calling, say "Let me check that." Do NOT imply success before the result.`
- **Confirmation (ask first):** anything with side effects — money, bookings, messages. `Describe the details and wait for explicit confirmation before calling.`

Sequencing: `Only call after the user has provided name, date, and time.` / `Only call if check_availability returned slots.`

### Voice-specific discipline

- **Silence reads as "frozen."** Use the preamble pattern for anything slower than instant.
- **Fewer tools is better.** Each tool adds instruction tokens and raises misfire risk. Keep the set tight.
- **Keep prompts short.** Direct sentences, no paragraphs.
- **Don't restate the description** in the prompt — `description` says what it does; `prompt` says when/when-not/how.

### Long-running work — beat the timeout, answer later

Tool calls time out after **10 seconds** (the model then receives "Failed to fetch information"). If the real work can't finish that fast, don't block on it:

1. **Respond to the tool call immediately** with an interim acknowledgment instead of the final result — e.g. `{ "status": "working", "message": "Generating that now, I'll have it shortly." }`. This beats the timeout and lets the agent tell the user it's working on it.
2. **When the real answer is ready, push it into the session** as a system message with the `send_message` client command (`role: "system"`). Set `trigger_response: true` if the agent should speak the result right away, or `false` to let it absorb the information silently and use it when relevant.

```js
// later, once the result is computed:
instance.sendCommand({
  type: "send_message",
  data: {
    role: "system",
    text: "The order lookup finished: order #ORD-7890 shipped and arrives Friday.",
    trigger_response: true,
  },
});
```

This decouples slow work from the tool-call window. The `send_message` command is part of the live session runtime — see [[session-runtime]] for the full command and event vocabulary.

## Managing tools

```bash
curl https://companion-api.napster.com/public/functions -H "X-Api-Key: $NAPSTER_API_KEY"            # list
curl https://companion-api.napster.com/public/functions/fn_abc123 -H "X-Api-Key: $NAPSTER_API_KEY"  # get
curl -X PUT https://companion-api.napster.com/public/functions/fn_abc123 \
  -H "X-Api-Key: $NAPSTER_API_KEY" -H "Content-Type: application/json" -d '{ … }'                    # update
curl -X DELETE https://companion-api.napster.com/public/functions/fn_abc123 -H "X-Api-Key: $NAPSTER_API_KEY"
```

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| Agent never calls the tool | Tool ID not in the agent's `functions` | Attach it via [[create-agent]] / [[manage-agents]] |
| Tool fires at the wrong time | Weak `prompt` | Add explicit "Use when" / "Do NOT use when" conditions |
| Explicit tool times out | Work slower than the 10s window | Return an interim ack immediately, then push the real answer via `send_message` (see "Long-running work" above) |
| Agent goes silent during a call | No preamble in a slow voice tool | Add "Before calling, say …" to the prompt |
| Duplicate side effects | Client handled the same `call_id` twice | Dedupe by `call_id` ([[session-runtime]]) |

## Next steps

- Attach the tool: [[create-agent]] or [[manage-agents]].
- Handle implicit calls at runtime: [[session-runtime]].
- Function-calling pitfalls: [[troubleshoot-omniagent]] § Function calling.
