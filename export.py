from datetime import datetime
from database import get_db

TYPE_EMOJI = {"video": "🎥", "link": "🔗", "book": "📚", "podcast": "🎧"}
ACTIVITY_EMOJI = {"reading": "📖", "watching": "🎥", "writing": "✍️", "thinking": "💭"}


def generate_markdown_export(question_id: int) -> tuple[str, str]:
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT * FROM questions WHERE id = ?", (question_id,))
    question = cur.fetchone()
    if not question:
        conn.close()
        raise ValueError("Question not found")

    cur.execute(
        "SELECT COALESCE(SUM(duration_minutes), 0) FROM study_sessions WHERE question_id = ?",
        (question_id,),
    )
    total_time = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM notes WHERE question_id = ?", (question_id,))
    notes_count = cur.fetchone()[0]

    cur.execute(
        "SELECT COUNT(*) FROM journal_entries WHERE question_id = ? AND content != ''",
        (question_id,),
    )
    journal_count = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM resources WHERE question_id = ?", (question_id,))
    resources_count = cur.fetchone()[0]

    cur.execute(
        "SELECT * FROM notes WHERE question_id = ? ORDER BY created_at", (question_id,)
    )
    notes = cur.fetchall()

    cur.execute(
        "SELECT * FROM journal_entries WHERE question_id = ? ORDER BY day_number",
        (question_id,),
    )
    journal_entries = cur.fetchall()

    cur.execute(
        "SELECT * FROM resources WHERE question_id = ? ORDER BY created_at",
        (question_id,),
    )
    resources = cur.fetchall()

    cur.execute(
        "SELECT * FROM study_sessions WHERE question_id = ? ORDER BY created_at",
        (question_id,),
    )
    sessions = cur.fetchall()

    conn.close()

    lines = [
        f"# {question['title']}",
        f"*Exported on {datetime.now().strftime('%B %d, %Y')}*",
        "",
        f"> {question['description']}",
        "",
        "---",
        "",
        "## Stats",
        f"- **Total Study Time**: {int(total_time)} minutes",
        f"- **Notes**: {notes_count}",
        f"- **Journal Days Completed**: {journal_count}/7",
        f"- **Resources**: {resources_count}",
        "",
        "---",
        "",
    ]

    if notes:
        lines.append("## Notes")
        lines.append("")
        for note in notes:
            lines.append(f"### {note['title']}")
            if note["tags"]:
                tags = " ".join(
                    f"`{t.strip()}`"
                    for t in note["tags"].split(",")
                    if t.strip()
                )
                lines.append(f"*Tags: {tags}*")
            lines.append("")
            lines.append(note["content"] or "")
            lines.append("")
            lines.append("---")
            lines.append("")

    if journal_entries:
        lines.append("## Daily Journal")
        lines.append("")
        for entry in journal_entries:
            if entry["content"]:
                lines.append(f"### Day {entry['day_number']}")
                lines.append("")
                lines.append(entry["content"])
                lines.append("")

    if resources:
        lines.append("## Resources")
        lines.append("")
        for r in resources:
            status = "✅" if r["is_watched"] else "⬜"
            emoji = TYPE_EMOJI.get(r["type"], "🔗")
            lines.append(f"- {status} {emoji} **{r['title']}**")
            if r["url"]:
                lines.append(f"  - <{r['url']}>")
            if r["notes"]:
                lines.append(f"  - Notes: {r['notes']}")
        lines.append("")

    if sessions:
        lines.append("## Study Sessions")
        lines.append("")
        for s in sessions:
            emoji = ACTIVITY_EMOJI.get(s["activity_type"], "📖")
            date = s["created_at"][:10]
            lines.append(
                f"- {emoji} **{s['activity_type'].title()}** — "
                f"{int(s['duration_minutes'])} min ({date})"
            )
            if s["notes"]:
                lines.append(f"  > {s['notes']}")
        lines.append("")

    safe_title = (
        question["title"][:50]
        .replace(" ", "_")
        .replace("?", "")
        .replace("/", "_")
        .replace("\\", "_")
    )
    filename = f"{safe_title}.md"
    return "\n".join(lines), filename
