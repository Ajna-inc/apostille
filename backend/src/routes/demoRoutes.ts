import { Router, Request, Response } from 'express';
import { getAgent, getMainAgent } from '../services/agentService';
import { OpenId4VcVerifierApi } from '@credo-ts/openid4vc';
import { ensureDidKeyForW3c } from '../services/oid4vci/w3cIssuance';
import { demoLdpVpSessions } from './demoOid4vpInterceptor';
import crypto from 'crypto';
import { StateStore } from '../services/redis/stateStore';
import { db } from '../db/driver';
import { MDL_DOCTYPE } from '../utils/mdlUtils';

const router = Router();
const DEMO_TENANT_ID = process.env.PLATFORM_TENANT_ID;
const apiBaseUrl = process.env.API_URL || process.env.PUBLIC_URL || 'http://localhost:3002';

// Simplified PendingOffer interface to match what's in oid4vciRoutes.ts
interface PendingOffer {
  id: string
  tenantId: string
  credentialDefinitionId: string
  credentialConfigurationId: string
  credentialData: Record<string, any>
  preAuthorizedCode: string
  txCode?: string
  status: 'pending' | 'token_issued' | 'credential_request_received' | 'credential_issued' | 'expired'
  format?: 'vc+sd-jwt' | 'mso_mdoc' | 'anoncreds' | 'jwt_vc_json' | 'jwt_vc_json-ld' | 'ldp_vc' | 'openbadge_v3'
  doctype?: string
  vcContexts?: string[]
  vcTypes?: string[]
  achievement?: Record<string, any>
  endorsement?: {
    endorsedEntity: string
    endorsementComment?: string
    issuerProfile?: Record<string, any>
  }
  createdAt: string
  expiresAt: string
}

const pendingOffers = new StateStore<PendingOffer>({
  prefix: 'oid4vci:offers:',
  defaultTtlSeconds: 600  // 10 minutes
});

function generateCode(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

function buildCredentialOfferUri(
  issuerUrl: string,
  preAuthorizedCode: string,
  credentialConfigurationId: string
): string {
  const credentialOffer = {
    credential_issuer: issuerUrl,
    credential_configuration_ids: [credentialConfigurationId],
    grants: {
      'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
        'pre-authorized_code': preAuthorizedCode,
      }
    }
  };
  
  const encodedOffer = encodeURIComponent(JSON.stringify(credentialOffer));
  return `openid-credential-offer://?credential_offer=${encodedOffer}`;
}

const DEMO_CREDENTIAL_TYPES: Record<string, any> = {
  // SD-JWT Tier
  'StudentID': {
    format: 'vc+sd-jwt',
    credentialConfigurationId: 'StudentID',
    generateData: (name: string) => {
      const [given, family] = name.split(' ');
      return {
        given_name: given || 'Alice',
        family_name: family || 'Johnson',
        student_id: 'S1234567890',
        university: 'Digital University',
        program: 'Computer Science',
        enrollment_year: '2023',
        expiry_date: '2027-06-30'
      };
    }
  },
  'ProfessionalLicense': {
    format: 'vc+sd-jwt',
    credentialConfigurationId: 'ProfessionalLicense',
    generateData: (name: string) => {
      const [given, family] = name.split(' ');
      return {
        given_name: given || 'Joyce',
        family_name: family || 'Smith',
        license_number: 'L-987654321',
        profession: 'Lawyer',
        issuing_authority: 'State Bar Association',
        issue_date: '2020-05-15',
        expiry_date: '2025-05-15'
      };
    }
  },
  'EmployeeBadge': {
    format: 'vc+sd-jwt',
    credentialConfigurationId: 'EmployeeBadge',
    generateData: (name: string) => {
      const [given, family] = name.split(' ');
      return {
        given_name: given || 'Bob',
        family_name: family || 'Williams',
        employee_id: 'E-554433',
        department: 'Engineering',
        job_title: 'Senior Developer',
        company: 'Tech Corp',
        issue_date: '2022-01-10'
      };
    }
  },
  'HealthInsurance': {
    format: 'vc+sd-jwt',
    credentialConfigurationId: 'HealthInsurance',
    generateData: (name: string) => {
      const [given, family] = name.split(' ');
      return {
        given_name: given || 'Charlie',
        family_name: family || 'Brown',
        member_id: 'M-11223344',
        plan_name: 'Premium Health',
        insurer: 'Global Care Provider',
        group_number: 'G-998877',
        effective_date: '2024-01-01'
      };
    }
  },
  'LoyaltyMembership': {
    format: 'vc+sd-jwt',
    credentialConfigurationId: 'LoyaltyMembership',
    generateData: (name: string) => {
      const [given, family] = name.split(' ');
      return {
        given_name: given || 'Diana',
        family_name: family || 'Prince',
        member_id: 'LM-776655',
        tier: 'Gold',
        points: '15400',
        joined_date: '2021-11-20',
        program_name: 'SkyHigh Rewards'
      };
    }
  },
  'AgeVerification': {
    format: 'vc+sd-jwt',
    credentialConfigurationId: 'AgeVerification',
    generateData: (name: string) => {
      const [given, family] = name.split(' ');
      return {
        given_name: given || 'Eve',
        family_name: family || 'Adams',
        birth_date: '1995-08-14',
        over_18: true,
        over_21: true,
        nationality: 'US'
      };
    }
  },
  
  // OBv3 Tier
  'AcademicExcellence': {
    format: 'openbadge_v3',
    credentialConfigurationId: 'AcademicExcellence',
    generateData: (name: string) => ({ name: name || 'Alice Johnson' }),
    achievement: {
      id: `urn:uuid:${crypto.randomUUID()}`,
      type: ['Achievement'],
      achievementType: 'Award',
      name: "Dean's List for Academic Excellence",
      description: 'Awarded for maintaining a GPA of 3.8 or higher during the academic year.',
      criteria: { narrative: 'Student must complete at least 12 credit hours with a minimum 3.8 GPA.' }
    }
  },
  'SkillsCertification': {
    format: 'openbadge_v3',
    credentialConfigurationId: 'SkillsCertification',
    generateData: (name: string) => ({ name: name || 'Bob Williams' }),
    achievement: {
      id: `urn:uuid:${crypto.randomUUID()}`,
      type: ['Achievement'],
      achievementType: 'Certificate',
      name: 'Cloud Computing Specialist',
      description: 'Professional certification demonstrating proficiency in cloud architecture and deployment.',
      criteria: { narrative: 'Passed the Cloud Computing Specialist Exam with a score of 85% or higher.' }
    }
  },
  'CourseCompletion': {
    format: 'openbadge_v3',
    credentialConfigurationId: 'CourseCompletion',
    generateData: (name: string) => ({ name: name || 'Charlie Brown' }),
    achievement: {
      id: `urn:uuid:${crypto.randomUUID()}`,
      type: ['Achievement'],
      achievementType: 'CourseRecord',
      name: 'Introduction to Web Development',
      description: 'Successfully completed the introductory course covering HTML, CSS, and JavaScript basics.',
      criteria: { narrative: 'Completed all course modules and the final capstone project.' }
    }
  },
  // OBv3 EndorsementCredential — third-party endorsement of an existing
  // achievement. The endorsedEntity here is the AcademicExcellence
  // achievement URN; for the demo this is a stable placeholder.
  'AcademicEndorsement': {
    format: 'openbadge_v3' as const,
    credentialConfigurationId: 'AcademicEndorsement',
    generateData: (name: string) => ({
      endorserName: name || 'Prof. Reviewer',
    }),
    endorsement: {
      endorsedEntity: 'urn:essi:demo:achievement:AcademicExcellence',
      endorsementComment:
        "This recipient consistently demonstrated exceptional academic performance. I endorse the validity of their Dean's List recognition.",
      issuerProfile: {
        type: 'Profile',
        name: 'Independent Faculty Review Board',
        description: 'A panel of senior faculty endorsing student achievements.',
      }
    }
  },

  // JSON-LD VC Tier (W3C VC Data Model 2.0, DataIntegrityProof / eddsa-rdfc-2022)
  'AlumniCredential': {
    format: 'ldp_vc' as const,
    credentialConfigurationId: 'AlumniCredential',
    generateData: (name: string) => {
      const [given, family] = name.split(' ');
      return {
        given_name: given || 'Alice',
        family_name: family || 'Johnson',
        degree: 'Bachelor of Science',
        major: 'Computer Science',
        graduation_year: '2024',
        alma_mater: 'Digital University',
        gpa: '3.85'
      };
    }
  },
  'VolunteerCertificate': {
    format: 'ldp_vc' as const,
    credentialConfigurationId: 'VolunteerCertificate',
    generateData: (name: string) => {
      const [given, family] = name.split(' ');
      return {
        given_name: given || 'Bob',
        family_name: family || 'Williams',
        organization: 'Open Source Foundation',
        role: 'Maintainer',
        hours_contributed: '120',
        year: String(new Date().getFullYear() - 1)
      };
    }
  },

  // W3C JWT VC Tier (W3C VC Data Model 1.1, signed as compact JWT)
  'EventTicket': {
    format: 'jwt_vc_json' as const,
    credentialConfigurationId: 'EventTicket',
    generateData: (name: string) => {
      const [given, family] = name.split(' ');
      return {
        given_name: given || 'Alice',
        family_name: family || 'Johnson',
        event_name: 'Identity Summit 2026',
        venue: 'Berlin Conference Center',
        seat: 'GA-1042',
        event_date: '2026-09-14',
        ticket_id: 'IDS26-' + Math.floor(Math.random() * 900000 + 100000)
      };
    }
  },
  'ResearchAttestation': {
    format: 'jwt_vc_json-ld' as const,
    credentialConfigurationId: 'ResearchAttestation',
    generateData: (name: string) => {
      const [given, family] = name.split(' ');
      return {
        given_name: given || 'Dr. Chen',
        family_name: family || 'Liu',
        institution: 'Independent Research Lab',
        role: 'Principal Investigator',
        project: 'Verifiable Credentials Field Study',
        attestation_date: new Date().toISOString().split('T')[0]
      };
    }
  },

  // mDL Tier (ISO 18013-5)
  'mDL': {
    format: 'mso_mdoc' as const,
    credentialConfigurationId: 'mDL',
    doctype: MDL_DOCTYPE,
    generateData: (name: string) => {
      const [given, family] = name.split(' ');
      const today = new Date();
      const expiry = new Date(today);
      expiry.setFullYear(expiry.getFullYear() + 5);
      return {
        given_name: given || 'Alice',
        family_name: family || 'Johnson',
        birth_date: '1990-07-15',
        document_number: 'DL-' + Math.floor(Math.random() * 9000000 + 1000000),
        issue_date: today.toISOString().split('T')[0],
        expiry_date: expiry.toISOString().split('T')[0],
        issuing_country: 'US',
        issuing_authority: 'Department of Motor Vehicles',
        // ISO 18013-5 §7.2.4: if issuing_jurisdiction is present, the issuer
        // certificate's stateOrProvinceName must equal it. The demo IACA/issuer
        // certs in `certificates/` have no ST in their subject DN, so any
        // value here would fail verification. Omit it (the field is optional)
        // until the cert subject is updated.
        driving_privileges: [
          { vehicle_category_code: 'B', issue_date: today.toISOString().split('T')[0], expiry_date: expiry.toISOString().split('T')[0] }
        ],
        age_over_18: true,
        age_over_21: true,
        portrait: '',  // wallets gracefully handle missing portrait
      };
    }
  }
};

router.post('/oid4vc-offer', async (req: Request, res: Response) => {
  if (!DEMO_TENANT_ID) {
    return res.status(503).json({
      error: 'server_error',
      error_description: 'Demo not configured. Set PLATFORM_TENANT_ID environment variable.'
    });
  }

  const { credentialType, recipientName } = req.body;
  const config = DEMO_CREDENTIAL_TYPES[credentialType];
  
  if (!config) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: `Unknown credential type: ${credentialType}`
    });
  }

  try {
    const offerId = crypto.randomUUID();
    const preAuthorizedCode = generateCode(32);
    const now = new Date();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
    
    const credentialData = config.generateData(recipientName || '');
    
    // For OBv3, we must ensure the issuer key binding exists.
    if (config.format === 'openbadge_v3') {
      try {
        const agent = await getAgent({ tenantId: DEMO_TENANT_ID });
        const openbadgesApi = (agent.modules as any)?.openbadges;
        if (openbadgesApi) {
          const hostname = new URL(apiBaseUrl).host;
          const issuerDid = `did:web:${hostname}:issuers:${DEMO_TENANT_ID}`;
          const verificationMethod = `${issuerDid}#key-0`;
          await openbadgesApi.ensureBinding(issuerDid, verificationMethod);
        }
      } catch (e: any) {
        console.warn('Demo OBv3 ensureBinding failed:', e.message);
      }
    }

    const offer: PendingOffer = {
      id: offerId,
      tenantId: DEMO_TENANT_ID,
      credentialDefinitionId: `demo-${config.credentialConfigurationId}`, // Dummy ID, skipped by using format directly
      credentialConfigurationId: config.credentialConfigurationId,
      credentialData,
      preAuthorizedCode,
      status: 'pending',
      format: config.format,
      doctype: config.doctype,  // mDL / mso_mdoc doctype
      achievement: config.achievement,
      endorsement: config.endorsement,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    await pendingOffers.set(offerId, offer);

    // Also persist to DB just in case
    try {
      await db.query(`
        INSERT INTO oid4vci_pending_offers (
          id, tenant_id, credential_definition_id, credential_configuration_id,
          credential_data, pre_authorized_code, status, format, achievement, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        offerId, DEMO_TENANT_ID, offer.credentialDefinitionId, offer.credentialConfigurationId,
        JSON.stringify(credentialData), preAuthorizedCode, 'pending',
        config.format,
        offer.achievement ? JSON.stringify(offer.achievement) : null,
        offer.expiresAt,
      ]);
    } catch (dbError: any) {
      console.warn('Failed to persist demo offer to database:', dbError.message);
    }

    const issuerUrl = `${apiBaseUrl}/issuers/${DEMO_TENANT_ID}`;
    const credentialOfferUri = buildCredentialOfferUri(issuerUrl, preAuthorizedCode, config.credentialConfigurationId);

    res.status(201).json({
      success: true,
      offerId,
      offerUri: credentialOfferUri,
      expiresAt: offer.expiresAt,
      format: config.format
    });
  } catch (error: any) {
    console.error('Error creating demo OID4VC offer:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to create demo offer'
    });
  }
});

router.get('/oid4vc-offer/:offerId/status', async (req: Request, res: Response) => {
  const { offerId } = req.params;
  
  if (!DEMO_TENANT_ID) {
    return res.status(503).json({
      error: 'server_error',
      error_description: 'Demo not configured.'
    });
  }

  try {
    const offer = await pendingOffers.get(offerId);

    if (offer && offer.tenantId === DEMO_TENANT_ID) {
      if (new Date() > new Date(offer.expiresAt)) {
        offer.status = 'expired';
        await pendingOffers.set(offerId, offer);
      }

      return res.json({
        success: true,
        offerId: offer.id,
        status: offer.status,
        createdAt: offer.createdAt,
        expiresAt: offer.expiresAt,
      });
    }

    try {
      const result = await db.query(
        'SELECT * FROM oid4vci_pending_offers WHERE id = $1 AND tenant_id = $2',
        [offerId, DEMO_TENANT_ID]
      );

      if (result.rows.length > 0) {
        const dbOffer = result.rows[0];
        return res.json({
          success: true,
          offerId: dbOffer.id,
          status: dbOffer.status,
          createdAt: dbOffer.created_at,
          expiresAt: dbOffer.expires_at,
        });
      }
    } catch (dbError) {
      // ignore
    }

    res.status(404).json({
      error: 'not_found',
      error_description: 'Offer not found'
    });
  } catch (error: any) {
    console.error('Error getting demo offer status:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to get offer status'
    });
  }
});

// ============================================================================
// OID4VP — Public demo verifier endpoints
// ============================================================================
//
// Wraps Credo's `agent.modules.openId4VcVerifier` for the platform demo tenant
// so the showcase can drive a "scan and present" flow without auth. Credo
// auto-mounts the wallet-facing endpoints (authorization-request fetch,
// authorization response) on the Express app; these routes are only what the
// demo UI needs (create a request, poll status, get parsed claims).
//
// Phase 1+2+3 of the OID4VP demo plan: real verification via Credo, format-
// aware presentation_definition for SD-JWT / mso_mdoc / jwt_vc_json /
// jwt_vc_json-ld / ldp_vc, status polling with parsed receipt.
// ============================================================================

const DEMO_VERIFIER_ID = 'demo-verifier';

type VerifiableType =
  | 'StudentID'
  | 'ProfessionalLicense'
  | 'EmployeeBadge'
  | 'HealthInsurance'
  | 'LoyaltyMembership'
  | 'AgeVerification'
  | 'AcademicExcellence'
  | 'SkillsCertification'
  | 'CourseCompletion'
  | 'AcademicEndorsement'
  | 'AlumniCredential'
  | 'VolunteerCertificate'
  | 'EventTicket'
  | 'ResearchAttestation'
  | 'mDL';

interface VerifiableSpec {
  id: VerifiableType;
  name: string;
  format: 'vc+sd-jwt' | 'mso_mdoc' | 'jwt_vc_json' | 'jwt_vc_json-ld' | 'ldp_vc';
  /** For SD-JWT: the `vct` claim string. */
  vct?: string;
  /** For mdoc: doctype string. */
  doctype?: string;
  /** For W3C VC formats: type[] required (besides VerifiableCredential). */
  vcType?: string;
  /** Attribute paths the verifier requests. Format-specific paths handled in builder. */
  attributes: string[];
}

const VERIFIABLE_CREDENTIALS: Record<VerifiableType, VerifiableSpec> = {
  StudentID:           { id: 'StudentID',           name: 'Student ID',             format: 'vc+sd-jwt',    vct: 'StudentID',           attributes: ['given_name', 'family_name', 'student_id', 'university'] },
  ProfessionalLicense: { id: 'ProfessionalLicense', name: 'Professional License',   format: 'vc+sd-jwt',    vct: 'ProfessionalLicense', attributes: ['given_name', 'family_name', 'license_number', 'profession'] },
  EmployeeBadge:       { id: 'EmployeeBadge',       name: 'Employee Badge',         format: 'vc+sd-jwt',    vct: 'EmployeeBadge',       attributes: ['given_name', 'family_name', 'employee_id', 'department'] },
  HealthInsurance:     { id: 'HealthInsurance',     name: 'Health Insurance',       format: 'vc+sd-jwt',    vct: 'HealthInsurance',     attributes: ['given_name', 'family_name', 'member_id', 'insurer'] },
  LoyaltyMembership:   { id: 'LoyaltyMembership',   name: 'Loyalty Membership',     format: 'vc+sd-jwt',    vct: 'LoyaltyMembership',   attributes: ['given_name', 'family_name', 'member_id', 'tier'] },
  AgeVerification:     { id: 'AgeVerification',     name: 'Age Verification',       format: 'vc+sd-jwt',    vct: 'AgeVerification',     attributes: ['given_name', 'family_name', 'birth_date', 'over_18'] },
  AcademicExcellence:  { id: 'AcademicExcellence',  name: 'Academic Excellence',    format: 'ldp_vc',       vcType: 'OpenBadgeCredential',  attributes: [] },
  SkillsCertification: { id: 'SkillsCertification', name: 'Skills Certification',   format: 'ldp_vc',       vcType: 'OpenBadgeCredential',  attributes: [] },
  CourseCompletion:    { id: 'CourseCompletion',    name: 'Course Completion',      format: 'ldp_vc',       vcType: 'OpenBadgeCredential',  attributes: [] },
  AcademicEndorsement: { id: 'AcademicEndorsement', name: 'Academic Endorsement',   format: 'ldp_vc',       vcType: 'EndorsementCredential', attributes: [] },
  AlumniCredential:    { id: 'AlumniCredential',    name: 'Alumni Credential',      format: 'ldp_vc',       vcType: 'AlumniCredential',     attributes: ['given_name', 'family_name', 'degree', 'alma_mater'] },
  VolunteerCertificate:{ id: 'VolunteerCertificate',name: 'Volunteer Certificate',  format: 'ldp_vc',       vcType: 'VolunteerCertificate', attributes: ['given_name', 'family_name', 'organization', 'role'] },
  EventTicket:         { id: 'EventTicket',         name: 'Event Ticket',           format: 'jwt_vc_json',  vcType: 'EventTicket',          attributes: ['given_name', 'family_name', 'event_name', 'seat'] },
  ResearchAttestation: { id: 'ResearchAttestation', name: 'Research Attestation',   format: 'jwt_vc_json-ld', vcType: 'ResearchAttestation', attributes: ['given_name', 'family_name', 'institution', 'role'] },
  mDL:                 { id: 'mDL',                 name: "Mobile Driver's License", format: 'mso_mdoc',    doctype: MDL_DOCTYPE,           attributes: ['given_name', 'family_name', 'birth_date', 'document_number'] },
};

/**
 * Credo 0.6.1 registers OpenId4VcVerifierModule but the module class has no
 * `api` property, so `agent.modules.openId4VcVerifier` is undefined. The
 * API is context-scoped; resolve it directly from the agent's dependency
 * manager instead.
 */
function getVerifierApi(agent: any): OpenId4VcVerifierApi {
  return agent.context.dependencyManager.resolve(OpenId4VcVerifierApi);
}

async function ensureDemoVerifier(agent: any): Promise<string> {
  const api = getVerifierApi(agent);
  try {
    await api.getVerifierByVerifierId(DEMO_VERIFIER_ID);
  } catch {
    await api.createVerifier({
      verifierId: DEMO_VERIFIER_ID,
      clientMetadata: { client_name: 'Essi Studio Demo Verifier' },
    });
  }
  return DEMO_VERIFIER_ID;
}

/**
 * Build a DIF PEX v2 presentation_definition tailored to one credential
 * format. Each format needs different `path` and `format` constraints so
 * wallets' PEX matchers correctly pair the request with the right credential.
 */
function buildPresentationDefinitionFor(spec: VerifiableSpec): any {
  const id = `demo-pd-${spec.id}-${Date.now()}`;
  const descriptorBase = { id: spec.id, name: spec.name, purpose: `Verify your ${spec.name}` };

  if (spec.format === 'vc+sd-jwt') {
    return {
      id,
      input_descriptors: [{
        ...descriptorBase,
        format: { 'vc+sd-jwt': { 'sd-jwt_alg_values': ['ES256', 'EdDSA'] } },
        constraints: {
          limit_disclosure: 'required',
          fields: [
            { path: ['$.vct'], filter: { type: 'string', const: spec.vct } },
            ...spec.attributes.map((a) => ({ path: [`$.${a}`] })),
          ],
        },
      }],
    };
  }

  if (spec.format === 'mso_mdoc') {
    const ns = 'org.iso.18013.5.1';
    return {
      id,
      input_descriptors: [{
        // For mdoc, bifold's PEX matcher checks
        // `input_descriptor.id === credential.docType`. Use the full
        // ISO doctype URN (e.g. `org.iso.18013.5.1.mDL`) instead of the
        // short demo id.
        id: spec.doctype || spec.id,
        name: spec.name,
        purpose: descriptorBase.purpose,
        format: { mso_mdoc: { alg: ['EdDSA', 'ES256'] } },
        constraints: {
          limit_disclosure: 'required',
          // ISO 18013-7 requires every field constraint to declare
          // `intent_to_retain`. Bifold rejects the request otherwise:
          // "Input descriptor must contain 'intent_to_retain' constraints
          // property". For a demo we don't retain anything.
          fields: spec.attributes.map((a) => ({
            path: [`$['${ns}']['${a}']`],
            intent_to_retain: false,
          })),
        },
      }],
    };
  }

  if (spec.format === 'jwt_vc_json' || spec.format === 'jwt_vc_json-ld') {
    return {
      id,
      input_descriptors: [{
        ...descriptorBase,
        format: { [spec.format]: { alg: ['EdDSA', 'ES256'] } },
        constraints: {
          fields: [
            { path: ['$.vc.type', '$.type'], filter: { type: 'array', contains: { type: 'string', const: spec.vcType } } },
            ...spec.attributes.map((a) => ({
              path: [`$.vc.credentialSubject.${a}`, `$.credentialSubject.${a}`],
            })),
          ],
        },
      }],
    };
  }

  // ldp_vc (also covers OBv3 + Endorsement on the wire — wallet detects type[])
  return {
    id,
    input_descriptors: [{
      ...descriptorBase,
      format: { ldp_vc: { proof_type: ['DataIntegrityProof', 'Ed25519Signature2020'] } },
      constraints: {
        fields: [
          { path: ['$.type'], filter: { type: 'array', contains: { type: 'string', const: spec.vcType } } },
          ...spec.attributes.map((a) => ({ path: [`$.credentialSubject.${a}`] })),
        ],
      },
    }],
  };
}

/**
 * Pull attribute key/value pairs out of a verified presentation. Credo's
 * VerifiablePresentation union covers W3C VC, SD-JWT, and mdoc; we shape
 * a uniform `{ attrs, type, holder? }` receipt for the UI.
 */
function extractClaimsFromPresentation(presentation: any): Record<string, any> {
  if (!presentation) return {};
  // mdoc presentation — IssuerSigned namespaces
  if (presentation.issuerSignedNamespaces || presentation.docType) {
    const ns = presentation.issuerSignedNamespaces ?? {};
    const flat: Record<string, any> = {};
    for (const namespace of Object.values(ns)) {
      for (const [k, v] of Object.entries(namespace as Record<string, any>)) {
        flat[k] = v;
      }
    }
    return { __format: 'mso_mdoc', __doctype: presentation.docType, ...flat };
  }
  // SD-JWT presentation — `prettyClaims` or `payload` on the SdJwtVc instance
  if (presentation.compact || presentation.prettyClaims) {
    const claims = presentation.prettyClaims ?? presentation.payload ?? {};
    const { _sd, _sd_alg, vct, iss, sub, iat, exp, cnf, ...rest } = claims;
    return { __format: 'vc+sd-jwt', __vct: vct, ...rest };
  }
  // W3C JSON-LD VP — credential is on presentation.verifiableCredential[]
  if (presentation.verifiableCredential || presentation.verifiableCredentials) {
    const vcs = presentation.verifiableCredential ?? presentation.verifiableCredentials ?? [];
    const vc = Array.isArray(vcs) ? vcs[0] : vcs;
    if (!vc) return {};
    const cs = (vc.credentialSubject || vc.payload?.vc?.credentialSubject || {}) as Record<string, any>;
    return { __format: 'ldp_vc', __type: vc.type, ...cs };
  }
  // W3C JWT VC payload
  if (presentation.payload?.vc) {
    const cs = presentation.payload.vc.credentialSubject ?? {};
    return { __format: 'jwt_vc_json', __type: presentation.payload.vc.type, ...cs };
  }
  return {};
}

/**
 * POST /api/demo/oid4vp-request
 *
 * body: { credentialType: <one of VerifiableType> }
 * returns: { sessionId, authorizationRequestUri, expiresAt }
 */
router.post('/oid4vp-request', async (req: Request, res: Response) => {
  if (!DEMO_TENANT_ID) {
    return res.status(503).json({ error: 'server_error', error_description: 'Demo not configured. Set PLATFORM_TENANT_ID.' });
  }

  const { credentialType } = req.body as { credentialType?: VerifiableType };
  const spec = credentialType ? VERIFIABLE_CREDENTIALS[credentialType] : null;
  if (!spec) {
    return res.status(400).json({ error: 'invalid_request', error_description: `Unknown credentialType: ${credentialType}` });
  }

  try {
    // OID4VC Verifier module is registered on the root (main) agent, not on
    // per-tenant agents. Use getMainAgent() so agent.modules.openId4VcVerifier
    // exists.
    const agent = await getMainAgent();
    const verifierId = await ensureDemoVerifier(agent);

    const definition = buildPresentationDefinitionFor(spec);

    // Sign the request with a did:key so Credo hosts it via request_uri
    // instead of inlining the (huge) request payload. An inline request with
    // client_metadata + presentation_definition typically exceeds 2.5 KB,
    // which overflows QR encoder capacity. Signed request_uri mode keeps the
    // QR small.
    const { vmId } = await ensureDidKeyForW3c(agent, 'Ed25519');

    const result = await getVerifierApi(agent).createAuthorizationRequest({
      verifierId,
      requestSigner: { method: 'did', didUrl: vmId },
      presentationExchange: { definition },
      // mdoc forces `direct_post.jwt` (Credo enforces ISO 18013-7 across
      // all draft versions — `direct_post` with mdoc is rejected with
      // "ISO 18013-7 requires the usage of response mode 'direct_post.jwt'").
      // Bifold/Credo-0.5's encrypted-response code path fails after building
      // the mdoc VP, so the mDL Verify flow is currently broken end-to-end
      // — known wallet-side limitation, not an issuer bug.
      // Other formats stay on plain `direct_post`.
      responseMode: spec.format === 'mso_mdoc' ? 'direct_post.jwt' : 'direct_post',
      // Use `v1.draft21` for ALL formats: bifold runs Credo 0.5 with an older
      // Sphereon SIOP library that throws "The SIOP spec version could not
      // inferred from the authentication request payload" when handed a
      // `v1.draft24` request. Draft-21 is the highest version bifold's
      // version sniffer recognizes today. Once bifold ships with Credo 0.6+
      // we can bump non-mdoc back to `v1.draft24` / `v1`.
      version: 'v1.draft21',
    });

    res.status(201).json({
      success: true,
      sessionId: result.verificationSession.id,
      authorizationRequestUri: result.authorizationRequest,
      credentialType: spec.id,
      format: spec.format,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
  } catch (error: any) {
    console.error('Error creating demo OID4VP request:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: `Failed to create demo verification request: ${error.message}`,
    });
  }
});

/**
 * GET /api/demo/oid4vp-request/:sessionId/status
 *
 * returns: { sessionId, status, verifiedClaims?, error? }
 *   - status mirrors Credo's session.state (RequestCreated, ResponseVerified, Error)
 *   - verifiedClaims is the parsed receipt for the UI (only when status === 'ResponseVerified')
 */
router.get('/oid4vp-request/:sessionId/status', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  if (!DEMO_TENANT_ID) {
    return res.status(503).json({ error: 'server_error', error_description: 'Demo not configured.' });
  }

  try {
    const agent = await getMainAgent();
    const verifierApi = getVerifierApi(agent);
    const session = await verifierApi.getVerificationSessionById(sessionId);

    const baseResponse = {
      sessionId: session.id,
      status: session.state,
      createdAt: session.createdAt,
    };

    // ldp_vp shortcut: our custom interceptor bypassed Credo's verifier,
    // verified the presentation via @ajna-inc/openbadges, and stored the
    // result keyed by authorizationRequestId. Credo's own session record
    // never advances past RequestCreated for these requests, so prefer the
    // intercepted result whenever present.
    const interceptResult = session.authorizationRequestId
      ? await demoLdpVpSessions.get(session.authorizationRequestId)
      : null;
    if (interceptResult?.state === 'verified') {
      return res.json({
        success: true,
        ...baseResponse,
        status: 'ResponseVerified',
        verifiedClaims: interceptResult.verifiedClaims ?? {},
      });
    }
    if (interceptResult?.state === 'failed') {
      return res.json({
        success: true,
        ...baseResponse,
        status: 'Error',
        error: interceptResult.error,
      });
    }

    if (session.state !== 'ResponseVerified') {
      return res.json({ success: true, ...baseResponse });
    }

    // Real signature verification already happened; just pull the parsed VP.
    const verified = await verifierApi.getVerifiedAuthorizationResponse(sessionId);
    const presentation = verified.presentationExchange?.presentations?.[0];
    const verifiedClaims = extractClaimsFromPresentation(presentation);

    return res.json({ success: true, ...baseResponse, verifiedClaims });
  } catch (error: any) {
    if (error?.message?.includes('not found') || error?.message?.includes('Not found')) {
      return res.status(404).json({ error: 'not_found', error_description: 'Verification session not found' });
    }
    console.error('Error getting demo OID4VP status:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: `Failed to get verification session: ${error.message}`,
    });
  }
});

/**
 * GET /api/demo/oid4vp-request/types
 *
 * returns the list of verifiable credential specs the demo can request.
 * Used by the frontend to populate the verifier dropdown.
 */
router.get('/oid4vp-types', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    types: Object.values(VERIFIABLE_CREDENTIALS).map(({ id, name, format }) => ({ id, name, format })),
  });
});

export default router;
