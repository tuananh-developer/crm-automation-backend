import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('next_best_action_recommendations')
@Index('UQ_next_best_action_recommendations_workflow_run', ['workflowRunId'], {
  unique: true,
})
@Index('IDX_next_best_action_recommendations_entity', [
  'entityType',
  'entityId',
  'createdAt',
])
export class NextBestActionRecommendation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'workflow_run_id', type: 'uuid' })
  workflowRunId!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 20 })
  entityType!: 'Lead' | 'Customer';

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId!: string;

  @Column({ type: 'jsonb' })
  recommendations!: Array<Record<string, unknown>>;

  @Column({ name: 'requires_human_approval', type: 'boolean', default: false })
  requiresHumanApproval!: boolean;

  @Column({ type: 'varchar', length: 30, default: 'RECOMMENDED' })
  status!: 'RECOMMENDED' | 'PENDING_APPROVAL' | 'REVIEWED';

  @Column({ name: 'review_task_id', type: 'uuid', nullable: true })
  reviewTaskId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
