# Newton for Claude

Ask Claude plain questions about Newton, and have it log your weekly activity, move role stages and draft report narrative, all through Newton's own rules. This guide is for Momentum Global Delivery Managers, Talent Partners, Leadership and Admin. If anything here doesn't work, ask Chris.

## What it is

Newton for Claude is a small add-on for Claude Desktop. Once it is installed you can ask things like "how do I log my week?", "which of my roles are flagged?" or "move the Data Engineer role to Interview 1", and Claude answers or makes the change using Newton's own data and calculations, so what you get matches what you see in Newton.

- **You see what Newton shows you.** Delivery Managers and Talent Partners get their own projects and roles, exactly as in Newton. Admin and Leadership also get the company-wide reads.
- **Changes need your yes.** Claude previews every change first and only saves it after you confirm (see "How changes work").
- **Delivery Managers, Talent Partners and Admin can make changes. Leadership is read-only.**
- **Windows and Claude Desktop only.** It does not work on a phone, a Mac or in a web browser.

## What you can do

- **Ask how Newton works.** "How do I add a placement?" Claude searches the Newton user guides and this guide and answers from them (`search_guides`, `read_guide_section`).
- **Look things up.** Projects, roles, pipeline, placements, weekly activity and time to fill for your projects (`list_projects`, `project_summary`, `list_roles`, `role_detail`, `activity_summary`, `list_placements`, `time_to_fill`). Talent Partners see the roles on their projects, and the activity and placements that are theirs.
- **Check a Hiring Plan.** For a Centre of Excellence project, Claude compares the plan with what has happened: planned and actual role opens by month, planned and actual hires (a hire counts when the offer is accepted), and each plan row with how many weeks ahead or behind it is (`hiring_plan`, and the Hiring Plan section of `report_facts`). Delivery Managers and Talent Partners see the whole project plan. A plan row's title is free text, so keep names out of it.
- **Log weekly activity.** "Log my week on the Data Engineer role: 12 sourced, 4 screens, 1 interview." Claude can add a new week or correct one that exists (`log_weekly_activity`).
  - Up to 10 role-weeks in one go. The week defaults to this week; future weeks are refused.
  - Name the role by its title (add the project if two projects have the same title).
  - A correction changes only the counts you give.
  - Delivery Managers and Admin can log for another Talent Partner on the project. Talent Partners log as themselves.
  - If you log hires above 0, the week is saved and Newton adds a reminder to record the placement. Claude never records placements: do that in Newton.
- **Move a role through its stages.** "Move the Data Engineer role to Interview 1", or "next" and "previous" (`update_role_stage`). Up to 10 roles in one go. Claude can move a role between any of the pipeline stages from Backlog to Offered, as the Roles page does, and the move is recorded in the role's history as made via Claude. Closing, cancelling, holding and reopening a role are done in Newton.
- **Draft report narrative.** "Draft this week's client narrative for the project." Claude reads a saved report from the Report Library and the facts for its period (`report_facts`), then rewrites the report's text blocks (`draft_report_narrative`). It only edits a report that already exists, it never creates, exports or shares one, and you read and edit the text before it goes anywhere. Up to 6 text blocks in one go.
- **Admin and Leadership only: company-wide reads.** Project scorecards, the bench, utilisation, workforce split, joiners, project teams and business goals (`project_scorecards`, `bench`, `utilisation`, `workforce_segmentation`, `joiners`, `project_team`, `business_goals`).

You can also ask "who am I in Newton?" (`newton_status`) to check your role and the Newton version.

## How changes work

Claude never saves a change straight away.

1. Claude shows a **preview**: what will change, from what to what, and any warnings. Nothing is saved yet.
2. Read it. If it is right, say yes in the chat.
3. Claude then confirms the change in Newton and saves exactly what you saw in the preview.

A preview lasts 5 minutes and can be used once. If it has expired, or the record changed in Newton in the meantime, Claude says so and you ask again for a fresh preview. Claude can only change what you could change in Newton yourself, on the projects and roles you can write to. A change made through Claude is marked "via Claude" in Newton (the Source of a weekly activity row, and the role history).

## What it cannot do

- Pause, close, cancel or reopen a role, or change headcount. Do those in Newton.
- Record or change placements.
- Show candidate names, notes, rejection reasons, email addresses, salaries or any money (budgets, bill rates, fees, forecasts). It never gets them.
- Work for internal-function roles (People Ops, Sales, staff). Newton for Claude is for Delivery Managers, Talent Partners, Leadership and Admin.
- Make changes for Leadership accounts. Leadership is read-only.
- Run on a Mac, a phone or in a web browser.

## What each role sees

- **Delivery Manager:** your projects, and every role on them.
- **Talent Partner:** your projects, every role on them, and the activity and placements that are yours.
- **Leadership:** company-wide reads, no changes.
- **Admin:** company-wide reads and changes.

If you ask about a project or role you can't see in Newton, Claude says "That Newton data isn't available to your account." and does not say whether it exists.

## Before you start

- Claude Desktop is installed on your Windows PC and you are signed in to it.
- You are a Delivery Manager, Talent Partner, Leadership or Admin user in Newton (you can open Reporting or the Command Centre).
- Chris has added you to the Newton app in Microsoft Entra. If sign-in later says "Your account isn't assigned to Newton in Entra.", ask Chris to add you.

## Install

1. Download the installer: https://momentumglobal.github.io/newton/mcp/newton-for-claude.mcpb
2. Double-click the downloaded file. Claude Desktop opens and shows **Newton for Claude**.
3. Click **Install**.
4. Check it worked: in Claude Desktop open Settings, then Extensions. **Newton for Claude** should be listed and switched on, with a version number.

If Claude Desktop doesn't open when you double-click, open Claude Desktop first, then double-click the file again.

## First sign-in

1. Start a new chat in Claude Desktop and ask: **Who am I in Newton?**
2. A browser window opens. Sign in with your Momentum Microsoft account.
3. When the browser says you are signed in, go back to Claude and **ask again**. Claude says "A browser window has opened for Newton sign-in. Finish signing in, then ask again." the first time, so asking again is expected.
4. You should now see your email, your Newton role and the Newton version.

You only do this once. Closing and reopening Claude does not ask you to sign in again.

## Things to ask

Name a project, a role or a short time period, and Claude will pick the right tool. Examples:

- "How do I log my weekly activity in Newton?"
- "Which of my projects are active, and which roles are flagged?"
- "Summarise the pipeline for this project."
- "Log my week on the Data Engineer role: 12 sourced, 4 screens, 1 interview."
- "Correct last week's screens on that role to 5."
- "Move the Data Engineer role to Interview 1."
- "Draft this week's Successes and Risks for the client report on this project."
- "Is the Hiring Plan on this project ahead or behind, and how many hires have we made against plan?"
- "How many placements did we make last quarter?"
- "What is our time to fill for this function in this country?"

Admin and Leadership can also ask company-wide questions:

- "Show me the project scorecards."
- "Who is on the bench?"
- "What is utilisation this month, by level?" and "What does the utilisation outlook look like to the end of the year?"
- "Who is on this project's team?"
- "What is our workforce split by location, contract type and level this month?"
- "Who joined Momentum in November?"
- "How are our business goals going this year, and which actions are overdue?"

The first question after Claude starts can take a few seconds while Newton loads. A whole-year utilisation question can take up to about 20 seconds. If a question is slow, ask for one project or fewer weeks.

## Signing in again

About every 90 days, or sooner if your organisation's sign-in rules require it, Claude tells you to sign in again. Just ask your question again and finish signing in in the browser.

To force a fresh sign-in yourself:

1. Fully quit Claude Desktop (right-click its icon by the clock, then Quit).
2. Delete the saved sign-in file, `mcp-token.bin`. It is in one of two places, depending on how Claude Desktop was installed:
   - `%LOCALAPPDATA%\Newton\mcp-token.bin`
   - if Claude Desktop came from the Microsoft Store: `%LOCALAPPDATA%\Packages\Claude_<id>\LocalCache\Local\Newton\mcp-token.bin` (`<id>` is the rest of the folder name that starts `Claude_`)
3. Reopen Claude and ask a Newton question.

Paste either path into the File Explorer address bar to open it. The file is encrypted to your Windows account and is no use on any other PC.

## Updating

Newton's answers update by themselves, so you normally do nothing. Only if Claude says:

"Newton for Claude needs updating. Download the latest version from https://momentumglobal.github.io/newton/mcp/newton-for-claude.mcpb and double-click it to reinstall, then restart Claude."

do exactly that: download the file again, double-click it, install, then fully quit and reopen Claude.

## Uninstalling

1. In Claude Desktop open Settings, then Extensions, choose **Newton for Claude** and click **Uninstall**.
2. To remove your saved sign-in as well, delete `mcp-token.bin` (both places are listed under "Signing in again").
3. If you also want your access to the Newton app removed, ask Chris.

## If something goes wrong

| What you see | What to do |
|---|---|
| "Unable to connect to extension server" | Fully quit and reopen Claude. If it persists, reinstall using the link above. |
| "A browser window has opened for Newton sign-in. Finish signing in, then ask again." | Finish signing in in the browser, then ask again. |
| "Sign-in was cancelled." | Ask again and complete the sign-in. |
| "Your account isn't assigned to Newton in Entra." | Ask Chris to add you to the Newton app. |
| "Your organisation's sign-in policy blocked this device." | Ask Chris. Your device or location may be blocked by company policy. |
| "Newton's permissions need admin consent." | Ask Chris. |
| "Newton for Claude isn't available to your Newton role" | Your Newton role is not Delivery Manager, Talent Partner, Leadership or Admin. Ask Chris if you think it should be. |
| "That isn't available to your Newton role" | That tool is not for your role (for example, scorecards are Admin and Leadership only, and Leadership can't make changes). |
| "That Newton data isn't available to your account." | The project or role is not one you can see in Newton. Check the name, or ask Chris. |
| "That confirmation has expired or was already used. Ask for a new preview." | Ask Claude for the change again and confirm the new preview within 5 minutes. |
| "This changed in Newton since the preview. Ask again for a new preview." | Someone changed the record. Ask again to see the up-to-date preview. |
| "Newton is still saving that change. Check Newton before trying again." | Open Newton and check whether the change is there before you ask again. |
| "Log at most 10 role-weeks in one go." or "Move at most 10 roles in one go." | Split the request into batches of 10 or fewer. |
| "Newton took too long to answer. Try again, or ask for a smaller slice (one project, fewer weeks)." | Ask again for one project or a shorter period. |
| "Couldn't load Newton" followed by a reason | Check your internet connection and ask again. |
| "Newton for Claude needs updating." | See "Updating". |

If you logged hires and Newton shows a reminder to record the placement, that is expected: Claude can't record placements, so open the reminder in Newton and add the placement there.

If Chris asks for the log file, it is `%LOCALAPPDATA%\Claude\Logs\mcp-server-Newton for Claude.log`. If you can't find it there, look in `%LOCALAPPDATA%\Packages\Claude_<id>\LocalCache\Local\Claude\Logs\`.

## Privacy and safety

- **What Claude can see:** project and role names, stages, dates, counts, percentages, flags, staff names, level and location, limited to what Newton shows you.
- **What it never gets:** candidate names, salaries or any money (budgets, bill rates, fees, forecasts), notes, hiring managers' names, rejection reasons or email addresses.
- **Changes:** only weekly activity, role stages and report text, each previewed and confirmed by you first, under the same permissions as in Newton. Every change is marked "via Claude".
- **Sign-in:** it uses Newton's own Microsoft sign-in and asks only for basic profile and Newton data access (User.Read, Sites.Selected, offline_access). It does not touch your files or OneDrive.
- **Who can use it:** Delivery Managers, Talent Partners, Leadership and Admin. Other accounts are stopped with a short message.
