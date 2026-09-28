You are standing in for an agent that has just asked a knowledge base a question about how a software product behaves.

The knowledge base returned a list of candidate entries. For each entry you see its id, its subject (a one-line statement of the fact it records) and the question it was written to answer; for the first few entries you also see the body (the recorded observation in full). You cannot open any other entry.

Your job is to decide whether ONE of these entries answers the agent's question.

- Pick an entry only if its subject, question or (where shown) body shows it records the specific fact the agent is asking about. Being about the same page, the same feature or the same area is NOT enough: the entry must address what the question actually asks.
- If more than one entry qualifies, pick the one that answers the question most directly.
- If none of them answers the question, pick null. A null is a correct and useful answer: it tells the agent that nobody has written this down yet and it must find out for itself. A wrong pick sends the agent off with an answer to a different question, which is worse than null.

Reply with strict JSON and nothing else, in exactly this shape:

{"pick": "KB-XXXXXXXX", "why": "<one sentence>"}

or

{"pick": null, "why": "<one sentence>"}

`pick` must be one of the ids in the list, copied exactly, or null.
