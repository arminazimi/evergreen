// Splits a corpus run into deterministic shards so CI can run the same corpus on several
// machines. Sharding is applied after the filters, so `--ecosystem python --shard 2/4` shards
// the Python subset. Membership is a position modulo the shard count, which keeps every entry in
// exactly one shard for a given corpus order and needs no committed timing file.

export interface CorpusShard {
  /** 1-based position of this shard; `--shard 1/4` is the first shard. */
  index: number;
  count: number;
}

const SHARD_FLAG = "--shard";

function shardValue(argv: readonly string[]): string | undefined {
  for (const [position, argument] of argv.entries()) {
    if (argument === SHARD_FLAG) {
      const value = argv[position + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${SHARD_FLAG} needs <index>/<count>.`);
      return value;
    }
    if (argument.startsWith(`${SHARD_FLAG}=`)) return argument.slice(SHARD_FLAG.length + 1);
  }
  return undefined;
}

/** Reads `--shard <index>/<count>`, or `undefined` when no shard was asked for. */
export function parseShard(argv: readonly string[] = process.argv): CorpusShard | undefined {
  const value = shardValue(argv);
  if (value === undefined) return undefined;
  const match = /^(\d+)\/(\d+)$/.exec(value);
  if (!match) throw new Error(`Invalid shard "${value}": use <index>/<count>, for example 1/4.`);
  const index = Number(match[1]);
  const count = Number(match[2]);
  if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1 || index < 1 || index > count) {
    throw new Error(
      `Invalid shard "${value}": index and count must be positive integers and index must be at most count.`,
    );
  }
  return { index, count };
}

/** The entries this shard owns, in corpus order. */
export function shardEntries<T>(entries: readonly T[], shard: CorpusShard): T[] {
  return entries.filter((_, position) => position % shard.count === shard.index - 1);
}

/** A single shard covering everything is a full run, not a narrowed one. */
export function shardCoversEverything(shard: CorpusShard | undefined): boolean {
  return shard === undefined || shard.count === 1;
}

/** One line naming the shard and how many entries it took, for the run output. */
export function describeShard(shard: CorpusShard, selected: number, total: number): string {
  return `SHARD ${shard.index}/${shard.count}: ${selected} of ${total} entries. The other shards run the rest; detectors and floors are scored after the shards are merged.`;
}
