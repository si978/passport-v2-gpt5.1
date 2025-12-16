import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryColumn()
  guid: string;

  @Index('idx_users_phone')
  @Column({ unique: true })
  phone: string;

  @Column({ type: 'int', default: 1 })
  userType: number;

  @Column({ default: 'phone' })
  accountSource: string;

  @Column({ type: 'int', default: 1 })
  status: number; // 1 active, 0 banned, -1 deleted

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
