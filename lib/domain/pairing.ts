export function orderPairIds(left: string, right: string): { low: string; high: string } {
  return left < right ? { low: left, high: right } : { low: right, high: left };
}
