import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  type!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  guid?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  at!: Date;

  @Column({ type: 'jsonb', nullable: true })
  meta?: Record<string, unknown> | null;
}
