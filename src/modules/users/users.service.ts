import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity.js';

export type SafeUser = Omit<User, 'passwordHash'>;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  /** Reviewers / workspace members. `passwordHash` never leaves the API. */
  async findAll(): Promise<SafeUser[]> {
    const users = await this.usersRepository.find({
      order: { name: 'ASC' },
    });

    return users.map((user) => {
      const { passwordHash, ...safeUser } = user;
      void passwordHash;

      return safeUser;
    });
  }
}
