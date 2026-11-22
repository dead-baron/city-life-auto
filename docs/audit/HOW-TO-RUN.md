# Running the audit with your API credits (on your computer, ~15 minutes to set up)

1. **API key with a spending cap** - console.anthropic.com (Steve's Individual Org): Settings > Workspaces > Create a
   workspace "audit" with a monthly spend limit (e.g. $150); then API keys > Create key in that workspace. Keep the key
   private (not in chats, not in files you commit).
2. **Tools** (once): Git, Node.js 20 or newer (nodejs.org), then in a terminal: `npm install -g @anthropic-ai/claude-code`
3. **Get the code** (PowerShell):
   ```
   cd $HOME
   git clone https://github.com/dead-baron/city-life-auto.git cla-audit
   cd cla-audit
   git checkout audit
   npm install
   ```
4. **Run it** (same window; the key only lives in this window):
   ```
   $env:ANTHROPIC_API_KEY = "<paste the key here>"
   claude -p "Read docs/audit/TASK.md and do it." --model <the Fable or Opus model name> --max-turns 400 --permission-mode acceptEdits --allowedTools "Bash,Read,Edit,Write,Grep,Glob"
   ```
   It runs on its own for an hour or more and prints the summary at the end. The workspace's spend limit stops it if
   it runs over. If it stops early, run the same command again: it picks up from the commits on the branch.
5. **When it's done**: the report is `docs/audit/REPORT.md` on the `audit` branch (pushed to GitHub). Tell Claude
   "the audit is done" on Friday and the fix pass starts from it.

Nothing here touches the live game: it never pushes to main.
