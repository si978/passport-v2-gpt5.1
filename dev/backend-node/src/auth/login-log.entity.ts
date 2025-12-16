import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('login_logs')
export class LoginLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  guid!: string;

  @Column()
  phone!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  loginAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  logoutAt?: Date | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  channel?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip?: string | null;

  @Column({ type: 'boolean' })
  success!: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  errorCode?: string | null;

   // 预留字段：用于与 PRD DM-04 对齐。
  @Column({ type: 'varchar', length: 64, nullable: true })
  mac?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  gateway?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  cafeName?: string | null;
}
