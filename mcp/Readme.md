# Newton for Claude

Ask Claude plain questions about Newton and get answers worked out by Newton itself. This guide is for Momentum Global leadership. If anything here doesn't work, ask Chris.

## What it is

Newton for Claude is a small add-on for Claude Desktop. Once it is installed you can ask things like "which roles are flagged on a project?" or "who is on the bench?" and Claude answers from Newton's live data, using Newton's own calculations, so the figures match what you see in Newton.

- **Read-only.** It can look things up. It cannot change anything in Newton.
- **Leadership and Admin only.** Anyone else gets a short message and no data.
- **Windows and Claude Desktop only.** It does not work on a phone, a Mac or in a web browser.
- **Covers Reporting and People:** projects, roles, pipeline, placements, time to fill, bench, utilisation and project teams.

## Before you start

- Claude Desktop is installed on your Windows PC and you are signed in to it.
- You are in Newton's Leadership group (you can open the Command Centre in Newton).
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
4. You should now see your email, your Newton role (Leadership or Admin) and the Newton version.

You only do this once. Closing and reopening Claude does not ask you to sign in again.

## Things to ask

Name a project, or a short time period, and Claude will pick the right tool. Examples:

- "Which projects are active in Newton?"
- "Which roles are flagged on this project, and why?"
- "Summarise the pipeline for this project."
- "How many placements did we make last quarter, by project?"
- "What is our time to fill for this function in this country?"
- "Show me the project scorecards."
- "Who is on the bench?"
- "What is utilisation this month, by level?" and "What does the utilisation outlook look like to the end of the year?"
- "Who is on this project's team?"

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
| "Newton for Claude is available to Leadership and Admin only." | Your account is not in the Leadership group. Ask Chris if you think it should be. |
| "That Newton data isn't available to your account." | Ask Chris. |
| "Newton took too long to answer. Try again, or ask for a smaller slice (one project, fewer weeks)." | Ask again for one project or a shorter period. |
| "Couldn't load Newton" followed by a reason | Check your internet connection and ask again. |
| "Newton for Claude needs updating." | See "Updating". |

If Chris asks for the log file, it is `%LOCALAPPDATA%\Claude\Logs\mcp-server-Newton for Claude.log`. If you can't find it there, look in `%LOCALAPPDATA%\Packages\Claude_<id>\LocalCache\Local\Claude\Logs\`.

## Privacy and safety

- **What Claude can see:** project and role names, stages, dates, counts, percentages, flags, staff names, level and location.
- **What it never gets:** candidate names, salaries or any money (budgets, bill rates, fees, forecasts), notes, hiring managers' names, rejection reasons or email addresses.
- **Read-only:** nothing you ask can change Newton.
- **Sign-in:** it uses Newton's own Microsoft sign-in and asks only for basic profile and Newton data access (User.Read, Sites.Selected, offline_access). It does not touch your files or OneDrive.
- **Leadership and Admin only:** other accounts are stopped with a short message.