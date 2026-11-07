// The SplitProtocol deployment. Deliberately not read from the environment, so
// a stale CONTRACT_ID variable can't point the agent at a different contract
// than the app. src/lib/stellar/contractIds.test.ts keeps every copy in sync.
export const SPLIT_CONTRACT_ID = 'CAZGYZEJJJ2GQMVEX4MKJ633JNCMGC5WH4P2P6PEXQBMH2VYX5Q2G3BI';
