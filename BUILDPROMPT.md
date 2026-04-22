# Build prompt: site-publish skill extension + whatarewecapableof agent

Use this prompt in a fresh session to build both pieces. It is self-contained.

---

## Prompt

I need you to build two things: (1) extend an existing skill with new reference files, and (2) create a new agent. Both follow established patterns in my skill architecture. Read the relevant existing files first to match conventions exactly.

### Part 1: Extend the site-publish skill with DNS and domain management

The site-publish skill at `~/.pi/agent/skills/site-publish/` currently covers Git, GitHub, and Vercel workflows for static sites. It needs new reference files covering domain registration, DNS management, and email setup. This knowledge was developed through a real setup session and captures hard-won operational details.

**Before writing anything:** read `~/.pi/agent/skills/site-publish/SKILL.md` and all existing reference files in that skill to understand the format, voice, and conventions.

**Create these new reference files:**

#### `references/05-domain-dns.md` — Domain and DNS management via Namecheap

Cover the full domain-to-deployment pipeline. Key content:

- Two DNS strategies: (A) keep Namecheap as DNS provider with individual records pointing to Vercel, (B) delegate nameservers to Vercel entirely. Recommend A for any domain that will also handle email or subdomains for other services.
- Namecheap API setup: enabling access (20+ domains or $50 balance/spend requirement, or contact support), IP whitelisting (must be done manually in dashboard first, no API for this), authentication via query params (ApiUser, ApiKey, UserName, ClientIp).
- The `namecheap.domains.dns.getHosts` and `namecheap.domains.dns.setHosts` endpoints. Stress that setHosts is a FULL REPLACEMENT of all records, not a patch. Any automation must read-before-write, merge new records with existing, and validate that MX/TXT records survive.
- Critical gotcha: setHosts silently drops MX records unless `EmailType=MX` is explicitly passed. This is not documented well and will break email if missed.
- API returns XML, not JSON. Authentication is query-param based.
- IP whitelisting friction: residential IPs change. For production automation, use a fixed-IP server or cloud function.
- DNS records for Vercel hosting: A record @ -> 76.76.21.21, CNAME www -> cname.vercel-dns.com.
- Apex domain CNAME limitation: DNS spec doesn't allow CNAME on apex. That's why Vercel uses A for apex, CNAME for www. Namecheap BasicDNS doesn't support ALIAS/ANAME.
- DNS propagation: typically 5-30 minutes, can take up to 48 hours.
- Vercel side: `vercel domains add`, `vercel domains inspect` for diagnostics, SSL auto-provisioned via Let's Encrypt once A record resolves.
- Multiple Vercel projects on one domain via subdomain CNAME records.

#### `references/06-email-setup.md` — Email configuration for custom domains

Cover setting up email alongside Vercel hosting. Key content:

- Email adds MX records, TXT records (SPF, DKIM, DMARC) alongside Vercel A/CNAME. All coexist in the same DNS zone.
- Cheap-to-premium migration path: start with Namecheap Private Email (~$1/mo per mailbox), migrate to Google Workspace ($7.20/user/mo) when you need Gmail interface, calendar, Drive, or multiple users. Migration is a DNS record swap; Vercel records don't change.
- Namecheap Private Email tiers: Starter (~$1/mo, 1GB), Pro (~$2.50/mo, 5GB), Ultimate (~$3.50/mo, unlimited). Powered by Open-Xchange/privateemail.com.
- Google Workspace tiers: Business Starter ($7.20/user/mo, 30GB), Business Standard ($14.40/user/mo, 2TB).
- Cost comparison for 3 mailboxes: Namecheap Starter ~$35/yr vs Workspace ~$259/yr.
- DNS records for Namecheap Private Email: MX mx1.privateemail.com (pri 10), MX mx2.privateemail.com (pri 10), TXT SPF (v=spf1 include:spf.privateemail.com ~all). DKIM is auto-added by Namecheap when you activate the email product.
- DNS records for Google Workspace: MX aspmx.l.google.com (pri 1), alt1/alt2 (pri 5), TXT SPF (v=spf1 include:_spf.google.com ~all), TXT DKIM (from Workspace admin console), TXT DMARC.
- DMARC setup: TXT record at _dmarc subdomain. Recommended starting policy: v=DMARC1; p=quarantine; rua=mailto:admin@domain. Explains what SPF, DKIM, and DMARC each do for deliverability.
- The setHosts full-replacement risk is amplified with email records. Breaking MX/SPF/DKIM silently kills email delivery and is harder to detect than a broken website.
- Mailbox creation is done through the Namecheap dashboard (not API). The API manages DNS records only.

**Update SKILL.md:** add rows to the routing table for the new reference files:

| If the task involves... | Read |
|---|---|
| Domain registration, DNS, Namecheap API | `references/05-domain-dns.md` |
| Email setup, MX records, deliverability | `references/06-email-setup.md` |

Add a common sequence:

- **"New site with custom domain and email"** — 01 (project setup), 05 (DNS), 06 (email), then 02 (daily workflow)

Also add whatarewecapableof.com to the projects table in SKILL.md alongside any existing projects listed there.

### Part 2: Create the whatarewecapableof agent

Noah and Austin are starting a consulting agency. The domain whatarewecapableof.com is its home. This agent manages the project context, follows the opulist-advisor pattern.

**Before writing anything:** read `~/.pi/agent/agents/opulist-advisor.md` and `~/.pi/agents/opulist-advisor/AGENT.md` to understand the agent format for both pi and Claude Code. Write both versions.

**Agent name:** `whatarewecapableof`

**Key context to embed in the agent:**

Team:
- Noah Glynn and Austin [last name TBD] are co-founders
- Consulting agency, early stage, pre-revenue
- Domain: whatarewecapableof.com

Current infrastructure:
- GitHub repo: youlikemodernart/whatarewecapableof (placeholder site)
- Vercel project: whatarewecapableof (deployed, SSL active)
- Domain: whatarewecapableof.com (Namecheap, DNS managed via API)
- DNS: A record to Vercel, CNAME for www, MX/SPF/DKIM/DMARC for email
- Email: Namecheap Private Email Starter, 3 mailboxes (hello@, noah@, austin@)
- Favicon: white square (#FFFFFF), OG card: white background with "What are we capable of?" in Helvetica Neue

Namecheap API access:
- Username: noahglynn
- API key location: stored in session, should be moved to a secure location or env var
- Whitelisted IP: 98.190.145.152 (coffee shop, will change)
- SLD: whatarewecapableof, TLD: com

What the agent should do:
- Track consulting agency development (positioning, services, clients, pipeline)
- Manage site development as it evolves beyond placeholder
- Handle DNS and email changes via Namecheap API when needed
- Coordinate deploys through the site-publish workflow
- Maintain awareness of the email setup and migration path to Google Workspace

What the agent should NOT do:
- Manage other domains or projects (those have their own agents/skills)
- Make Namecheap API calls without confirming the whitelisted IP is current
- Store API keys in the agent file (reference env vars or secure storage)

Scope for the agent definition:
- Include a "Before Answering" routing table that points to site-publish references for DNS/email/deploy questions
- Include infrastructure status section with current URLs, records, email config
- Include a team section
- Include an "Agency Development" section with placeholder for positioning, services, target market as those get defined
- Include conduct rules: verify IP before API calls, read-before-write on DNS, confirm destructive changes

**Write to both locations:**
- Pi: `~/.pi/agent/agents/whatarewecapableof.md`
- Claude: `~/.pi/agents/whatarewecapableof/AGENT.md`

Use the correct frontmatter for each (pi uses `model`, `thinking`, `tools`; Claude uses `model`, `effort`, `tools` with capitalized tool names).

### Verification

After building both pieces:
1. Confirm all new files exist at the expected paths
2. Confirm SKILL.md routing table was updated
3. Confirm both agent files have identical body content with correct frontmatter
4. Read the site-publish SKILL.md back and verify the new routing table rows render correctly
5. Read both agent files back and verify they match the opulist-advisor pattern
