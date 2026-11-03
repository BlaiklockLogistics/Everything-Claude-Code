# Blaiklock Secret Santa

A Blaiklock Logistics parcel-tracking themed Secret Santa page for the office. Each person signs in with their
work Microsoft 365 account, leaves a one-sentence note for their Secret Santa, then "tracks
their parcel" and peels the shipping label to see who they're buying for, along with that
person's note.

- Exchange day: Thursday 24 December 2026
- Minimum spend: £20
- Hosted free on Azure Static Web Apps, with Microsoft 365 sign-in built in

## Blaiklock branding

The page is already themed as Blaiklock Logistics: the packing tape, the header, the
Blaiklock van on the tracking screen, the shipping label and the `BLK-` tracking numbers.
Two things make it match the real brand:

1. **Logo:** save the Blaiklock logo as `app/brand/logo.png` (a PNG with a transparent
   background, roughly 360 x 88 pixels or similar). The page picks it up automatically and
   shows it in the header in place of the "BLK" tile. An SVG also works: save it as
   `app/brand/logo.svg` and change `brand/logo.png` to `brand/logo.svg` in `app/app.js`.
2. **Colours:** at the top of `app/styles.css`, change `--brand` to the main Blaiklock
   colour and `--brand-ink` to the colour that sits on top of it (usually white). These
   colour the van, the logo tile and the top bar of the shipping label.

The Christmas red tape and the kraft-paper background stay, so it still feels festive.

## How it keeps the pairs secret

| What could go wrong | What stops it |
|---|---|
| Someone picks a colleague's name or edits the link to see their match | There is no name picker and nothing in the link. The server only uses the Microsoft account you signed in with. |
| Someone opens the browser's developer tools to read the full list | The full list never reaches the browser. The server sends only your own match. |
| Someone outside the company opens the link | Only signed-in Microsoft accounts reach the server, and only addresses on the list get a match. You can also restrict sign-in to the company domain. |
| The organiser sees the pairs by accident | The pairs are worked out on the server when someone asks for theirs. They are never saved in a list, sheet or file that anyone could open. |
| Someone draws themselves, or two people just swap gifts | Everyone is placed in one big loop, so neither can happen. |
| Notes leak who wrote them | The notes table stores a scrambled key instead of names or email addresses. |

One limit: anyone who can see the `DRAW_SECRET` setting in Azure **and** knows how to run the
code could work out the pairs. Keep Azure access to IT or one trusted person, and the organiser
can take part like everyone else.

## What you need

- Access to an Azure subscription. Ask IT, as the company may already have one.
- About 30 minutes.
- The list of the 28 people taking part.
- Cost: the Static Web App is on the free plan. The storage account for notes costs pennies at most.

## Setup

### 1. Make the list of people

Create a text file called `people.txt`. The easiest way is to start an email in Outlook to
everyone taking part, then copy the whole **To:** line into the file. It will look like this:

```text
Jane Smith <jane.smith@company.co.uk>; Smith, Dave <dave.smith@company.co.uk>; ...
```

One address per line also works.

Then, from the `secret-santa` folder, run:

```bash
node tools/make-settings.js people.txt
```

The script checks the list, confirms the draw works, and prints two values to copy:
`PARTICIPANTS` and `DRAW_SECRET`. It never prints who has who. Delete `people.txt` afterwards.

If nobody has Node.js installed, you can write `PARTICIPANTS` by hand in the same
`Name <email>; Name <email>` format. For `DRAW_SECRET`, use a random password of 32 characters
or more from a password generator.

### 2. Create a storage account for the notes

1. In the [Azure portal](https://portal.azure.com), search for **Storage accounts** and select **Create**.
2. Create a new resource group called `secret-santa`, give the account a name such as
   `secretsantanotes`, pick region **UK South**, and keep **Standard** performance and
   **LRS** redundancy.
3. Select **Review + create**, then **Create**.
4. Open the new storage account, go to **Security + networking > Access keys**, and copy the
   **Connection string** for key1. You'll paste it in step 4.

### 3. Create the Static Web App

1. In the Azure portal, search for **Static Web Apps** and select **Create**.
2. Fill in:
   - **Resource group:** `secret-santa`
   - **Name:** `secret-santa`
   - **Plan type:** Free
   - **Source:** GitHub. Sign in, then choose organisation `blaiklocklogistics`, repository
     `everything-claude-code`, and the branch that holds this folder.
   - **Build presets:** Custom
   - **App location:** `secret-santa/app`
   - **Api location:** `secret-santa/api`
   - **Output location:** leave blank
3. Select **Review + create**, then **Create**.

Azure adds a deployment workflow to the repository and publishes the site. This takes a few
minutes. You can watch it under the repository's **Actions** tab.

### 4. Add the settings

Open the Static Web App, go to **Settings > Environment variables**, and add these to
**Production**:

| Name | Value | Required |
|---|---|---|
| `PARTICIPANTS` | From step 1 | Yes |
| `DRAW_SECRET` | From step 1 | Yes |
| `STORAGE_CONNECTION_STRING` | From step 2 | Yes |
| `ALLOWED_EMAIL_DOMAINS` | The company email domain, e.g. `company.co.uk` | Recommended |
| `REVEAL_OPENS` | When reveals unlock, e.g. `2026-12-01T09:00:00Z`. Leave it out to open straight away. | No |
| `EVENT_NAME` | Defaults to `Secret Santa 2026` | No |
| `EXCHANGE_DATE` | Defaults to `2026-12-24` | No |
| `MIN_SPEND` | Defaults to `£20` | No |

Select **Apply**. The settings take effect within a minute.

### 5. Test it

1. Open the site's URL from the Static Web App's **Overview** page.
2. Select **Sign in with Microsoft**. The first time, Microsoft may ask you to allow
   "Azure Static Web Apps" to read your basic profile. If it says an admin must approve,
   ask IT to grant consent once for the organisation.
3. Check that your name appears, save a note, and confirm the reveal works.
4. Ask someone who isn't taking part to sign in. They should see "We couldn't find a
   consignment for you".

### 6. Send it out

Share the link by email or in Teams. A timeline that works well:

1. **Week 1:** send the link and ask everyone to save their note. Set `REVEAL_OPENS` to the
   start of week 2 so the page shows a countdown.
2. **Week 2:** reveals unlock, and everyone sees who they've got with that person's note
   already filled in.
3. **24 December:** gift exchange.

## Important rules once it's live

- **Don't change `PARTICIPANTS` or `DRAW_SECRET` after anyone has seen their match.** The draw
  is worked out from both, so changing either reshuffles everyone.
- To add or remove someone, do it **before** reveals open, with `REVEAL_OPENS` set to a date
  in the future.
- Notes can be edited at any time, and the person buying for them always sees the latest
  version.

## Troubleshooting

| What you see | What to do |
|---|---|
| "We couldn't find a consignment for you" for someone on the list | The page shows the address they signed in with. Their Microsoft sign-in name may differ from their email address. Put the sign-in address in `PARTICIPANTS`, before reveals open. |
| "The depot isn't set up yet" | A required setting is missing or invalid. Check the names in step 4 and look at the Static Web App's logs. |
| The deployment fails on the API runtime | In `app/staticwebapp.config.json`, change `"node:22"` to `"node:20"` and push again. |
| A sign-in page appears with a GitHub option | Only Microsoft sign-in is enabled. The GitHub and Twitter sign-in routes return "not found". |

## Stricter sign-in (optional)

The free plan accepts any Microsoft account at sign-in. Matches are only given to addresses on
the list, and `ALLOWED_EMAIL_DOMAINS` limits it to the company domain. To also block every
account outside the company's Microsoft 365 tenant at the sign-in screen, upgrade to the
Standard plan, register an app in Microsoft Entra ID, configure custom authentication with
your tenant's issuer, and set `ALLOWED_TENANT_ID` to your tenant ID. Most offices won't need
this.

## For developers

```text
secret-santa/
  app/                  Static page (HTML, CSS, JS) and staticwebapp.config.json
  api/                  Azure Functions (Node.js v4 model)
    src/index.js        Routes: GET /api/me, PUT /api/wishlist, GET /api/reveal
    src/lib/            Settings, draw, sign-in check, notes storage, handlers
  tools/                make-settings.js for the organiser
  tests/                node:test suite
```

Run the tests from the `secret-santa` folder:

```bash
npm test
```

To run the whole site locally, use the Static Web Apps CLI with the Functions Core Tools,
which simulates sign-in, and set `WISHLIST_STORE=memory` in `api/local.settings.json`
instead of a storage connection string.
