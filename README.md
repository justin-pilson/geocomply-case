# GeoComply deal platform: live demo

Two separate websites that talk to each other through one database.

- `crm/`: a mock of Salesforce. This is where the rep creates the deal, logs a call, asks for an engineer and closes the deal.
- `platform/`: the GeoComply platform (engineering, pods, marketing). It shows the same deal live as it changes.
- `supabase/`: the backend, already set up for you. `schema.sql` is the database. `functions/predict/index.ts` is the model.

## How the pieces connect

1. The CRM saves the deal to the `deals` table in Supabase.
2. The CRM calls the `predict` function on Supabase's servers. It reads the 17 past deals from the `past_deals` table, scores how similar each one is, lets the 5 closest vote, and writes the results to `model_runs` and `predictions`.
3. Both sites listen to the database. When anything changes, both update within a second. (If live updates are blocked on the venue Wi-Fi, they still refresh every 5 seconds.)

Supabase project: **geocomply-deal-demo** (in the same organization as your other projects).

## Put both sites online with Vercel

You need Node.js on your computer. To check, open Terminal and type `node -v`. If you see a version number, you're set. If not, install the "LTS" version from nodejs.org first.

1. Unzip the folder somewhere easy, like your Desktop.
2. Open Terminal and go into the platform folder. Type `cd ` (with a space), drag the `platform` folder into the Terminal window, then press Enter.
3. Type `npx vercel --prod` and press Enter.
   - If it asks to install the `vercel` package, type `y`.
   - It opens your browser to log in to Vercel. Log in, then come back to Terminal.
   - Answer the setup questions: set up and deploy, yes. Which scope, pick your account. Link to an existing project, no. Project name, type `geocomply-platform`. Code location, press Enter. Modify settings, no.
   - When it finishes, it prints a link ending in `.vercel.app`. That's your platform site. Copy it.
4. Open `crm/config.js` in any text editor (TextEdit works). Paste the platform link between the quotes after `PLATFORM_URL:`, so it looks like `PLATFORM_URL: 'https://geocomply-platform.vercel.app'`. Save.
5. Back in Terminal, type `cd ` again, drag the `crm` folder in, press Enter, then run `npx vercel --prod` again. Name this project `geocomply-crm`.
6. Open both links in two browser windows side by side.

If you edit anything later, run `npx vercel --prod` again from that folder to update the live site.

## Running the demo

Start on the CRM. Click **Reset demo** first if a deal is already there.

1. **New**, then **Fill demo deal**, then **Save**. The model runs on the server.
2. **See how it decided** shows every past deal and its match score.
3. **Activity**, **Log a Call**, **Fill demo note**, **Save**. The model reruns, and the permission prompt becomes "Stuck now".
4. **Bring an engineer to the next call**.
5. On the platform: the deal is on the engineering board. Open it and click **Assign to me**. The CRM updates by itself.
6. **Marketing** shows the new buyer quote.
7. Back in the CRM, click **Closed** on the stage bar. On the platform, **Pods** shows the handoff.

## If the judges ask where the data is

Open supabase.com/dashboard, then the **geocomply-deal-demo** project.

- **Table Editor**:
  - `past_deals` is what the model learns from: the 18 deals from the pipeline extract. The `sticking_points` column is what each got stuck on. NV-083 is marked `held_out`, so the model never sees its answer.
  - `deals`, `activities`, `model_runs` and `predictions` fill in live as you click through the demo.
  - Open a row in `model_runs` to show every match score.
- **Edge Functions**, then **predict**, shows the model's code.

## Security note

The key in `config.js` is Supabase's public key. The database only lets it read the demo data and edit the single demo deal (NV-083). All data is example data from the case.
