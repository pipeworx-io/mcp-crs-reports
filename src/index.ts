interface McpToolDefinition {
  name: string;
  description: string;
  /** Human-facing one-liner (fleet #1967). Optional; consumers fall back to
   *  description. Kept in step with shared/src/types.ts — scripts/lib/
   *  check-inlined-types.mjs reports drift at publish time. */
  summary?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    anyOf?: Array<{ required: string[] }>;
    oneOf?: Array<{ required: string[] }>;
    allOf?: Array<{ required: string[] }>;
  };
  outputSchema?: Record<string, unknown>;
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Legal authority typing and the age-labelling contract.
 *
 * Phase 0 of docs/secondary-legal-sources-plan.md (fleet #1970). This is the
 * SHARED shape that 14 federal secondary-legal source packs key on, so it is
 * defined once here rather than retrofitted across 14 packs later.
 *
 * WHAT THIS IS FOR. The product claim is that an agent asking a legal question
 * can rank what it gets back — controlling authority above the issuing agency's
 * own reading of its rule, that above a practitioner manual, that above a law
 * review article, that above a 1910 treatise. No free legal tool does this. The
 * ranking is only possible if every pack labels its documents with the same
 * vocabulary, which is what `AUTHORITY_TYPES` and `BINDING_STATUSES` are.
 *
 * THE TWO AXES ARE NOT THE SAME AXIS, and conflating them is the mistake this
 * file exists to prevent:
 *
 *   authority_type  — what KIND of instrument this is. A property of the
 *                     document. Stable forever. A repealed statute is still a
 *                     statute.
 *   binding_status  — what FORCE it carries. Changes over time (a rule is
 *                     proposed, then binding, then vacated) and is the axis
 *                     `superseded_by` hangs off.
 *
 * A single "authority level" field cannot express "an agency manual that its own
 * staff must follow but which binds no court", and that describes the IRM, the
 * Justice Manual, the MPEP and the TMEP — four of our fourteen sources. Hence
 * two fields.
 *
 * Vocabulary rationale, including everything deliberately EXCLUDED:
 * docs/secondary-legal-authority-vocabulary.md
 */

// ───────────────────────── authority_type ─────────────────────────
//
// Ordered by tier, and the order in this array is not load-bearing — read the
// tier from AUTHORITY_TIER. Each value has to earn its place by changing what a
// caller would DO with the document; a value that only adds a synonym is a value
// that will be filled in inconsistently by 14 packs.

const AUTHORITY_TYPES = [
  // ── Tier 1: controlling. A tribunal in the document's own jurisdiction must
  //    follow it. These are the things an answer should lead with.
  'constitution',        // Constitutional text itself. Separated from `statute`
                         // because nothing supersedes it by ordinary enactment,
                         // so it never carries binding_status 'superseded'.
  'treaty',              // Ratified agreement with domestic force. Not in the
                         // current 14 sources, but included because its absence
                         // would force treaties into `statute`, which is wrong
                         // about how they are amended and displaced.
  'statute',             // Enacted legislation. U.S.C., Public Laws.
  'regulation',          // Legislative rule with the force of law — notice and
                         // comment, codified in the CFR. Distinct from
                         // `agency_guidance` precisely because that one is the
                         // sub-regulatory material that does NOT bind.
  'case',                // Judicial decision. Binding within its own court
                         // hierarchy, persuasive outside it — which is why the
                         // forum-relativity note below matters most here.
  'court_rule',          // FRCP, FRE, local rules. Force of law, but procedural
                         // and promulgated by courts rather than legislatures,
                         // so a caller filtering for "substantive law" needs to
                         // be able to exclude them.

  // ── Tier 2: official interpretation. The issuing body's own reading of an
  //    instrument it administers. Entitled to weight; binds no court.
  'agency_guidance',     // Sub-regulatory: interpretive rules, policy
                         // statements, staff bulletins, no-action letters,
                         // enforcement guidance. EEOC/DOL/NLRB guidance, SEC
                         // staff interpretations, FTC Legal Library.
  'agency_manual',       // The agency's internal operating manual: IRS IRM, DOJ
                         // Justice Manual, USPTO MPEP/TMEP, Copyright Office
                         // Compendium. Split from `agency_guidance` because
                         // these are the documents that carry binding_status
                         // 'binding_on_issuer' — they direct the agency's own
                         // staff while expressly conferring no rights on the
                         // public.
  'legislative_history', // Committee reports, conference reports, floor
                         // statements. Official in origin, interpretive in use.

  // ── Tier 3: practitioner guidance. Authoritative in practice, no legal force.
  'practice_manual',     // Court and tribunal practice manuals: EOIR practice
                         // manuals, FJC benchbooks.
  'jury_instruction',    // Pattern jury instructions. The direct answer to
                         // "what must be proven", which is why they get their
                         // own value rather than sitting inside
                         // `practice_manual` where a caller could not filter
                         // for them.
  'legal_treatise',      // Systematic expert treatment: the GAO Red Book.
                         // Current, maintained, cited by practitioners.
  'legislative_analysis',// CRS reports, GAO reports, Commons Library briefings.
                         // Non-partisan expert analysis prepared for
                         // legislators. NOT tier 2: CRS speaks for nobody and
                         // interprets no rule of its own. NOT tier 4: not
                         // peer-reviewed scholarship either.

  // ── Tier 4: scholarly commentary.
  'scholarly_article',   // Peer-reviewed or law-review published. OpenAlex,
                         // Crossref, DOAJ, Digital Commons.
  'working_paper',       // Preprint or unreviewed. Split from
                         // `scholarly_article` because "has this been through
                         // review" changes how much weight an agent should give
                         // it, and both arrive from the same upstreams.

  // ── Tier 5: historical commentary.
  'historical_treatise', // A treatise whose value is historical rather than
                         // current — the public-domain 1910 titles. Labelled so
                         // an agent never presents one as the current rule.

  // ── Tier 6: reference. Makes no authority claim at all.
  'reference',           // Glossaries, citation guides, dictionaries. Kept
                         // rather than folded into `scholarly_article`, which
                         // would put a definition list in the scholarship tier
                         // and corrupt every ranking that reads it.
] as const;

type AuthorityType = (typeof AUTHORITY_TYPES)[number];

/** The five tiers the product promise names, plus reference for things making no claim. */
const AUTHORITY_TIERS = [
  'controlling',
  'official_interpretation',
  'practitioner_guidance',
  'scholarly_commentary',
  'historical_commentary',
  'reference',
] as const;

type AuthorityTier = (typeof AUTHORITY_TIERS)[number];

const TIER_OF: Record<AuthorityType, AuthorityTier> = {
  constitution: 'controlling',
  treaty: 'controlling',
  statute: 'controlling',
  regulation: 'controlling',
  case: 'controlling',
  court_rule: 'controlling',
  agency_guidance: 'official_interpretation',
  agency_manual: 'official_interpretation',
  legislative_history: 'official_interpretation',
  practice_manual: 'practitioner_guidance',
  jury_instruction: 'practitioner_guidance',
  legal_treatise: 'practitioner_guidance',
  legislative_analysis: 'practitioner_guidance',
  scholarly_article: 'scholarly_commentary',
  working_paper: 'scholarly_commentary',
  historical_treatise: 'historical_commentary',
  reference: 'reference',
};

/** 1 = controlling … 6 = reference. Lower sorts first. */
function authorityTier(t: AuthorityType): AuthorityTier {
  return TIER_OF[t];
}

function authorityTierRank(t: AuthorityType): number {
  return AUTHORITY_TIERS.indexOf(TIER_OF[t]) + 1;
}

/**
 * The one-bit view a lot of callers actually want. Derived rather than stored,
 * so it cannot drift away from authority_type — which is what would happen if
 * `primary`/`secondary` were a column somebody had to remember to set.
 */
function isPrimaryAuthority(t: AuthorityType): boolean {
  return TIER_OF[t] === 'controlling';
}

// ───────────────────────── binding_status ─────────────────────────

const BINDING_STATUSES = [
  'binding',            // A tribunal in this document's own jurisdiction must
                        // follow it. See the forum-relativity note below: this
                        // is the document's claim, not a claim about the
                        // caller's forum.
  'persuasive',         // May be relied on, need not be followed. The default
                        // truthful answer for most secondary material.
  'binding_on_issuer',  // Binds the issuing agency's own staff; creates no
                        // rights in third parties and binds no court. The IRM,
                        // the Justice Manual and the MPEP all say this about
                        // themselves in terms. Collapsing it into 'binding'
                        // would be flatly false; collapsing it into
                        // 'persuasive' loses that an examiner IS required to
                        // follow it, which is the whole reason a patent
                        // practitioner reads the MPEP.
  'proposed',           // Not yet in force: an NPRM's rule text, an introduced
                        // bill, a draft edition. effective_date is in the
                        // future or unknown.
  'superseded',         // Replaced by a later instrument. `superseded_by` names
                        // it. Still served — per Bruce's serve-and-label ruling
                        // we never withhold — but never as current law. The GAO
                        // Red Book third edition against the fourth is exactly
                        // this.
  'repealed',           // Withdrawn with nothing replacing it. Distinct from
                        // 'superseded' because the caller's next action differs:
                        // superseded means go read superseded_by, repealed means
                        // there is nothing to go and read.
  'vacated',            // Struck down by a court. Distinct from 'repealed'
                        // because it was never validly law rather than having
                        // been withdrawn, and because a vacated rule served as
                        // binding is the worst single error this schema can
                        // make.
  'unknown',            // We could not determine it from the source. THE
                        // DEFAULT, deliberately: the alternative to an explicit
                        // 'unknown' is a pack guessing, and a guessed 'binding'
                        // is the most dangerous value in this vocabulary. An
                        // omission has to read as an omission, not as
                        // 'persuasive'.
] as const;

type BindingStatus = (typeof BINDING_STATUSES)[number];

/**
 * BINDING_STATUS IS A CODED VALUE **AND** A PROSE NOTE. Both, not either.
 *
 * Settled here because two shipped tools had already guessed differently. The
 * govinfo GAO tools (#1972) put a whole sentence in `binding_status` — "GAO's own
 * view of federal appropriations law. Persuasive and followed in practice by
 * agency counsel; not binding on courts." That sentence is genuinely more useful
 * to a caller than any enum value, and it is also unrankable, unfilterable and
 * unjoinable. Choosing one loses something real either way:
 *
 *   enum only   — an agent can rank and filter, but "followed in practice by
 *                 agency counsel though not binding on courts" is exactly the
 *                 kind of thing a lawyer needs and `persuasive` does not say.
 *   prose only  — reads well and cannot be computed over. Ranking 14 sources by
 *                 authority is the product promise; it dies here.
 *
 * So `binding_status` is the controlled vocabulary (machine-readable, what
 * authoritySortKey reads) and `binding_note` is the sentence (human-readable,
 * never parsed). A pack SHOULD set both. The enum is what ranks; the note is
 * what explains. Nothing ever infers one from the other — a note is not parsed
 * into a status, because a regex over legal prose producing `binding` is the
 * single worst failure available to this schema.
 */
const BINDING_STATUS_IS_CODED_PLUS_PROSE = true;

/**
 * BINDING IS RELATIVE TO A FORUM AND WE DO NOT KNOW THE CALLER'S FORUM.
 *
 * A Second Circuit opinion is binding in the Second Circuit and persuasive in
 * the Ninth. So `binding_status: 'binding'` means "this instrument carries the
 * force of law within the jurisdiction named in its own `jurisdiction` field",
 * and nothing more. The caller composes (jurisdiction, binding_status) against
 * its own forum. Baking the forum in — a `binding_in_2d_cir` value — would make
 * the field a lie for every other caller, so it is excluded by design.
 */
const BINDING_IS_FORUM_RELATIVE = true;

/**
 * How much a binding_status should discount a document WITHIN its tier. A
 * superseded statute must not outrank a current agency manual when the question
 * is "what is the rule now", and tier alone would rank it above.
 *
 * Multiplied into the sort key rather than bolted on as a special case so the
 * behaviour is one number a reader can check.
 */
const TIER_STEP = 10;

const STATUS_PENALTY: Record<BindingStatus, number> = {
  // In force. No penalty — these three are equally "live", and which of them is
  // the right answer is decided by the TIER, not here.
  binding: 0,
  binding_on_issuer: 0,
  persuasive: 0,
  // Unlabelled costs a little, but we do not bury a document for being honest
  // about what we could not determine. Stays well inside one tier.
  unknown: 2,
  // ── Past TIER_STEP, so these CROSS A TIER BOUNDARY. That is the point and it
  //    is worth being explicit about, because it is the one place where
  //    binding_status outranks authority_type:
  //
  //    superseded statute      = 10 + 12 = 22
  //    current agency manual   = 20 +  0 = 20   ← wins
  //
  //    The default question a caller is asking is "what is the rule NOW", and a
  //    superseded statute is not an answer to it while a current manual is. A
  //    caller asking what the law was in 2019 filters on effective_date and
  //    binding_status explicitly rather than relying on this ordering.
  //
  //    The penalties are sized to cross exactly ONE tier, never two: the largest
  //    is 16, so nothing falls more than one-and-a-bit tiers. A repealed statute
  //    (25) still outranks a practitioner treatise (30), which is deliberate —
  //    the treatise is not law either, and the statute is at least primary text.
  proposed: 11,    // Not yet in force. Lands just below current guidance (20 vs 21).
  superseded: 12,  // A current version exists; prefer it. Read superseded_by.
  repealed: 15,    // Withdrawn, nothing replaces it.
  vacated: 16,     // Struck down. The value most dangerous to serve as current.
};

/**
 * Sort key for "which of these is the better authority". Ascending: lower is
 * stronger. Combines both axes, because either one alone gives a wrong order.
 */
function authoritySortKey(a: Pick<LegalAuthority, 'authority_type' | 'binding_status'>): number {
  return authorityTierRank(a.authority_type) * TIER_STEP + STATUS_PENALTY[a.binding_status ?? 'unknown'];
}

/** Strongest authority first. Stable for equal keys. */
function rankByAuthority<T extends Pick<LegalAuthority, 'authority_type' | 'binding_status'>>(docs: T[]): T[] {
  return docs
    .map((d, i) => ({ d, i, k: authoritySortKey(d) }))
    .sort((x, y) => x.k - y.k || x.i - y.i)
    .map((x) => x.d);
}

function isAuthorityType(v: unknown): v is AuthorityType {
  return typeof v === 'string' && (AUTHORITY_TYPES as readonly string[]).includes(v);
}

function isBindingStatus(v: unknown): v is BindingStatus {
  return typeof v === 'string' && (BINDING_STATUSES as readonly string[]).includes(v);
}

/**
 * A TIER NAME IS NOT AN AUTHORITY TYPE, and something has to say so out loud.
 *
 * The shipped govinfo GAO tools (#1972) emit `authority_type:
 * 'official_interpretation'` — which is a TIER, spanning three types. It is a
 * reasonable-looking mistake and `isAuthorityType` already returns false for it,
 * but a pack that proxies live never touches the CHECK constraint that would
 * reject it, so nothing tells the author. Fourteen packs making this call
 * independently is exactly the "vague enum poisons everything downstream" risk
 * this vocabulary exists to close.
 *
 * Accepting a tier as a type is NOT the fix. `official_interpretation` covers
 * `agency_guidance`, `agency_manual` and `legislative_history`, and collapsing
 * them destroys the only distinction that justifies `binding_on_issuer` — the
 * reason the two-field design exists at all. So the coarse value is refused and
 * the author is told which types to choose between.
 *
 * Returns the valid type, or a diagnosis naming the candidates.
 */
function classifyAuthorityInput(v: unknown):
  | { ok: true; authority_type: AuthorityType }
  | { ok: false; reason: string; candidates: AuthorityType[] } {
  if (isAuthorityType(v)) return { ok: true, authority_type: v };

  if (typeof v === 'string' && (AUTHORITY_TIERS as readonly string[]).includes(v)) {
    const candidates = AUTHORITY_TYPES.filter((t) => TIER_OF[t] === v);
    return {
      ok: false,
      candidates,
      reason: `"${v}" is a TIER, not an authority_type. A tier is derived from the ` +
        `type via authorityTier(); passing it as the type loses the distinction the ` +
        `tier is made of. Pick one of: ${candidates.join(', ')}.`,
    };
  }

  return {
    ok: false,
    candidates: [],
    reason: `"${String(v)}" is not an authority_type. Valid values: ${AUTHORITY_TYPES.join(', ')}.`,
  };
}

// ───────────────────────── licence terms ─────────────────────────
//
// Added for decision #1973 / task #1974: Bruce ruled we WILL mirror CC BY-NC-SA
// material (Cornell LII/Wex, CORE, CALI), served free through the gateway's
// existing `zeroRated` mechanism. That makes the licence side of this shape
// load-bearing in a way a single string cannot carry.
//
// WHY THIS IS PER DOCUMENT AND NOT PER SOURCE. CALI is the proof: most eLangdell
// titles are BY-NC-SA, but *Sources of American Law* is BY-SA with no NC clause.
// A per-pack licence constant mislabels it, and one mis-filed title is the whole
// compliance story. Same shape as the `finra` precedent, where one pack reads two
// distributions under two different sets of terms — which is why `zeroRated`
// accepts a string[] of tool names rather than only `true`.
//
// WHY A US FEDERAL WORK IS NOT "A LICENCE". 17 U.S.C. §105 makes the work
// UNCOPYRIGHTABLE. Nobody granted us anything and there is no licensor, no
// attribution clause and no downstream obligation. Forcing that into a
// CC-shaped field would tell a caller it is bound by terms that do not exist,
// which is its own kind of false statement — so `license_kind` separates the
// two and `obligations` comes back empty rather than defaulting to attribution.

const LICENSE_KINDS = [
  'public_domain_us_gov',   // 17 U.S.C. §105. Uncopyrightable, not licensed.
  'public_domain_expired',  // Copyright lapsed — the Gutenberg treatises.
  'public_domain_dedicated',// CC0 and equivalents: a deliberate dedication.
  'creative_commons',       // A CC grant with clauses that bite. BY/SA/NC/ND.
  'open_government',        // UK OGL, Open Parliament Licence, EU CC BY. Reuse
                            // including commercial reuse is granted, usually
                            // with attribution.
  'permission_none',        // No reuse grant published. Per the standing rule
                            // (`mirror-needs-grant-proxy-does-not`, Bruce
                            // 2026-09-08) we may PROXY this live but must not
                            // mirror it. The corpus table refuses this value —
                            // see the CHECK in migration 196.
  'unknown',                // Not yet checked. Also refused by the corpus table:
                            // "check before you bake, not after".
  'vendor_terms',           // A bespoke API/vendor licence with its own clauses —
                            // the Semantic Scholar API License Agreement, CORE's
                            // Terms & Conditions. Not CC, not open government,
                            // and not "no grant": there IS a grant, it is just
                            // theirs. Proxy-only: such terms forbid passing the
                            // data on as a dataset, so `mayMirror` is false and
                            // the corpus table's CHECK does not admit it. Added
                            // for #1974 so a proxied non-commercial API can carry
                            // real LicenseTerms instead of being mislabelled as
                            // Creative Commons or as unlicensed.
] as const;

type LicenseKind = (typeof LICENSE_KINDS)[number];

/** The clauses that actually constrain a caller. Empty for a public-domain work. */
const LICENSE_OBLIGATIONS = [
  'attribution',    // BY — the credit in `attribution` must be shown.
  'share_alike',    // SA — derivatives must carry the same licence.
  'non_commercial', // NC — the reason #1974 needs zeroRated.
  'no_derivatives', // ND — no modified redistribution.
] as const;

type LicenseObligation = (typeof LICENSE_OBLIGATIONS)[number];

interface LicenseTerms {
  /**
   * SPDX identifier where one exists: 'CC-BY-NC-SA-4.0', 'CC-BY-SA-4.0',
   * 'CC-BY-4.0', 'CC0-1.0', 'OGL-UK-3.0'. US federal works have no SPDX id
   * because they are not licensed at all, so they carry the LicenseRef form
   * 'LicenseRef-US-Gov-Works-17USC105' — distinguishable at a glance from a CC
   * grant, which is the point.
   */
  id: string;
  kind: LicenseKind;
  url: string | null;
  /**
   * The literal attribution string we are required to render, written out. A
   * boolean cannot be shown to a user, and ShareAlike compliance means SHOWING
   * the credit — so this is the text, or null when nothing is required.
   */
  attribution: string | null;
  /** The clauses that bite. Empty array for a public-domain work. */
  obligations: LicenseObligation[];
}

/** 'LicenseRef-' prefix marks an id that is not an SPDX licence — see LicenseTerms.id. */
const US_GOV_LICENSE_ID = 'LicenseRef-US-Gov-Works-17USC105';

/** The terms for a work of the US federal government. No licensor, no clauses. */
function usGovernmentWork(): LicenseTerms {
  return {
    id: US_GOV_LICENSE_ID,
    kind: 'public_domain_us_gov',
    url: 'https://www.law.cornell.edu/uscode/text/17/105',
    attribution: null,
    obligations: [],
  };
}

/**
 * Is the CALLER bound by anything downstream? This is the flag a caller needs in
 * order to comply, and it must be surfaced on the payload: they cannot honour
 * terms we never showed them.
 */
function isEncumbered(l: LicenseTerms): boolean {
  return l.obligations.length > 0;
}

/**
 * Does serving this document have to be free? NC forbids commercial use, and
 * Pipeworx bills per call, so an NC document must route through the gateway's
 * `zeroRated` path. This is the hook #1974 reads; it is derived from the
 * obligations rather than stored, so it cannot drift away from the licence.
 */
function requiresZeroRating(l: LicenseTerms): boolean {
  return l.obligations.includes('non_commercial');
}

/**
 * May we MIRROR this document, as opposed to proxying it live? Bruce's standing
 * rule: `mirror-needs-grant-proxy-does-not` (2026-09-08). Everything in the
 * corpus rail is a mirror by construction, so this has to be true for anything
 * that lands in `secondary_legal_documents` — and migration 196 enforces it in
 * the database rather than trusting 14 loaders to remember.
 */
function mayMirror(l: LicenseTerms): boolean {
  return l.kind !== 'permission_none' && l.kind !== 'unknown' && l.kind !== 'vendor_terms';
}

/** One sentence a caller can render verbatim next to the text. */
function licenseNote(l: LicenseTerms): string {
  if (!isEncumbered(l)) {
    return l.kind === 'public_domain_us_gov'
      ? 'Work of the United States Government — not subject to copyright (17 U.S.C. § 105). No reuse conditions.'
      : `${l.id} — no reuse conditions.`;
  }
  const clauses: string[] = [];
  if (l.obligations.includes('attribution')) {
    clauses.push(`you must credit the source${l.attribution ? ` as: "${l.attribution}"` : ''}`);
  }
  if (l.obligations.includes('share_alike')) clauses.push(`any derivative you publish must carry ${l.id}`);
  if (l.obligations.includes('non_commercial')) clauses.push('you may not use it commercially');
  if (l.obligations.includes('no_derivatives')) clauses.push('you may not publish modified versions');
  return `${l.id} — ${clauses.join('; ')}. These conditions bind you as well as us.`;
}

/**
 * A Creative Commons grant, with the obligations DERIVED from the SPDX id so
 * the two can never disagree: 'CC-BY-NC-SA-2.5' yields attribution +
 * non_commercial + share_alike, and the licence URL is built from the same
 * tokens. `attribution` is the credit line the rightsholder asks for, written
 * out — BY means rendering it, so it travels on the payload verbatim.
 *
 * Added for #1974 (Cornell LII/Wex is BY-NC-SA 2.5 per its own terms page;
 * CALI eLangdell titles are BY-NC-SA 4.0 or BY-SA 4.0 per each book's front
 * matter). A pack that hand-types `obligations` next to an id is one edit
 * away from a BY-SA title labelled non-commercial or the reverse, and one
 * mis-filed title is the whole compliance story.
 */
function creativeCommonsLicense(id: string, attribution: string | null): LicenseTerms {
  const m = /^CC-(0|BY(?:-NC)?(?:-SA|-ND)?)-(\d+\.\d+)$/i.exec(id.trim());
  if (!m) throw new Error(`creativeCommonsLicense: unrecognised id ${JSON.stringify(id)} (expected e.g. CC-BY-NC-SA-4.0 or CC0-1.0-style CC-0-1.0)`);
  const clauses = m[1].toUpperCase();
  const version = m[2];
  if (clauses === '0') {
    return {
      id: `CC0-${version}`,
      kind: 'public_domain_dedicated',
      url: `https://creativecommons.org/publicdomain/zero/${version}/`,
      attribution: null,
      obligations: [],
    };
  }
  const obligations: LicenseObligation[] = ['attribution'];
  if (clauses.includes('-NC')) obligations.push('non_commercial');
  if (clauses.includes('-SA')) obligations.push('share_alike');
  if (clauses.includes('-ND')) obligations.push('no_derivatives');
  return {
    id: `CC-${clauses}-${version}`,
    kind: 'creative_commons',
    url: `https://creativecommons.org/licenses/${clauses.toLowerCase()}/${version}/`,
    attribution,
    obligations,
  };
}

/**
 * Terms that are a vendor's own document rather than a public licence — an API
 * licence agreement we accepted to hold a key. `id` uses the SPDX LicenseRef
 * form so it cannot be mistaken for a CC grant; `url` is the document itself;
 * `obligations` are whichever of the four clauses the document actually
 * imposes, read from it rather than assumed. Always proxy-only (see mayMirror).
 */
function vendorTermsLicense(opts: {
  ref: string;
  url: string;
  attribution: string | null;
  obligations: LicenseObligation[];
}): LicenseTerms {
  const ref = opts.ref.startsWith('LicenseRef-') ? opts.ref : `LicenseRef-${opts.ref}`;
  return { id: ref, kind: 'vendor_terms', url: opts.url, attribution: opts.attribution, obligations: [...opts.obligations] };
}

/**
 * Put the licence ON THE PAYLOAD. Every response of a licensed pack — including
 * soft failures, which are still "derived from" the licensed source — carries
 * `license` (the LicenseTerms: id, kind, url, attribution, obligations),
 * `license_note` (one sentence a caller can render verbatim) and, for BY
 * terms, a top-level `attribution` so the credit is the first thing a
 * synthesising model reads. Leading keys on purpose — mcps/finra established
 * that ordering and the reason (fleet #531): the answer path passes a pack's
 * structuredContent through, so what leads the object leads the answer.
 *
 * This is the coordination point with #1970/#1976: one `license` field, one
 * shape, derived from LicenseTerms — never a second per-pack mechanism.
 */
function attachLicense<T>(result: T, terms: LicenseTerms): Record<string, unknown> {
  const head: Record<string, unknown> = {
    ...(terms.attribution ? { attribution: terms.attribution } : {}),
    license: terms,
    license_note: licenseNote(terms),
  };
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    return { ...head, ...(result as Record<string, unknown>) };
  }
  return { ...head, data: result };
}

function isLicenseKind(v: unknown): v is LicenseKind {
  return typeof v === 'string' && (LICENSE_KINDS as readonly string[]).includes(v);
}

function isLicenseObligation(v: unknown): v is LicenseObligation {
  return typeof v === 'string' && (LICENSE_OBLIGATIONS as readonly string[]).includes(v);
}

// ───────────────────────── the envelope ─────────────────────────

/**
 * The authority envelope every secondary-legal pack attaches to a document.
 * Mirrors the columns in supabase/migrations/196_secondary_legal_corpus.sql —
 * keep the two in step.
 */
interface LegalAuthority {
  /** Stable id within the source, e.g. 'R47132' or 'mpep-2106'. */
  doc_id: string;
  /** Pack/source slug this came from, e.g. 'crs-reports'. */
  source: string;
  title: string;

  authority_type: AuthorityType;
  /** Nullable so an honest omission is representable; treated as 'unknown'. */
  binding_status: BindingStatus | null;
  /**
   * The nuance the enum cannot carry, as a sentence a caller can show a human.
   * BOTH fields ship — see BINDING_STATUS_IS_CODED_PLUS_PROSE below.
   *
   * e.g. binding_status: 'persuasive' + binding_note: "GAO's own view of federal
   * appropriations law. Persuasive and followed in practice by agency counsel;
   * not binding on courts."
   */
  binding_note: string | null;

  /**
   * Whose law. Hierarchical so a caller can prefix-match:
   * 'us' · 'us-federal' · 'us-federal-ca9' · 'us-tx' · 'uk' · 'eu'.
   *
   * 'us-federal', NOT 'us-federal': the shipped govinfo GAO tools (#1972) already
   * emit the long form, and matching what is live costs nothing while an
   * abbreviation nobody needs would make two spellings of one jurisdiction.
   */
  jurisdiction: string;
  /** The body that issued it, in its own words: 'Congressional Research Service'. */
  issuer: string;

  /** When the instrument took or takes effect. Null when the source says nothing. */
  effective_date: string | null;
  /** Set when binding_status is superseded/repealed/vacated. A doc_id or citation. */
  superseded_by: string | null;

  /** Citations this document makes, as the source writes them. Never guessed. */
  citations: string[];

  /**
   * The terms WE rely on to serve this document, and the obligations they put on
   * the CALLER. Per document, not per source — see the LicenseTerms doc comment
   * for why that is not a nicety.
   */
  license: LicenseTerms;

  /** When we fetched our copy. Always set by the loader; never by hand. */
  retrieved_at: string;
  /** The source's own last-modified, when it publishes one. */
  source_last_modified: string | null;
}

// ───────────────────────── the age-labelling contract ─────────────────────────
//
// Bruce's ruling, 2026-09-14: SERVE STALE DATA AND LABEL THE AGE. Never refuse.
// So nothing in this section throws, returns null, or withholds a document. The
// only output is a label, and the caller decides.
//
// THE TWO AGES ARE DIFFERENT AND THE FLAG ONLY WATCHES ONE OF THEM.
//
//   age_days        — how old OUR COPY is (now - retrieved_at). This is the one
//                     `stale` keys on, because it is the one that answers "did
//                     our refresh stop running". It is a defect when it grows.
//   source_age_days — how old the DOCUMENT is (now - source_last_modified).
//                     Informational, and NEVER a staleness signal: the
//                     Constitution is 238 years old and perfectly fresh. Wiring
//                     the flag to this instead is the obvious bug here, which is
//                     why they have different names and this paragraph exists.

const DAY_MS = 86_400_000;

/**
 * Per-source tolerance in days: how old our copy may get before we say so.
 * Set from the source's own publication cadence plus one missed cycle, because
 * the failure worth catching is a refresh that STOPPED, not a source that is
 * between releases.
 *
 * A source absent from this map gets DEFAULT_TOLERANCE_DAYS and is reported as
 * using the default, rather than being skipped. An unlisted source that is
 * silently exempt is how a staleness check becomes unable to fail.
 */
const SOURCE_TOLERANCE_DAYS: Record<string, number> = {
  // Continuously revised, so a copy older than ~2 weeks means the cron stopped.
  'crs-reports': 14,
  'doj-justice-manual': 21,
  'irs-irm': 21,
  'govuk-manuals': 14,
  // Weekly to monthly publishers: one cycle plus a missed one.
  'gao-reports': 21,
  'ftc-legal-library': 60,
  'eeoc-dol-nlrb-guidance': 60,
  'sec-staff-interpretations': 60,
  'fjc-publications': 60,
  // Quarterly / edition-driven. Generous on the document, tight enough that a
  // dead refresh still surfaces within a cycle or two.
  'constitution-annotated': 120,
  'eoir-practice-manuals': 120,
  'uspto-mpep': 200,
  'uspto-tmep': 400,
  'copyright-compendium': 400,
  'federal-jury-instructions': 400,
  // Historical corpus: the documents never change, but a re-crawl that stops
  // still means the pipeline is dead, so this is a liveness number not a
  // freshness one.
  'gutenberg-legal': 400,
};

const DEFAULT_TOLERANCE_DAYS = 90;

function sourceToleranceDays(source: string): number {
  return SOURCE_TOLERANCE_DAYS[source] ?? DEFAULT_TOLERANCE_DAYS;
}

interface AgeLabel {
  retrieved_at: string;
  source_last_modified: string | null;
  effective_date: string | null;
  /** Age of OUR COPY in days. What `stale` watches. */
  age_days: number;
  /** Age of the DOCUMENT in days, or null. Informational — never a defect. */
  source_age_days: number | null;
  /**
   * false when the source's own last-modified is known NOT to track content.
   * GAOREPORTS is the case: 16,569 packages, none issued after 2009, every one
   * stamped last_modified 2025-03-07 — a bulk re-stamp. Present, well-formed,
   * recent, and meaningless.
   */
  source_last_modified_trusted: boolean;
  /**
   * The date the CONTENT is actually as-of, when the change signal cannot be
   * believed. Where this is set, source_age_days is measured from it rather than
   * from the re-stamp, because reporting a 2009 report as 191 days old is a
   * confident false statement and "we don't know" would have been better.
   */
  content_as_of: string | null;
  tolerance_days: number;
  /** true when age_days > tolerance_days. Never a reason to withhold. */
  stale: boolean;
  /** Set when tolerance came from DEFAULT_TOLERANCE_DAYS rather than the map. */
  tolerance_is_default: boolean;
  /** One sentence a caller can show a human verbatim. */
  note: string;
}

function ageDays(fromIso: string | null | undefined, nowMs: number): number | null {
  if (!fromIso) return null;
  const ms = Date.parse(fromIso);
  if (Number.isNaN(ms)) return null;
  // Clamp at 0: a retrieved_at a few seconds in the future (clock skew between
  // the loader and the reader) must not read as a negative age.
  return Math.max(0, Math.round(((nowMs - ms) / DAY_MS) * 10) / 10);
}

/**
 * Label a document's age. ALWAYS returns a label — there is no failure mode and
 * no refusal, by ruling.
 *
 * `toleranceOverrideDays` exists so a tool can expose a per-call tolerance and
 * so the contract is testable: lower it and `stale` must flip to true on the
 * same document, which is the red case for this check.
 */
function labelAge(
  doc: Pick<LegalAuthority, 'source' | 'retrieved_at' | 'source_last_modified' | 'effective_date'> & {
    /** Pass false when the source's last_modified is a bulk re-stamp. */
    source_last_modified_trusted?: boolean;
    /** Required when the above is false: what the content is really as-of. */
    content_as_of?: string | null;
  },
  nowMs: number = Date.now(),
  toleranceOverrideDays?: number,
): AgeLabel {
  const mapped = SOURCE_TOLERANCE_DAYS[doc.source];
  const tolerance = toleranceOverrideDays ?? mapped ?? DEFAULT_TOLERANCE_DAYS;
  const toleranceIsDefault = toleranceOverrideDays === undefined && mapped === undefined;

  // A missing or unparseable retrieved_at is not an excuse to skip the check.
  // It reads as infinitely old, which is loud, rather than as fresh, which is
  // the silent failure this whole contract exists to prevent.
  const copyAge = ageDays(doc.retrieved_at, nowMs);
  const age = copyAge ?? Number.POSITIVE_INFINITY;
  // A change signal we cannot believe must not produce a freshness number. Where
  // the source says "trust content_as_of instead", measure the document age from
  // that; where it says neither, report null rather than inventing one.
  const signalTrusted = doc.source_last_modified_trusted !== false;
  const asOf = doc.content_as_of ?? null;
  const srcAge = signalTrusted ? ageDays(doc.source_last_modified, nowMs) : ageDays(asOf, nowMs);
  const stale = age > tolerance;

  // WORDING IS LOAD-BEARING: no possessive. "our copy is 0d old" ships to
  // callers on every response on this rail and tells them we hold a copy, which
  // is against the standing rule to let callers assume pass-through. "retrieved
  // Nd ago" carries the identical meaning — a retrieval time is a fact about
  // the record either way — without making a claim about who stores what.
  // Caught live on crs_recent by Marten (0) before this rail reached its other
  // 13 sources; check:hosting-claims did not catch it because it does not scan
  // shared/ at all.
  const note = copyAge === null
    ? `no usable retrieved_at, so this is treated as stale against the ${tolerance}d tolerance for "${doc.source}"`
    : stale
      ? `retrieved ${age}d ago, past the ${tolerance}d refresh tolerance for "${doc.source}" — served anyway, labelled stale`
      : `retrieved ${age}d ago, within the ${tolerance}d refresh tolerance for "${doc.source}"`;

  return {
    retrieved_at: doc.retrieved_at,
    source_last_modified: doc.source_last_modified ?? null,
    effective_date: doc.effective_date ?? null,
    age_days: age === Number.POSITIVE_INFINITY ? Number.MAX_SAFE_INTEGER : age,
    source_age_days: srcAge,
    source_last_modified_trusted: signalTrusted,
    content_as_of: asOf,
    tolerance_days: tolerance,
    stale,
    tolerance_is_default: toleranceIsDefault,
    note,
  };
}

/**
 * The shape a pack returns for one document: the authority envelope, the age
 * label, and the text. Every secondary-legal tool response carries this so a
 * caller never has to ask a second question to find out how old the answer is.
 */
interface AuthoredDocument extends LegalAuthority {
  tier: AuthorityTier;
  freshness: AgeLabel;
  /**
   * The licence obligations, surfaced ON THE PAYLOAD rather than left in the row.
   * A caller cannot comply with terms we never showed it, so an encumbered
   * document always arrives with the conditions attached and the attribution
   * string spelled out.
   */
  license_terms: {
    encumbered: boolean;
    requires_zero_rating: boolean;
    note: string;
  };
  text?: string;
}

function withAuthorityEnvelope(
  doc: LegalAuthority,
  opts: { text?: string; nowMs?: number; toleranceOverrideDays?: number } = {},
): AuthoredDocument {
  return {
    ...doc,
    tier: authorityTier(doc.authority_type),
    freshness: labelAge(doc, opts.nowMs ?? Date.now(), opts.toleranceOverrideDays),
    license_terms: {
      encumbered: isEncumbered(doc.license),
      requires_zero_rating: requiresZeroRating(doc.license),
      note: licenseNote(doc.license),
    },
    ...(opts.text !== undefined ? { text: opts.text } : {}),
  };
}
/**
 * Congressional Research Service reports — Congress's own nonpartisan analysis, searchable and readable in full.
 *
 * (Line 2 above is what scripts/publish-pack.sh and registry-batch.sh publish
 * as the package description — keep it one complete line. Fleet #1975, #2012.)
 *
 * WHAT CRS IS, because it decides how these answers should be read. CRS is
 * Congress's in-house, nonpartisan research arm. Its reports explain what a
 * statute does, how a programme works, what a policy option would cost, and who
 * the players are — written for legislators, with citations, and revised as the
 * law moves. They are not law and they bind nobody; they are the most-cited
 * secondary source in US federal policy work, and courts and agencies read them
 * as background. Every response here says so in `binding_status` and
 * `binding_note` rather than leaving a caller to assume authority the documents
 * do not have.
 *
 * WHAT A CALLER GETS. `crs_search` ranks reports by title and by CRS's own
 * summary; `crs_report` returns one report's complete text; `crs_recent` is the
 * change feed; `crs_topics` exposes CRS's own taxonomy so a filter value can be
 * looked up instead of guessed. Everything carries the secondary-legal authority
 * envelope (authority_type, binding_status, jurisdiction, issuer, citations,
 * licence) and an age label, because a policy answer whose vintage is invisible
 * is a policy answer waiting to be wrong.
 *
 * THE ONE LIMIT WE STATE IN EVERY SEARCH RESPONSE. Search ranks titles and
 * summaries. A phrase that appears only in the body of a 60,000-character
 * R-series report will not match — the body is returned by `crs_report`, not
 * scanned by `crs_search`. Saying so is the difference between "we did not look
 * there" and the caller reading a miss as "CRS has never written about this".
 *
 * LICENCE. CRS reports are works of the United States government: 17 U.S.C. §105
 * puts them outside copyright entirely, so there is no licence to comply with and
 * no attribution obligation. One honest caveat, which CRS itself prints: a report
 * may reproduce a chart or photograph owned by a third party, and §105 does not
 * reach that. Reusing an embedded figure is a different question from reusing the
 * text.
 *
 * TWO MODES, AND EVERY RESPONSE SAYS WHICH. On the Pipeworx gateway the corpus
 * is injected and answers carry `mode: 'corpus'` — full extracted report text,
 * title-and-summary search, the whole topic vocabulary. A standalone install has
 * no corpus; given a free api.data.gov key as `_apiKey` it answers
 * `mode: 'live_api'` straight from api.congress.gov, which serves the records
 * but not the report bodies. The live section near the bottom of this file
 * states exactly what that mode cannot do.
 *
 * DATA SOURCE. api.congress.gov/v3/crsreport (the Library of Congress's own API,
 * api.data.gov-fronted) for the record and the taxonomy; the report text comes
 * from the current-version PDF each record points at, at
 * www.congress.gov/crs_external_products/. The HTML rendition of the same
 * document sits behind an interactive Cloudflare challenge and answers 403 to
 * every automated client, which is why the text comes from the PDF.
 */


const SOURCE = 'crs-reports';

// The Workers runtime sends no User-Agent at all, and an unnamed client is the
// first thing a bot filter drops (phishtank/chess/devto each went 100% dark on
// exactly this). Every request out of this pack identifies itself.
const UA = 'pipeworx-crs-reports/1.0 (+https://pipeworx.io)';

// ─────────────────────────── the corpus connection ───────────────────────────

interface R2Bucketish {
  get(key: string, opts?: { range?: { offset: number; length: number } }):
    Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
}

type Corpus = { url: string; key: string; r2: R2Bucketish | null };

function corpusFrom(args: Record<string, unknown>): Corpus | null {
  const url = (args._supabaseUrl as string | undefined)?.trim();
  const key = (args._supabaseKey as string | undefined)?.trim();
  if (!url || !key) return null;
  return { url, key, r2: (args._r2 as R2Bucketish | undefined) ?? null };
}

/**
 * No corpus and no key. This is what a bare `npm install` of this package hits,
 * so the refusal has to say what would fix it — see the live-fallback section
 * below for what a key buys and what it does not.
 */
const UNAVAILABLE = {
  found: false,
  reason: 'corpus_unavailable',
  hint:
    'The CRS corpus is not reachable from this process, and running outside the Pipeworx ' +
    'gateway this pack requires an API key: pass a free api.data.gov key as `_apiKey` ' +
    '(https://api.data.gov/signup/) and it will answer live from api.congress.gov instead — ' +
    'report records, summaries and the change feed, but no extracted full text. On the hosted ' +
    'gateway (https://gateway.pipeworx.io/mcp) no key is needed and the full text comes with it.',
} as const;

interface DocumentRow {
  doc_id: string;
  title: string;
  authority_type: string;
  binding_status: string | null;
  binding_note: string | null;
  jurisdiction: string;
  issuer: string;
  effective_date: string | null;
  superseded_by: string | null;
  citations: string[] | null;
  license: string;
  license_kind: string;
  license_url: string | null;
  attribution: string | null;
  obligations: string[] | null;
  retrieved_at: string;
  source_last_modified: string | null;
  abstract: string | null;
  metadata: Record<string, unknown> | null;
  pack_path: string;
  byte_offset: number;
  byte_length: number;
  text_bytes: number | null;
  text_sha256: string | null;
}

async function pg<T>(c: Corpus, path: string): Promise<T[]> {
  const res = await fetch(`${c.url}/rest/v1/${path}`, {
    headers: {
      apikey: c.key, Authorization: `Bearer ${c.key}`,
      Accept: 'application/json', 'User-Agent': UA,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`corpus query failed (${res.status})`);
  return (await res.json()) as T[];
}

async function rpc<T>(c: Corpus, fn: string, body: Record<string, unknown>): Promise<T[]> {
  const res = await fetch(`${c.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: c.key, Authorization: `Bearer ${c.key}`,
      'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`corpus search failed (${res.status})`);
  return (await res.json()) as T[];
}

/**
 * One document's text, located by its own index row.
 *
 * The sha256 check is not ceremony. A wrong byte offset does not error — gzip
 * members are self-delimiting enough that an off-by-one usually yields the
 * NEIGHBOURING report, in full, with no complaint. Serving one report's text
 * under another's citation is the worst failure available here, so a hash
 * mismatch returns nothing rather than plausible text.
 */
async function documentText(c: Corpus, row: DocumentRow): Promise<string | null> {
  if (!c.r2) return null;
  const obj = await c.r2.get(row.pack_path, { range: { offset: row.byte_offset, length: row.byte_length } });
  if (!obj) return null;
  const body = new Response(await obj.arrayBuffer()).body?.pipeThrough(new DecompressionStream('gzip'));
  if (!body) return null;
  const text = await new Response(body).text();
  if (row.text_bytes != null && new TextEncoder().encode(text).length !== row.text_bytes) return null;
  if (row.text_sha256) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (hex !== row.text_sha256) return null;
  }
  return text;
}

// ──────────────────────────── response shaping ────────────────────────────

const PRODUCT_CLASS_MEANING: Record<string, string> = {
  Reports: 'R / RL / RS series — the long-form reports, typically 20–80 pages',
  Resources: 'In Focus — two-page briefs on one topic',
  Posts: 'Insight and Legal Sidebar — short pieces on a current development',
  Infographics: 'IG series — a chart or diagram with explanatory text',
  Testimony: 'TE series — CRS testimony prepared for a congressional hearing',
};

function licenseOf(row: DocumentRow): LicenseTerms {
  return {
    id: row.license,
    kind: row.license_kind as LicenseTerms['kind'],
    url: row.license_url,
    attribution: row.attribution,
    obligations: (row.obligations ?? []) as LicenseTerms['obligations'],
  };
}

function authorityOf(row: DocumentRow): LegalAuthority {
  return {
    doc_id: row.doc_id,
    source: SOURCE,
    title: row.title,
    authority_type: row.authority_type as LegalAuthority['authority_type'],
    binding_status: row.binding_status as LegalAuthority['binding_status'],
    binding_note: row.binding_note,
    jurisdiction: row.jurisdiction,
    issuer: row.issuer,
    effective_date: row.effective_date,
    superseded_by: row.superseded_by,
    citations: row.citations ?? [],
    license: licenseOf(row),
    retrieved_at: row.retrieved_at,
    source_last_modified: row.source_last_modified,
  };
}

function meta(row: DocumentRow) {
  const m = (row.metadata ?? {}) as Record<string, unknown>;
  const productClass = (m.product_class as string | null) ?? null;
  return {
    product_class: productClass,
    product_class_meaning: productClass ? PRODUCT_CLASS_MEANING[productClass] ?? null : null,
    version: (m.version as number | null) ?? null,
    authors: (m.authors as string[] | undefined) ?? [],
    topics: (m.topics as string[] | undefined) ?? [],
    pdf_url: (m.pdf_url as string | null) ?? null,
    url: (m.congress_url as string | null) ?? `https://www.congress.gov/crs-product/${row.doc_id}`,
    // Which rendition the text came from. For an In Focus the two are nearly the
    // same document; for an R-series report the summary is a page and the report
    // is fifty, so a caller comparing two answers needs to know which it has.
    text_source: (m.text_source as string | null) ?? null,
  };
}

const LICENSE_CAVEAT =
  'A work of the US federal government: outside copyright under 17 U.S.C. §105, ' +
  'with no attribution obligation. CRS notes that an individual report may reproduce ' +
  'third-party copyrighted material (a chart, a photograph); §105 does not cover those.';

/** The common per-document shape: authority envelope + age label + CRS fields. */
function shape(row: DocumentRow, opts: { text?: string; snippet?: boolean } = {}) {
  const env = withAuthorityEnvelope(authorityOf(row), opts.text !== undefined ? { text: opts.text } : {});
  const m = meta(row);
  return {
    doc_id: env.doc_id,
    title: env.title,
    ...m,
    authority: {
      authority_type: env.authority_type,
      tier: env.tier,
      binding_status: env.binding_status,
      binding_note: env.binding_note,
      jurisdiction: env.jurisdiction,
      issuer: env.issuer,
    },
    citations: env.citations,
    effective_date: env.effective_date,
    freshness: env.freshness,
    license: env.license,
    license_terms: env.license_terms,
    license_caveat: LICENSE_CAVEAT,
    abstract_chars: row.abstract?.length ?? 0,
    ...(opts.snippet && row.abstract ? { summary: row.abstract.slice(0, 600) } : {}),
    ...(opts.text !== undefined ? { text: opts.text, text_chars: opts.text.length } : {}),
  };
}

const SEARCH_SCOPE_NOTE =
  'Ranked over report titles and the summaries CRS publishes with them. A phrase that ' +
  'appears only in the body of a long report will not rank here — read a full report with ' +
  'crs_report, which returns its complete text.';

// ─────────────────────────────────── tools ───────────────────────────────────

const tools: McpToolExport['tools'] = [
  {
    name: 'crs_search',
    description:
      'Find Congressional Research Service (CRS) reports on a policy topic, statute or programme ' +
      'and get their titles, summaries, topics, authors, publication dates and report numbers. ' +
      'CRS is the nonpartisan research service that writes explanatory analysis for Congress: ' +
      'what a law does, how a federal programme works, what the policy options are, what a ' +
      'proposal would cost. Covers 14,000+ current reports back to 2018 across every subject ' +
      'Congress legislates on — trade, health, immigration, defense, tax, energy, housing. ' +
      'Ranks titles and CRS summaries; use crs_report to read a report in full.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'What to search for. Supports quoted phrases and a leading minus to exclude: ' +
            '"section 232" tariffs -steel',
        },
        topic: {
          type: 'string',
          description:
            "One of CRS's own subject terms, e.g. 'U.S. Trade Policy'. Exact match — call " +
            'crs_topics to see the vocabulary and pick a real one.',
        },
        product_class: {
          type: 'string',
          enum: ['Reports', 'Resources', 'Posts', 'Infographics', 'Testimony'],
          description:
            'CRS product family: Reports (long R/RL/RS reports), Resources (two-page In Focus), ' +
            'Posts (Insight and Legal Sidebar), Infographics, Testimony.',
        },
        author: { type: 'string', description: 'A CRS analyst, exactly as CRS credits them.' },
        published_since: { type: 'string', description: 'Earliest publication date, YYYY-MM-DD.' },
        published_before: { type: 'string', description: 'Latest publication date, YYYY-MM-DD.' },
        limit: { type: 'number', description: 'Results to return, 1–50. Default 10.' },
      },
    },
  },
  {
    name: 'crs_report',
    description:
      'Read one Congressional Research Service report in full by its report number (R43255, ' +
      'IF13006, LSB10123, IN12304). Returns the complete text of the current version, plus its ' +
      'authors, CRS subject topics, publication date, the bills and public laws it cites, how ' +
      'old the text is, and a statement that CRS analysis is persuasive rather than binding. ' +
      'Use it after crs_search, or directly when a report number is already known.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        report_id: {
          type: 'string',
          description: "CRS report number, e.g. 'R43255' or 'IF13006'. Case-insensitive.",
        },
        include_text: {
          type: 'boolean',
          description: 'Return the report text. Default true; false gives metadata only.',
        },
        max_chars: {
          type: 'number',
          description:
            'Truncate the text at this many characters and say so. Default 120000, which holds ' +
            'all but the longest reports whole. Values below 1000 are raised to 1000 — a 200-character ' +
            'slice of a report is not a shorter answer, it is a misleading one.',
        },
      },
      required: ['report_id'],
    },
  },
  {
    name: 'crs_recent',
    description:
      'What the Congressional Research Service has published or revised lately — the newest CRS ' +
      'reports and updates, newest first, with their topics and summaries. Answers "what is CRS ' +
      'saying about current legislation right now" and tracks the analysis that follows a bill, ' +
      'a rule or a crisis. Filter by CRS topic or product family.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        days: { type: 'number', description: 'How far back to look, in days. Default 14, max 365.' },
        topic: { type: 'string', description: "A CRS subject term — see crs_topics." },
        product_class: {
          type: 'string',
          enum: ['Reports', 'Resources', 'Posts', 'Infographics', 'Testimony'],
          description: 'CRS product family.',
        },
        limit: { type: 'number', description: 'Results to return, 1–50. Default 20.' },
      },
    },
  },
  {
    name: 'crs_topics',
    description:
      "The Congressional Research Service's own subject taxonomy, with how many reports carry " +
      'each term — the legal filter values for crs_search and crs_recent. Also lists CRS analysts ' +
      'by output, and the product families. Call this before filtering by topic: CRS writes ' +
      "'U.S. Trade Policy', and a guessed 'Trade' matches nothing.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        facet: {
          type: 'string',
          enum: ['topics', 'authors', 'product_class'],
          description: 'Which vocabulary to list. Default topics.',
        },
        limit: { type: 'number', description: 'Values to return, 1–500. Default 100.' },
      },
    },
  },
];

// ────────────────────────────────── handlers ──────────────────────────────────

const clamp = (v: unknown, dflt: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : dflt;
};

const SELECT =
  'doc_id,title,authority_type,binding_status,binding_note,jurisdiction,issuer,effective_date,' +
  'superseded_by,citations,license,license_kind,license_url,attribution,obligations,retrieved_at,' +
  'source_last_modified,abstract,metadata,pack_path,byte_offset,byte_length,text_bytes,text_sha256';

function metadataFilter(args: Record<string, unknown>): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  if (typeof args.topic === 'string' && args.topic.trim()) m.topics = [args.topic.trim()];
  if (typeof args.author === 'string' && args.author.trim()) m.authors = [args.author.trim()];
  if (typeof args.product_class === 'string' && args.product_class.trim()) {
    m.product_class = args.product_class.trim();
  }
  return m;
}

async function crsSearch(c: Corpus, args: Record<string, unknown>) {
  const limit = clamp(args.limit, 10, 1, 50);
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  const filters = metadataFilter(args);

  const rows = await rpc<DocumentRow>(c, 'secondary_legal_search', {
    p_source: SOURCE,
    p_query: query || null,
    p_metadata: filters,
    p_from: (args.published_since as string) || null,
    p_to: (args.published_before as string) || null,
    p_limit: limit,
    p_offset: 0,
  });

  if (!rows.length) {
    return {
      found: false,
      mode: 'corpus' as const,
      reason: 'no_match',
      query: query || null,
      filters,
      searched: SEARCH_SCOPE_NOTE,
      hint:
        'No CRS report title or summary matched. Topic and author filters are exact — call ' +
        'crs_topics for the real values. Try fewer words, or crs_recent to see what CRS has ' +
        'published lately.',
    };
  }

  return {
    found: true,
    mode: 'corpus' as const,
    query: query || null,
    filters,
    count: rows.length,
    searched: SEARCH_SCOPE_NOTE,
    results: rows.map((r) => shape(r, { snippet: true })),
  };
}

async function crsReport(c: Corpus, args: Record<string, unknown>) {
  const raw = String(args.report_id ?? '').trim();
  // CRS numbers are printed lower-case as often as upper, and a caller pasting
  // 'r43255' getting "no such report" would be told the corpus lacks something
  // it holds.
  const id = raw.toUpperCase().replace(/\s+/g, '');
  if (!id) {
    return {
      found: false, mode: 'corpus' as const, reason: 'missing_argument',
      hint: "Pass report_id, e.g. 'R43255'.",
    };
  }

  const rows = await pg<DocumentRow>(
    c,
    `secondary_legal_documents?source=eq.${SOURCE}&doc_id=eq.${encodeURIComponent(id)}&select=${SELECT}&limit=1`,
  );
  const row = rows[0];
  if (!row) {
    return {
      found: false,
      mode: 'corpus' as const,
      reason: 'no_such_report',
      report_id: id,
      hint:
        `No CRS report numbered ${id} is in the current set, which covers reports active since ` +
        '2018. Search for it by subject with crs_search, or check the number at ' +
        'https://www.congress.gov/crs-products.',
    };
  }

  const includeText = args.include_text !== false;
  const maxChars = clamp(args.max_chars, 120_000, 1_000, 1_000_000);
  let text: string | undefined;
  let truncated = false;
  let textError: string | null = null;

  if (includeText) {
    const full = await documentText(c, row);
    if (full === null) {
      // Say which half failed. "No text" that silently means "the integrity check
      // rejected the bytes" is the failure this pack most needs to be loud about.
      textError =
        'The report text could not be verified against its recorded checksum on this call, so it ' +
        'is withheld rather than returned unchecked. The metadata below is unaffected; the ' +
        'official PDF is linked in pdf_url.';
    } else {
      text = full.length > maxChars ? full.slice(0, maxChars) : full;
      truncated = full.length > maxChars;
    }
  }

  return {
    found: true,
    mode: 'corpus' as const,
    ...shape(row, text !== undefined ? { text } : {}),
    ...(truncated ? { truncated: true, full_text_chars: row.text_bytes } : {}),
    ...(textError ? { text_unavailable: textError } : {}),
  };
}

async function crsRecent(c: Corpus, args: Record<string, unknown>) {
  const days = clamp(args.days, 14, 1, 365);
  const limit = clamp(args.limit, 20, 1, 50);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const filters = metadataFilter(args);
  const filterParam = Object.keys(filters).length
    ? `&metadata=cs.${encodeURIComponent(JSON.stringify(filters))}`
    : '';

  const rows = await pg<DocumentRow>(
    c,
    `secondary_legal_documents?source=eq.${SOURCE}&source_last_modified=gte.${since}${filterParam}` +
      `&select=${SELECT}&order=source_last_modified.desc&limit=${limit}`,
  );

  if (!rows.length) {
    return {
      found: false,
      mode: 'corpus' as const,
      reason: 'nothing_in_window',
      window_days: days,
      filters,
      hint:
        `No CRS report was published or revised in the last ${days} days matching that filter. ` +
        'Widen days, drop the topic filter, or search the whole set with crs_search.',
    };
  }

  return {
    found: true,
    mode: 'corpus' as const,
    window_days: days,
    since,
    filters,
    count: rows.length,
    results: rows.map((r) => shape(r, { snippet: true })),
  };
}

async function crsTopics(c: Corpus, args: Record<string, unknown>) {
  const facet = ['topics', 'authors', 'product_class'].includes(String(args.facet))
    ? String(args.facet)
    : 'topics';
  const limit = clamp(args.limit, 100, 1, 500);

  const rows = await rpc<{ value: string; documents: number }>(c, 'secondary_legal_facet', {
    p_source: SOURCE,
    p_key: facet,
    p_limit: limit,
  });

  if (!rows.length) {
    return {
      found: false,
      mode: 'corpus' as const,
      reason: 'no_values',
      facet,
      hint: `No values are recorded for ${facet}. Try facet 'topics'.`,
    };
  }

  return {
    found: true,
    mode: 'corpus' as const,
    facet,
    count: rows.length,
    note:
      facet === 'topics'
        ? "CRS's own subject terms. crs_search and crs_recent match these exactly."
        : facet === 'product_class'
          ? 'CRS product families and what each one is.'
          : 'CRS analysts by number of reports credited.',
    values: rows.map((r) => ({
      value: r.value,
      documents: Number(r.documents),
      ...(facet === 'product_class' ? { meaning: PRODUCT_CLASS_MEANING[r.value] ?? null } : {}),
    })),
  };
}

// ───────────────────── the live fallback: api.congress.gov ─────────────────────
/**
 * A standalone `npm install` of this pack gets neither the Postgres index nor
 * the R2 pack files the gateway injects, so every tool used to answer
 * `{found:false, reason:'corpus_unavailable'}` — an inert package under our
 * name. Fleet #2012.
 *
 * With a caller-supplied api.data.gov key (`_apiKey`, free at
 * https://api.data.gov/signup/) the pack answers from the Library of Congress's
 * own API instead. That is a DIFFERENT answer, so every response says which it
 * is: `mode: 'live_api'` for the upstream record, `mode: 'corpus'` for the
 * corpus, with extracted PDF text. On the gateway the corpus is always
 * present and this path never runs — the hosted answers are unchanged.
 *
 * WHAT LIVE MODE CANNOT DO, stated rather than silently degraded:
 *
 *  • No full report text. The text lives in the current-version PDF and
 *    extracting it needs a PDF toolchain this pack does not carry. `crs_report`
 *    returns CRS's own summary instead, under the name `summary` and never
 *    `text`, because a 3,700-character summary standing in the field where a
 *    61,000-character report belongs is the one substitution a caller would
 *    never notice.
 *  • No summary-ranked search. The list endpoint carries titles only and has no
 *    query parameter at all — `sort` is accepted and ignored, and so is anything
 *    else it does not know. Live search therefore scans TITLES of the most
 *    recently updated reports and reports how many it read against the corpus
 *    total, so a miss is legible as "not in the window I scanned" rather than
 *    "CRS never wrote it".
 *  • No topic or author filter, and no topic/author vocabulary. Both live only
 *    on the per-report detail record, one HTTP call each across 14,000 reports.
 *    Live mode REFUSES those filters instead of returning an unfiltered answer
 *    wearing a filter's name.
 */

/** Free at https://api.data.gov/signup/ — any api.data.gov key opens this API. */
function keyFrom(args: Record<string, unknown>): string | null {
  const k = (args._apiKey as string | undefined)?.trim();
  return k ? k : null;
}

const LIVE_BASE = 'https://api.congress.gov/v3/crsreport';
const LIVE_PAGE = 250;      // the list endpoint's maximum page size
const LIVE_MAX_PAGES = 16;  // so one search reads at most 4,000 titles

/**
 * Kept verbatim in step with BINDING_NOTE in scripts/ingest-crs-reports.mjs,
 * which is what the corpus rows carry. The corpus path reads the row; this
 * constant is only for documents shaped from the live API, and the two saying
 * different things about the same reports would be worse than either.
 */
const LIVE_BINDING_NOTE =
  'Nonpartisan analysis written for Congress by the Congressional Research Service. ' +
  'It is not law: it binds no court and no agency. Courts and agencies cite it as ' +
  'background and it is routinely read as part of a statute\'s legislative context, ' +
  'which is what makes it persuasive rather than merely informative.';

const LIVE_LICENSE: LicenseTerms = {
  id: 'LicenseRef-US-Gov-Works-17USC105',
  kind: 'public_domain_us_gov' as LicenseTerms['kind'],
  url: 'https://www.law.cornell.edu/uscode/text/17/105',
  attribution: null,
  obligations: [],
};

const LIVE_SEARCH_SCOPE =
  'Live mode ranks nothing: it scans report TITLES from the newest-updated end of the ' +
  'corpus and returns matches in that order. CRS summaries are not searched here (the ' +
  'list endpoint does not carry them) and there is no relevance score. The hosted ' +
  'gateway searches all 14,000+ titles and summaries together.';

const LIVE_DETAIL_NOTE =
  'authors, topics, citations and the PDF link live on the per-report record, not in this ' +
  'list — call crs_report with a doc_id to get them.';

const LIVE_UPDATE_DATE_NOTE =
  "`update_date` is api.congress.gov's own updateDate. It is an America/New_York wall time " +
  'published with a `Z` on the end, so it reads 4–5 hours later than the UTC instant the ' +
  'document actually changed. The corpus path corrects it; live mode reports it as published ' +
  'rather than quietly shifting a value the upstream prints differently.';

interface LiveListRow {
  id: string;
  title?: string | null;
  contentType?: string | null;
  publishDate?: string | null;
  updateDate?: string | null;
  status?: string | null;
  version?: number | null;
  url?: string | null;
}

interface LiveDetailRow extends LiveListRow {
  currentVersion?: number | null;
  summary?: string | null;
  authors?: { author?: string | null }[];
  topics?: { topic?: string | null }[];
  formats?: { format?: string | null; url?: string | null }[];
  relatedMaterials?: {
    type?: string | null; number?: string | number | null; congress?: number | null;
    title?: string | null; URL?: string | null;
  }[];
}

interface LiveListPage {
  CRSReports?: LiveListRow[];
  pagination?: { count?: number | null };
}

/** An upstream refusal a caller can act on, rather than a stack trace. */
class LiveError extends Error {
  constructor(readonly reason: string, readonly hint: string) {
    super(hint);
  }
}

async function liveGet<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  key: string,
): Promise<T> {
  const url = new URL(LIVE_BASE + path);
  url.searchParams.set('api_key', key);
  url.searchParams.set('format', 'json');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json', 'User-Agent': UA },
    signal: AbortSignal.timeout(20_000),
  });

  if (res.status === 403) {
    throw new LiveError(
      'invalid_api_key',
      'api.congress.gov rejected the key (403). This pack requires an API key outside the ' +
        'Pipeworx gateway: pass a valid api.data.gov key as `_apiKey` — they are free at ' +
        'https://api.data.gov/signup/ and one key works across every api.data.gov API.',
    );
  }
  if (res.status === 429) {
    throw new LiveError(
      'rate_limited',
      'api.data.gov rate-limited this key (429). A registered key allows 1,000 requests an ' +
        'hour and DEMO_KEY far fewer; wait for the window to roll, or register your own key.',
    );
  }
  if (res.status === 404) throw new LiveError('not_found', 'api.congress.gov has no such record.');
  if (!res.ok) {
    throw new LiveError('upstream_error', `api.congress.gov answered ${res.status} on this call.`);
  }
  return (await res.json()) as T;
}

const dayOf = (iso: string | null | undefined): string | null =>
  typeof iso === 'string' && iso.length >= 10 ? iso.slice(0, 10) : null;

/** The detail record prints `url` without a scheme ('www.congress.gov/…'). */
function absoluteUrl(u: string | null | undefined, id: string): string {
  if (typeof u === 'string' && u.trim()) {
    const t = u.trim();
    return /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, '')}`;
  }
  return `https://www.congress.gov/crs-product/${id}`;
}

/**
 * 'PUB 115-439' → 'P.L. 115-439'; a bill row → 'H.R. 1234 (115th Congress)'.
 *
 * `number` arrives as a STRING on public-law rows ('115-439') and as a NUMBER on
 * bill rows (1234), in the same array. Coerce rather than trust the declared type
 * — the mixed shape threw on the first real report this was run against.
 */
function citationOf(m: NonNullable<LiveDetailRow['relatedMaterials']>[number]): string | null {
  const type = String(m.type ?? '').toUpperCase();
  const number = String(m.number ?? '').trim();
  if (!number) return null;
  if (type === 'PUB') return `P.L. ${number}`;
  const label = BILL_LABEL[type];
  if (!label) return null;
  return m.congress ? `${label} ${number} (${m.congress}th Congress)` : `${label} ${number}`;
}

const BILL_LABEL: Record<string, string> = {
  HR: 'H.R.', S: 'S.', HRES: 'H.Res.', SRES: 'S.Res.',
  HJRES: 'H.J.Res.', SJRES: 'S.J.Res.', HCONRES: 'H.Con.Res.', SCONRES: 'S.Con.Res.',
};

function liveAuthority(r: LiveDetailRow, citations: string[]): LegalAuthority {
  return {
    doc_id: r.id,
    source: SOURCE,
    title: r.title ?? r.id,
    authority_type: 'legislative_analysis' as LegalAuthority['authority_type'],
    binding_status: 'persuasive' as LegalAuthority['binding_status'],
    binding_note: LIVE_BINDING_NOTE,
    jurisdiction: 'us-federal',
    issuer: 'Congressional Research Service',
    effective_date: dayOf(r.publishDate),
    superseded_by: null,
    citations,
    license: LIVE_LICENSE,
    retrieved_at: new Date().toISOString(),
    source_last_modified: r.updateDate ?? null,
  };
}

/**
 * The live counterpart of `shape()`. Where the corpus knows something the list
 * endpoint does not, the field is `null` rather than `[]` — an empty array here
 * would read as "this report credits no authors" when the truth is "nobody
 * looked".
 */
function liveShape(r: LiveDetailRow, opts: { detail?: boolean } = {}) {
  const citations = opts.detail
    ? (r.relatedMaterials ?? []).map(citationOf).filter((c): c is string => !!c)
    : [];
  const env = withAuthorityEnvelope(liveAuthority(r, citations));
  const productClass = r.contentType ?? null;
  return {
    doc_id: env.doc_id,
    title: env.title,
    product_class: productClass,
    product_class_meaning: productClass ? PRODUCT_CLASS_MEANING[productClass] ?? null : null,
    version: r.currentVersion ?? r.version ?? null,
    authors: opts.detail ? (r.authors ?? []).map((a) => a.author).filter(Boolean) : null,
    topics: opts.detail ? (r.topics ?? []).map((t) => t.topic).filter(Boolean) : null,
    pdf_url: opts.detail
      ? (r.formats ?? []).find((f) => (f.format ?? '').toUpperCase() === 'PDF')?.url ?? null
      : null,
    url: absoluteUrl(r.url, r.id),
    text_source: null,
    authority: {
      authority_type: env.authority_type,
      tier: env.tier,
      binding_status: env.binding_status,
      binding_note: env.binding_note,
      jurisdiction: env.jurisdiction,
      issuer: env.issuer,
    },
    citations: opts.detail ? env.citations : null,
    effective_date: env.effective_date,
    publish_date: r.publishDate ?? null,
    update_date: r.updateDate ?? null,
    status: r.status ?? null,
    freshness: env.freshness,
    license: env.license,
    license_terms: env.license_terms,
    license_caveat: LICENSE_CAVEAT,
    ...(opts.detail ? {} : { detail_fields: LIVE_DETAIL_NOTE }),
  };
}

/** topic / author cannot be honoured live, so they are refused by name. */
function liveUnsupportedFilters(args: Record<string, unknown>): string[] {
  return (['topic', 'author'] as const).filter(
    (k) => typeof args[k] === 'string' && (args[k] as string).trim(),
  );
}

const liveFilterRefusal = (used: string[]) => ({
  found: false,
  mode: 'live_api' as const,
  reason: 'filter_unavailable_live',
  unavailable_filters: used,
  hint:
    `Live mode cannot filter by ${used.join(' or ')}: CRS records those only on the per-report ` +
    'detail record, so honouring the filter would cost one request per report across 14,000 ' +
    'reports. Drop it — query, product_class and the date range all work here — or use the ' +
    'hosted gateway at https://gateway.pipeworx.io/mcp, which indexes both. Returning an ' +
    'unfiltered list under a filtered question would be the wrong answer wearing the right label.',
});

interface ParsedQuery { include: string[]; exclude: string[] }

/** Same surface the corpus search documents: quoted phrases, leading minus excludes. */
function parseQuery(q: string): ParsedQuery {
  const include: string[] = [];
  const exclude: string[] = [];
  for (const raw of q.match(/-?"[^"]*"|\S+/g) ?? []) {
    let t = raw;
    let negated = false;
    if (t.startsWith('-')) { negated = true; t = t.slice(1); }
    t = t.replace(/"/g, '').trim().toLowerCase();
    if (!t) continue;
    (negated ? exclude : include).push(t);
  }
  return { include, exclude };
}

function titleMatches(title: string, p: ParsedQuery): boolean {
  const t = title.toLowerCase();
  return p.include.every((x) => t.includes(x)) && !p.exclude.some((x) => t.includes(x));
}

async function liveSearch(key: string, args: Record<string, unknown>) {
  const unsupported = liveUnsupportedFilters(args);
  if (unsupported.length) return liveFilterRefusal(unsupported);

  const limit = clamp(args.limit, 10, 1, 50);
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  const productClass =
    typeof args.product_class === 'string' ? args.product_class.trim() : '';
  const since = dayOf(args.published_since as string | undefined);
  const before = dayOf(args.published_before as string | undefined);

  if (!query && !productClass && !since && !before) {
    return {
      found: false,
      mode: 'live_api' as const,
      reason: 'missing_argument',
      hint:
        'Live mode scans titles, so it needs something to scan for: pass query, product_class ' +
        'or a date range. crs_recent lists the newest reports without a query.',
    };
  }

  const parsed = parseQuery(query);
  const matches: LiveListRow[] = [];
  let scanned = 0;
  let corpusSize: number | null = null;
  let exhausted = false;

  for (let page = 0; page < LIVE_MAX_PAGES && matches.length < limit; page++) {
    const body = await liveGet<LiveListPage>(
      '',
      { offset: page * LIVE_PAGE, limit: LIVE_PAGE },
      key,
    );
    const rows = body.CRSReports ?? [];
    corpusSize = body.pagination?.count ?? corpusSize;
    scanned += rows.length;

    for (const r of rows) {
      const published = dayOf(r.publishDate);
      if (query && !titleMatches(r.title ?? '', parsed)) continue;
      if (productClass && (r.contentType ?? '') !== productClass) continue;
      if (since && (!published || published < since)) continue;
      if (before && (!published || published > before)) continue;
      matches.push(r);
      if (matches.length >= limit) break;
    }

    if (rows.length < LIVE_PAGE) { exhausted = true; break; }
  }

  const coverage = {
    scanned_reports: scanned,
    corpus_size: corpusSize,
    scanned_all: exhausted,
    scan_order: 'Most recently updated first — the only order this endpoint serves.',
  };

  if (!matches.length) {
    return {
      found: false,
      mode: 'live_api' as const,
      reason: exhausted ? 'no_match' : 'no_match_in_scanned_window',
      query: query || null,
      searched: LIVE_SEARCH_SCOPE,
      ...coverage,
      hint: exhausted
        ? 'No CRS report title matched anywhere in the set. Live mode does not search summaries — ' +
          'a phrase CRS uses only inside a report will miss here.'
        : `No title matched in the ${scanned} most recently updated reports` +
          `${corpusSize ? ` of ${corpusSize}` : ''}. This is a window, not the whole corpus: ` +
          'try fewer words, or the hosted gateway, which searches every title and summary.',
    };
  }

  return {
    found: true,
    mode: 'live_api' as const,
    source_api: LIVE_BASE,
    query: query || null,
    filters: {
      ...(productClass ? { product_class: productClass } : {}),
      ...(since ? { published_since: since } : {}),
      ...(before ? { published_before: before } : {}),
    },
    count: matches.length,
    searched: LIVE_SEARCH_SCOPE,
    ...coverage,
    update_date_note: LIVE_UPDATE_DATE_NOTE,
    results: matches.map((r) => liveShape(r)),
  };
}

async function liveReport(key: string, args: Record<string, unknown>) {
  const id = String(args.report_id ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!id) {
    return {
      found: false,
      mode: 'live_api' as const,
      reason: 'missing_argument',
      hint: "Pass report_id, e.g. 'R43255'.",
    };
  }

  let record: LiveDetailRow | undefined;
  try {
    const body = await liveGet<{ CRSReport?: LiveDetailRow }>(`/${encodeURIComponent(id)}`, {}, key);
    record = body.CRSReport;
  } catch (err) {
    if (err instanceof LiveError && err.reason === 'not_found') record = undefined;
    else throw err;
  }

  if (!record?.id) {
    return {
      found: false,
      mode: 'live_api' as const,
      reason: 'no_such_report',
      report_id: id,
      hint:
        `api.congress.gov has no CRS report numbered ${id}. Check the number at ` +
        'https://www.congress.gov/crs-products, or find it by subject with crs_search.',
    };
  }

  const includeSummary = args.include_text !== false;
  const maxChars = clamp(args.max_chars, 120_000, 1_000, 1_000_000);
  const summary = typeof record.summary === 'string' ? record.summary : null;
  const shortForm = (record.contentType ?? '') !== 'Reports';

  return {
    found: true,
    mode: 'live_api' as const,
    source_api: LIVE_BASE,
    ...liveShape(record, { detail: true }),
    ...(includeSummary && summary
      ? {
          summary: summary.length > maxChars ? summary.slice(0, maxChars) : summary,
          summary_chars: Math.min(summary.length, maxChars),
          ...(summary.length > maxChars
            ? { truncated: true, full_summary_chars: summary.length }
            : {}),
        }
      : {}),
    summary_is: summary
      ? shortForm
        ? "CRS's own summary. For In Focus, Insight, Legal Sidebar and Infographic products it " +
          'is effectively the whole document, so this is close to the full text.'
        : "CRS's published SUMMARY, not the report body — for an R-series report that is roughly " +
          'a page standing in for fifty.'
      : 'This record carries no summary text upstream.',
    text_unavailable:
      'Live mode returns no extracted report text: the body lives in the PDF at pdf_url and ' +
      'extracting it needs a PDF toolchain this package does not carry. The hosted gateway at ' +
      'https://gateway.pipeworx.io/mcp returns the full verified text of every report.',
    update_date_note: LIVE_UPDATE_DATE_NOTE,
  };
}

async function liveRecent(key: string, args: Record<string, unknown>) {
  const unsupported = liveUnsupportedFilters(args);
  if (unsupported.length) return liveFilterRefusal(unsupported);

  const days = clamp(args.days, 14, 1, 365);
  const limit = clamp(args.limit, 20, 1, 50);
  const productClass = typeof args.product_class === 'string' ? args.product_class.trim() : '';
  // fromDateTime filters on updateDate, which is what "recent" means here.
  const since = new Date(Date.now() - days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');

  const rows: LiveListRow[] = [];
  let scanned = 0;
  for (let page = 0; page < LIVE_MAX_PAGES && rows.length < limit; page++) {
    const body = await liveGet<LiveListPage>(
      '',
      { offset: page * LIVE_PAGE, limit: LIVE_PAGE, fromDateTime: since },
      key,
    );
    const batch = body.CRSReports ?? [];
    scanned += batch.length;
    for (const r of batch) {
      if (productClass && (r.contentType ?? '') !== productClass) continue;
      rows.push(r);
      if (rows.length >= limit) break;
    }
    if (batch.length < LIVE_PAGE) break;
  }

  if (!rows.length) {
    return {
      found: false,
      mode: 'live_api' as const,
      reason: 'nothing_in_window',
      window_days: days,
      since,
      scanned_reports: scanned,
      hint:
        `No CRS report was published or revised in the last ${days} days matching that filter. ` +
        'Widen days or drop product_class.',
    };
  }

  return {
    found: true,
    mode: 'live_api' as const,
    source_api: LIVE_BASE,
    window_days: days,
    since,
    filters: productClass ? { product_class: productClass } : {},
    count: rows.length,
    scanned_reports: scanned,
    update_date_note: LIVE_UPDATE_DATE_NOTE,
    results: rows.map((r) => liveShape(r)),
  };
}

async function liveTopics(args: Record<string, unknown>) {
  const facet = ['topics', 'authors', 'product_class'].includes(String(args.facet))
    ? String(args.facet)
    : 'topics';

  if (facet !== 'product_class') {
    return {
      found: false,
      mode: 'live_api' as const,
      reason: 'facet_unavailable_live',
      facet,
      hint:
        `CRS ${facet} are recorded only on the per-report detail record, so building this ` +
        'vocabulary live would mean one request per report across 14,000 reports. Two ways ' +
        "round it: call crs_report on a report you already have and read its own topics and " +
        'authors, or use the hosted gateway at https://gateway.pipeworx.io/mcp, which has the ' +
        'whole vocabulary with counts. Facet `product_class` does answer here.',
    };
  }

  return {
    found: true,
    mode: 'live_api' as const,
    facet,
    count: Object.keys(PRODUCT_CLASS_MEANING).length,
    note:
      "CRS product families, as api.congress.gov's `contentType`. Counts are omitted rather " +
      'than guessed: the live list endpoint does not aggregate, and the hosted gateway is where ' +
      'the per-value document counts come from.',
    values: Object.entries(PRODUCT_CLASS_MEANING).map(([value, meaning]) => ({
      value,
      documents: null,
      meaning,
    })),
  };
}

async function liveCall(
  name: string,
  key: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    switch (name) {
      case 'crs_search': return await liveSearch(key, args);
      case 'crs_report': return await liveReport(key, args);
      case 'crs_recent': return await liveRecent(key, args);
      case 'crs_topics': return await liveTopics(args);
      default: throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    if (err instanceof LiveError) {
      return { found: false, mode: 'live_api', reason: err.reason, hint: err.hint };
    }
    throw err;
  }
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const corpus = corpusFrom(args);
  const key = keyFrom(args);

  // No corpus: the standalone case. A key turns the package from inert into a
  // live client of the same source; without one there is nothing to answer from.
  if (!corpus) return key ? liveCall(name, key, args) : UNAVAILABLE;

  try {
    switch (name) {
      case 'crs_search': return await crsSearch(corpus, args);
      case 'crs_report': return await crsReport(corpus, args);
      case 'crs_recent': return await crsRecent(corpus, args);
      case 'crs_topics': return await crsTopics(corpus, args);
      default: throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    // The corpus is the better answer and stays the default. When it is
    // unreachable mid-call and the caller brought their own key, answer live
    // rather than erroring — labelled, because a degraded answer that reads like
    // the normal one is worse than the error it replaced.
    if (!key) throw err;
    const answer = await liveCall(name, key, args);
    return {
      ...answer,
      degraded_from_corpus:
        `The CRS corpus failed on this call (${err instanceof Error ? err.message : String(err)}), ` +
        'so this was answered live from api.congress.gov: no extracted report text, and search ' +
        'covers titles only.',
    };
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
