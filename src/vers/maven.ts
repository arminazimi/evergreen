import { required } from "../required.js";
import { registerVersionScheme, VersError } from "../vers.js";
import type { VersionScheme } from "../vers.js";

// A port of Maven 3.9 org.apache.maven.artifact.versioning.ComparableVersion, checked against the VERS maven vectors.

const QUALIFIERS = ["alpha", "beta", "milestone", "rc", "snapshot", "", "sp"];
const ALIASES: Record<string, string> = { ga: "", final: "", release: "", cr: "rc" };
const RELEASE_INDEX = String(QUALIFIERS.indexOf(""));

type Item = IntItem | StringItem | CombinationItem | ListItem;

class IntItem {
  readonly kind = "int";
  constructor(readonly value: bigint) {}
  isNull(): boolean {
    return this.value === 0n;
  }
  compareTo(other: Item | null): number {
    if (other === null) return this.value === 0n ? 0 : 1;
    if (other.kind === "int") return this.value === other.value ? 0 : this.value < other.value ? -1 : 1;
    return 1;
  }
}

function comparableQualifier(qualifier: string): string {
  const index = QUALIFIERS.indexOf(qualifier);
  return index === -1 ? `${QUALIFIERS.length}-${qualifier}` : String(index);
}

function compareStrings(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

class StringItem {
  readonly kind = "string";
  readonly value: string;
  constructor(value: string, followedByDigit: boolean) {
    if (followedByDigit && value.length === 1) {
      value = value === "a" ? "alpha" : value === "b" ? "beta" : value === "m" ? "milestone" : value;
    }
    this.value = ALIASES[value] ?? value;
  }
  isNull(): boolean {
    return comparableQualifier(this.value) === RELEASE_INDEX;
  }
  compareTo(other: Item | null): number {
    if (other === null) return compareStrings(comparableQualifier(this.value), RELEASE_INDEX);
    switch (other.kind) {
      case "int":
        return -1;
      case "string":
        return compareStrings(comparableQualifier(this.value), comparableQualifier(other.value));
      case "combination": {
        const result = this.compareTo(other.stringPart);
        return result === 0 ? -1 : result;
      }
      case "list":
        return -1;
    }
  }
}

class CombinationItem {
  readonly kind = "combination";
  readonly stringPart: StringItem;
  readonly digitPart: IntItem;
  constructor(value: string) {
    const index = value.search(/\d/);
    this.stringPart = new StringItem(value.slice(0, index), true);
    this.digitPart = new IntItem(BigInt(value.slice(index)));
  }
  isNull(): boolean {
    return false;
  }
  compareTo(other: Item | null): number {
    if (other === null) return this.stringPart.compareTo(null);
    switch (other.kind) {
      case "int":
        return -1;
      case "string": {
        const result = this.stringPart.compareTo(other);
        return result === 0 ? 1 : result;
      }
      case "list":
        return -1;
      case "combination": {
        const result = this.stringPart.compareTo(other.stringPart);
        return result === 0 ? this.digitPart.compareTo(other.digitPart) : result;
      }
    }
  }
}

class ListItem {
  readonly kind = "list";
  readonly items: Item[] = [];
  /** True when this list holds a trailing ".X" qualifier, which keeps preceding zeros (2.0.a != 2-a). */
  constructor(readonly fromTrailingDot = false) {}
  isNull(): boolean {
    return this.items.length === 0;
  }
  normalize(): void {
    for (let index = this.items.length - 1; index >= 0; index--) {
      const item = required(this.items[index], "the item");
      if (!item.isNull()) continue;
      const next = this.items[index + 1];
      if (index === this.items.length - 1 || next?.kind === "string") {
        this.items.splice(index, 1);
      } else if (next?.kind === "list" && !next.fromTrailingDot) {
        const first = next.items[0];
        if (first?.kind === "combination" || first?.kind === "string") this.items.splice(index, 1);
      }
    }
  }
  compareTo(other: Item | null): number {
    if (other === null) {
      for (const item of this.items) {
        const result = item.compareTo(null);
        if (result !== 0) return result;
      }
      return 0;
    }
    switch (other.kind) {
      case "int":
        return -1;
      case "string":
      case "combination":
        return 1;
      case "list": {
        const length = Math.max(this.items.length, other.items.length);
        for (let index = 0; index < length; index++) {
          const left = this.items[index] ?? null;
          const right = other.items[index] ?? null;
          const result = left === null ? (right === null ? 0 : -1 * right.compareTo(left)) : left.compareTo(right);
          if (result !== 0) return result;
        }
        return 0;
      }
    }
  }
}

function parseItem(isCombination: boolean, isDigit: boolean, buffer: string): Item {
  if (isCombination) return new CombinationItem(buffer.replace(/-/g, ""));
  if (isDigit) return new IntItem(BigInt(buffer));
  return new StringItem(buffer, false);
}

/** Walks a lowercased version one character at a time, building nested lists the way ComparableVersion does. */
class VersionScanner {
  private readonly root = new ListItem();
  private list = this.root;
  private readonly stack: ListItem[] = [this.root];
  private isDigit = false;
  private isCombination = false;
  private start = 0;

  constructor(private readonly version: string) {}

  scan(): ListItem {
    for (let index = 0; index < this.version.length; index++) this.visit(index);
    this.finish();
    while (this.stack.length > 0) required(this.stack.pop(), "the stacked list").normalize();
    return this.root;
  }

  private visit(index: number): void {
    const character = this.version.charAt(index);
    if (character === ".") this.endAtDot(index);
    else if (character === "-") this.endAtDash(index);
    else if (character >= "0" && character <= "9") this.visitDigit(index);
    else this.visitLetter(index);
  }

  /** The pending buffer, from the last boundary up to (not including) `end`. */
  private pendingItem(end: number): Item {
    return parseItem(this.isCombination, this.isDigit, this.version.slice(this.start, end));
  }

  private push(fromTrailingDot = false): void {
    const next = new ListItem(fromTrailingDot);
    this.list.items.push(next);
    this.list = next;
    this.stack.push(next);
  }

  private endAtDot(index: number): void {
    this.list.items.push(index === this.start ? new IntItem(0n) : this.pendingItem(index));
    this.isCombination = false;
    this.start = index + 1;
  }

  private endAtDash(index: number): void {
    if (index === this.start) {
      this.list.items.push(new IntItem(0n));
    } else if (this.isLetterDashDigit(index)) {
      // X-1 is treated as X1.
      this.isCombination = true;
      return;
    } else {
      this.list.items.push(this.pendingItem(index));
    }
    this.start = index + 1;
    if (this.list.items.length > 0) this.push();
    this.isCombination = false;
  }

  /** A dash inside letters that is followed by a digit, such as the dash in "x-1". */
  private isLetterDashDigit(index: number): boolean {
    return !this.isDigit && index !== this.version.length - 1 && /\d/.test(this.version.charAt(index + 1));
  }

  private visitDigit(index: number): void {
    if (!this.isDigit && index > this.start) {
      // X1
      this.isCombination = true;
      if (this.list.items.length > 0) this.push();
    }
    this.isDigit = true;
  }

  private visitLetter(index: number): void {
    if (this.isDigit && index > this.start) {
      this.list.items.push(parseItem(this.isCombination, true, this.version.slice(this.start, index)));
      this.start = index;
      this.push();
      this.isCombination = false;
    }
    this.isDigit = false;
  }

  private finish(): void {
    if (this.version.length <= this.start) return;
    // 1.0.0.X1 < 1.0.0-X2: treat .X as -X for any string qualifier X.
    if (!this.isDigit && this.list.items.length > 0) this.push(this.version.charAt(this.start - 1) === ".");
    this.list.items.push(parseItem(this.isCombination, this.isDigit, this.version.slice(this.start)));
  }
}

function parse(input: string): ListItem {
  if (!input || /\s/.test(input)) throw new VersError(`Invalid Maven version "${input}".`);
  return new VersionScanner(input.toLowerCase()).scan();
}

/** Maven ComparableVersion ordering for Java and Kotlin artifacts. */
export const mavenScheme: VersionScheme = {
  names: ["maven"],
  compare(left, right) {
    return parse(left).compareTo(parse(right));
  },
};

registerVersionScheme(mavenScheme);
