Restate and restructure the user's input into a clear, well-organized prompt optimized for AI agents.

Everything after the `/meta-prompt` command is the user's input.

Example usage: `/meta-prompt I want to add a feature where the conveyor stops when a part is detected but only if it's in manual mode and the user has enabled that setting`

Optionally the user may wrap their prompt between `---` markers to indicate what to optimize.

---

## Your Task

Transform the input into a structured, unambiguous prompt. Then **output the final prompt in a copy-pastable block** (see Output Format below).

### 1. Core Intent
State the primary goal or question in one clear sentence.

### 2. Context & Constraints
Extract any implicit or explicit:
- Preconditions or assumptions
- Constraints or limitations
- Dependencies on other systems/features
- Edge cases mentioned

### 3. Structured Request
Rewrite using:
- **Goal**: What should be accomplished
- **When/Where**: Under what conditions or in what context
- **Acceptance Criteria**: How to know when it's done (if applicable)
- **Out of Scope**: What this request is NOT asking for (if it helps)

### 4. Clarifying Questions (if needed)
List ambiguities as specific yes/no or multiple-choice questions.

### 5. Refined Prompt (copy-pastable)
Provide the final, self-contained prompt.

---

## Output Format

1. Give your analysis (sections 1–4) briefly.
2. Then output **exactly** the following, with the refined prompt inside the code block:

```
--- COPY-PASTE PROMPT BELOW ---
[Put the full refined prompt here, nothing else. No extra commentary inside the block.]
--- END ---
```

The content between the two `---` lines must be **only** the refined prompt text, so the user can select from "COPY-PASTE PROMPT BELOW" through "END", copy, and paste into another chat or agent.

---

**Guidelines:**
- Preserve the user's intent—don't add requirements they didn't ask for
- Remove filler words and conversational artifacts
- Use precise technical terminology where appropriate
- Structure complex requests into numbered steps
- If the input is a question, ensure the refined version asks exactly what's needed
