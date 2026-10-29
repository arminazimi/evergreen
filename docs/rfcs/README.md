# Requests for comments

An RFC is a proposal for a change that people should discuss before code exists: a public contract, a new command or output format, a scope change, or a decision that is expensive to reverse. Small fixes, documentation, tests, and detector additions do not need one.

The process is deliberately short:

1. Copy [`0000-template.md`](0000-template.md) to the next free number, for example `0001-plan-command.md`.
2. Fill in every section. Keep it short enough to read in one sitting; link to evidence instead of pasting it.
3. Open a pull request with the RFC. The number in the file name and the pull request number do not have to match.
4. Discuss in the pull request. Revise the document as the discussion settles.
5. A maintainer merges the pull request when the status is `accepted` and the objections are answered, or closes it with the status `rejected`.

## Status

| Status | Meaning |
|---|---|
| `draft` | Under discussion; anything may change. |
| `accepted` | Agreed and ready to implement. |
| `rejected` | Considered and declined; the reasons stay in the document. |
| `superseded` | Replaced by a later RFC, which is linked from the status line. |

## RFCs and decision records

An RFC argues for a change before it is made. [`docs/decisions/`](../decisions/) records the outcome: what was decided, why, and what it rules out. When an accepted RFC changes an architecture contract, public schema, or CLI behavior, the implementation pull request adds the matching decision record. An RFC does not replace a decision record, and a decision record does not need a preceding RFC.

## Editing rules

- One RFC per file, one topic per RFC.
- Keep the headings from the template and delete the guidance text once the section is written.
- Never rewrite an accepted RFC's decision. Supersede it with a new RFC, or record a later decision record that links back to it.
