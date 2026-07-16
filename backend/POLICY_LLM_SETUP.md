# Policy LLM Setup

To enable AI-powered policy interpretation, configure these environment variables before starting the backend:

```bash
POLICY_LLM_API_KEY=
POLICY_LLM_BASE_URL=https://api.openai.com/v1
POLICY_LLM_MODEL=your_model_name
POLICY_LLM_TIMEOUT=90
```

Behavior:

- If both `POLICY_LLM_API_KEY` and `POLICY_LLM_MODEL` are set, policy parsing will call the model first.
- If the model call fails or is not configured, the system falls back to the local rule-based analysis.
- You can trigger a fresh analysis from the policy page with the `重新生成解读` button.
