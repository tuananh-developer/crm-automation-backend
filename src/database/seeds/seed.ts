import 'reflect-metadata';
import bcrypt from 'bcrypt';
import { AppDataSource } from '../../data-source.js';
import { User } from '../../modules/users/entities/user.entity.js';
import { UserRole, UserStatus } from '../../modules/users/enums/user.enum.js';
import { LeadSource } from '../../modules/leads/entities/lead-source.entity.js';
import { Lead } from '../../modules/leads/entities/lead.entity.js';
import { Interaction } from '../../modules/leads/entities/interaction.entity.js';
import {
  LeadStatus,
  InteractionType,
} from '../../modules/leads/enums/lead.enum.js';
import { Customer } from '../../modules/customers/entities/customer.entity.js';
import { Segment } from '../../modules/customers/entities/segment.entity.js';
import { CustomerSegment } from '../../modules/customers/entities/customer-segment.entity.js';
import { SegmentAssignmentType } from '../../modules/customers/enums/customer.enum.js';
import { FollowUpSequence } from '../../modules/follow-up/entities/follow-up-sequence.entity.js';
import { FollowUpStep } from '../../modules/follow-up/entities/follow-up-step.entity.js';
import { LeadFollowUpEnrollment } from '../../modules/follow-up/entities/lead-follow-up-enrollment.entity.js';
import { FollowUpExecution } from '../../modules/follow-up/entities/follow-up-execution.entity.js';
import {
  EnrollmentStatus,
  ExecutionStatus,
  FollowUpSequenceStatus,
} from '../../modules/follow-up/enums/follow-up.enum.js';
import { WorkflowRun } from '../../modules/workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../../modules/workflow/enums/workflow.enum.js';
import { LeadQualification } from '../../modules/lead-intelligence/entities/lead-qualification.entity.js';
import { LeadEnrichment } from '../../modules/lead-intelligence/entities/lead-enrichment.entity.js';
import { LeadScore } from '../../modules/lead-intelligence/entities/lead-score.entity.js';
import {
  EnrichmentStatus,
  QualificationStatus,
  ScoreLabel,
} from '../../modules/lead-intelligence/enums/lead-intelligence.enum.js';
import { ReviewTask } from '../../modules/review/entities/review-task.entity.js';
import {
  ReviewDecision,
  ReviewStatus,
} from '../../modules/review/enums/review.enum.js';
import { Notification } from '../../modules/notifications/entities/notification.entity.js';
import { AuditLog } from '../../modules/audit/entities/audit-log.entity.js';

export async function runSeed(options?: { fresh?: boolean }): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // Ignore if .env is missing or already loaded
  }
  const isFresh = options?.fresh ?? process.argv.includes('--fresh');
  console.log(
    `🌱 Starting CRM seed data process${isFresh ? ' (FRESH MODE)' : ''}...\n`,
  );

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  if (isFresh) {
    console.log('🧹 Clearing existing CRM data from all tables...');
    await AppDataSource.query(`
      TRUNCATE TABLE
        "follow_up_executions",
        "lead_follow_up_enrollments",
        "follow_up_steps",
        "follow_up_sequences",
        "customer_segments",
        "segments",
        "interactions",
        "lead_qualifications",
        "lead_enrichments",
        "lead_scores",
        "review_tasks",
        "notifications",
        "audit_logs",
        "workflow_runs",
        "leads",
        "customers",
        "lead_sources",
        "users"
      CASCADE;
    `);
    console.log('  ✓ All 18 tables cleared successfully.\n');
  }

  const userRepository = AppDataSource.getRepository(User);
  const leadSourceRepository = AppDataSource.getRepository(LeadSource);
  const customerRepository = AppDataSource.getRepository(Customer);
  const segmentRepository = AppDataSource.getRepository(Segment);
  const customerSegmentRepository =
    AppDataSource.getRepository(CustomerSegment);
  const leadRepository = AppDataSource.getRepository(Lead);
  const interactionRepository = AppDataSource.getRepository(Interaction);
  const workflowRunRepository = AppDataSource.getRepository(WorkflowRun);
  const qualificationRepository =
    AppDataSource.getRepository(LeadQualification);
  const enrichmentRepository = AppDataSource.getRepository(LeadEnrichment);
  const scoreRepository = AppDataSource.getRepository(LeadScore);
  const sequenceRepository = AppDataSource.getRepository(FollowUpSequence);
  const stepRepository = AppDataSource.getRepository(FollowUpStep);
  const enrollmentRepository = AppDataSource.getRepository(
    LeadFollowUpEnrollment,
  );
  const executionRepository = AppDataSource.getRepository(FollowUpExecution);
  const reviewTaskRepository = AppDataSource.getRepository(ReviewTask);
  const notificationRepository = AppDataSource.getRepository(Notification);
  const auditLogRepository = AppDataSource.getRepository(AuditLog);

  // ─────────────────────────────────────────────────────────────────────────
  // 1. USERS (10 rows)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('👤 Seeding 10 Users...');
  const defaultPasswordHash = await bcrypt.hash('Password123!', 10);

  const usersData = [
    {
      name: 'System Admin',
      email: 'admin@crm.local',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
    {
      name: 'Sarah Tech Lead',
      email: 'sarah.admin@crm.local',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
    {
      name: 'Alex Sales Rep',
      email: 'sales@crm.local',
      role: UserRole.SALES,
      status: UserStatus.ACTIVE,
    },
    {
      name: 'Emma Watson',
      email: 'emma.watson@crm.local',
      role: UserRole.SALES,
      status: UserStatus.ACTIVE,
    },
    {
      name: 'David Kim',
      email: 'david.kim@crm.local',
      role: UserRole.SALES,
      status: UserStatus.ACTIVE,
    },
    {
      name: 'Jessica Taylor',
      email: 'jessica.taylor@crm.local',
      role: UserRole.SALES,
      status: UserStatus.ACTIVE,
    },
    {
      name: 'Robert Chen',
      email: 'robert.chen@crm.local',
      role: UserRole.SALES,
      status: UserStatus.ACTIVE,
    },
    {
      name: 'Maria Garcia',
      email: 'maria.garcia@crm.local',
      role: UserRole.SALES,
      status: UserStatus.ACTIVE,
    },
    {
      name: 'James Wilson',
      email: 'james.wilson@crm.local',
      role: UserRole.SALES,
      status: UserStatus.INACTIVE,
    },
    {
      name: 'Linda Brown',
      email: 'linda.brown@crm.local',
      role: UserRole.SALES,
      status: UserStatus.LOCKED,
    },
  ];

  const seededUsers: User[] = [];
  for (const u of usersData) {
    let user = await userRepository.findOne({ where: { email: u.email } });
    if (!user) {
      user = userRepository.create({ ...u, passwordHash: defaultPasswordHash });
      await userRepository.save(user);
      console.log(
        `  ✓ Created User: ${user.name} (${user.email}) [${user.role}]`,
      );
    } else {
      console.log(`  • User already exists: ${user.email}`);
    }
    seededUsers.push(user);
  }
  const [adminUser, admin2, salesUser, sales2, sales3, sales4, sales5, sales6] =
    seededUsers;

  // ─────────────────────────────────────────────────────────────────────────
  // 2. LEAD SOURCES (10 rows)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n📍 Seeding 10 Lead Sources...');
  const leadSourcesData = [
    {
      name: 'Website',
      description: 'Organic & direct traffic via website',
      isActive: true,
    },
    {
      name: 'Facebook',
      description: 'Facebook advertising and social lead generation',
      isActive: true,
    },
    {
      name: 'Referral',
      description: 'Client, partner, and word-of-mouth referrals',
      isActive: true,
    },
    {
      name: 'Event',
      description: 'Industry expos, trade shows, and webinars',
      isActive: true,
    },
    {
      name: 'Manual',
      description: 'Outbound sales prospecting and manual data entry',
      isActive: true,
    },
    {
      name: 'LinkedIn',
      description: 'B2B LinkedIn marketing and InMail campaigns',
      isActive: true,
    },
    {
      name: 'Google Ads',
      description: 'Search and display advertising campaigns',
      isActive: true,
    },
    {
      name: 'TikTok',
      description: 'Short-form video marketing campaigns',
      isActive: true,
    },
    {
      name: 'Direct Mail',
      description: 'Targeted email and newsletter campaigns',
      isActive: true,
    },
    {
      name: 'Partner Network',
      description: 'Affiliate and strategic partner ecosystem',
      isActive: true,
    },
  ];

  const seededSources: LeadSource[] = [];
  for (const src of leadSourcesData) {
    let source = await leadSourceRepository.findOne({
      where: { name: src.name },
    });
    if (!source) {
      source = leadSourceRepository.create(src);
      await leadSourceRepository.save(source);
      console.log(`  ✓ Created Lead Source: ${source.name}`);
    } else {
      console.log(`  • Lead Source already exists: ${source.name}`);
    }
    seededSources.push(source);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. CUSTOMERS (10 rows)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n🏢 Seeding 10 Customers...');
  const customersData = [
    {
      name: 'Acme Corporation',
      email: 'contact@acme.corp',
      phone: '+1-555-0101',
      companyName: 'Acme Corp',
      companyWebsite: 'https://acme.corp',
      jobTitle: 'Chief Technology Officer',
      companySize: 250,
      industry: 'Software & IT',
      status: 'ACTIVE',
      createdBy: adminUser.id,
      notes: 'Key enterprise account.',
    },
    {
      name: 'Global Logistics Ltd',
      email: 'info@globallogistics.io',
      phone: '+1-555-0102',
      companyName: 'Global Logistics Ltd',
      companyWebsite: 'https://globallogistics.io',
      jobTitle: 'VP Operations',
      companySize: 600,
      industry: 'Logistics',
      status: 'ACTIVE',
      createdBy: salesUser.id,
      notes: 'Global supply chain enterprise.',
    },
    {
      name: 'Nexus FinTech Group',
      email: 'support@nexusfin.com',
      phone: '+1-555-0103',
      companyName: 'Nexus FinTech',
      companyWebsite: 'https://nexusfin.com',
      jobTitle: 'Head of Product',
      companySize: 120,
      industry: 'Financial Services',
      status: 'ACTIVE',
      createdBy: adminUser.id,
      notes: 'Digital banking infrastructure customer.',
    },
    {
      name: 'BioHealth Solutions',
      email: 'contact@biohealth.org',
      phone: '+1-555-0104',
      companyName: 'BioHealth Labs',
      companyWebsite: 'https://biohealth.org',
      jobTitle: 'Director of R&D',
      companySize: 80,
      industry: 'Healthcare',
      status: 'ACTIVE',
      createdBy: sales2.id,
      notes: 'Biotech lab management subscription.',
    },
    {
      name: 'Apex Retailers Inc',
      email: 'ops@apexretail.net',
      phone: '+1-555-0105',
      companyName: 'Apex Retail',
      companyWebsite: 'https://apexretail.net',
      jobTitle: 'CMO',
      companySize: 450,
      industry: 'Retail & E-commerce',
      status: 'ACTIVE',
      createdBy: sales3.id,
      notes: 'Omnichannel retail customer.',
    },
    {
      name: 'Starlight Media',
      email: 'hello@starlightmedia.com',
      phone: '+1-555-0106',
      companyName: 'Starlight Media',
      companyWebsite: 'https://starlightmedia.com',
      jobTitle: 'Creative Director',
      companySize: 35,
      industry: 'Media & Entertainment',
      status: 'ACTIVE',
      createdBy: salesUser.id,
      notes: 'Digital content studio.',
    },
    {
      name: 'GreenEnergy Ventures',
      email: 'contact@greenenergy.co',
      phone: '+1-555-0107',
      companyName: 'Green Energy',
      companyWebsite: 'https://greenenergy.co',
      jobTitle: 'Sustainability Lead',
      companySize: 150,
      industry: 'Renewable Energy',
      status: 'ACTIVE',
      createdBy: adminUser.id,
      notes: 'Clean tech enterprise.',
    },
    {
      name: 'Skyline Real Estate',
      email: 'leads@skylinerealty.com',
      phone: '+1-555-0108',
      companyName: 'Skyline Realty',
      companyWebsite: 'https://skylinerealty.com',
      jobTitle: 'Managing Broker',
      companySize: 90,
      industry: 'Real Estate',
      status: 'ACTIVE',
      createdBy: sales4.id,
      notes: 'Commercial real estate portfolio.',
    },
    {
      name: 'Vanguard Cybersecurity',
      email: 'info@vanguardsec.ai',
      phone: '+1-555-0109',
      companyName: 'Vanguard Sec',
      companyWebsite: 'https://vanguardsec.ai',
      jobTitle: 'CISO',
      companySize: 300,
      industry: 'Software & IT',
      status: 'ACTIVE',
      createdBy: admin2.id,
      notes: 'AI-driven cyber defense company.',
    },
    {
      name: 'Horizon Manufacturing',
      email: 'sales@horizonmfg.com',
      phone: '+1-555-0110',
      companyName: 'Horizon MFG',
      companyWebsite: 'https://horizonmfg.com',
      jobTitle: 'VP Procurement',
      companySize: 800,
      industry: 'Manufacturing',
      status: 'ACTIVE',
      createdBy: sales5.id,
      notes: 'Industrial automation manufacturer.',
    },
  ];

  const seededCustomers: Customer[] = [];
  for (const c of customersData) {
    let customer = await customerRepository.findOne({
      where: { email: c.email },
    });
    if (!customer) {
      customer = customerRepository.create(c);
      await customerRepository.save(customer);
      console.log(
        `  ✓ Created Customer: ${customer.name} (${customer.companyName})`,
      );
    } else {
      console.log(`  • Customer already exists: ${customer.email}`);
    }
    seededCustomers.push(customer);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. SEGMENTS (10 rows)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n📊 Seeding 10 Segments...');
  const segmentsData = [
    {
      name: 'Enterprise VIP',
      description: 'Enterprise accounts > 200 employees',
      criteria: { minCompanySize: 200 },
      isActive: true,
      createdBy: adminUser.id,
    },
    {
      name: 'SMB High Growth',
      description: 'Rapidly growing small-to-medium businesses',
      criteria: { maxCompanySize: 100, stage: 'Growth' },
      isActive: true,
      createdBy: adminUser.id,
    },
    {
      name: 'SaaS & Tech Innovators',
      description: 'Software & technology providers',
      criteria: { industries: ['Software & IT'] },
      isActive: true,
      createdBy: adminUser.id,
    },
    {
      name: 'Healthcare & Biotech',
      description: 'Healthcare, hospitals, and biotech firms',
      criteria: { industries: ['Healthcare'] },
      isActive: true,
      createdBy: adminUser.id,
    },
    {
      name: 'E-Commerce & Retail',
      description: 'Retailers and online brands',
      criteria: { industries: ['Retail & E-commerce'] },
      isActive: true,
      createdBy: adminUser.id,
    },
    {
      name: 'Financial Services',
      description: 'Banks, FinTechs, and investment firms',
      criteria: { industries: ['Financial Services'] },
      isActive: true,
      createdBy: adminUser.id,
    },
    {
      name: 'High Churn Risk',
      description: 'Accounts with reduced engagement',
      criteria: { engagement: 'low' },
      isActive: true,
      createdBy: adminUser.id,
    },
    {
      name: 'Key Strategic Accounts',
      description: 'Tier 1 priority enterprise customers',
      criteria: { tier: 'Tier 1' },
      isActive: true,
      createdBy: adminUser.id,
    },
    {
      name: 'Global Expansion',
      description: 'Multi-national overseas accounts',
      criteria: { region: 'Global' },
      isActive: true,
      createdBy: adminUser.id,
    },
    {
      name: 'Early Adopters',
      description: 'Customers on beta and new feature pilots',
      criteria: { beta_program: true },
      isActive: true,
      createdBy: adminUser.id,
    },
  ];

  const seededSegments: Segment[] = [];
  for (const s of segmentsData) {
    let segment = await segmentRepository.findOne({ where: { name: s.name } });
    if (!segment) {
      segment = segmentRepository.create(s);
      await segmentRepository.save(segment);
      console.log(`  ✓ Created Segment: ${segment.name}`);
    } else {
      console.log(`  • Segment already exists: ${segment.name}`);
    }
    seededSegments.push(segment);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. CUSTOMER_SEGMENTS (10 rows)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n🔗 Seeding 10 Customer-Segment Links...');
  for (let i = 0; i < 10; i++) {
    const cust = seededCustomers[i];
    const seg = seededSegments[i];
    let cs = await customerSegmentRepository.findOne({
      where: { customerId: cust.id, segmentId: seg.id },
    });
    if (!cs) {
      cs = customerSegmentRepository.create({
        customerId: cust.id,
        segmentId: seg.id,
        assignmentType:
          i % 2 === 0
            ? SegmentAssignmentType.MANUAL
            : SegmentAssignmentType.RULE,
        confidence: 0.9 + (i % 10) * 0.01,
        assignedReason: `Matched criteria for ${seg.name} based on company profile.`,
        assignedAt: new Date(),
        assignedBy: adminUser.id,
      });
      await customerSegmentRepository.save(cs);
      console.log(
        `  ✓ Assigned Customer "${cust.name}" to Segment "${seg.name}"`,
      );
    } else {
      console.log(
        `  • Customer Segment assignment already exists: ${cust.name} -> ${seg.name}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. LEADS (10 rows)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n🎯 Seeding 10 Leads...');
  const sampleLeadsData = [
    {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@techsolutions.com',
      phone: '+1-555-1001',
      companyName: 'Tech Solutions Inc',
      companyWebsite: 'https://techsolutions.com',
      jobTitle: 'VP Operations',
      companySize: 50,
      industry: 'Technology',
      status: LeadStatus.NEW,
      sourceId: seededSources[0].id,
      ownerId: salesUser.id,
      notes: 'Demo request on website form.',
    },
    {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@growthmedia.com',
      phone: '+1-555-1002',
      companyName: 'Growth Media Group',
      companyWebsite: 'https://growthmedia.com',
      jobTitle: 'Marketing Director',
      companySize: 20,
      industry: 'Marketing',
      status: LeadStatus.QUALIFYING,
      sourceId: seededSources[1].id,
      ownerId: sales2.id,
      notes: 'Facebook lead campaign.',
    },
    {
      firstName: 'Michael',
      lastName: 'Brown',
      email: 'mbrown@apexlogistics.io',
      phone: '+1-555-1003',
      companyName: 'Apex Logistics',
      companyWebsite: 'https://apexlogistics.io',
      jobTitle: 'Head of Supply Chain',
      companySize: 500,
      industry: 'Logistics',
      status: LeadStatus.QUALIFIED,
      sourceId: seededSources[3].id,
      ownerId: sales3.id,
      notes: 'Met at Tech Summit 2026.',
    },
    {
      firstName: 'Sarah',
      lastName: 'Connor',
      email: 'sconnor@cyberdyne.ai',
      phone: '+1-555-1004',
      companyName: 'Cyberdyne Systems',
      companyWebsite: 'https://cyberdyne.ai',
      jobTitle: 'CSO',
      companySize: 1000,
      industry: 'Software & IT',
      status: LeadStatus.NURTURING,
      sourceId: seededSources[4].id,
      ownerId: sales4.id,
      notes: 'Requested security whitepaper.',
    },
    {
      firstName: 'David',
      lastName: 'Miller',
      email: 'david@millerconsulting.com',
      phone: '+1-555-1005',
      companyName: 'Miller Consulting',
      companyWebsite: 'https://millerconsulting.com',
      jobTitle: 'Managing Partner',
      companySize: 15,
      industry: 'Consulting',
      status: LeadStatus.CONVERTED,
      sourceId: seededSources[2].id,
      ownerId: salesUser.id,
      convertedCustomerId: seededCustomers[0].id,
      convertedBy: salesUser.id,
      convertedAt: new Date(),
      notes: 'Closed and converted to customer.',
    },
    {
      firstName: 'Emily',
      lastName: 'Davis',
      email: 'emily.davis@retailhub.net',
      phone: '+1-555-1006',
      companyName: 'Retail Hub',
      companyWebsite: 'https://retailhub.net',
      jobTitle: 'Store Manager',
      companySize: 8,
      industry: 'Retail',
      status: LeadStatus.LOST,
      sourceId: seededSources[0].id,
      ownerId: sales2.id,
      notes: 'Out of budget this quarter.',
    },
    {
      firstName: 'Carlos',
      lastName: 'Santana',
      email: 'carlos@soundwave.fm',
      phone: '+1-555-1007',
      companyName: 'SoundWave Digital',
      companyWebsite: 'https://soundwave.fm',
      jobTitle: 'Head of Growth',
      companySize: 45,
      industry: 'Media',
      status: LeadStatus.NEW,
      sourceId: seededSources[6].id,
      ownerId: sales3.id,
      notes: 'Google Ads click-through.',
    },
    {
      firstName: 'Amanda',
      lastName: 'Lee',
      email: 'amanda@quantumbio.com',
      phone: '+1-555-1008',
      companyName: 'Quantum BioTech',
      companyWebsite: 'https://quantumbio.com',
      jobTitle: 'Chief Scientist',
      companySize: 110,
      industry: 'Healthcare',
      status: LeadStatus.QUALIFIED,
      sourceId: seededSources[5].id,
      ownerId: sales4.id,
      notes: 'B2B LinkedIn outreach.',
    },
    {
      firstName: 'Oliver',
      lastName: 'Queen',
      email: 'oliver@starlinggreen.org',
      phone: '+1-555-1009',
      companyName: 'Starling Green Energy',
      companyWebsite: 'https://starlinggreen.org',
      jobTitle: 'COO',
      companySize: 220,
      industry: 'Renewable Energy',
      status: LeadStatus.NURTURING,
      sourceId: seededSources[9].id,
      ownerId: sales5.id,
      notes: 'Partner referral network.',
    },
    {
      firstName: 'Rachel',
      lastName: 'Green',
      email: 'rachel@fashionpulse.co',
      phone: '+1-555-1010',
      companyName: 'Fashion Pulse',
      companyWebsite: 'https://fashionpulse.co',
      jobTitle: 'VP Merchandising',
      companySize: 75,
      industry: 'Retail & E-commerce',
      status: LeadStatus.QUALIFYING,
      sourceId: seededSources[7].id,
      ownerId: sales6.id,
      notes: 'TikTok viral campaign lead.',
    },
  ];

  const seededLeads: Lead[] = [];
  for (const ld of sampleLeadsData) {
    let lead = await leadRepository.findOne({ where: { email: ld.email } });
    if (!lead) {
      lead = leadRepository.create(ld);
      await leadRepository.save(lead);
      console.log(
        `  ✓ Created Lead: ${lead.firstName} ${lead.lastName} [${lead.status}]`,
      );
    } else {
      console.log(`  • Lead already exists: ${lead.email}`);
    }
    seededLeads.push(lead);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7. INTERACTIONS (10 rows)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n💬 Seeding 10 Interactions...');
  const interactionsData = [
    {
      leadId: seededLeads[0].id,
      type: InteractionType.FORM_SUBMIT,
      channel: 'WEB',
      subject: 'Website Inbound Demo Request',
      content: 'Lead submitted enterprise demo form with high interest.',
      occurredAt: new Date(Date.now() - 3600000 * 24 * 3),
      createdBy: salesUser.id,
    },
    {
      leadId: seededLeads[1].id,
      type: InteractionType.MESSAGE,
      channel: 'FACEBOOK',
      subject: 'Facebook Ad Engagement',
      content: 'Responded to automated messenger welcome prompt.',
      occurredAt: new Date(Date.now() - 3600000 * 24 * 2),
      createdBy: sales2.id,
    },
    {
      leadId: seededLeads[2].id,
      type: InteractionType.MEETING,
      channel: 'IN_PERSON',
      subject: 'Booth Meeting at Tech Summit',
      content: 'Discussed supply chain automation roadmap and budget approval.',
      occurredAt: new Date(Date.now() - 3600000 * 24 * 5),
      createdBy: sales3.id,
    },
    {
      leadId: seededLeads[3].id,
      type: InteractionType.EMAIL,
      channel: 'EMAIL',
      subject: 'Security & Compliance Architecture Review',
      content: 'Sent SOC2 compliance documents and integration specs.',
      occurredAt: new Date(Date.now() - 3600000 * 24 * 1),
      createdBy: sales4.id,
    },
    {
      leadId: seededLeads[4].id,
      type: InteractionType.CALL,
      channel: 'PHONE',
      subject: 'Closing Deal Consultation Call',
      content: 'Agreed on annual contract terms and payment schedule.',
      occurredAt: new Date(Date.now() - 3600000 * 24 * 7),
      createdBy: salesUser.id,
    },
    {
      leadId: seededLeads[5].id,
      type: InteractionType.CALL,
      channel: 'PHONE',
      subject: 'Pricing & Budget Discussion',
      content: 'Client indicated postponement to next fiscal year.',
      occurredAt: new Date(Date.now() - 3600000 * 24 * 4),
      createdBy: sales2.id,
    },
    {
      leadId: seededLeads[6].id,
      type: InteractionType.PAGE_VIEW,
      channel: 'WEB',
      subject: 'Pricing Page Visit',
      content: 'Lead viewed enterprise pricing tier 3 times in 2 hours.',
      occurredAt: new Date(Date.now() - 3600000 * 12),
      createdBy: sales3.id,
    },
    {
      leadId: seededLeads[7].id,
      type: InteractionType.MESSAGE,
      channel: 'LINKEDIN',
      subject: 'LinkedIn Outreach Reply',
      content: 'Amanda expressed interest in AI lab automation capabilities.',
      occurredAt: new Date(Date.now() - 3600000 * 8),
      createdBy: sales4.id,
    },
    {
      leadId: seededLeads[8].id,
      type: InteractionType.MEETING,
      channel: 'ZOOM',
      subject: 'Discovery Product Walkthrough',
      content:
        'Presented CRM workflow builder to Green Energy operations team.',
      occurredAt: new Date(Date.now() - 3600000 * 16),
      createdBy: sales5.id,
    },
    {
      leadId: seededLeads[9].id,
      type: InteractionType.EMAIL,
      channel: 'EMAIL',
      subject: 'Retail E-commerce Follow-up',
      content: 'Sent automated product catalog and e-commerce case studies.',
      occurredAt: new Date(Date.now() - 3600000 * 6),
      createdBy: sales6.id,
    },
  ];

  for (let i = 0; i < 10; i++) {
    const inter = interactionRepository.create(interactionsData[i]);
    await interactionRepository.save(inter);
    console.log(
      `  ✓ Created Interaction: [${inter.type}] for Lead ${seededLeads[i].firstName}`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 8. WORKFLOW_RUNS (10 rows)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n⚙️ Seeding 10 Workflow Runs...');
  const seededWorkflowRuns: WorkflowRun[] = [];
  for (let i = 0; i < 10; i++) {
    const wf = workflowRunRepository.create({
      workflowName: `crm_automation_flow_${i + 1}`,
      n8nExecutionId: `n8n_exec_${Date.now()}_${i + 1}`,
      leadId: seededLeads[i].id,
      customerId: seededCustomers[i].id,
      triggeredByUserId: adminUser.id,
      status:
        i % 3 === 0
          ? WorkflowStatus.SUCCESS
          : i % 3 === 1
            ? WorkflowStatus.RUNNING
            : WorkflowStatus.PENDING,
      inputPayload: {
        leadId: seededLeads[i].id,
        action: 'AUTOMATED_PROCESS',
        timestamp: new Date(),
      },
      outputPayload: { processed: true, score: 85 + i },
      startedAt: new Date(),
    });
    await workflowRunRepository.save(wf);
    seededWorkflowRuns.push(wf);
    console.log(`  ✓ Created Workflow Run: ${wf.workflowName} [${wf.status}]`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 9. LEAD_QUALIFICATIONS (10 rows)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n🧠 Seeding 10 Lead Qualifications...');
  for (let i = 0; i < 10; i++) {
    const qual = qualificationRepository.create({
      leadId: seededLeads[i].id,
      workflowRunId: seededWorkflowRuns[i].id,
      status:
        i < 5
          ? QualificationStatus.QUALIFIED
          : i < 8
            ? QualificationStatus.NEEDS_REVIEW
            : QualificationStatus.DISQUALIFIED,
      intent: i < 5 ? 'High Purchase Intent' : 'Information Gathering',
      confidence: 0.85 + (i % 10) * 0.01,
      reason: `AI qualification analysis for ${seededLeads[i].companyName}: budget and authority verified.`,
      modelProvider: 'OpenAI',
      modelName: 'gpt-4o',
      modelVersion: '2026-v1',
      inputSnapshot: {
        email: seededLeads[i].email,
        company: seededLeads[i].companyName,
      },
      outputSnapshot: { qualificationScore: 90 - i * 4 },
    });
    await qualificationRepository.save(qual);
    console.log(
      `  ✓ Created Lead Qualification for ${seededLeads[i].firstName} [${qual.status}]`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 10. LEAD_ENRICHMENTS (10 rows)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n🔍 Seeding 10 Lead Enrichments...');
  for (let i = 0; i < 10; i++) {
    const enrich = enrichmentRepository.create({
      leadId: seededLeads[i].id,
      workflowRunId: seededWorkflowRuns[i].id,
      provider: i % 2 === 0 ? 'Clearbit' : 'Apollo.io',
      externalRequestId: `req_enrich_${Date.now()}_${i + 1}`,
      status: EnrichmentStatus.SUCCESS,
      companyName: seededLeads[i].companyName,
      companyWebsite: seededLeads[i].companyWebsite,
      companyIndustry: seededLeads[i].industry,
      companySize: seededLeads[i].companySize,
      contactJobTitle: seededLeads[i].jobTitle,
      contactLinkedinUrl: `https://linkedin.com/in/${seededLeads[i].firstName.toLowerCase()}-${seededLeads[i].lastName?.toLowerCase()}`,
      rawResponse: { enriched: true, domain: seededLeads[i].companyWebsite },
      enrichedAt: new Date(),
    });
    await enrichmentRepository.save(enrich);
    console.log(
      `  ✓ Created Lead Enrichment for ${seededLeads[i].firstName} via ${enrich.provider}`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 11. LEAD_SCORES (10 rows)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n📈 Seeding 10 Lead Scores...');
  for (let i = 0; i < 10; i++) {
    const scVal = 95 - i * 6;
    const score = scoreRepository.create({
      leadId: seededLeads[i].id,
      workflowRunId: seededWorkflowRuns[i].id,
      score: scVal,
      label:
        scVal >= 80
          ? ScoreLabel.HOT
          : scVal >= 55
            ? ScoreLabel.WARM
            : ScoreLabel.COLD,
      reason: `Scored based on company size (${seededLeads[i].companySize}), title (${seededLeads[i].jobTitle}), and recent engagement.`,
      modelProvider: 'Anthropic',
      modelName: 'claude-3-5-sonnet',
      modelVersion: 'v2',
      scoringFeatures: { companyFit: 0.9, intentScore: scVal / 100 },
      inputSnapshot: { leadEmail: seededLeads[i].email },
      outputSnapshot: { finalScore: scVal },
    });
    await scoreRepository.save(score);
    console.log(
      `  ✓ Created Lead Score: ${score.score} [${score.label}] for ${seededLeads[i].firstName}`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 12. FOLLOW_UP_SEQUENCES (10 rows)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n🔁 Seeding 10 Follow-up Sequences...');
  const sequencesData = [
    {
      name: 'Inbound Lead Welcome & Qualification',
      description: 'Automated 3-step outreach for inbound leads',
      status: FollowUpSequenceStatus.ACTIVE,
      createdBy: adminUser.id,
    },
    {
      name: 'Enterprise High-Touch Cadence',
      description: 'Executive multi-channel outreach for high-value leads',
      status: FollowUpSequenceStatus.ACTIVE,
      createdBy: adminUser.id,
    },
    {
      name: 'Webinar Post-Event Engagement',
      description: 'Nurture attendees after online events and webinars',
      status: FollowUpSequenceStatus.ACTIVE,
      createdBy: salesUser.id,
    },
    {
      name: 'Demo Request Fast Follow-Up',
      description: 'Rapid response sequence for website demo bookings',
      status: FollowUpSequenceStatus.ACTIVE,
      createdBy: sales2.id,
    },
    {
      name: 'Cold Lead Re-engagement',
      description: 'Revival sequence for uncontacted or inactive leads',
      status: FollowUpSequenceStatus.PAUSED,
      createdBy: salesUser.id,
    },
    {
      name: 'Self-Serve Product Onboarding',
      description: 'Email educational sequence for free trial accounts',
      status: FollowUpSequenceStatus.ACTIVE,
      createdBy: adminUser.id,
    },
    {
      name: 'Executive Decision Maker Cadence',
      description: 'Targeting C-level officers with ROI whitepapers',
      status: FollowUpSequenceStatus.ACTIVE,
      createdBy: sales3.id,
    },
    {
      name: 'Partner Referral Welcome',
      description:
        'Priority cadence for inbound referrals from trusted partners',
      status: FollowUpSequenceStatus.ACTIVE,
      createdBy: admin2.id,
    },
    {
      name: 'E-Commerce Buyer Nurturing',
      description: 'Specialized sequence tailored for retail brands',
      status: FollowUpSequenceStatus.ACTIVE,
      createdBy: sales4.id,
    },
    {
      name: 'Security Review & Compliance Journey',
      description: 'SOC2 and compliance assurance for security leads',
      status: FollowUpSequenceStatus.DRAFT,
      createdBy: adminUser.id,
    },
  ];

  const seededSequences: FollowUpSequence[] = [];
  for (const seq of sequencesData) {
    let sequence = await sequenceRepository.findOne({
      where: { name: seq.name },
    });
    if (!sequence) {
      sequence = sequenceRepository.create(seq);
      await sequenceRepository.save(sequence);
      console.log(`  ✓ Created Sequence: ${sequence.name}`);
    } else {
      console.log(`  • Sequence already exists: ${sequence.name}`);
    }
    seededSequences.push(sequence);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 13. FOLLOW_UP_STEPS (10 rows)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n👣 Seeding 10 Follow-up Steps...');
  const seededSteps: FollowUpStep[] = [];
  for (let i = 0; i < 10; i++) {
    const seq = seededSequences[i % seededSequences.length];
    const stepOrder = Math.floor(i / seededSequences.length) + 1;
    let step = await stepRepository.findOne({
      where: { sequenceId: seq.id, stepOrder },
    });
    if (!step) {
      step = stepRepository.create({
        sequenceId: seq.id,
        stepOrder,
        delayMinutes: i * 720,
        channel: i % 3 === 0 ? 'EMAIL' : i % 3 === 1 ? 'CALL' : 'MESSAGE',
        actionType:
          i % 3 === 0
            ? 'SEND_EMAIL'
            : i % 3 === 1
              ? 'SCHEDULE_CALL'
              : 'SEND_SMS',
        subjectTemplate: `Step ${stepOrder}: Introduction & Solutions for {{companyName}}`,
        contentTemplate: `Hi {{firstName}},\n\nWe wanted to share how our CRM helps {{companyName}} accelerate revenue.\n\nBest,\nCRM Team`,
        conditions: { active: true },
        metadata: { stepIndex: i + 1 },
        isActive: true,
      });
      await stepRepository.save(step);
      console.log(
        `  ✓ Created Step ${stepOrder} in Sequence "${seq.name}" [${step.channel}]`,
      );
    } else {
      console.log(
        `  • Step already exists: Seq ${seq.name} - Step ${stepOrder}`,
      );
    }
    seededSteps.push(step);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 14. LEAD_FOLLOW_UP_ENROLLMENTS (10 rows)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n📝 Seeding 10 Follow-up Enrollments...');
  const seededEnrollments: LeadFollowUpEnrollment[] = [];
  for (let i = 0; i < 10; i++) {
    const lead = seededLeads[i];
    const seq = seededSequences[i];
    const step = seededSteps[i];
    let enrollment = await enrollmentRepository.findOne({
      where: { leadId: lead.id, sequenceId: seq.id },
    });
    if (!enrollment) {
      enrollment = enrollmentRepository.create({
        leadId: lead.id,
        sequenceId: seq.id,
        currentStepId: step.id,
        status:
          i % 4 === 0 ? EnrollmentStatus.COMPLETED : EnrollmentStatus.ACTIVE,
        startedAt: new Date(),
        assignedBy: salesUser.id,
      });
      await enrollmentRepository.save(enrollment);
      console.log(
        `  ✓ Enrolled Lead "${lead.firstName} ${lead.lastName}" in "${seq.name}"`,
      );
    } else {
      console.log(
        `  • Enrollment already exists: ${lead.email} in ${seq.name}`,
      );
    }
    seededEnrollments.push(enrollment);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 15. FOLLOW_UP_EXECUTIONS (10 rows)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n⚡ Seeding 10 Follow-up Executions...');
  for (let i = 0; i < 10; i++) {
    const exec = executionRepository.create({
      enrollmentId: seededEnrollments[i].id,
      stepId: seededSteps[i].id,
      status:
        i % 3 === 0
          ? ExecutionStatus.SUCCESS
          : i % 3 === 1
            ? ExecutionStatus.PENDING
            : ExecutionStatus.RUNNING,
      scheduledAt: new Date(Date.now() + i * 3600000),
      startedAt: new Date(),
      completedAt: i % 3 === 0 ? new Date() : null,
      providerMessageId: `msg_provider_id_${Date.now()}_${i + 1}`,
      requestPayload: {
        recipient: seededLeads[i].email,
        subject: `Outreach to ${seededLeads[i].firstName}`,
      },
      responsePayload: { status: 'delivered', code: 200 },
      retryCount: 0,
    });
    await executionRepository.save(exec);
    console.log(
      `  ✓ Created Follow-up Execution for Enrollment ${i + 1} [${exec.status}]`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 16. REVIEW_TASKS (10 rows)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n📋 Seeding 10 Review Tasks...');
  const seededReviews: ReviewTask[] = [];
  for (let i = 0; i < 10; i++) {
    const review = reviewTaskRepository.create({
      leadId: seededLeads[i].id,
      workflowRunId: seededWorkflowRuns[i].id,
      assignedTo: seededUsers[i % seededUsers.length].id,
      status:
        i % 3 === 0
          ? ReviewStatus.RESOLVED
          : i % 3 === 1
            ? ReviewStatus.PENDING
            : ReviewStatus.IN_REVIEW,
      reason: `Qualification confidence check for high-budget lead from ${seededLeads[i].companyName}.`,
      decision: i % 3 === 0 ? ReviewDecision.APPROVE : null,
      reviewComment:
        i % 3 === 0 ? 'Verified budget and contact authenticity.' : null,
    });
    await reviewTaskRepository.save(review);
    seededReviews.push(review);
    console.log(
      `  ✓ Created Review Task for Lead ${seededLeads[i].firstName} [${review.status}]`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 17. NOTIFICATIONS (10 rows)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n🔔 Seeding 10 Notifications...');
  const notifTypes = [
    {
      title: 'New High-Score Lead Assigned',
      content:
        'You have been assigned a new hot lead: John Doe (Tech Solutions).',
    },
    {
      title: 'Follow-up Task Reminder',
      content: 'Follow-up consultation call is scheduled for Jane Smith.',
    },
    {
      title: 'Lead Qualification Completed',
      content: 'AI qualification scored Michael Brown at 95 (HOT).',
    },
    {
      title: 'Security Review Requested',
      content: 'Sarah Connor requested custom architecture compliance review.',
    },
    {
      title: 'Deal Converted Successfully!',
      content: 'David Miller converted into customer Acme Corporation.',
    },
    {
      title: 'Workflow Alert',
      content:
        'Automated outreach cadence completed successfully for Carlos Santana.',
    },
    {
      title: 'New Review Task Assigned',
      content: 'Please review lead qualification for Amanda Lee.',
    },
    {
      title: 'Partner Referral Alert',
      content: 'Starling Green Energy came through Partner Network referral.',
    },
    {
      title: 'E-commerce Campaign Engagement',
      content: 'Rachel Green clicked TikTok campaign product brochure.',
    },
    {
      title: 'System Security Report',
      content: 'Weekly audit log report generated and ready for review.',
    },
  ];

  for (let i = 0; i < 10; i++) {
    const notif = notificationRepository.create({
      userId: seededUsers[i].id,
      type: 'LEAD_NOTIFICATION',
      title: notifTypes[i].title,
      content: notifTypes[i].content,
      leadId: seededLeads[i].id,
      customerId: seededCustomers[i].id,
      reviewTaskId: seededReviews[i].id,
      isRead: i % 2 === 0,
      readAt: i % 2 === 0 ? new Date() : null,
    });
    await notificationRepository.save(notif);
    console.log(
      `  ✓ Created Notification for ${seededUsers[i].name}: "${notif.title}"`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 18. AUDIT_LOGS (10 rows)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n📜 Seeding 10 Audit Logs...');
  const auditActions = [
    { action: 'USER_LOGIN', entityType: 'USER', id: adminUser.id },
    { action: 'LEAD_CREATED', entityType: 'LEAD', id: seededLeads[0].id },
    { action: 'LEAD_QUALIFIED', entityType: 'LEAD', id: seededLeads[1].id },
    {
      action: 'CUSTOMER_CONVERTED',
      entityType: 'CUSTOMER',
      id: seededCustomers[0].id,
    },
    {
      action: 'SEQUENCE_CREATED',
      entityType: 'FOLLOW_UP_SEQUENCE',
      id: seededSequences[0].id,
    },
    {
      action: 'SEGMENT_ASSIGNED',
      entityType: 'CUSTOMER_SEGMENT',
      id: seededCustomers[1].id,
    },
    {
      action: 'WORKFLOW_TRIGGERED',
      entityType: 'WORKFLOW_RUN',
      id: seededWorkflowRuns[0].id,
    },
    {
      action: 'REVIEW_RESOLVED',
      entityType: 'REVIEW_TASK',
      id: seededReviews[0].id,
    },
    { action: 'LEAD_ENRICHED', entityType: 'LEAD', id: seededLeads[3].id },
    { action: 'SETTINGS_UPDATED', entityType: 'SYSTEM', id: adminUser.id },
  ];

  for (let i = 0; i < 10; i++) {
    const audit = auditLogRepository.create({
      userId: seededUsers[i].id,
      action: auditActions[i].action,
      entityType: auditActions[i].entityType,
      entityId: auditActions[i].id,
      oldValue: { status: 'PENDING' },
      newValue: { status: 'ACTIVE' },
      metadata: { source: 'SEED_DATA_GENERATOR', executionTimeMs: 12 },
      ipAddress: `192.168.1.${10 + i}`,
      userAgent: 'CRM-Backend-Seeder/1.0',
    });
    await auditLogRepository.save(audit);
    console.log(
      `  ✓ Created Audit Log: [${audit.action}] by ${seededUsers[i].name}`,
    );
  }

  console.log(
    '\n✨ Database seeding of all 18 tables (10+ rows each) completed successfully!\n',
  );
}

// Auto-run when executed directly via Node
if (
  process.argv[1]?.endsWith('seed.js') ||
  process.argv[1]?.endsWith('seed.ts')
) {
  runSeed()
    .then(async () => {
      if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
      }
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('❌ Seeding failed:', error);
      if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
      }
      process.exit(1);
    });
}
