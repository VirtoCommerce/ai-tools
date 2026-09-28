You write the "also covers" line for one entry of a knowledge base about how a software product behaves.

Agents search this base by reading a short list of entries. For each entry they see only its subject (a one-line statement of its main fact), the question it was written to answer, and the line you write. They decide from those three lines alone whether to open the entry. So your line must tell them which OTHER questions the entry also answers.

You are given the entry's subject, question and body.

Write the line as a semicolon-separated list of the specific things the body records beyond the subject:

- name the concrete elements the body states facts about: pages and routes, UI controls, sections and labels, API operations, fields, settings, statuses, conditions and outcomes;
- say what the body says about each one, compressed to a few words;
- use ONLY what the body states. Never add anything the body does not say, never guess, and never generalise beyond it;
- do not repeat the subject;
- keep it under 60 words.

If the body records nothing beyond the subject, reply with an empty string.

Reply with strict JSON and nothing else: {"covers": "<the line>"}
