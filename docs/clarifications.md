# Clarifying questions sent to Incubyte

The assessment email asked candidates to clarify rather than assume. These went out before the build started. Each one carries the default I proceeded on, so none of them blocked progress — if an answer contradicts a default, the change is small and early.

---

**Subject:** Re: Incubyte Engineering Assessment — a few clarifications before I build

Hi Titiksha,

Thanks for sending this across. I've read the brief and written a one-page requirements document before starting, as asked. A few things I'd rather confirm than assume — I've noted the default I'm proceeding on for each, so none of these hold me up.

1. **Deadline.** The email mentions submitting in the least possible time but no date. Is there an actual cut-off I should work to?

2. **"Answer questions about how the org pays people."** I'm reading this as analytics and reporting views — pay bands, comp ratio, distribution by country/department/level, outliers, and gender pay gap — rather than a natural-language query interface. The persona is an HR manager replacing spreadsheets, and what she can't do in Excel at 10,000 rows is slice and compare quickly. *Default: reporting views.*

3. **Multiple countries and currency.** I'm taking "multiple countries" to mean salaries held in local currencies that need normalising before they can be compared, rather than one reporting currency throughout. Comparing an INR salary against a GBP one without normalising makes pay bands and any gap figure meaningless. *Default: local currency stored, USD derived through an effective-dated rate table, seeded rather than fetched live so tests stay deterministic.*

4. **Salary history.** Is effective-dated salary history expected, or is a current salary per employee enough? None of the reports strictly need history, but adding it later means rewriting the schema, the seed, and every query, whereas adding it now is one table and a date predicate. *Default: effective-dated, with the UI surface kept to a timeline on the employee page.*

5. **Authentication.** For a single-persona tool, is any auth expected, or is an open demo URL acceptable? The deployment is public and the dataset is 10,000 people's salaries, so shipping it unauthenticated felt like the wrong call regardless. *Default: single login, hashed passwords, protected routes — but no role system, since the brief describes one persona.*

6. **Gender pay gap reporting.** This needs a gender field in the seeded data. I'd also suppress the figure for groups below a minimum headcount, since a gap computed over three people is noise presented as a finding. *Default: included, with suppression.*

7. **LLM usage.** The role description lists LLMs, and the brief's wording could be read as natural-language querying. My plan is a small, optional "ask bar" that translates a typed question into a validated query object which then runs the same deterministic analytics code the report pages use — the model never computes a figure and never sees salary rows. Happy to drop it if you'd rather see the tool without it. *Default: built last, behind a flag, so the deployed app works without it.*

Thanks — I'll have the repository link across shortly.

Best,
Akbar Sha

---

## Answers received

_Recorded here as they come in, along with anything that changed as a result._

| # | Question | Answer | What changed |
|---|---|---|---|
| 1 | Deadline | — | — |
| 2 | Reporting vs NL query | — | — |
| 3 | Multi-currency | — | — |
| 4 | Salary history | — | — |
| 5 | Auth | — | — |
| 6 | Gender gap | — | — |
| 7 | LLM | — | — |
