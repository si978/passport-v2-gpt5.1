import { Injectable } from '@nestjs/common';

@Injectable()
export class GuidGenerator {
  generate(userType: number, now = new Date()): string {
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const typePart = userType.toString().padStart(2, '0');
    const randPart = Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join('');
    return `${datePart}${typePart}${randPart}`;
  }
}
