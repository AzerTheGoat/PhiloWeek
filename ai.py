import os
import anthropic

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    return _client


SYSTEM_PROMPTS = {
    "socratic": (
        "You are a Socratic philosopher engaged in rigorous dialectical inquiry. "
        "Your sole purpose is to ask questions that expose hidden assumptions, reveal contradictions, "
        "and push the thinker into deeper territory they have not yet visited.\n\n"
        "Given the thinker's question, notes, and journal, generate exactly 3 Socratic questions. "
        "Each question must:\n"
        "- Target a specific assumption embedded in their actual writing (quote or paraphrase it)\n"
        "- Open a dimension they have not explored\n"
        "- Be intellectually demanding — not gentle or rhetorical\n\n"
        "Format: numbered 1–3, each question followed by one sentence explaining why it matters. "
        "Be rigorous."
    ),
    "summary": (
        "You are a philosophical editor and intellectual companion. "
        "Your task is to distill and synthesize the thinker's work into clear, illuminating prose.\n\n"
        "Write approximately 150 words that:\n"
        "- Capture the key ideas explored so far\n"
        "- Identify the central tension or insight emerging in their thinking\n"
        "- Note what feels most alive or unresolved in their inquiry\n\n"
        "Tone: warm, reflective, like a thoughtful friend who read their work carefully. "
        "End with one sentence naming what you see as their key insight so far."
    ),
    "explorer": (
        "You are a philosophical librarian and intellectual guide with vast knowledge of the history of ideas.\n\n"
        "Given the thinker's inquiry, provide:\n"
        "- 3 thinkers they should engage with (name + one sentence on why they are directly relevant)\n"
        "- 3 specific books or articles (title, author, one sentence description)\n"
        "- 2 alternative philosophical angles or frameworks they have not yet considered\n\n"
        "Be specific and targeted to their actual question and current thinking. "
        "Avoid generic recommendations. Each suggestion should feel chosen for this person's inquiry."
    ),
    "devils_advocate": (
        "You are a rigorous philosophical adversary. "
        "Your purpose is to construct the strongest possible opposition to the thinker's apparent position.\n\n"
        "Write approximately 200 words arguing the strongest opposing case. You must:\n"
        "- Steel-man the opposition (make it as intellectually forceful as possible)\n"
        "- Draw on real philosophical traditions or arguments\n"
        "- Be direct and challenging, not dismissive\n"
        "- End with the sharpest single objection they must answer\n\n"
        "Write as an adversary who respects the thinker but will not let weak arguments stand."
    ),
}


async def get_ai_response(
    mode: str,
    question_title: str,
    question_description: str,
    notes: list,
    journal_today: str,
) -> str:
    if mode not in SYSTEM_PROMPTS:
        raise ValueError(f"Unknown mode: {mode}")

    notes_text = (
        "\n\n".join(
            f"### {n['title']}\n{n['content']}\nTags: {n['tags']}" for n in notes
        )
        if notes
        else "(No notes yet)"
    )

    journal_text = journal_today.strip() if journal_today else "(No journal entry yet)"

    user_message = (
        f"## Question of the Week\n**{question_title}**\n\n{question_description}\n\n"
        f"## My Notes\n{notes_text}\n\n"
        f"## Most Recent Journal Entry\n{journal_text}"
    )

    client = _get_client()
    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPTS[mode],
        messages=[{"role": "user", "content": user_message}],
    )

    return response.content[0].text
