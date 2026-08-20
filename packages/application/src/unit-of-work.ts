import type { Database, DatabaseTransaction } from "@xiongzai/database";

export type TransactionWork<T> = (transaction: DatabaseTransaction) => Promise<T>;

export class UnitOfWork {
  constructor(private readonly database: Database) {}

  run<T>(work: TransactionWork<T>): Promise<T> {
    return this.database.transaction(work);
  }
}
